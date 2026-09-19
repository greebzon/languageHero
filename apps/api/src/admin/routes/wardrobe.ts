/* «Маскоты» and «Магазин» in the panel. Creating a mascot or an item queues an asset job that
   draws everything the app needs (body, portrait, slot map, icon, outfit layers for every
   existing counterpart); later edits can regenerate all of it or only the layers. */
import type { FastifyInstance } from 'fastify';
import { and, desc, eq, inArray } from 'drizzle-orm';
import {
  assetGenerateSchema,
  mascotInputSchema,
  mascotPatchSchema,
  shopItemInputSchema,
  shopItemPatchSchema,
  wardrobeTextsGenerateSchema,
} from '@lingvohero/contracts';
import type { AdminOptions } from '../plugin.js';
import type { Db } from '../../db/client.js';
import { preserveMascotAccess } from '../../account/progression.js';
import { env } from '../../env.js';
import {
  assets,
  generationJobs,
  mascots,
  outfitLayers,
  shopItems,
  type GenerationStage,
} from '../../db/schema.js';
import type { GenerationSettings } from '../../generation/factory.js';
import { audit } from '../audit.js';
import { AdminError, parseInput } from '../errors.js';
import { ACTIVE_JOB_STATUSES, createAssetJob } from '../../worker/queue.js';
import { jobDto, jobWithTasks } from './generations.js';
import { notFound } from './shared.js';
import {
  queueWardrobeTextsJob,
  wardrobeHash,
  wardrobeSource,
  wardrobeTranslations,
} from '../../worker/text-stages.js';

type MascotRow = typeof mascots.$inferSelect;
type ItemRow = typeof shopItems.$inferSelect;
type LayerRow = typeof outfitLayers.$inferSelect;
const fileUrl = (id: string | null) => (id ? `/v1/admin/assets/${id}/file` : null);
export const mascotReady = (m: MascotRow) => !!(m.bodyAssetId && m.portraitAssetId && m.slots);
export const itemReady = (i: ItemRow) => !!i.iconAssetId;

/* Translations typed or changed by hand count as made from the current Russian. */
function stampTexts<T extends Record<string, unknown>>(
  kind: 'mascot' | 'item',
  next: MascotRow | ItemRow,
  texts: Partial<Record<'en' | 'he', T>> | undefined,
  previous: Partial<Record<'en' | 'he', T>> = {},
) {
  if (!texts) return undefined;
  const hash = wardrobeHash(wardrobeSource(kind, next));
  const strip = (t?: T) => (t ? JSON.stringify({ ...t, sourceHash: undefined }) : '');
  return Object.fromEntries(
    Object.entries(texts).map(([locale, t]) => {
      const before = previous[locale as 'en' | 'he'];
      const changed = strip(t) !== strip(before);
      return [locale, { ...t, sourceHash: changed ? hash : (before?.sourceHash ?? t?.sourceHash) }];
    }),
  ) as Partial<Record<'en' | 'he', T & { sourceHash?: string }>>;
}

