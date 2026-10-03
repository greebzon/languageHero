/* One-off: replace a bad generated asset (a fake provider's checkered square or beep that
   reached real sets) with a fresh one from the configured provider.
   Usage: tsx src/cli/redo-asset.ts <assetId> [<assetId> ...]
   The picture is redrawn from the asset's own prompt, the speech re-recorded from its
   transcript, in the language of the set that uses it. Every draft lesson that points at the
   old asset gets the new one (edit revision +1; the app sees it after the next release), and
   the generation task that made the old asset loses its input hash so no job reuses it. */
import { and, eq, sql } from 'drizzle-orm';
import { storeAsset } from '../admin/asset-store.js';
import { wavPeak } from '../admin/media.js';
import { createDb } from '../db/client.js';
import { assets, courses, generationTasks, languages, lessons } from '../db/schema.js';
import { env, storageRoot } from '../env.js';
import { generationSettings } from '../generation/factory.js';
import { speechInstructions } from '../generation/prompts.js';

const ids = process.argv.slice(2);
if (ids.length === 0) throw new Error('usage: <assetId> [<assetId> ...]');
if (!env.DATABASE_URL) throw new Error('DATABASE_URL is not set');
const settings = generationSettings(env);
if (!settings.provider) throw new Error(settings.unavailableReason ?? 'no provider');
if (settings.provider.name === 'fake') throw new Error('GENERATION_PROVIDER is fake');
const provider = settings.provider;
const model = settings.modelConfig;
const handle = createDb(env.DATABASE_URL);
const { db } = handle;

async function users(assetId: string) {
  return db
    .select()
    .from(lessons)
    .where(sql`${lessons.document}->'media' @> ${JSON.stringify([{ assetId }])}::jsonb`);
}

async function redraw(old: typeof assets.$inferSelect) {
  const prompt = old.provenance.prompt;
  if (!prompt) throw new Error(`${old.id}: no prompt to redraw from`);
  const result = await provider.generateImage({
    context: { jobId: 'redo-asset', stage: 'image', targetId: old.id },
    model: model.image,
    prompt,
    size: '1024x1024',
    quality: model.imageQuality,
  });
  return storeAsset(
    db,
    storageRoot,
    result.png,
    { source: 'generated', model: model.image, promptVersion: 'redo', prompt },
    { altText: old.altText },
  );
}

async function rerecord(old: typeof assets.$inferSelect, languageCode: string) {
  const text = old.transcript ?? old.provenance.prompt;
  if (!text) throw new Error(`${old.id}: no transcript to re-record`);
  const language = await db.query.languages.findFirst({
    where: eq(languages.code, languageCode),
  });
  let wav: Buffer | null = null;
  for (let attempt = 1; attempt <= 3 && !wav; attempt += 1) {
    const result = await provider.synthesizeSpeech({
      context: { jobId: 'redo-asset', stage: 'audio', targetId: old.id },
      model: model.tts,
      voice: model.voice,
      text,
      instructions: speechInstructions(language!.title),
    });
    const peak = wavPeak(result.wav);
    if (peak === null || peak >= 0.02) wav = result.wav;
  }
  if (!wav) throw new Error(`${old.id}: speech stayed silent`);
  return storeAsset(
    db,
    storageRoot,
    wav,
    {
      source: 'generated',
      model: `${model.tts}/${model.voice}`,
      promptVersion: 'redo',
      prompt: text,
    },
    { transcript: text },
  );
}

try {
  for (const id of ids) {
    const old = await db.query.assets.findFirst({ where: eq(assets.id, id) });
    if (!old) throw new Error(`${id}: asset not found`);
    const using = await users(id);
    if (using.length === 0) {
      console.log(`${id}: no lesson uses it, skipped`);
      continue;
    }
    // Speech is per language: a shared beep is re-recorded in each set's own language.
    const byLanguage = new Map<string, typeof using>();
    for (const lesson of using) {
      const course = await db.query.courses.findFirst({ where: eq(courses.id, lesson.courseId) });
      const code = old.kind === 'audio' ? course!.languageCode : '*';
      byLanguage.set(code, [...(byLanguage.get(code) ?? []), lesson]);
    }
    for (const [code, group] of byLanguage) {
      const { asset } = old.kind === 'image' ? await redraw(old) : await rerecord(old, code);
      for (const lesson of group) {
        const media = lesson.document.media.map((m) =>
          m.assetId === id ? { ...m, assetId: asset.id } : m,
        );
        const updated = await db
          .update(lessons)
          .set({
            document: { ...lesson.document, media },
            editRevision: sql`${lessons.editRevision} + 1`,
            updatedAt: new Date(),
          })
          .where(and(eq(lessons.id, lesson.id), eq(lessons.editRevision, lesson.editRevision)))
          .returning({ id: lessons.id });
        if (updated.length === 0) throw new Error(`${lesson.id}: edited meanwhile, run again`);
      }
      console.log(
        `${id} (${old.kind}) → ${asset.id} [${asset.byteSize} B] in ${group.map((l) => l.id).join(', ')}`,
      );
    }
    // The task that made it and every task that reused it carry the same hash.
    await db
      .update(generationTasks)
      .set({ inputHash: null })
      .where(sql`${generationTasks.output}->>'assetId' = ${id}`);
  }
} finally {
  await handle.close();
}
