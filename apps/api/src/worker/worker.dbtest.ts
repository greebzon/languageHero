import test from 'node:test';
import assert from 'node:assert/strict';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { generationInputSchema, type GenerationInput } from '@lingvohero/contracts';
import { importPublishedContent } from '../admin/import.js';
import { createTestContext } from '../admin/testing.js';
import type { Db } from '../db/client.js';
import { assets, courses, generationTasks, lessons } from '../db/schema.js';
import { FakeProvider } from '../generation/fake-provider.js';
import { buildRelease } from '../publishing/build-release.js';
import { loadBuildInput } from '../publishing/plan.js';
import { cancelJob, claimTask, createJob, jobTasks, recoverLeases, retryTask } from './queue.js';
import { runWorkerOnce, runWorkerUntilIdle } from './runner.js';
import type { StageContext } from './stages.js';

const rates = { imageUsd: 0.04, ttsPer1kCharsUsd: 0.015, textPer1kTokensUsd: 0.01 };
const modelConfig = {
  text: 'fake',
  image: 'fake',
  imageQuality: 'low',
  tts: 'fake',
  voice: 'fake',
};

function context(db: Db, storageRoot: string, provider: FakeProvider): StageContext {
  return { db, provider, storageRoot, rates, workerId: 'test-worker' };
}

async function makeCourse(db: Db, id: string) {
  await db.insert(courses).values({ id, languageCode: 'en', title: `Set ${id}` });
}

async function start(
  db: Db,
  courseId: string,
  input: Partial<GenerationInput>,
  key: string = crypto.randomUUID(),
  costLimitUsd = 5,
) {
  return createJob(db, {
    courseId,
    input: generationInputSchema.parse({ topic: 'Зоопарк', totalExercises: 12, ...input }),
    modelConfig,
    idempotencyKey: key,
    requestedBy: null,
    costLimitUsd,
  });
}

/** retry-wait tasks would normally wait for their backoff; tests make them due immediately. */
const dueNow = (db: Db, jobId: string) =>
  db
    .update(generationTasks)
    .set({ nextAttemptAt: sql`now() - interval '1 second'` })
    .where(and(eq(generationTasks.jobId, jobId), eq(generationTasks.status, 'retry-wait')));

async function drain(ctx: StageContext, jobId: string, rounds = 10) {
  for (let i = 0; i < rounds; i += 1) {
    await runWorkerUntilIdle(ctx);
    const job = await ctx.db.query.generationJobs.findFirst({
      where: (j, { eq: e }) => e(j.id, jobId),
    });
    if (job && job.status !== 'running' && job.status !== 'queued') return job;
    await dueNow(ctx.db, jobId);
  }
  return (await ctx.db.query.generationJobs.findFirst({
    where: (j, { eq: e }) => e(j.id, jobId),
  }))!;
}

