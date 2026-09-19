/* Asset jobs: a mascot's body, portrait and slot map; a shop item's icon; and the outfit layers
   — the item painted onto one mascot's body inside that slot's mask, so it fits that body.
   Everything is stored as draft assets and referenced from mascots / shop_items / outfit_layers. */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { eq, sql } from 'drizzle-orm';
import {
  mascotSlotsSchema,
  type MascotSlot,
  type MascotSlots,
  type SlotBox,
} from '@lingvohero/contracts';
import { storeAsset } from '../admin/asset-store.js';
import { mediaFilename } from '../admin/media.js';
import { assets, courses, mascots, outfitLayers, shopItems } from '../db/schema.js';
import { audit } from '../admin/audit.js';
import { coverPrompt } from '../generation/prompts.js';
import { toJsonSchema } from '../generation/dto.js';
import { composeOutfitLayer, zoneFor, zoneMaskPng } from '../generation/outfit-compose.js';
import { decodePng, encodePng } from '../generation/png.js';
import { ProviderError, type RequestContext } from '../generation/provider.js';
import { addUsage, type JobRow, type TaskRow } from './queue.js';
import type { StageContext, StageResult } from './stages.js';

const permanent = (message: string) => new ProviderError(message, 'permanent');
/** Shared look of every mascot and wearable, so generated pieces match the bundled ones. */
export const ASSET_STYLE =
  "Cute 2D cartoon style for a children's language-learning game (ages 6-9): clean bold outlines, soft cel shading, bright candy colors, big friendly eyes, no text, no watermark, no logo.";
const BODY_SIZE = '1024x1536' as const;

type Env = { ctx: StageContext; job: JobRow; task: TaskRow; context: RequestContext };
type MascotRow = typeof mascots.$inferSelect;
type ItemRow = typeof shopItems.$inferSelect;

export async function runAssetStage(
  ctx: StageContext,
  job: JobRow,
  task: TaskRow,
): Promise<StageResult> {
  const env: Env = {
    ctx,
    job,
    task,
    context: { jobId: job.id, stage: task.stage, targetId: task.targetId },
  };
  switch (task.stage) {
    case 'mascot-base':
      return mascotBase(env);
    case 'mascot-portrait':
      return mascotPortrait(env);
    case 'mascot-slots':
      return mascotSlotMap(env);
    case 'item-icon':
      return itemIcon(env);
    case 'outfit-layer':
      return outfitLayer(env);
    case 'course-cover':
      return courseCover(env);
    default:
      throw permanent(`Стадия ${task.stage} не относится к ассетам`);
  }
}

async function charge(
  env: Env,
  delta: { inputTokens?: number; outputTokens?: number; images?: number; estimatedUsd: number },
) {
  const usage = await addUsage(env.ctx.db, env.job.id, delta);
  if (usage && usage.estimatedUsd > env.job.costLimitUsd)
    throw permanent(
      `Превышен лимит стоимости работы (${usage.estimatedUsd.toFixed(2)} $ из ${env.job.costLimitUsd} $)`,
    );
}
async function loadMascot(env: Env, id: string | null): Promise<MascotRow> {
  const row = id
    ? await env.ctx.db.query.mascots.findFirst({ where: eq(mascots.id, id) })
    : undefined;
  if (!row) throw permanent('Маскот не найден');
  return row;
}
async function loadItem(env: Env, id: string | null): Promise<ItemRow> {
  const row = id
    ? await env.ctx.db.query.shopItems.findFirst({ where: eq(shopItems.id, id) })
    : undefined;
  if (!row) throw permanent('Товар не найден');
  return row;
}
async function assetBytes(env: Env, assetId: string | null) {
  const row = assetId
    ? await env.ctx.db.query.assets.findFirst({ where: eq(assets.id, assetId) })
    : undefined;
  if (!row || row.kind !== 'image') throw permanent('Исходная картинка не найдена');
  const bytes = await readFile(join(env.ctx.storageRoot, mediaFilename(row.sha256, 'png'))).catch(
    () => {
      throw permanent('Файл исходной картинки отсутствует в хранилище');
    },
  );
  return { row, bytes };
}
async function saveImage(env: Env, png: Buffer, prompt: string, altText: string) {
  await charge(env, { images: 1, estimatedUsd: env.ctx.rates.imageUsd });
  const { asset } = await storeAsset(
    env.ctx.db,
    env.ctx.storageRoot,
    png,
    {
      source: 'generated',
      model: env.job.modelConfig.image,
      promptVersion: env.job.promptVersion,
      prompt: prompt.slice(0, 500),
    },
    { altText, generationTaskId: env.task.id },
  );
  return asset;
}
const imageArgs = (env: Env) => ({
  context: env.context,
  model: env.job.modelConfig.image,
  quality: env.job.modelConfig.imageQuality,
  background: 'transparent' as const,
});
const editArgs = (env: Env) => ({
  ...imageArgs(env),
  model: env.job.modelConfig.edit ?? env.job.modelConfig.image,
});

