import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { courses, languages, lessons } from '../db/schema.js';
import { buildRelease } from '../publishing/build-release.js';
import { loadBuildInput } from '../publishing/plan.js';
import { baseTextsHash } from '../publishing/convert.js';
import { runWorkerUntilIdle } from '../worker/runner.js';
import { importPublishedContent } from './import.js';
import { createTestContext } from './testing.js';

test('«Перевести тексты»: overlays for every lesson, the card and the language, base untouched', async (t) => {
  const ctx = await createTestContext(t);
  if (!ctx) return;
  const { app, db, storageRoot, headers, provider, generation, contentRoot } = ctx;
  await importPublishedContent(db, contentRoot);
  // The bundled set arrives translated: start from Russian only.
  await db.update(lessons).set({ texts: {} });
  await db.update(courses).set({ texts: {} });
  await db.update(languages).set({ titles: {} });
  const call = (method: 'GET' | 'POST' | 'PATCH', url: string, payload?: Record<string, unknown>) =>
    app.inject({ method, url: `/v1/admin${url}`, headers, payload });
  const worker = { db, provider, storageRoot, rates: generation.rates, workerId: 'texts-test' };
  const before = await db.select().from(lessons).where(eq(lessons.courseId, 'en-forest'));
  assert.ok(before.length > 0);

  const started = await call('POST', '/courses/en-forest/texts/generate', {
    idempotencyKey: randomUUID(),
  });
  assert.equal(started.statusCode, 202, started.body);
  const job = started.json().job;
  assert.equal(job.kind, 'texts');
  await runWorkerUntilIdle(worker);
  const done = (await call('GET', `/generations/${job.id}`)).json();
  assert.equal(done.job.status, 'awaiting-review', JSON.stringify(done.job));
  assert.deepEqual(
    [...new Set(done.tasks.map((task: { stage: string }) => task.stage))],
    ['lesson-texts', 'course-texts'],
  );

  const after = await db.select().from(lessons).where(eq(lessons.courseId, 'en-forest'));
  for (const lesson of after) {
    const old = before.find((l) => l.id === lesson.id)!;
    // The Russian base stays as it was; the overlays carry the fingerprint of that Russian.
    assert.equal(lesson.title, old.title);
    assert.deepEqual(lesson.document, old.document);
    for (const locale of ['en', 'he'] as const) {
      const texts = lesson.texts[locale]!;
      assert.equal(texts.title, `[${locale}] ${old.title}`);
      assert.equal(
        texts.sourceHash,
        baseTextsHash(old.title, old.presentation ?? null, old.document),
      );
      assert.equal(Object.keys(texts.exercises!).length, old.document.exercises.length);
      assert.equal(Object.keys(texts.words!).length, old.document.words.length);
    }
  }
  const course = (await db.query.courses.findFirst({ where: eq(courses.id, 'en-forest') }))!;
  assert.match(course.texts.en!.title, /^\[en\] /);
  const language = (await db.query.languages.findFirst({ where: eq(languages.code, 'en') }))!;
  assert.match(language.titles.he!, /^\[he\] /);

  // The next release shows the set in every interface locale.
  const built = buildRelease(await loadBuildInput(db, 99));
  assert.deepEqual(built.errors, []);
  const set = built.release!.catalog.courses.find((c) => c.id === 'en-forest')!;
  assert.deepEqual(set.locales, ['ru', 'en', 'he']);
  assert.ok(set.lessons.every((l) => l.titles?.en && l.titles.he));

  // Everything is translated: another run has nothing to do; `force` translates again.
  const again = await call('POST', '/courses/en-forest/texts/generate', {
    idempotencyKey: randomUUID(),
  });
  assert.equal(again.statusCode, 409);
  assert.equal(again.json().code, 'nothing_to_generate');
  // Editing the Russian makes that lesson's translation outdated, and only it is redone.
  const edited = after[0]!;
  await call('PATCH', `/lessons/${edited.id}`, {
    title: `${edited.title}!`,
    editRevision: edited.editRevision,
  });
  const partial = await call('POST', '/courses/en-forest/texts/generate', {
    locales: ['en'],
    idempotencyKey: randomUUID(),
  });
  assert.equal(partial.statusCode, 202, partial.body);
  assert.deepEqual(
    partial.json().tasks.map((task: { targetId: string }) => task.targetId),
    [edited.id],
  );
  assert.equal(
    (await call('POST', '/courses/nope/texts/generate', { idempotencyKey: randomUUID() }))
      .statusCode,
    404,
  );
});