test('a job runs through every stage and leaves a publishable draft set', async (t) => {
  const ctx0 = await createTestContext(t);
  if (!ctx0) return;
  const { db, contentRoot, storageRoot } = ctx0;
  await importPublishedContent(db, contentRoot);
  await makeCourse(db, 'en-zoo');
  const provider = new FakeProvider();
  const ctx = context(db, storageRoot, provider);
  const { job, created } = await start(db, 'en-zoo', {
    totalExercises: 12,
    targetWords: ['apple', 'ball'],
  });
  assert.equal(created, true);
  const again = await start(db, 'en-zoo', { totalExercises: 12 }, job.idempotencyKey);
  assert.equal(again.created, false);
  assert.equal(again.job.id, job.id);
  await assert.rejects(start(db, 'en-zoo', {}), /уже идёт/);

  const done = await drain(ctx, job.id);
  assert.equal(done.status, 'awaiting-review', done.error ?? '');
  assert.deepEqual(done.output!.distribution, [6, 6]);
  assert.equal(done.output!.words.length, 8);
  assert.ok(done.usage.images === 9 && done.usage.estimatedUsd > 0.3, JSON.stringify(done.usage));
  const tasks = await jobTasks(db, job.id);
  assert.equal(tasks.filter((x) => x.status !== 'succeeded').length, 0);
  assert.deepEqual(
    [...new Set(tasks.map((x) => x.stage))],
    ['plan', 'text', 'review', 'media-plan', 'cover', 'image', 'audio', 'assemble'],
  );
  const rows = await db.select().from(lessons).where(eq(lessons.courseId, 'en-zoo'));
  assert.deepEqual(rows.map((r) => r.id).sort(), ['en-zoo-01', 'en-zoo-02']);
  assert.ok(rows.every((r) => r.document.exercises.length === 6));
  assert.ok(rows.every((r) => r.document.media.every((m) => m.assetId)));
  const generated = await db.select().from(assets).where(eq(assets.generationTaskId, tasks[0]!.id));
  assert.equal(generated.length, 0); // plan task produced no media
  const all = await db.query.assets.findMany({
    where: (a, { eq: e }) => e(a.status, 'draft'),
  });
  assert.equal(
    all.filter((a) => a.provenance.source === 'generated').length,
    17,
    JSON.stringify(all.map((a) => [a.kind, a.width, a.altText, a.provenance.source])),
  );
  const course = (await db.query.courses.findFirst({
    where: (c, { eq: e }) => e(c.id, 'en-zoo'),
  }))!;
  assert.ok(course.coverAssetId);
  assert.equal(course.topic, 'Зоопарк');

  // The draft is a valid release once the set is made public.
  await db.update(courses).set({ visibility: 'published' }).where(eq(courses.id, 'en-zoo'));
  const built = buildRelease(await loadBuildInput(db, 99));
  assert.deepEqual(built.errors, []);
  assert.ok(built.release!.catalog.courses.some((c) => c.id === 'en-zoo' && c.cover));

  // Regenerating after a manual edit keeps the admin's version and stores the AI variant aside.
  // Words already in the course are avoided by the plan; the required ones and the cover repeat
  // exactly, so their media is reused rather than generated again.
  await db
    .update(lessons)
    .set({ title: 'Правка админа', editRevision: sql`${lessons.editRevision} + 1` })
    .where(eq(lessons.id, 'en-zoo-01'));
  provider.calls.length = 0;
  const second = await start(db, 'en-zoo', { totalExercises: 12, targetWords: ['apple', 'ball'] });
  const secondDone = await drain(ctx, second.job.id);
  assert.equal(secondDone.status, 'awaiting-review', secondDone.error ?? '');
  assert.equal(secondDone.output!.conflicts!.length, 2);
  assert.ok(secondDone.warnings.some((w) => /изменён вручную/.test(w)));
  const diagnostics = JSON.stringify({
    calls: provider.calls,
    words: secondDone.output!.words.map((w) => w.key),
  });
  assert.ok(
    secondDone.output!.words.some((w) => w.key === 'apple'),
    diagnostics,
  );
  const reusedKeys = ['apple', 'ball', 'cover'];
  assert.equal(
    provider.calls.filter((c) => reusedKeys.includes(c.targetId)).length,
    0,
    diagnostics,
  );
  const fresh = secondDone.output!.words.filter((w) => !reusedKeys.includes(w.key));
  assert.ok(fresh.length >= 4, diagnostics);
  assert.equal(provider.calls.filter((c) => c.stage === 'image').length, fresh.length, diagnostics);
  const edited = (await db.query.lessons.findFirst({
    where: (l, { eq: e }) => e(l.id, 'en-zoo-01'),
  }))!;
  assert.equal(edited.title, 'Правка админа');
});

