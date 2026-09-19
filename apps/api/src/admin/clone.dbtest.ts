import test from 'node:test';
import assert from 'node:assert/strict';
import { asc, eq } from 'drizzle-orm';
import { assets, courses, lessons } from '../db/schema.js';
import { buildRelease } from '../publishing/build-release.js';
import { loadBuildInput } from '../publishing/plan.js';
import { runWorkerUntilIdle } from '../worker/runner.js';
import { importPublishedContent } from './import.js';
import { createTestContext } from './testing.js';

test('clone a set: copy as is, and translate with AI keeping pictures', async (t) => {
  const ctx = await createTestContext(t);
  if (!ctx) return;
  const { app, db, contentRoot, storageRoot, headers, provider, generation } = ctx;
  await importPublishedContent(db, contentRoot);
  const call = (method: 'GET' | 'POST' | 'PATCH', url: string, payload?: Record<string, unknown>) =>
    app.inject({ method, url: `/v1/admin${url}`, headers, payload });
  await call('POST', '/languages', { code: 'de', title: 'Немецкий', status: 'active' });
  await call('POST', '/languages', {
    code: 'he',
    title: 'Иврит',
    direction: 'rtl',
    status: 'active',
  });
  const lessonsOf = (courseId: string) =>
    db.select().from(lessons).where(eq(lessons.courseId, courseId)).orderBy(asc(lessons.position));
  const source = await lessonsOf('en-forest');

  // Copy: everything duplicated as a draft in the target language.
  const copy = await call('POST', '/courses/en-forest/clone', {
    languageCode: 'de',
    id: 'de-forest-a1b2',
    title: 'Загадочный лес',
    mode: 'copy',
    idempotencyKey: crypto.randomUUID(),
  });
  assert.equal(copy.statusCode, 201, copy.body);
  assert.equal(copy.json().job, null);
  assert.equal(copy.json().course.languageCode, 'de');
  assert.equal(copy.json().course.visibility, 'draft');
  const copied = await lessonsOf('de-forest-a1b2');
  assert.deepEqual(
    copied.map((l) => l.id),
    source.map((_, i) => `de-forest-a1b2-${String(i + 1).padStart(2, '0')}`),
  );
  assert.deepEqual(
    copied.map((l) => l.document),
    source.map((l) => l.document),
  );
  assert.ok(copied.every((l) => l.lastPublishedVersion === null));

  // Guards.
  const sameId = await call('POST', '/courses/en-forest/clone', {
    languageCode: 'de',
    id: 'de-forest-a1b2',
    title: 'X',
    mode: 'copy',
    idempotencyKey: crypto.randomUUID(),
  });
  assert.equal(sameId.statusCode, 409);
  const sameLanguage = await call('POST', '/courses/en-forest/clone', {
    languageCode: 'en',
    id: 'en-forest-copy',
    title: 'X',
    mode: 'translate',
    idempotencyKey: crypto.randomUUID(),
  });
  assert.equal(sameLanguage.statusCode, 400);
  assert.ok(sameLanguage.json().fieldErrors.languageCode);
  const empty = await call('POST', '/courses/en-space/clone', {
    languageCode: 'de',
    id: 'de-space',
    title: 'X',
    mode: 'copy',
    idempotencyKey: crypto.randomUUID(),
  });
  assert.equal(empty.statusCode, 422);

  // Translate: a job in the queue; pictures reused, words/audio/tiles new.
  const key = crypto.randomUUID();
  const translate = await call('POST', '/courses/en-forest/clone', {
    languageCode: 'he',
    id: 'he-forest-x9y8',
    title: 'Загадочный лес',
    mode: 'translate',
    idempotencyKey: key,
  });
  assert.equal(translate.statusCode, 202, translate.body);
  const jobId = translate.json().job.job.id as string;
  const repeat = await call('POST', '/courses/en-forest/clone', {
    languageCode: 'he',
    id: 'he-forest-x9y8',
    title: 'Загадочный лес',
    mode: 'translate',
    idempotencyKey: key,
  });
  assert.equal(repeat.statusCode, 200);
  assert.equal(repeat.json().job.job.id, jobId);

  await runWorkerUntilIdle({
    db,
    provider,
    storageRoot,
    rates: generation.rates,
    workerId: 'clone-test',
  });
  const view = (await call('GET', `/generations/${jobId}`)).json();
  assert.equal(view.job.status, 'awaiting-review', view.job.error ?? '');
  const stages = new Set(view.tasks.map((x: { stage: string }) => x.stage));
  assert.equal(stages.has('image'), false);
  assert.equal(stages.has('cover'), false);
  assert.equal(view.tasks.filter((x: { stage: string }) => x.stage === 'audio').length, 4);

  const translated = await lessonsOf('he-forest-x9y8');
  assert.equal(translated.length, source.length);
  const sourceImages = new Map(
    source.flatMap((l) => l.document.media.filter((m) => m.kind === 'image')).map((m) => [m.id, m]),
  );
  for (const [i, lesson] of translated.entries()) {
    const original = source[i]!;
    assert.equal(lesson.document.exercises.length, original.document.exercises.length);
    assert.deepEqual(
      lesson.document.exercises.map((e) => e.type),
      original.document.exercises.map((e) => e.type),
    );
    assert.ok(lesson.document.words.every((w) => w.spelling.endsWith('he')));
    // Same picture and atlas region as the source word.
    for (const media of lesson.document.media.filter((m) => m.kind === 'image')) {
      const before = sourceImages.get(media.id)!;
      assert.equal(media.assetId, before.assetId);
      assert.deepEqual(media.region, before.region);
    }
    // Build-word tiles spell the new word.
    for (const exercise of lesson.document.exercises)
      if (exercise.type === 'build-word') {
        const word = lesson.document.words.find((w) => w.id === exercise.wordId)!;
        const letters = exercise.tiles.map((t) => t.letter);
        for (const letter of word.spelling) {
          const at = letters.indexOf(letter);
          assert.ok(at >= 0, `${word.spelling} not spellable from ${letters.join('')}`);
          letters.splice(at, 1);
        }
      }
  }
  const audio = await db.query.assets.findMany({ where: eq(assets.kind, 'audio') });
  assert.ok(audio.some((a) => a.transcript === 'Foxhe'));

  // The translated draft publishes like any other set.
  await db.update(courses).set({ visibility: 'published' }).where(eq(courses.id, 'he-forest-x9y8'));
  const built = buildRelease(await loadBuildInput(db, 99));
  assert.deepEqual(built.errors, []);
  assert.ok(built.release!.catalog.courses.some((c) => c.id === 'he-forest-x9y8' && c.cover));
});
