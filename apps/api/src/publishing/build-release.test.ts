import test from 'node:test';
import assert from 'node:assert/strict';
import type { LessonDocument } from '@lingvohero/contracts';
import { buildRelease, type CourseRow, type LanguageRow, type LessonRow } from './build-release.js';
import { baseTextsHash, toCourseLesson, type AssetRef } from './convert.js';
import { lessonHash } from './hash.js';

const now = new Date('2026-09-18T00:00:00Z');
const png: AssetRef = {
  id: '11111111-1111-4111-8111-111111111111',
  sha256: 'a'.repeat(64),
  ext: 'png',
};
const wav: AssetRef = {
  id: '22222222-2222-4222-8222-222222222222',
  sha256: 'b'.repeat(64),
  ext: 'wav',
};
const cover: AssetRef = {
  id: '33333333-3333-4333-8333-333333333333',
  sha256: 'c'.repeat(64),
  ext: 'png',
};
const assets = new Map([png, wav, cover].map((a) => [a.id, a]));

const document = (tiles = ['f', 'o', 'x']): LessonDocument => ({
  words: [
    {
      id: 'fox',
      text: 'A fox',
      spelling: 'fox',
      translation: 'Лиса',
      imageId: 'fox-img',
      audioId: 'fox-audio',
    },
    {
      id: 'owl',
      text: 'An owl',
      spelling: 'owl',
      translation: 'Сова',
      imageId: 'fox-img',
      audioId: 'fox-audio',
    },
  ],
  media: [
    { id: 'fox-img', kind: 'image', assetId: png.id },
    { id: 'fox-audio', kind: 'audio', assetId: wav.id },
  ],
  exercises: [
    {
      id: 'ex-1',
      type: 'build-word',
      prompt: 'Собери слово',
      hint: 'Рыжая',
      wordId: 'fox',
      tiles: tiles.map((letter, i) => ({ id: `t${i}`, letter })),
    },
    {
      id: 'ex-2',
      type: 'listen-and-select',
      prompt: 'Слушай',
      hint: 'Хвост',
      wordId: 'fox',
      choices: ['fox', 'owl'],
    },
  ],
});

const language = (
  code: string,
  status: LanguageRow['status'],
  position = 0,
  extra: Partial<LanguageRow> = {},
): LanguageRow => ({
  code,
  title: code.toUpperCase(),
  direction: 'ltr',
  locale: null,
  titles: {},
  status,
  position,
  publishedAt: null,
  createdAt: now,
  updatedAt: now,
  ...extra,
});
const course = (
  id: string,
  languageCode: string,
  visibility: CourseRow['visibility'],
  extra: Partial<CourseRow> = {},
): CourseRow => ({
  id,
  languageCode,
  topic: null,
  title: `Set ${id}`,
  description: null,
  texts: {},
  coverAssetId: null,
  position: 0,
  visibility,
  editRevision: 1,
  publishedRevision: null,
  createdAt: now,
  updatedAt: now,
  ...extra,
});
const lesson = (id: string, courseId: string, extra: Partial<LessonRow> = {}): LessonRow => ({
  id,
  courseId,
  position: 0,
  title: `Lesson ${id}`,
  presentation: null,
  document: document(),
  texts: {},
  editRevision: 3,
  lastPublishedVersion: null,
  lastPublishedHash: null,
  createdAt: now,
  updatedAt: now,
  ...extra,
});

test('builds a release from active languages, published sets and previews only', () => {
  const out = buildRelease({
    revision: 5,
    languages: [language('de', 'draft'), language('en', 'active', 1), language('fr', 'archived')],
    courses: [
      course('en-a', 'en', 'published', { position: 1, description: 'Desc' }),
      course('en-p', 'en', 'preview', { position: 0, description: 'Soon', coverAssetId: cover.id }),
      course('en-d', 'en', 'draft'),
      course('de-x', 'de', 'published'),
      course('fr-x', 'fr', 'preview'),
    ],
    lessons: [
      lesson('en-a-2', 'en-a', { position: 1 }),
      lesson('en-a-1', 'en-a', { position: 0 }),
      lesson('de-x-1', 'de-x'),
    ],
    assets,
  });
  assert.deepEqual(out.errors, []);
  const catalog = out.release!.catalog;
  assert.equal(catalog.revision, 5);
  assert.deepEqual(
    catalog.languages.map((l) => l.code),
    ['en'],
  );
  assert.deepEqual(
    catalog.courses.map((c) => c.id),
    ['en-a'],
  );
  assert.deepEqual(
    catalog.courses[0]!.lessons.map((l) => [l.id, l.version]),
    [
      ['en-a-1', 1],
      ['en-a-2', 1],
    ],
  );
  assert.deepEqual(catalog.courses[0]!.lessons[0]!.requiredTypes, [
    'build-word',
    'listen-and-select',
  ]);
  assert.equal(catalog.courses[0]!.lessons[0]!.exerciseCount, 2);
  assert.deepEqual(
    catalog.previews!.map((p) => p.id),
    ['en-p'],
  );
  assert.equal(catalog.previews![0]!.cover.path, `/v1/media/${cover.sha256}.png`);
  assert.equal(catalog.previews![0]!.cover.id, 'p-cover');
  assert.equal(out.release!.lessons.length, 2);
  assert.deepEqual(
    out.plan.map((p) => [p.lessonId, p.version, p.editRevision]),
    [
      ['en-a-1', 1, 3],
      ['en-a-2', 1, 3],
    ],
  );
  assert.ok(out.warnings.some((w) => w.id === 'en-a' && /обложк/.test(w.message)));
});