test('transient failures back off and recover; permanent ones fail the job until retried', async (t) => {
  const ctx0 = await createTestContext(t);
  if (!ctx0) return;
  const { db, contentRoot, storageRoot } = ctx0;
  await importPublishedContent(db, contentRoot);
  await makeCourse(db, 'en-a');
  await makeCourse(db, 'en-b');
  const provider = new FakeProvider();
  const ctx = context(db, storageRoot, provider);

  // Two rate-limit failures per image: retry-wait with backoff, then success on the third try.
  const { job } = await start(db, 'en-a', {
    totalExercises: 6,
    simulate: { stage: 'image', times: 2, permanent: false, delayMs: 0 },
  });
  await runWorkerUntilIdle(ctx);
  const waiting = (await jobTasks(db, job.id)).filter((x) => x.status === 'retry-wait');
  assert.ok(waiting.length > 0);
  assert.ok(waiting.every((x) => x.nextAttemptAt! > new Date() && /rate limit/.test(x.lastError!)));
  const done = await drain(ctx, job.id);
  assert.equal(done.status, 'awaiting-review', done.error ?? '');
  const images = (await jobTasks(db, job.id)).filter((x) => x.stage === 'image');
  assert.ok(images.every((x) => x.attempts === 3 && x.status === 'succeeded'));

  // Five failures of one word exceed the budget of three attempts: the job fails, the rest is cancelled…
  // (`zebra` is new: the words of the first job already have reusable audio artifacts.)
  const b = await start(db, 'en-b', {
    totalExercises: 6,
    targetWords: ['zebra'],
    simulate: { stage: 'audio', targetId: 'zebra', times: 5, permanent: false, delayMs: 0 },
  });
  const failed = await drain(ctx, b.job.id);
  assert.equal(failed.status, 'failed');
  assert.match(failed.error!, /audio/);
  const tasksB = await jobTasks(db, b.job.id);
  assert.ok(tasksB.some((x) => x.stage === 'audio' && x.status === 'failed' && x.attempts === 3));
  assert.ok(tasksB.some((x) => x.stage === 'assemble' && x.status === 'cancelled'));
  assert.equal((await db.select().from(lessons).where(eq(lessons.courseId, 'en-b'))).length, 0);
  // …and a manual retry of the failed step extends the budget and finishes the job.
  for (const task of tasksB.filter((x) => x.status === 'failed'))
    await retryTask(db, b.job.id, task.id, null);
  const recovered = await drain(ctx, b.job.id);
  assert.equal(recovered.status, 'awaiting-review', recovered.error ?? '');
  assert.equal((await db.select().from(lessons).where(eq(lessons.courseId, 'en-b'))).length, 1);
});

test('cancel, expired leases and the cost limit', async (t) => {
  const ctx0 = await createTestContext(t);
  if (!ctx0) return;
  const { db, contentRoot, storageRoot } = ctx0;
  await importPublishedContent(db, contentRoot);
  const provider = new FakeProvider();
  const ctx = context(db, storageRoot, provider);

  await makeCourse(db, 'en-c');
  const { job } = await start(db, 'en-c', { totalExercises: 6 });
  const first = await runWorkerOnce(ctx);
  assert.equal(first?.stage, 'plan');
  await cancelJob(db, job.id, null);
  const cancelled = await drain(ctx, job.id);
  assert.equal(cancelled.status, 'cancelled');
  const tasks = await jobTasks(db, job.id);
  assert.ok(tasks.filter((x) => x.status === 'cancelled').length > 0);
  assert.equal(tasks.filter((x) => x.status === 'pending').length, 0);
  await assert.rejects(cancelJob(db, job.id, null), /уже в состоянии/);

  // A worker that died mid-task: its lease expires and another worker picks the task up.
  await makeCourse(db, 'en-d');
  const d = await start(db, 'en-d', { totalExercises: 6 });
  const claimed = (await claimTask(db, 'dead-worker'))!;
  assert.equal(claimed.jobId, d.job.id);
  assert.equal(await claimTask(db, 'other-worker'), null);
  await db
    .update(generationTasks)
    .set({ leaseUntil: new Date(Date.now() - 1000) })
    .where(eq(generationTasks.id, claimed.id));
  assert.equal(await recoverLeases(db), 1);
  const dDone = await drain(ctx, d.job.id);
  assert.equal(dDone.status, 'awaiting-review', dDone.error ?? '');
  const planTask = (await jobTasks(db, d.job.id)).find((x) => x.stage === 'plan')!;
  assert.equal(planTask.attempts, 2);

  // The cost cap stops the job before the budget is gone.
  await makeCourse(db, 'en-e');
  const e = await start(db, 'en-e', { totalExercises: 6 }, crypto.randomUUID(), 0.05);
  const capped = await drain(ctx, e.job.id);
  assert.equal(capped.status, 'failed');
  assert.match(capped.error!, /лимит стоимости/);
  const pendingOrRunning = await db
    .select()
    .from(generationTasks)
    .where(
      and(
        eq(generationTasks.jobId, e.job.id),
        inArray(generationTasks.status, ['pending', 'running']),
      ),
    );
  assert.equal(pendingOrRunning.length, 0);
});
