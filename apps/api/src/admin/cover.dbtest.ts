import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { runWorkerUntilIdle } from '../worker/runner.js';
import { importPublishedContent } from './import.js';
import { createTestContext } from './testing.js';

test('a set cover can be removed and redrawn: the job replaces the draft cover', async (t) => {
  const ctx = await createTestContext(t);
  if (!ctx) return;
  const { app, db, storageRoot, headers, provider, generation, contentRoot } = ctx;
  await importPublishedContent(db, contentRoot);
  const call = (method: 'GET' | 'POST' | 'PATCH', url: string, payload?: Record<string, unknown>) =>
    app.inject({ method, url: `/v1/admin${url}`, headers, payload });
  const worker = { db, provider, storageRoot, rates: generation.rates, workerId: 'cover-test' };

  const before = (await call('GET', '/courses/en-forest')).json().course;
  assert.ok(before.coverAssetId, 'the imported set has a cover');

  // Removing the cover is a plain edit.
  const removed = await call('PATCH', '/courses/en-forest', {
    coverAssetId: null,
    editRevision: before.editRevision,
  });
  assert.equal(removed.statusCode, 200, removed.body);
  assert.equal(removed.json().course.coverAssetId, null);

  const key = randomUUID();
  const started = await call('POST', '/courses/en-forest/cover/generate', {
    hint: 'a misty forest glade at sunrise',
    idempotencyKey: key,
  });
  assert.equal(started.statusCode, 202, started.body);
  const job = started.json().job;
  assert.equal(job.kind, 'cover');
  assert.equal(job.courseId, 'en-forest');
  // Same key → same job; a second job for the set while one runs → 409.
  assert.equal(
    (await call('POST', '/courses/en-forest/cover/generate', { idempotencyKey: key })).statusCode,
    200,
  );
  assert.equal(
    (await call('POST', '/courses/en-forest/cover/generate', { idempotencyKey: randomUUID() }))
      .statusCode,
    409,
  );
  assert.equal(
    (await call('POST', '/courses/nope/cover/generate', { idempotencyKey: randomUUID() }))
      .statusCode,
    404,
  );

  await runWorkerUntilIdle(worker);
  const done = (await call('GET', `/generations/${job.id}`)).json();
  assert.equal(done.job.status, 'awaiting-review', JSON.stringify(done.job));
  assert.deepEqual(
    done.tasks.map((task: { stage: string; status: string }) => [task.stage, task.status]),
    [['course-cover', 'succeeded']],
  );
  const after = (await call('GET', '/courses/en-forest')).json().course;
  assert.ok(after.coverAssetId, 'the new cover is set');
  assert.equal(after.coverAssetId, done.tasks[0].output.assetId);
  assert.equal(after.cover.kind, 'image');
  assert.ok(after.editRevision > removed.json().course.editRevision, 'the revision moved');
  const history = (await call('GET', '/courses/en-forest/generations')).json().items;
  assert.equal(history[0].id, job.id);
});
