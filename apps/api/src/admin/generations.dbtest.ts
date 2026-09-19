import test from 'node:test';
import assert from 'node:assert/strict';
import { eq, sql } from 'drizzle-orm';
import { buildApp } from '../app.js';
import { generationJobs, lessons } from '../db/schema.js';
import { runWorkerUntilIdle } from '../worker/runner.js';
import { importPublishedContent } from './import.js';
import { createTestContext } from './testing.js';

test('generation routes: settings, estimates, idempotent start, progress, cancel, retry, conflicts', async (t) => {
  const ctx = await createTestContext(t);
  if (!ctx) return;
  const { app, db, contentRoot, storageRoot, headers, provider, generation } = ctx;
  await importPublishedContent(db, contentRoot);
  const call = (
    method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
    url: string,
    payload?: Record<string, unknown>,
  ) => app.inject({ method, url: `/v1/admin${url}`, headers, payload });
  const worker = { db, provider, storageRoot, rates: generation.rates, workerId: 'route-test' };

  const settings = await call('GET', '/generation-settings');
  assert.equal(settings.json().providerReady, true);
  assert.equal(settings.json().providerName, 'fake');
  assert.equal(settings.json().limits.maxExercises, 60);
  const estimateResponse = await call('POST', '/generation-estimates', {
    topic: 'Космос',
    totalExercises: 25,
  });
  assert.deepEqual(estimateResponse.json().distribution, [6, 6, 6, 7]);
  assert.equal(estimateResponse.json().images, 17);
  assert.equal(
    (await call('POST', '/generation-estimates', { topic: 'Космос', totalExercises: 61 }))
      .statusCode,
    400,
  );
  const explicit = await call('POST', '/generation-estimates', {
    topic: 'Космос',
    totalExercises: 25,
    wordCount: 12,
  });
  assert.equal(explicit.json().words, 12);
  const tooFew = await call('POST', '/generation-estimates', {
    topic: 'Космос',
    totalExercises: 25,
    wordCount: 3,
  });
  assert.equal(tooFew.statusCode, 400);
  assert.match(tooFew.json().fieldErrors.wordCount[0], /не меньше 5/);

  await call('POST', '/courses', { id: 'en-space-set', languageCode: 'en', title: 'Космос' });
  const key = crypto.randomUUID();
  const started = await call('POST', '/courses/en-space-set/generations', {
    topic: 'Космос',
    totalExercises: 12,
    wordCount: 6,
    idempotencyKey: key,
  });
  assert.equal(started.statusCode, 202, started.body);
  const jobId = started.json().job.id as string;
  assert.equal(started.json().job.input.wordCount, 6);
  assert.equal(started.json().job.status, 'queued');
  assert.equal(started.json().progress.total, 1);
  assert.equal(started.json().allowed.cancel, true);
  const repeated = await call('POST', '/courses/en-space-set/generations', {
    topic: 'Космос',
    totalExercises: 12,
    idempotencyKey: key,
  });
  assert.equal(repeated.statusCode, 200);
  assert.equal(repeated.json().job.id, jobId);
  const busy = await call('POST', '/courses/en-space-set/generations', {
    topic: 'Другая тема',
    totalExercises: 6,
    idempotencyKey: crypto.randomUUID(),
  });
  assert.equal(busy.statusCode, 409);
  assert.equal(busy.json().code, 'job_in_progress');
  assert.equal((await call('GET', '/courses/en-space-set/generations')).json().items.length, 1);

  await runWorkerUntilIdle(worker);
  const finished = await call('GET', `/generations/${jobId}`);
  assert.equal(finished.json().job.status, 'awaiting-review', finished.body);
  assert.equal(finished.json().progress.done, finished.json().progress.total);
  assert.equal(finished.json().job.result.lessons.length, 2);
  assert.equal(finished.json().job.result.words.length, 6);
  assert.equal(finished.json().job.input.simulate, undefined);
  assert.ok(finished.json().stages.find((s: { stage: string }) => s.stage === 'image').done > 0);
  assert.equal(finished.json().allowed.cancel, false);
  assert.deepEqual(finished.json().allowed.retryTaskIds, []);
  const course = (await call('GET', '/courses/en-space-set')).json();
  assert.equal(course.lessons.length, 2);
  assert.ok(course.course.cover);
  assert.equal((await call('GET', `/lessons/${course.lessons[0].id}/preview`)).statusCode, 200);
  // The fresh lessons are Russian: a texts job translated them for the other interface locales.
  const history = (await call('GET', '/courses/en-space-set/generations')).json().items;
  const texts = history.find((j: { kind: string }) => j.kind === 'texts');
  assert.equal(texts?.status, 'awaiting-review');
  const preview = (await call('GET', `/lessons/${course.lessons[0].id}/preview`)).json();
  assert.ok(preview.lesson.texts.en.title && preview.lesson.texts.he.title);

  // Cancel a queued job.
  await call('POST', '/courses', { id: 'en-c', languageCode: 'en', title: 'C' });
  const c = await call('POST', '/courses/en-c/generations', {
    topic: 'Тема',
    totalExercises: 6,
    idempotencyKey: crypto.randomUUID(),
  });
  const cancelled = await call('POST', `/generations/${c.json().job.id}/cancel`);
  assert.equal(cancelled.statusCode, 200);
  assert.equal(cancelled.json().job.status, 'cancelled');
  assert.equal((await call('POST', `/generations/${c.json().job.id}/cancel`)).statusCode, 409);

  // A permanent failure surfaces per task with a retry action; the retry finishes the job.
  await call('POST', '/courses', { id: 'en-d', languageCode: 'en', title: 'D' });
  const d = await call('POST', '/courses/en-d/generations', {
    topic: 'Тема',
    totalExercises: 6,
    targetWords: ['moon'],
    simulate: { stage: 'image', targetId: 'moon', times: 1, permanent: true },
    idempotencyKey: crypto.randomUUID(),
  });
  await runWorkerUntilIdle(worker);
  const failed = await call('GET', `/generations/${d.json().job.id}`);
  assert.equal(failed.json().job.status, 'failed');
  assert.match(failed.json().job.error, /image \(moon\)/);
  const failedTask = failed
    .json()
    .tasks.find(
      (x: { status: string; stage: string }) => x.status === 'failed' && x.stage === 'image',
    );
  assert.ok(failedTask);
  assert.ok(failed.json().allowed.retryTaskIds.includes(failedTask.id));
  // Lift the simulated failure, then retry through the API.
  await db.execute(
    sql`update generation_jobs set input = input - 'simulate' where id = ${d.json().job.id}`,
  );
  const retried = await call(
    'POST',
    `/generations/${d.json().job.id}/tasks/${failedTask.id}/retry`,
  );
  assert.equal(retried.statusCode, 200, retried.body);
  assert.equal(retried.json().job.status, 'running');
  await runWorkerUntilIdle(worker);
  assert.equal(
    (await call('GET', `/generations/${d.json().job.id}`)).json().job.status,
    'awaiting-review',
  );

  // Conflicts: edit a lesson, regenerate, apply the AI variant explicitly.
  const lessonId = course.lessons[0].id as string;
  await db
    .update(lessons)
    .set({
      title: 'Моя правка',
      presentation: {
        intro: 'Моё вступление',
        completionTitle: 'Мой финал',
        completionMessage: 'Моё',
      },
      editRevision: sql`${lessons.editRevision} + 1`,
    })
    .where(eq(lessons.id, lessonId));
  const again = await call('POST', '/courses/en-space-set/generations', {
    topic: 'Космос',
    totalExercises: 12,
    idempotencyKey: crypto.randomUUID(),
  });
  await runWorkerUntilIdle(worker);
  const conflicted = await call('GET', `/generations/${again.json().job.id}`);
  assert.equal(conflicted.json().job.status, 'awaiting-review');
  assert.ok(conflicted.json().allowed.applyConflicts);
  assert.equal((await call('GET', `/lessons/${lessonId}`)).json().lesson.title, 'Моя правка');
  const applied = await call('POST', `/generations/${again.json().job.id}/apply-conflicts`);
  assert.equal(applied.statusCode, 200, applied.body);
  assert.equal(applied.json().allowed.applyConflicts, false);
  const replaced = (await call('GET', `/lessons/${lessonId}`)).json().lesson;
  assert.notEqual(replaced.title, 'Моя правка');
  assert.notEqual(replaced.presentation?.intro, 'Моё вступление');
  // The variant brings its own intro and completion texts, not only the exercises.
  const stored = await db.query.generationJobs.findFirst({
    where: eq(generationJobs.id, again.json().job.id),
  });
  assert.ok(stored);
  assert.deepEqual(
    replaced.presentation,
    stored.output!.lessons.find((l) => l.lessonId === lessonId)!.presentation,
  );
  assert.equal(
    (await call('POST', `/generations/${again.json().job.id}/apply-conflicts`)).statusCode,
    409,
  );

  // Without a provider the wizard is off but everything else works.
  const offline = buildApp({
    contentRoot,
    admin: {
      db,
      storageRoot,
      cookieSecure: false,
      sessionTtlHours: 1,
      generation: { ...generation, provider: null, unavailableReason: 'нет ключа' },
    },
  });
  try {
    const offSettings = await offline.inject({ url: '/v1/admin/generation-settings', headers });
    assert.equal(offSettings.json().providerReady, false);
    const refused = await offline.inject({
      method: 'POST',
      url: '/v1/admin/courses/en-c/generations',
      headers,
      payload: { topic: 'Тема', totalExercises: 6, idempotencyKey: crypto.randomUUID() },
    });
    assert.equal(refused.statusCode, 503);
    assert.equal(refused.json().code, 'provider_unavailable');
    assert.equal((await offline.inject({ url: '/v1/admin/languages', headers })).statusCode, 200);
  } finally {
    await offline.close();
  }
});
