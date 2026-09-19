/* One-off: re-record a word's speech with the configured TTS and point a draft lesson at it.
   Usage: tsx src/cli/redo-speech.ts <lessonId> <wordId>
   Used for recordings that came back silent (see `wavPeak`); the lesson gets a new edit
   revision and reaches the app with the next release. */
import { and, eq } from 'drizzle-orm';
import { storeAsset } from '../admin/asset-store.js';
import { wavPeak } from '../admin/media.js';
import { createDb } from '../db/client.js';
import { languages, lessons } from '../db/schema.js';
import { env, storageRoot } from '../env.js';
import { generationSettings } from '../generation/factory.js';
import { speechInstructions } from '../generation/prompts.js';
import { sql } from 'drizzle-orm';

const [lessonId, wordId] = process.argv.slice(2);
if (!lessonId || !wordId) throw new Error('usage: <lessonId> <wordId>');
if (!env.DATABASE_URL) throw new Error('DATABASE_URL is not set');
const settings = generationSettings(env);
if (!settings.provider) throw new Error(settings.unavailableReason ?? 'no provider');
const handle = createDb(env.DATABASE_URL);
const { db } = handle;
try {
  const lesson = await db.query.lessons.findFirst({ where: eq(lessons.id, lessonId) });
  if (!lesson) throw new Error('lesson not found');
  const word = lesson.document.words.find((w) => w.id === wordId);
  if (!word?.audioId) throw new Error('word without audio');
  const course = await db.query.courses.findFirst({
    where: (c, { eq: is }) => is(c.id, lesson.courseId),
  });
  const language = await db.query.languages.findFirst({
    where: eq(languages.code, course!.languageCode),
  });
  let wav: Buffer | null = null;
  for (let attempt = 1; attempt <= 3 && !wav; attempt += 1) {
    const result = await settings.provider.synthesizeSpeech({
      context: { jobId: 'redo-speech', stage: 'audio', targetId: wordId },
      model: settings.modelConfig.tts,
      voice: settings.modelConfig.voice,
      text: word.text,
      instructions: speechInstructions(language!.title),
    });
    const peak = wavPeak(result.wav);
    console.log(`attempt ${attempt}: peak ${peak?.toFixed(3)}`);
    if (peak === null || peak >= 0.02) wav = result.wav;
  }
  if (!wav) throw new Error('speech stayed silent');
  const { asset } = await storeAsset(
    db,
    storageRoot,
    wav,
    {
      source: 'generated',
      model: `${settings.modelConfig.tts}/${settings.modelConfig.voice}`,
      promptVersion: 'redo',
      prompt: word.text,
    },
    { transcript: word.text },
  );
  const media = lesson.document.media.map((m) =>
    m.id === word.audioId ? { ...m, assetId: asset.id } : m,
  );
  await db
    .update(lessons)
    .set({
      document: { ...lesson.document, media },
      editRevision: sql`${lessons.editRevision} + 1`,
      updatedAt: new Date(),
    })
    .where(and(eq(lessons.id, lesson.id), eq(lessons.editRevision, lesson.editRevision)));
  console.log(`${lessonId}/${wordId}: new audio ${asset.id} (${asset.durationMs} ms)`);
} finally {
  await handle.close();
}