export function mascotDto(
  row: MascotRow,
  extra: { layers?: number; activeJobId?: string | null } = {},
) {
  return {
    id: row.id,
    name: row.name,
    withName: row.withName,
    unlockLevel: row.unlockLevel,
    trait: row.trait,
    perk: row.perk,
    description: row.description,
    sourceAssetId: row.sourceAssetId,
    sourceUrl: fileUrl(row.sourceAssetId),
    bodyUrl: fileUrl(row.bodyAssetId),
    portraitUrl: fileUrl(row.portraitAssetId),
    slots: row.slots,
    texts: row.texts ?? {},
    translations: wardrobeTranslations('mascot', row),
    ready: mascotReady(row),
    published: !!row.published,
    position: row.position,
    layers: extra.layers ?? 0,
    activeJobId: extra.activeJobId ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
export function itemDto(
  row: ItemRow,
  extra: { layers?: number; activeJobId?: string | null } = {},
) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    slot: row.slot,
    rarity: row.rarity,
    price: row.price,
    prompt: row.prompt,
    sourceAssetId: row.sourceAssetId,
    sourceUrl: fileUrl(row.sourceAssetId),
    iconUrl: fileUrl(row.iconAssetId),
    texts: row.texts ?? {},
    translations: wardrobeTranslations('item', row),
    ready: itemReady(row),
    published: !!row.published,
    position: row.position,
    layers: extra.layers ?? 0,
    activeJobId: extra.activeJobId ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
const layerDto = (layer: LayerRow) => ({
  mascotId: layer.mascotId,
  itemId: layer.itemId,
  url: fileUrl(layer.assetId),
  box: layer.box,
  updatedAt: layer.updatedAt,
});

/** Every task a mascot needs; `layers` only redraws outfits (one item when targetId is given). */
export function mascotTasks(
  mascot: MascotRow,
  items: ItemRow[],
  scope: 'all' | 'layers',
  targetId?: string,
): { stage: GenerationStage; targetId: string }[] {
  const layers = items
    .filter((i) => itemReady(i) && (!targetId || i.id === targetId))
    .map((i) => ({ stage: 'outfit-layer' as const, targetId: i.id }));
  if (scope === 'all')
    return [
      { stage: 'mascot-base', targetId: 'base' },
      { stage: 'mascot-portrait', targetId: 'portrait' },
      { stage: 'mascot-slots', targetId: 'slots' },
      ...layers,
    ];
  if (!mascotReady(mascot))
    throw new AdminError(409, 'mascot_not_ready', 'Сначала нужно создать тело и разметку маскота');
  return layers;
}
export function itemTasks(
  item: ItemRow,
  all: MascotRow[],
  scope: 'all' | 'layers',
  targetId?: string,
): { stage: GenerationStage; targetId: string }[] {
  const layers = all
    .filter((m) => mascotReady(m) && (!targetId || m.id === targetId))
    .map((m) => ({ stage: 'outfit-layer' as const, targetId: m.id }));
  if (scope === 'all') return [{ stage: 'item-icon', targetId: 'icon' }, ...layers];
  if (!itemReady(item))
    throw new AdminError(409, 'item_not_ready', 'Сначала нужно создать иконку товара');
  return layers;
}

async function activeJobs(db: Db, kind: 'mascot' | 'item') {
  const rows = await db
    .select({ id: generationJobs.id, subjectId: generationJobs.subjectId })
    .from(generationJobs)
    .where(
      and(eq(generationJobs.kind, kind), inArray(generationJobs.status, [...ACTIVE_JOB_STATUSES])),
    );
  return new Map(rows.map((r) => [r.subjectId, r.id]));
}
async function layerCounts(db: Db, by: 'mascotId' | 'itemId') {
  const rows = await db.select().from(outfitLayers);
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(row[by], (counts.get(row[by]) ?? 0) + 1);
  return counts;
}
async function imageAsset(db: Db, id: string | null, field: string) {
  if (!id) return;
  const row = await db.query.assets.findFirst({ where: eq(assets.id, id) });
  if (!row || row.kind !== 'image')
    throw new AdminError(400, 'invalid_input', 'Нужна картинка PNG', {
      [field]: ['Файл не найден'],
    });
}

export async function wardrobeRoutes(
  app: FastifyInstance,
  options: AdminOptions & { generation: GenerationSettings },
) {
  const { db, generation } = options;
  const start = async (
    kind: 'mascot' | 'item',
    subjectId: string,
    tasks: { stage: GenerationStage; targetId: string }[],
    idempotencyKey: string,
    actorId: string,
  ) => {
    if (!generation.provider)
      throw new AdminError(503, 'provider_unavailable', generation.unavailableReason!);
    return createAssetJob(db, {
      kind,
      subjectId,
      tasks,
      modelConfig: generation.modelConfig,
      idempotencyKey,
      requestedBy: actorId,
      costLimitUsd: generation.costLimitUsd,
    });
  };

  /* --- Mascots --- */
  app.get('/mascots', async () => {
    const rows = await db.select().from(mascots).orderBy(mascots.position, mascots.name);
    const [active, layers] = await Promise.all([
      activeJobs(db, 'mascot'),
      layerCounts(db, 'mascotId'),
    ]);
    return {
      items: rows.map((m) =>
        mascotDto(m, { layers: layers.get(m.id) ?? 0, activeJobId: active.get(m.id) ?? null }),
      ),
      providerReady: generation.provider !== null,
      unavailableReason: generation.unavailableReason,
    };
  });
  app.post('/mascots', async (request, reply) => {
    const { idempotencyKey, ...input } = parseInput(
      mascotInputSchema.extend({ idempotencyKey: assetGenerateSchema.shape.idempotencyKey }),
      request.body,
    );
    if (await db.query.mascots.findFirst({ where: eq(mascots.id, input.id) }))
      throw new AdminError(409, 'conflict', 'Маскот с таким id уже есть', {
        id: ['Придумайте другой идентификатор'],
      });
    await imageAsset(db, input.sourceAssetId, 'sourceAssetId');
    const [row] = await db
      .insert(mascots)
      .values({
        ...input,
        unlockLevel: input.id === 'fox' ? 1 : input.unlockLevel,
        texts: stampTexts('mascot', input as MascotRow, input.texts) ?? {},
        position: (await db.select().from(mascots)).length,
      })
      .returning();
    await audit(db, {
      actorId: request.admin!.id,
      entityType: 'mascot',
      entityId: row!.id,
      action: 'create',
      payload: { name: row!.name },
    });
    const items = await db.select().from(shopItems);
    const job = generation.provider
      ? (
          await start(
            'mascot',
            row!.id,
            mascotTasks(row!, items, 'all'),
            idempotencyKey,
            request.admin!.id,
          )
        ).job
      : null;
    return reply
      .code(201)
      .send({ mascot: mascotDto(row!, { activeJobId: job?.id ?? null }), job: job && jobDto(job) });
  });
  app.get<{ Params: { id: string } }>('/mascots/:id', async (request) => {
    const row = await db.query.mascots.findFirst({ where: eq(mascots.id, request.params.id) });
    if (!row) notFound('Маскот');
    const items = await db.select().from(shopItems).orderBy(shopItems.position, shopItems.name);
    const layers = await db.select().from(outfitLayers).where(eq(outfitLayers.mascotId, row.id));
    const jobs = await db
      .select()
      .from(generationJobs)
      .where(and(eq(generationJobs.kind, 'mascot'), eq(generationJobs.subjectId, row.id)))
      .orderBy(desc(generationJobs.createdAt))
      .limit(10);
    const active = jobs.find((j) => ACTIVE_JOB_STATUSES.includes(j.status as 'queued'));
    return {
      mascot: mascotDto(row, { layers: layers.length, activeJobId: active?.id ?? null }),
      items: items.map((item) => ({
        item: itemDto(item),
        layer: layers.filter((l) => l.itemId === item.id).map(layerDto)[0] ?? null,
      })),
      jobs: jobs.map((j) => jobDto(j)),
    };
  });
  app.patch<{ Params: { id: string } }>('/mascots/:id', async (request) => {
    const row = await db.query.mascots.findFirst({ where: eq(mascots.id, request.params.id) });
    if (!row) notFound('Маскот');
    const patch = parseInput(mascotPatchSchema, request.body);
    if (row.id === 'fox') patch.unlockLevel = 1;
    if (patch.sourceAssetId !== undefined)
      await imageAsset(db, patch.sourceAssetId, 'sourceAssetId');
    if (patch.published && !mascotReady(row))
      throw new AdminError(
        409,
        'mascot_not_ready',
        'Опубликовать можно только готового маскота (тело, портрет, разметка)',
      );
    const { published, texts, ...fields } = patch;
    const [updated] = await db.transaction(async (tx) => {
      const [current] = await tx.select().from(mascots).where(eq(mascots.id, row.id)).for('update');
      if (
        (patch.published === false ||
          (patch.unlockLevel !== undefined && patch.unlockLevel > current.unlockLevel)) &&
        mascotReady(current) &&
        current.published
      )
        await preserveMascotAccess(tx, current.id, current.unlockLevel, env.ACCOUNT_LEVEL_STEP);
      return tx
        .update(mascots)
        .set({
          ...fields,
          ...(texts
            ? { texts: stampTexts('mascot', { ...row, ...fields }, texts, row.texts) }
            : {}),
          ...(published === undefined ? {} : { published: published ? 1 : 0 }),
          updatedAt: new Date(),
        })
        .where(eq(mascots.id, row.id))
        .returning();
    });
    await audit(db, {
      actorId: request.admin!.id,
      entityType: 'mascot',
      entityId: row.id,
      action: 'update',
      payload: patch,
    });
    return { mascot: mascotDto(updated!) };
  });
  app.post<{ Params: { id: string } }>('/mascots/:id/generate', async (request, reply) => {
    const row = await db.query.mascots.findFirst({ where: eq(mascots.id, request.params.id) });
    if (!row) notFound('Маскот');
    const input = parseInput(assetGenerateSchema, request.body);
    const items = await db.select().from(shopItems);
    const { job, created } = await start(
      'mascot',
      row.id,
      mascotTasks(row, items, input.scope, input.targetId),
      input.idempotencyKey,
      request.admin!.id,
    );
    return reply.code(created ? 202 : 200).send(await jobWithTasks(db, job));
  });
  app.delete<{ Params: { id: string } }>('/mascots/:id', async (request, reply) => {
    const row = await db.query.mascots.findFirst({ where: eq(mascots.id, request.params.id) });
    if (!row) notFound('Маскот');
    if (row.published)
      throw new AdminError(409, 'published', 'Сначала снимите маскота с публикации');
    await db.delete(mascots).where(eq(mascots.id, row.id));
    await audit(db, {
      actorId: request.admin!.id,
      entityType: 'mascot',
      entityId: row.id,
      action: 'delete',
      payload: {},
    });
    return reply.code(204).send();
  });

  /* «Перевести тексты» for mascots and items: one job for everything missing or outdated. */
  app.post('/wardrobe/texts/generate', async (request, reply) => {
    const input = parseInput(wardrobeTextsGenerateSchema, request.body);
    if (!generation.provider)
      throw new AdminError(503, 'provider_unavailable', generation.unavailableReason!);
    const { job, created } = await queueWardrobeTextsJob(db, {
      locales: input.locales,
      force: input.force,
      modelConfig: generation.modelConfig,
      idempotencyKey: input.idempotencyKey,
      requestedBy: request.admin!.id,
      costLimitUsd: generation.costLimitUsd,
    });
    return reply.code(created ? 202 : 200).send(await jobWithTasks(db, job));
  });
  app.get('/wardrobe/texts/jobs', async () => {
    const jobs = await db
      .select()
      .from(generationJobs)
      .where(and(eq(generationJobs.kind, 'texts'), eq(generationJobs.subjectId, 'wardrobe')))
      .orderBy(desc(generationJobs.createdAt))
      .limit(5);
    return { items: jobs.map((j) => jobDto(j)) };
  });

  /* --- Shop items --- */
  app.get('/shop-items', async () => {
    const rows = await db.select().from(shopItems).orderBy(shopItems.position, shopItems.name);
    const [active, layers] = await Promise.all([activeJobs(db, 'item'), layerCounts(db, 'itemId')]);
    return {
      items: rows.map((i) =>
        itemDto(i, { layers: layers.get(i.id) ?? 0, activeJobId: active.get(i.id) ?? null }),
      ),
      providerReady: generation.provider !== null,
      unavailableReason: generation.unavailableReason,
    };
  });
  app.post('/shop-items', async (request, reply) => {
    const { idempotencyKey, ...input } = parseInput(
      shopItemInputSchema.extend({ idempotencyKey: assetGenerateSchema.shape.idempotencyKey }),
      request.body,
    );
    if (await db.query.shopItems.findFirst({ where: eq(shopItems.id, input.id) }))
      throw new AdminError(409, 'conflict', 'Товар с таким id уже есть', {
        id: ['Придумайте другой идентификатор'],
      });
    await imageAsset(db, input.sourceAssetId, 'sourceAssetId');
    const [row] = await db
      .insert(shopItems)
      .values({
        ...input,
        texts: stampTexts('item', input as ItemRow, input.texts) ?? {},
        position: (await db.select().from(shopItems)).length,
      })
      .returning();
    await audit(db, {
      actorId: request.admin!.id,
      entityType: 'item',
      entityId: row!.id,
      action: 'create',
      payload: { name: row!.name, price: row!.price },
    });
    const all = await db.select().from(mascots);
    const job = generation.provider
      ? (
          await start(
            'item',
            row!.id,
            itemTasks(row!, all, 'all'),
            idempotencyKey,
            request.admin!.id,
          )
        ).job
      : null;
    return reply
      .code(201)
      .send({ item: itemDto(row!, { activeJobId: job?.id ?? null }), job: job && jobDto(job) });
  });
  app.get<{ Params: { id: string } }>('/shop-items/:id', async (request) => {
    const row = await db.query.shopItems.findFirst({ where: eq(shopItems.id, request.params.id) });
    if (!row) notFound('Товар');
    const all = await db.select().from(mascots).orderBy(mascots.position, mascots.name);
    const layers = await db.select().from(outfitLayers).where(eq(outfitLayers.itemId, row.id));
    const jobs = await db
      .select()
      .from(generationJobs)
      .where(and(eq(generationJobs.kind, 'item'), eq(generationJobs.subjectId, row.id)))
      .orderBy(desc(generationJobs.createdAt))
      .limit(10);
    const active = jobs.find((j) => ACTIVE_JOB_STATUSES.includes(j.status as 'queued'));
    return {
      item: itemDto(row, { layers: layers.length, activeJobId: active?.id ?? null }),
      mascots: all.map((m) => ({
        mascot: mascotDto(m),
        layer: layers.filter((l) => l.mascotId === m.id).map(layerDto)[0] ?? null,
      })),
      jobs: jobs.map((j) => jobDto(j)),
    };
  });
  app.patch<{ Params: { id: string } }>('/shop-items/:id', async (request) => {
    const row = await db.query.shopItems.findFirst({ where: eq(shopItems.id, request.params.id) });
    if (!row) notFound('Товар');
    const patch = parseInput(shopItemPatchSchema, request.body);
    if (patch.sourceAssetId !== undefined)
      await imageAsset(db, patch.sourceAssetId, 'sourceAssetId');
    if (patch.published && !itemReady(row))
      throw new AdminError(409, 'item_not_ready', 'Опубликовать можно только товар с иконкой');
    if (patch.slot && patch.slot !== row.slot)
      // The layers were painted for the old body part; they must be redrawn.
      await db.delete(outfitLayers).where(eq(outfitLayers.itemId, row.id));
    const { published, texts, ...fields } = patch;
    const [updated] = await db
      .update(shopItems)
      .set({
        ...fields,
        ...(texts ? { texts: stampTexts('item', { ...row, ...fields }, texts, row.texts) } : {}),
        ...(published === undefined ? {} : { published: published ? 1 : 0 }),
        updatedAt: new Date(),
      })
      .where(eq(shopItems.id, row.id))
      .returning();
    await audit(db, {
      actorId: request.admin!.id,
      entityType: 'item',
      entityId: row.id,
      action: 'update',
      payload: patch,
    });
    return { item: itemDto(updated!) };
  });
  app.post<{ Params: { id: string } }>('/shop-items/:id/generate', async (request, reply) => {
    const row = await db.query.shopItems.findFirst({ where: eq(shopItems.id, request.params.id) });
    if (!row) notFound('Товар');
    const input = parseInput(assetGenerateSchema, request.body);
    const all = await db.select().from(mascots);
    const { job, created } = await start(
      'item',
      row.id,
      itemTasks(row, all, input.scope, input.targetId),
      input.idempotencyKey,
      request.admin!.id,
    );
    return reply.code(created ? 202 : 200).send(await jobWithTasks(db, job));
  });
  app.delete<{ Params: { id: string } }>('/shop-items/:id', async (request, reply) => {
    const row = await db.query.shopItems.findFirst({ where: eq(shopItems.id, request.params.id) });
    if (!row) notFound('Товар');
    if (row.published) throw new AdminError(409, 'published', 'Сначала снимите товар с публикации');
    await db.delete(shopItems).where(eq(shopItems.id, row.id));
    await audit(db, {
      actorId: request.admin!.id,
      entityType: 'item',
      entityId: row.id,
      action: 'delete',
      payload: {},
    });
    return reply.code(204).send();
  });
}
