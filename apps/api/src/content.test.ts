import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, cp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { releaseSchema } from '@lingvohero/contracts';
import seed from '../../../content/seed.json';
import { buildApp } from './app';
import { defaultContentRoot, publishRelease, readCatalog } from './content';

test('live publication adds languages/lessons and keeps old versions addressable', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'lingvo-content-'));
  const app = buildApp({ contentRoot: root });
  t.after(async () => {
    await app.close();
    if (dirname(resolve(root)) !== resolve(tmpdir())) throw new Error('Unexpected test directory');
    await rm(root, { recursive: true, force: true });
  });
  await cp(join(defaultContentRoot, 'media'), join(root, 'media'), { recursive: true });
  // The bundled release as a first publication: version 1 of every lesson, no translations.
  const first = releaseSchema.parse({
    ...seed,
    catalog: {
      ...seed.catalog,
      courses: seed.catalog.courses.map(({ locales: _l, ...course }) => ({
        ...course,
        lessons: course.lessons.map(({ titles: _t, ...ref }) => ({ ...ref, version: 1 })),
      })),
    },
    lessons: seed.lessons.map(({ texts: _x, ...lesson }) => ({ ...lesson, version: 1 })),
  });
  await publishRelease(first, root);
  assert.equal((await app.inject('/v1/catalog')).statusCode, 409);
  const response = await app.inject('/v1/catalog?schemaVersion=2');
  assert.equal(response.statusCode, 200);
  assert.equal(JSON.stringify(response.json()).includes('exercises'), false);
  assert.equal(
    (
      await app.inject({
        url: '/v1/catalog?schemaVersion=2',
        headers: { 'if-none-match': response.headers.etag! },
      })
    ).statusCode,
    304,
  );
  const next = structuredClone(first);
  next.catalog.revision = first.catalog.revision + 1;
  next.lessons[0].version = 2;
  next.lessons[0].title = 'Updated lesson';
  next.catalog.courses[0].lessons[0].version = 2;
  next.catalog.courses[0].lessons[0].title = 'Updated lesson';
  const extra = {
    ...structuredClone(first.lessons[0]),
    id: 'de-animals-01',
    language: 'de',
    title: 'Test course',
  };
  next.lessons.push(extra);
  next.catalog.languages.push({ code: 'de', title: 'Deutsch (test)', direction: 'ltr' });
  next.catalog.courses.push({
    id: 'de-test',
    language: 'de',
    title: 'Test course',
    lessons: [{ ...first.catalog.courses[0].lessons[0], id: extra.id, title: extra.title }],
  });
  await publishRelease(next, root);
  assert.equal((await app.inject('/v1/catalog?schemaVersion=2')).json().languages.length, 2);
  assert.equal((await app.inject('/v1/lessons/de-animals-01/versions/1')).json().id, extra.id);
  assert.equal(
    (await app.inject('/v1/lessons/en-animals-01/versions/1')).json().title,
    first.lessons[0].title,
  );
  assert.equal(
    (await app.inject('/v1/lessons/en-animals-01/versions/2')).json().title,
    'Updated lesson',
  );
  const bad = structuredClone(next);
  bad.catalog.revision = next.catalog.revision + 1;
  bad.lessons[0].exercises[0].hint = 'Changed without bump';
  await assert.rejects(publishRelease(bad, root), /new lesson version/);
  assert.equal((await readCatalog(root)).revision, next.catalog.revision);
  const missingCover = structuredClone(next);
  missingCover.catalog.revision = next.catalog.revision + 1;
  missingCover.catalog.courses[0].cover = {
    id: 'cover',
    kind: 'image',
    path: `/v1/media/${'0'.repeat(64)}.png`,
  };
  await assert.rejects(publishRelease(missingCover, root));
  assert.equal((await readCatalog(root)).revision, next.catalog.revision);
  assert.deepEqual(response.json().previews, first.catalog.previews);
  const missing = structuredClone(next);
  missing.catalog.revision = next.catalog.revision + 1;
  missing.lessons[0].version = 3;
  missing.catalog.courses[0].lessons[0].version = 3;
  missing.lessons[0].media[0].path = `/v1/media/${'0'.repeat(64)}.png`;
  await assert.rejects(publishRelease(missing, root));
  assert.equal((await readCatalog(root)).revision, next.catalog.revision);
  const media = await app.inject(first.lessons[0].media[0].path);
  assert.equal(media.statusCode, 200);
  assert.equal(media.headers['content-type'], 'image/png');
  assert.deepEqual(
    media.rawPayload,
    await readFile(join(root, 'media', first.lessons[0].media[0].path.split('/').pop()!)),
  );
  assert.equal((await app.inject('/v1/media/not-an-asset.png')).statusCode, 400);
  assert.equal((await app.inject('/v1/lessons/unknown/versions/1')).statusCode, 404);
  assert.equal((await app.inject('/v1/lessons/en-animals-01/versions/0')).statusCode, 400);
  assert.equal(
    (await app.inject({ method: 'POST', url: '/v1/catalog', payload: first.catalog })).statusCode,
    404,
  );
});