test('keeps the version of an unchanged lesson and bumps a changed one', () => {
  const built = toCourseLesson(
    document(),
    { id: 'en-a-1', version: 2, language: 'en', title: 'Lesson en-a-1', presentation: null },
    assets,
  );
  const hash = lessonHash(built.lesson!);
  const base = {
    revision: 2,
    languages: [language('en', 'active')],
    courses: [course('en-a', 'en', 'published')],
    assets,
  };
  const same = buildRelease({
    ...base,
    lessons: [lesson('en-a-1', 'en-a', { lastPublishedVersion: 2, lastPublishedHash: hash })],
  });
  assert.equal(same.release!.lessons[0]!.version, 2);
  const changed = buildRelease({
    ...base,
    lessons: [
      lesson('en-a-1', 'en-a', {
        lastPublishedVersion: 2,
        lastPublishedHash: hash,
        title: 'Renamed',
      }),
    ],
  });
  assert.equal(changed.release!.lessons[0]!.version, 3);
  assert.equal(changed.release!.catalog.courses[0]!.lessons[0]!.title, 'Renamed');
  // After a restore (or a release published outside the panel) the store may already hold
  // later versions than the database remembers: a change goes past all of them.
  const afterRestore = buildRelease({
    ...base,
    storedVersions: new Map([['en-a-1', 5]]),
    lessons: [
      lesson('en-a-1', 'en-a', { lastPublishedVersion: 2, lastPublishedHash: hash, title: 'X' }),
    ],
  });
  assert.equal(afterRestore.release!.lessons[0]!.version, 6);
});

test('reports errors per entity: empty set, preview without cover, unsolvable lesson', () => {
  const out = buildRelease({
    revision: 1,
    languages: [language('en', 'active')],
    courses: [
      course('en-empty', 'en', 'published'),
      course('en-p', 'en', 'preview', { description: 'Soon' }),
      course('en-bad', 'en', 'published', { coverAssetId: wav.id }),
    ],
    lessons: [lesson('en-bad-1', 'en-bad', { document: document(['f', 'o', 'z']) })],
    assets,
  });
  assert.equal(out.release, null);
  const byId = Object.fromEntries(out.errors.map((e) => [e.id, e.fieldErrors]));
  assert.ok(byId['en-empty']!.lessons);
  assert.ok(byId['en-p']!.coverAssetId);
  assert.ok(byId['en-bad']!.coverAssetId);
  assert.match(JSON.stringify(byId['en-bad-1']), /Tiles cannot form word/);
});

test('translations: complete ones make a set visible in that locale, gaps are warned about', () => {
  const doc = document();
  const english = {
    title: 'Forest friends',
    exercises: {
      'ex-1': { prompt: 'Build the word', hint: 'A red tail' },
      'ex-2': { prompt: 'Listen', hint: 'A tail' },
    },
    words: { fox: { translation: 'Fox' }, owl: { translation: 'Owl' } },
    sourceHash: baseTextsHash('Lesson en-a-1', null, doc),
  };
  const out = buildRelease({
    revision: 6,
    languages: [language('en', 'active', 0, { titles: { en: 'English', he: ' ' } })],
    courses: [
      course('en-a', 'en', 'published', {
        description: 'Desc',
        texts: { en: { title: 'Set A', description: 'About A' } },
      }),
    ],
    lessons: [
      lesson('en-a-1', 'en-a', {
        position: 0,
        // A half-done Hebrew overlay and a stray key for a deleted word are dropped quietly.
        texts: {
          en: { ...english, words: { ...english.words, ghost: { translation: 'x' } } },
          he: { title: 'חברים' },
        },
      }),
      lesson('en-a-2', 'en-a', {
        position: 1,
        title: 'Changed since',
        texts: { en: { ...english, title: 'Second' } },
      }),
    ],
    assets,
  });
  assert.deepEqual(out.errors, []);
  const catalog = out.release!.catalog;
  assert.deepEqual(catalog.languages[0]!.titles, { en: 'English' });
  const set = catalog.courses[0]!;
  assert.deepEqual(set.locales, ['ru', 'en']);
  assert.deepEqual(set.texts, { en: { title: 'Set A', description: 'About A' } });
  assert.deepEqual(
    set.lessons.map((l) => l.titles),
    [{ en: 'Forest friends', he: 'חברים' }, { en: 'Second' }],
  );
  const first = out.release!.lessons.find((l) => l.id === 'en-a-1')!;
  assert.deepEqual(Object.keys(first.texts!.en!.words!), ['fox', 'owl']);
  assert.deepEqual(first.texts!.he, { title: 'חברים' });
  assert.ok(out.warnings.some((w) => w.id === 'en-a' && /интерфейса he/.test(w.message)));
  // The second lesson's Russian title changed after it was translated.
  assert.ok(out.warnings.some((w) => w.id === 'en-a-2' && /устарел/.test(w.message)));
  assert.ok(!out.warnings.some((w) => w.id === 'en-a-1' && /устарел/.test(w.message)));
});
