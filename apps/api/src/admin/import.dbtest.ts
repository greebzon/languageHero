import test from 'node:test';
import assert from 'node:assert/strict';
import { readCatalog, readLesson } from '../content.js';
import { toCourseLesson } from '../publishing/convert.js';
import { lessonHash } from '../publishing/hash.js';
import { importPublishedContent } from './import.js';
import { createTestContext } from './testing.js';

test('import mirrors the published store once and is a no-op afterwards', async (t) => {
  const ctx = await createTestContext(t);
  if (!ctx) return;
  const { db, contentRoot } = ctx;
  const first = await importPublishedContent(db, contentRoot);
  assert.deepEqual(first.created, { languages: 1, courses: 3, lessons: 5, assets: 8 });
  const second = await importPublishedContent(db, contentRoot);
  assert.deepEqual(second.created, { languages: 0, courses: 0, lessons: 0, assets: 0 });
  assert.deepEqual(second.skipped, { languages: 1, courses: 3, lessons: 5, assets: 8 });

  const courses = await db.query.courses.findMany();
  assert.deepEqual(courses.map((c) => [c.id, c.visibility]).sort(), [
    ['en-forest', 'published'],
    ['en-space', 'preview'],
    ['en-underwater', 'preview'],
  ]);
  assert.ok(courses.every((c) => c.coverAssetId));
  const catalog = await readCatalog(contentRoot);
  const assets = await db.query.assets.findMany();
  const assetsById = new Map(
    assets.map((a) => [
      a.id,
      { id: a.id, sha256: a.sha256, ext: a.kind === 'image' ? ('png' as const) : ('wav' as const) },
    ]),
  );

  // Every imported draft converts back into exactly the published package.
  for (const course of catalog.courses)
    for (const ref of course.lessons) {
      const published = await readLesson(contentRoot, ref.id, ref.version);
      const draft = (await db.query.lessons.findFirst({
        where: (l, { eq }) => eq(l.id, ref.id),
      }))!;
      assert.equal(draft.lastPublishedVersion, ref.version);
      assert.equal(draft.lastPublishedHash, lessonHash(published));
      const rebuilt = toCourseLesson(
        draft.document,
        {
          id: draft.id,
          version: ref.version,
          language: course.language,
          title: draft.title,
          presentation: draft.presentation ?? null,
          texts: draft.texts,
        },
        assetsById,
      );
      assert.deepEqual(rebuilt.lesson, published);
    }
  const events = await db.query.auditEvents.findMany();
  assert.equal(events.filter((e) => e.action === 'import').length, 2);
});
