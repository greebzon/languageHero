import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import seed from '../../../../content/seed.json' with { type: 'json' };
import { defaultContentRoot } from '../content.js';
import { importPublishedContent } from './import.js';
import { createTestContext } from './testing.js';

/** Files the seeded test catalog references (the working store may hold newer ones too). */
async function storeFiles() {
  const dir = join(defaultContentRoot, 'media');
  const paths = seed.lessons.flatMap((l) => l.media.map((m) => m.path.split('/').pop()!));
  const png = paths.find((n) => n.endsWith('.png'))!;
  const wav = paths.find((n) => n.endsWith('.wav'))!;
  return { png: await readFile(join(dir, png)), wav: await readFile(join(dir, wav)) };
}

function multipart(name: string, bytes: Buffer) {
  const boundary = 'lingvo-test-boundary';
  const payload = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${name}"\r\nContent-Type: application/octet-stream\r\n\r\n`,
    ),
    bytes,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return { payload, headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } };
}

test('languages, courses, lessons and assets: manual editing rules', async (t) => {
  const ctx = await createTestContext(t);
  if (!ctx) return;
  const { app, db, contentRoot, headers } = ctx;
  await importPublishedContent(db, contentRoot);
  const call = (
    method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
    url: string,
    payload?: Record<string, unknown>,
  ) => app.inject({ method, url: `/v1/admin${url}`, headers, payload });

  // Anonymous and cross-origin writes are rejected before touching data.
  assert.equal((await app.inject('/v1/admin/languages')).statusCode, 401);
  assert.equal(
    (
      await app.inject({
        method: 'POST',
        url: '/v1/admin/languages',
        headers: { cookie: headers.cookie },
        payload: { code: 'xx', title: 'X' },
      })
    ).statusCode,
    403,
  );

  // Languages
  const list = await call('GET', '/languages');
  assert.deepEqual(
    list.json().items.map((l: { code: string; courseCount: number }) => [l.code, l.courseCount]),
    [['en', 3]],
  );
  const created = await call('POST', '/languages', { code: 'de', title: 'Немецкий' });
  assert.equal(created.statusCode, 201);
  assert.equal(created.json().language.status, 'draft');
  assert.equal((await call('POST', '/languages', { code: 'de', title: 'X' })).statusCode, 409);
  const badCode = await call('POST', '/languages', { code: 'DE', title: 'X' });
  assert.equal(badCode.statusCode, 400);
  assert.ok(badCode.json().fieldErrors.code);
  assert.equal(
    (await call('PATCH', '/languages/de', { status: 'active' })).json().language.status,
    'active',
  );
  assert.equal((await call('PATCH', '/languages/xx', { title: 'X' })).statusCode, 404);

  // Courses
  const course = await call('POST', '/courses', {
    id: 'de-zoo',
    languageCode: 'de',
    title: 'Зоопарк',
    description: 'Животные по-немецки',
  });
  assert.equal(course.statusCode, 201);
  assert.equal(course.json().course.position, 0);
  assert.equal(course.json().course.editRevision, 1);
  assert.equal(
    (await call('POST', '/courses', { id: 'xx-1', languageCode: 'xx', title: 'X' })).statusCode,
    400,
  );
  assert.equal(
    (await call('POST', '/courses', { id: 'de-zoo', languageCode: 'de', title: 'X' })).statusCode,
    409,
  );
  const visible = await call('PATCH', '/courses/de-zoo', {
    visibility: 'published',
    editRevision: 1,
  });
  assert.equal(visible.statusCode, 200);
  const patched = await call('PATCH', '/courses/de-zoo', { title: 'Зоопарк!', editRevision: 2 });
  assert.equal(patched.statusCode, 200);
  assert.equal(patched.json().course.editRevision, 3);
  // A partial update never resets the fields it does not mention.
  assert.equal(patched.json().course.visibility, 'published');
  assert.equal(patched.json().course.description, 'Животные по-немецки');
  const stale = await call('PATCH', '/courses/de-zoo', { title: 'Старое', editRevision: 1 });
  assert.equal(stale.statusCode, 409);
  assert.equal(stale.json().code, 'stale_revision');
  assert.equal((await call('GET', '/courses/de-zoo')).json().course.title, 'Зоопарк!');
  const byLanguage = await call('GET', '/courses?language=de');
  assert.equal(byLanguage.json().total, 1);
  assert.equal((await call('GET', '/courses?language=en&visibility=preview')).json().total, 2);

  // Assets
  const files = await storeFiles();
  const duplicate = await app.inject({
    method: 'POST',
    url: '/v1/admin/assets',
    headers: { ...headers, ...multipart('animals.png', files.png).headers },
    payload: multipart('animals.png', files.png).payload,
  });
  assert.equal(duplicate.statusCode, 200);
  assert.equal(duplicate.json().created, false);
  assert.equal(duplicate.json().asset.status, 'published');
  const tim = await readFile(new URL('../../../mobile/assets/images/tim.png', import.meta.url));
  const upload = await app.inject({
    method: 'POST',
    url: '/v1/admin/assets',
    headers: { ...headers, ...multipart('tim.png', tim).headers },
    payload: multipart('tim.png', tim).payload,
  });
  assert.equal(upload.statusCode, 201);
  const asset = upload.json().asset;
  assert.equal(asset.kind, 'image');
  assert.equal(asset.status, 'draft');
  assert.equal(asset.provenance.uploadedBy, 'admin');
  const served = await app.inject({ url: asset.url, headers });
  assert.equal(served.statusCode, 200);
  assert.equal(served.headers['content-type'], 'image/png');
  assert.deepEqual(served.rawPayload, tim);
  assert.equal((await app.inject(asset.url)).statusCode, 401);
  const jpeg = await app.inject({
    method: 'POST',
    url: '/v1/admin/assets',
    headers: { ...headers, ...multipart('photo.png', Buffer.from('ffd8ffe0', 'hex')).headers },
    payload: multipart('photo.png', Buffer.from('ffd8ffe0', 'hex')).payload,
  });
  assert.equal(jpeg.statusCode, 422);
  assert.equal(jpeg.json().code, 'invalid_media');
  assert.equal((await call('GET', '/assets?kind=audio')).json().total, 4);
  assert.equal((await call('GET', '/assets/not-a-uuid')).statusCode, 404);
  const cover = await call('PATCH', '/courses/de-zoo', { coverAssetId: asset.id, editRevision: 3 });
  assert.equal(cover.json().course.cover.id, asset.id);
  const audioAsset = (await call('GET', '/assets?kind=audio')).json().items[0];
  const badCover = await call('PATCH', '/courses/de-zoo', {
    coverAssetId: audioAsset.id,
    editRevision: 4,
  });
  assert.equal(badCover.statusCode, 400);
  assert.ok(badCover.json().fieldErrors.coverAssetId);

  // Lessons: an empty draft saves, the preview refuses it with field errors.
  const lesson = await call('POST', '/courses/de-zoo/lessons', {
    id: 'de-zoo-01',
    title: 'Урок 1',
  });
  assert.equal(lesson.statusCode, 201);
  assert.deepEqual(lesson.json().lesson.document, { words: [], media: [], exercises: [] });
  const emptyPreview = await call('GET', '/lessons/de-zoo-01/preview');
  assert.equal(emptyPreview.statusCode, 422);
  assert.ok(emptyPreview.json().fieldErrors.words);
  const document = {
    words: [
      {
        id: 'tim',
        text: 'Tim',
        spelling: 'tim',
        translation: 'Тим',
        imageId: 'tim-img',
        audioId: 'tim-audio',
      },
    ],
    media: [
      { id: 'tim-img', kind: 'image', assetId: asset.id },
      { id: 'tim-audio', kind: 'audio', assetId: audioAsset.id },
    ],
    exercises: [
      {
        id: 'ex-1',
        type: 'build-word',
        prompt: 'Собери слово',
        hint: 'Три буквы',
        wordId: 'tim',
        tiles: [
          { id: 't1', letter: 't' },
          { id: 't2', letter: 'i' },
          { id: 't3', letter: 'x' },
        ],
      },
    ],
  };
  const unsolvable = await call('PATCH', '/lessons/de-zoo-01', { document, editRevision: 1 });
  assert.equal(unsolvable.statusCode, 200);
  const brokenPreview = await call('GET', '/lessons/de-zoo-01/preview');
  assert.equal(brokenPreview.statusCode, 422);
  assert.match(JSON.stringify(brokenPreview.json().fieldErrors), /Tiles cannot form word/);
  document.exercises[0]!.tiles[2] = { id: 't3', letter: 'm' };
  assert.equal(
    (await call('PATCH', '/lessons/de-zoo-01', { document, editRevision: 2 })).statusCode,
    200,
  );
  assert.equal(
    (await call('PATCH', '/lessons/de-zoo-01', { title: 'X', editRevision: 2 })).statusCode,
    409,
  );
  const preview = await call('GET', '/lessons/de-zoo-01/preview');
  assert.equal(preview.statusCode, 200);
  assert.equal(preview.json().lesson.language, 'de');
  assert.equal(preview.json().lesson.media[0].path, `/v1/media/${asset.sha256}.png`);
  assert.equal(preview.json().mediaUrls['tim-img'], asset.url);

  const copy = await call('POST', '/lessons/de-zoo-01/duplicate', { id: 'de-zoo-02' });
  assert.equal(copy.statusCode, 201);
  assert.equal(copy.json().lesson.position, 1);
  assert.equal(copy.json().lesson.title, 'Урок 1 (копия)');
  const order = await call('PUT', '/courses/de-zoo/lesson-order', {
    ids: ['de-zoo-02', 'de-zoo-01'],
    editRevision: 4,
  });
  assert.equal(order.statusCode, 200);
  assert.deepEqual(
    (await call('GET', '/courses/de-zoo')).json().lessons.map((l: { id: string }) => l.id),
    ['de-zoo-02', 'de-zoo-01'],
  );
  assert.equal(
    (
      await call('PUT', '/courses/de-zoo/lesson-order', {
        ids: ['de-zoo-02'],
        editRevision: 5,
      })
    ).statusCode,
    400,
  );
  assert.equal((await call('DELETE', '/lessons/de-zoo-02')).statusCode, 204);
  const publishedDelete = await call('DELETE', '/lessons/en-animals-01');
  assert.equal(publishedDelete.statusCode, 422);
  assert.equal(publishedDelete.json().code, 'published_lesson');
  assert.equal(
    (
      await call('PUT', '/languages/en/course-order', {
        ids: ['en-space', 'en-forest', 'en-underwater'],
      })
    ).statusCode,
    200,
  );
  assert.deepEqual(
    (await call('GET', '/courses?language=en')).json().items.map((c: { id: string }) => c.id),
    ['en-space', 'en-forest', 'en-underwater'],
  );
  const audits = await db.query.auditEvents.findMany();
  assert.ok(audits.some((e) => e.action === 'upload' && e.actorId === ctx.user.id));
});
