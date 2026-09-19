import test from 'node:test';
import assert from 'node:assert/strict';
import { open, readFile, readdir, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { importPublishedContent } from '../admin/import.js';
import { createTestContext } from '../admin/testing.js';
import { defaultContentRoot, readCatalog } from '../content.js';
import { publications } from '../db/schema.js';

function multipart(name: string, bytes: Buffer) {
  const boundary = 'lingvo-test-boundary';
  const payload = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${name}"\r\n\r\n`,
    ),
    bytes,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return { payload, contentType: `multipart/form-data; boundary=${boundary}` };
}

test('plan → publish flow: versions, media, stale plans, previews, archive and restore', async (t) => {
  const ctx = await createTestContext(t);
  if (!ctx) return;
  const { app, db, contentRoot, headers } = ctx;
  await importPublishedContent(db, contentRoot);
  const call = (
    method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
    url: string,
    payload?: Record<string, unknown>,
  ) => app.inject({ method, url: `/v1/admin${url}`, headers, payload });
  const publicCatalog = async () => (await app.inject('/v1/catalog?schemaVersion=2')).json();
  const upload = async (name: string, bytes: Buffer) => {
    const body = multipart(name, bytes);
    const response = await app.inject({
      method: 'POST',
      url: '/v1/admin/assets',
      headers: { ...headers, 'content-type': body.contentType },
      payload: body.payload,
    });
    return response.json().asset as { id: string; sha256: string; url: string };
  };
  const startRevision = (await readCatalog(contentRoot)).revision;

  // A plan with nothing changed still validates and reproduces the published catalog.
  const noop = await call('POST', '/publication-plans');
  assert.equal(noop.statusCode, 201, noop.body);
  assert.deepEqual(noop.json().diff.lessons, []);
  assert.deepEqual(noop.json().diff.courses, { added: [], removed: [], changed: [] });
  assert.equal(noop.json().publication.targetRevision, startRevision + 1);

  // New language + set + lesson with a fresh cover and imported audio.
  const tim = await readFile(new URL('../../../mobile/assets/images/tim.png', import.meta.url));
  const cover = await upload('tim.png', tim);
  const wavName = (await readdir(join(defaultContentRoot, 'media'))).find((n) =>
    n.endsWith('.wav'),
  )!;
  const audio = await upload('fox.wav', await readFile(join(defaultContentRoot, 'media', wavName)));
  await call('POST', '/languages', { code: 'de', title: 'Немецкий', status: 'active' });
  await call('POST', '/courses', {
    id: 'de-zoo',
    languageCode: 'de',
    title: 'Зоопарк',
    description: 'Звери',
    coverAssetId: cover.id,
    visibility: 'published',
  });
  const document = {
    words: [
      {
        id: 'fox',
        text: 'Fuchs',
        spelling: 'fuchs',
        translation: 'Лиса',
        imageId: 'fox-img',
        audioId: 'fox-audio',
      },
    ],
    media: [
      { id: 'fox-img', kind: 'image', assetId: cover.id },
      { id: 'fox-audio', kind: 'audio', assetId: audio.id },
    ],
    exercises: [
      {
        id: 'ex-1',
        type: 'listen-and-select',
        prompt: 'Слушай',
        hint: 'Рыжая',
        wordId: 'fox',
        choices: ['fox'],
      },
    ],
  };
  await call('POST', '/courses/de-zoo/lessons', { id: 'de-zoo-01', title: 'Лиса', document });
  const invalid = await call('POST', '/courses/de-zoo/validate');
  assert.equal(invalid.json().ok, false);
  assert.match(JSON.stringify(invalid.json().errors), /de-zoo-01/);
  document.exercises[0]!.choices = ['fox', 'fox'];
  await call('PATCH', '/lessons/de-zoo-01', { document, editRevision: 1 });
  assert.equal((await call('POST', '/courses/de-zoo/validate')).json().ok, false);
  document.words.push({
    id: 'owl',
    text: 'Eule',
    spelling: 'eule',
    translation: 'Сова',
    imageId: 'fox-img',
    audioId: 'fox-audio',
  });
  document.exercises[0]!.choices = ['fox', 'owl'];
  await call('PATCH', '/lessons/de-zoo-01', { document, editRevision: 2 });
  assert.equal((await call('POST', '/courses/de-zoo/validate')).json().ok, true);

  // The old plan is stale now; a fresh plan carries the new content.
  const plan = await call('POST', '/publication-plans');
  assert.equal(plan.statusCode, 201, plan.body);
  assert.deepEqual(plan.json().diff.languages.added, ['de']);
  assert.deepEqual(plan.json().diff.courses.added, ['de-zoo']);
  assert.deepEqual(plan.json().diff.lessons, [
    { id: 'de-zoo-01', title: 'Лиса', from: null, to: 1 },
  ]);
  assert.equal((await publicCatalog()).languages.length, 1);

  const published = await call('POST', '/publications', { planId: plan.json().publication.id });
  assert.equal(published.statusCode, 200, published.body);
  assert.equal(published.json().publication.status, 'published');
  const catalog = await publicCatalog();
  assert.equal(catalog.revision, startRevision + 1);
  assert.deepEqual(
    catalog.languages.map((l: { code: string }) => l.code),
    ['en', 'de'],
  );
  const zoo = catalog.courses.find((c: { id: string }) => c.id === 'de-zoo');
  assert.equal(zoo.cover.path, `/v1/media/${cover.sha256}.png`);
  assert.deepEqual(zoo.lessons[0], {
    id: 'de-zoo-01',
    version: 1,
    title: 'Лиса',
    exerciseCount: 1,
    requiredTypes: ['listen-and-select'],
  });
  const pkg = await app.inject('/v1/lessons/de-zoo-01/versions/1');
  assert.equal(pkg.statusCode, 200);
  assert.equal(pkg.json().language, 'de');
  const media = await app.inject(`/v1/media/${cover.sha256}.png`);
  assert.equal(media.statusCode, 200);
  assert.deepEqual(media.rawPayload, tim);
  assert.equal((await call('GET', `/assets/${cover.id}`)).json().asset.status, 'published');
  const lessonRow = (await call('GET', '/lessons/de-zoo-01')).json().lesson;
  assert.equal(lessonRow.lastPublishedVersion, 1);

  // Publishing the stale first plan is refused and the store is untouched.
  const stale = await call('POST', '/publications', { planId: noop.json().publication.id });
  assert.equal(stale.statusCode, 409);
  assert.equal(stale.json().code, 'stale_plan');
  assert.equal((await publicCatalog()).revision, startRevision + 1);

  // Unchanged lesson keeps version 1 across another release; a change bumps to 2.
  const renamed = await call('PATCH', '/courses/de-zoo', { title: 'Зоопарк!', editRevision: 1 });
  assert.equal(renamed.statusCode, 200, renamed.body);
  const second = await call('POST', '/publication-plans');
  assert.deepEqual(second.json().diff.lessons, []);
  assert.deepEqual(second.json().diff.courses.changed, ['de-zoo']);
  await call('POST', '/publications', { planId: second.json().publication.id });
  assert.equal(
    (await publicCatalog()).courses.find((c: { id: string }) => c.id === 'de-zoo').lessons[0]
      .version,
    1,
  );
  await call('PATCH', '/lessons/de-zoo-01', { title: 'Лиса и сова', editRevision: 3 });
  const third = await call('POST', '/publication-plans');
  assert.deepEqual(third.json().diff.lessons, [
    { id: 'de-zoo-01', title: 'Лиса и сова', from: 1, to: 2 },
  ]);
  await call('POST', '/publications', { planId: third.json().publication.id });
  assert.equal((await app.inject('/v1/lessons/de-zoo-01/versions/1')).json().title, 'Лиса');
  assert.equal((await app.inject('/v1/lessons/de-zoo-01/versions/2')).json().title, 'Лиса и сова');

  // Preview → published set keeps its id and yields exactly one card.
  await call('POST', '/courses/en-underwater/lessons', {
    id: 'en-underwater-01',
    title: 'Рыбы',
    document,
  });
  const underwater = (await call('GET', '/courses/en-underwater')).json().course;
  await call('PATCH', '/courses/en-underwater', {
    visibility: 'published',
    editRevision: underwater.editRevision,
  });
  const fourth = await call('POST', '/publication-plans');
  assert.equal(fourth.statusCode, 201, fourth.body);
  assert.deepEqual(fourth.json().diff.previews.removed, ['en-underwater']);
  assert.deepEqual(fourth.json().diff.courses.added, ['en-underwater']);
  await call('POST', '/publications', { planId: fourth.json().publication.id });
  const afterPromotion = await publicCatalog();
  assert.equal(
    afterPromotion.courses.filter((c: { id: string }) => c.id === 'en-underwater').length,
    1,
  );
  assert.deepEqual(
    afterPromotion.previews.map((p: { id: string }) => p.id),
    ['en-space'],
  );
  // The underwater lesson reused an already-published image (no copy needed) — its id differs from the fox lesson.
  assert.equal((await app.inject('/v1/lessons/en-underwater-01/versions/1')).statusCode, 200);

  // Archiving a language hides its sets; earlier packages stay addressable.
  await call('PATCH', '/languages/de', { status: 'archived' });
  const fifth = await call('POST', '/publication-plans');
  assert.deepEqual(fifth.json().diff.languages.removed, ['de']);
  assert.deepEqual(fifth.json().diff.courses.removed, ['de-zoo']);
  await call('POST', '/publications', { planId: fifth.json().publication.id });
  assert.equal((await publicCatalog()).languages.length, 1);
  assert.equal((await app.inject('/v1/lessons/de-zoo-01/versions/2')).statusCode, 200);

  // Restore an earlier revision as a new one.
  const restore = await call('POST', '/publication-plans/restore', { revision: startRevision + 3 });
  assert.equal(restore.statusCode, 201, restore.body);
  assert.equal(restore.json().publication.kind, 'restore');
  assert.deepEqual(restore.json().diff.languages.added, ['de']);
  await call('POST', '/publications', { planId: restore.json().publication.id });
  const restored = await publicCatalog();
  assert.equal(restored.revision, startRevision + 6);
  assert.equal(restored.languages.length, 2);
  assert.equal(
    (await call('POST', '/publication-plans/restore', { revision: 999 })).statusCode,
    404,
  );

  // A foreign publisher lock blocks the panel without corrupting anything.
  const lock = await open(join(contentRoot, '.publish.lock'), 'wx');
  await lock.close();
  const blocked = await call('POST', '/publication-plans');
  const busy = await call('POST', '/publications', { planId: blocked.json().publication.id });
  assert.equal(busy.statusCode, 409);
  assert.equal(busy.json().code, 'publisher_busy');
  assert.equal((await call('GET', '/publications')).json().lockPresent, true);
  await unlink(join(contentRoot, '.publish.lock'));
  assert.equal((await publicCatalog()).revision, startRevision + 6);

  // Recovery: a publication stuck in `publishing` whose target already matches the store.
  const again = await call('POST', '/publication-plans');
  const stuckId = again.json().publication.id as string;
  await db
    .update(publications)
    .set({ status: 'publishing', createdAt: new Date(Date.now() - 11 * 60_000) })
    .where(eq(publications.id, stuckId));
  const list = await call('GET', '/publications');
  const recovered = list.json().items.find((p: { id: string }) => p.id === stuckId);
  assert.equal(recovered.status, 'failed');
  assert.equal(recovered.error, 'interrupted');
  assert.equal(list.json().currentRevision, startRevision + 6);
  const detail = await call('GET', `/publications/${stuckId}`);
  assert.equal(detail.json().publication.actorLogin, 'admin');
  assert.ok(detail.json().diff);
  const drafts = await call('GET', '/courses?visibility=draft');
  assert.equal(drafts.json().total, 0);
  const publicNoDrafts = JSON.stringify(await publicCatalog());
  assert.equal(publicNoDrafts.includes('assetId'), false);
});