/* --- Set cover --- */
/**
 * Draws a new cover from the set's topic (or title) and an optional scene hint and makes it
 * the draft cover at once: the old one stays in the media library, and the change reaches the
 * app only with the next release. The edit revision moves, so an open form sees the change.
 */
async function courseCover(env: Env): Promise<StageResult> {
  const courseId = env.job.courseId;
  const course = courseId
    ? await env.ctx.db.query.courses.findFirst({ where: eq(courses.id, courseId) })
    : undefined;
  if (!course) throw permanent('Сет не найден');
  const hint = String((env.job.input as unknown as { hint?: string }).hint ?? '').trim();
  const prompt = `${coverPrompt(course.topic || course.title, null)}${hint ? ` Scene: ${hint}.` : ''}`;
  const result = await env.ctx.provider.generateImage({
    context: env.context,
    model: env.job.modelConfig.image,
    quality: env.job.modelConfig.imageQuality,
    prompt,
    size: '1536x1024',
  });
  const asset = await saveImage(env, result.png, prompt, `Обложка: ${course.title}`);
  await env.ctx.db.transaction(async (tx) => {
    await tx
      .update(courses)
      .set({
        coverAssetId: asset.id,
        editRevision: sql`${courses.editRevision} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(courses.id, course.id));
    await audit(tx, {
      actorId: env.job.requestedBy,
      entityType: 'course',
      entityId: course.id,
      action: 'cover-generated',
      payload: { jobId: env.job.id, coverAssetId: asset.id, previous: course.coverAssetId },
    });
  });
  return { output: { assetId: asset.id }, requestId: result.requestId };
}

/* --- Mascot --- */
async function mascotBase(env: Env): Promise<StageResult> {
  const mascot = await loadMascot(env, env.job.subjectId);
  let prompt: string;
  let result;
  if (mascot.sourceAssetId) {
    const { bytes } = await assetBytes(env, mascot.sourceAssetId);
    prompt = `Keep this exact character with the same pose, proportions, colors and outfit. Remove the background, floor, pedestal, branch, props, letters and any placeholder shapes. Output the whole standing character alone, centered with some margin, on a fully transparent background. ${ASSET_STYLE}`;
    result = await env.ctx.provider.editImage({
      ...editArgs(env),
      prompt,
      images: [bytes],
      size: BODY_SIZE,
    });
  } else {
    prompt = `${mascot.description}. A full-body standing mascot character facing the viewer in a friendly open pose, the whole character visible with feet at the bottom, centered with some margin, isolated on a fully transparent background. ${ASSET_STYLE}`;
    result = await env.ctx.provider.generateImage({ ...imageArgs(env), prompt, size: BODY_SIZE });
  }
  const asset = await saveImage(env, result.png, prompt, `${mascot.name}: тело`);
  await env.ctx.db
    .update(mascots)
    .set({ bodyAssetId: asset.id, updatedAt: new Date() })
    .where(eq(mascots.id, mascot.id));
  return { output: { assetId: asset.id }, requestId: result.requestId };
}
async function mascotPortrait(env: Env): Promise<StageResult> {
  const mascot = await loadMascot(env, env.job.subjectId);
  const { bytes } = await assetBytes(env, mascot.bodyAssetId);
  const prompt = `Make a round badge portrait of this same character: head and shoulders, smiling at the viewer, centered inside a circle with a thick colored ring border in colors matching the character. Fully transparent outside the circle. ${ASSET_STYLE}`;
  const result = await env.ctx.provider.editImage({
    ...editArgs(env),
    prompt,
    images: [bytes],
    size: '1024x1024',
  });
  const asset = await saveImage(env, result.png, prompt, `${mascot.name}: портрет`);
  await env.ctx.db
    .update(mascots)
    .set({ portraitAssetId: asset.id, updatedAt: new Date() })
    .where(eq(mascots.id, mascot.id));
  return { output: { assetId: asset.id }, requestId: result.requestId };
}
/* Boxes come from the vision model; hats need room above the head, capes room around it. */
export function refineSlots(raw: MascotSlots): MascotSlots {
  const clamp = (b: SlotBox): SlotBox => {
    const x = Math.min(1, Math.max(0, b.x));
    const y = Math.min(1, Math.max(0, b.y));
    return {
      x,
      y,
      w: Math.max(0.02, Math.min(1 - x, b.w)),
      h: Math.max(0.02, Math.min(1 - y, b.h)),
    };
  };
  const grow = (b: SlotBox, dx: number, dyUp: number, dyDown: number): SlotBox =>
    clamp({ x: b.x - dx, y: b.y - dyUp, w: b.w + 2 * dx, h: b.h + dyUp + dyDown });
  return {
    head: grow(raw.head, 0.04, raw.head.h * 0.45, 0),
    eyes: grow(raw.eyes, 0.03, 0.02, 0.02),
    outfit: grow(raw.outfit, 0.03, 0.02, 0.02),
    back: grow(raw.back, 0.12, 0.05, 0.08),
    companion: clamp(raw.companion),
  };
}
async function mascotSlotMap(env: Env): Promise<StageResult> {
  const mascot = await loadMascot(env, env.job.subjectId);
  const { bytes } = await assetBytes(env, mascot.bodyAssetId);
  const result = await env.ctx.provider.generateText({
    context: env.context,
    model: env.job.modelConfig.text,
    schemaName: 'mascot_slots',
    schema: toJsonSchema(mascotSlotsSchema),
    system:
      'You locate body parts of a cartoon character in a picture and answer strictly in the JSON schema. Coordinates are fractions of the image width and height between 0 and 1; x and y are the top-left corner of the box, w and h its size.',
    user: `Find bounding boxes on this character: head — the whole head including ears, hair or fur on top (where a hat sits); eyes — a band covering both eyes (where glasses sit); outfit — the torso from the shoulders to the hips (where a shirt or costume goes); back — the shoulders and upper body with some space around them (where a cape hangs behind the body); companion — an empty area beside the character at shoulder height where a small floating pet could hover. Boxes may overlap.`,
    payload: { mascotId: mascot.id },
    images: [bytes],
    maxOutputTokens: 800,
  });
  if (!result.ok) throw permanent(`Модель отказалась: ${result.refusal}`);
  await charge(env, {
    ...result.usage,
    estimatedUsd:
      ((result.usage.inputTokens + result.usage.outputTokens) / 1000) *
      env.ctx.rates.textPer1kTokensUsd,
  });
  const parsed = mascotSlotsSchema.safeParse(result.data);
  if (!parsed.success) throw permanent('Модель не смогла разметить зоны маскота');
  const slots = refineSlots(parsed.data);
  await env.ctx.db
    .update(mascots)
    .set({ slots, updatedAt: new Date() })
    .where(eq(mascots.id, mascot.id));
  return { output: { slots }, requestId: result.requestId };
}

/* --- Shop item --- */
const slotNoun: Record<MascotSlot, string> = {
  head: 'piece of headwear (a hat, crown, cap or helmet)',
  eyes: 'pair of glasses or an eye mask',
  outfit: 'costume or outfit worn on the torso',
  back: 'cape, cloak or backpack',
  companion: 'small floating companion (a creature, star or magical object)',
};
const slotPlacement: Record<MascotSlot, string> = {
  head: 'on top of the head, resting on the fur or hair, with the ears still visible',
  eyes: 'on the face, resting on the nose in front of the eyes',
  outfit:
    'worn over the body and following its shape — on the torso, and on the arms, legs and feet if the garment covers them — while the head, face and neck stay uncovered; the top of the editable area is the neckline of the garment, so finish it there with a proper collar or hem; footwear: when the garment has boots or shoes of its own, draw them in place of the shoes the character wears, covering the feet entirely so that nothing of the original shoes remains visible — never boots on top of shoes; only a garment without footwear lets the trouser legs end on top of the existing shoes',
  back: 'over the shoulders, hanging behind the body: in front only its clasp at the neck and its edges beside the body are visible, and whatever the character already wears on the chest stays exactly as it is',
  companion: 'beside the character',
};
async function itemIcon(env: Env): Promise<StageResult> {
  const item = await loadItem(env, env.job.subjectId);
  let prompt: string;
  let result;
  if (item.sourceAssetId) {
    const { bytes } = await assetBytes(env, item.sourceAssetId);
    prompt = `Keep this exact item (${item.prompt}); remove the background and anything else, show the item alone, centered, on a fully transparent background. ${ASSET_STYLE}`;
    result = await env.ctx.provider.editImage({
      ...editArgs(env),
      prompt,
      images: [bytes],
      size: '1024x1024',
    });
  } else {
    prompt = `${item.prompt}. A single ${slotNoun[item.slot]} for a cartoon mascot, shown alone without any character, centered, isolated on a fully transparent background. ${ASSET_STYLE}`;
    result = await env.ctx.provider.generateImage({ ...imageArgs(env), prompt, size: '1024x1024' });
  }
  const asset = await saveImage(env, result.png, prompt, `${item.name}: иконка`);
  await env.ctx.db
    .update(shopItems)
    .set({ iconAssetId: asset.id, updatedAt: new Date() })
    .where(eq(shopItems.id, item.id));
  return { output: { assetId: asset.id }, requestId: result.requestId };
}
async function outfitLayer(env: Env): Promise<StageResult> {
  const pair =
    env.job.kind === 'mascot'
      ? { mascotId: env.job.subjectId, itemId: env.task.targetId }
      : { mascotId: env.task.targetId, itemId: env.job.subjectId };
  const mascot = await loadMascot(env, pair.mascotId);
  const item = await loadItem(env, pair.itemId);
  if (!mascot.bodyAssetId || !mascot.slots)
    throw permanent(`У маскота «${mascot.name}» ещё нет тела и разметки зон`);
  if (!item.iconAssetId) throw permanent(`У товара «${item.name}» ещё нет иконки`);
  const zone = zoneFor(mascot.slots, item.slot);
  // The stored box is what the app and the panel clip to; the neckline is a mask detail.
  const box = { x: zone.x, y: zone.y, w: zone.w, h: zone.h };
  const upsert = async (assetId: string) => {
    await env.ctx.db
      .insert(outfitLayers)
      .values({ mascotId: mascot.id, itemId: item.id, assetId, box, taskId: env.task.id })
      .onConflictDoUpdate({
        target: [outfitLayers.mascotId, outfitLayers.itemId],
        set: { assetId, box, taskId: env.task.id, updatedAt: new Date() },
      });
  };
  const icon = await assetBytes(env, item.iconAssetId);
  // A companion just floats next to the body: the icon itself is the layer.
  if (item.slot === 'companion') {
    await upsert(icon.row.id);
    return { output: { assetId: icon.row.id, reusedFrom: 'icon' }, requestId: null };
  }
  const body = await assetBytes(env, mascot.bodyAssetId);
  const width = body.row.width ?? 1024;
  const height = body.row.height ?? 1536;
  // The masked part of the body is redrawn from the prompt, so the model must be told what the
  // character wears there (a t-shirt inside the cape zone was silently dropped otherwise).
  const prompt = `Add the ${item.name} from the second picture (${item.prompt}) to the character in the first picture (${mascot.description}), so it sits ${slotPlacement[item.slot]}, with correct perspective, scale and lighting, drawn in the same outline and shading style as the character. This is a strict edit: the character's face, eyes, expression, pose, hands, colors, existing clothes and outline must stay pixel-identical to the first picture; paint only the item inside the editable area and keep the transparent background. Do not change the framing: the character keeps exactly the same size and position on the canvas, with the same empty margins around it.`;
  const result = await env.ctx.provider.editImage({
    ...editArgs(env),
    prompt,
    images: [body.bytes, icon.bytes],
    mask: zoneMaskPng(width, height, zone),
    size: BODY_SIZE,
  });
  // The edit is a whole re-rendered picture; the layer is only what the item added to it.
  // The fake provider returns flat test images, which have nothing to align or compare.
  let layerPng = result.png;
  let composed: { drift: number; scale: number; editAssetId: string } | null = null;
  if (env.ctx.provider.name !== 'fake') {
    const outcome = composeOutfitLayer(
      decodePng(body.bytes),
      decodePng(result.png),
      item.slot,
      zone,
      undefined,
      mascot.slots.eyes.y + mascot.slots.eyes.h,
      decodePng(icon.bytes),
    );
    // Charged even when rejected: the queue's retry budget is what limits the spend.
    await charge(env, { images: 1, estimatedUsd: env.ctx.rates.imageUsd });
    if (!outcome.ok) {
      // Keep the rejected picture so the admin can see what the model did (linked from the error).
      const { asset: rejected } = await storeAsset(
        env.ctx.db,
        env.ctx.storageRoot,
        result.png,
        {
          source: 'generated',
          model: env.job.modelConfig.edit ?? env.job.modelConfig.image,
          promptVersion: env.job.promptVersion,
          prompt: prompt.slice(0, 500),
        },
        { altText: `${mascot.name} в «${item.name}» (отклонено)`, generationTaskId: env.task.id },
      );
      throw new ProviderError(
        `${outcome.reason}; пробуем ещё раз (вариант: /v1/admin/assets/${rejected.id}/file)`,
        'retryable',
        null,
        result.requestId,
      );
    }
    layerPng = encodePng(outcome.layer);
    // The raw edit is kept too: a later compositor change can rebuild the layer from it
    // (`cli/recut-layer.ts`) without paying for a new generation.
    const { asset: edit } = await storeAsset(
      env.ctx.db,
      env.ctx.storageRoot,
      result.png,
      {
        source: 'generated',
        model: env.job.modelConfig.edit ?? env.job.modelConfig.image,
        promptVersion: env.job.promptVersion,
        prompt: prompt.slice(0, 500),
      },
      { altText: `${mascot.name} в «${item.name}» (правка модели)`, generationTaskId: env.task.id },
    );
    composed = { drift: outcome.drift, scale: outcome.alignment.scale, editAssetId: edit.id };
  }
  const { asset } = await storeAsset(
    env.ctx.db,
    env.ctx.storageRoot,
    layerPng,
    {
      source: 'generated',
      model: env.job.modelConfig.edit ?? env.job.modelConfig.image,
      promptVersion: env.job.promptVersion,
      prompt: prompt.slice(0, 500),
    },
    { altText: `${mascot.name} в «${item.name}»`, generationTaskId: env.task.id },
  );
  if (!composed) await charge(env, { images: 1, estimatedUsd: env.ctx.rates.imageUsd });
  await upsert(asset.id);
  return { output: { assetId: asset.id, box, ...composed }, requestId: result.requestId };
}
