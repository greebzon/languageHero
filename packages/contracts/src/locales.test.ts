import test from 'node:test';
import assert from 'node:assert/strict';
import seed from '../../../content/seed.json';
import {
  courseLessonSchema,
  courseLocales,
  lessonLocales,
  releaseSchema,
  type CourseLesson,
} from './course';
import { languageTitle, localizeLesson, visibleCatalog } from './locales';

/* The bundled release without its translations: each test adds the overlays it needs. */
const release = releaseSchema.parse({
  ...seed,
  catalog: {
    ...seed.catalog,
    courses: seed.catalog.courses.map(({ locales: _l, ...course }) => ({
      ...course,
      lessons: course.lessons.map(({ titles: _t, ...ref }) => ref),
    })),
  },
  lessons: seed.lessons.map(({ texts: _x, ...lesson }) => lesson),
});
/** The seed's first lesson with a complete English overlay. */
function translated(lesson: CourseLesson): CourseLesson {
  return courseLessonSchema.parse({
    ...lesson,
    texts: {
      en: {
        title: `EN ${lesson.title}`,
        ...(lesson.presentation
          ? {
              presentation: {
                intro: 'Hi!',
                completionTitle: 'Done!',
                completionMessage: 'Well done.',
              },
            }
          : {}),
        exercises: Object.fromEntries(
          lesson.exercises.map((e) => [e.id, { prompt: `EN ${e.id}`, hint: 'A hint' }]),
        ),
        words: Object.fromEntries(lesson.words.map((w) => [w.id, { translation: `EN ${w.id}` }])),
      },
    },
  });
}

test('a lesson has a locale only when its overlay covers every text', () => {
  const lesson = release.lessons[0]!;
  assert.deepEqual(lessonLocales(lesson), ['ru']);
  const full = translated(lesson);
  assert.deepEqual(lessonLocales(full), ['ru', 'en']);
  const missing = { ...full, texts: { en: { ...full.texts!.en!, words: {} } } };
  assert.deepEqual(lessonLocales(missing), ['ru']);
  // A set has a locale only when all its lessons do.
  assert.deepEqual(courseLocales([full, lesson]), ['ru']);
  assert.deepEqual(courseLocales([full, translated(release.lessons[1]!)]), ['ru', 'en']);
  // Overlay keys must point at existing exercises and words.
  const stray = {
    ...full,
    texts: { en: { ...full.texts!.en!, words: { ghost: { translation: 'x' } } } },
  };
  assert.equal(courseLessonSchema.safeParse(stray).success, false);
  assert.equal(courseLessonSchema.safeParse({ ...full, texts: { ru: {} } }).success, false);
});

test('localizeLesson swaps in the overlay; old clients keep the base', () => {
  const lesson = translated(release.lessons[0]!);
  const en = localizeLesson(lesson, 'en');
  assert.equal(en.title, `EN ${lesson.title}`);
  assert.equal(en.exercises[0]!.prompt, `EN ${lesson.exercises[0]!.id}`);
  assert.equal(en.words[0]!.translation, `EN ${lesson.words[0]!.id}`);
  assert.equal(en.words[0]!.spelling, lesson.words[0]!.spelling);
  assert.equal(localizeLesson(lesson, 'ru'), lesson);
  // No complete Hebrew overlay: Russian stays.
  assert.equal(localizeLesson(lesson, 'he').title, lesson.title);
});

test('visibleCatalog hides untranslated sets and localises titles', () => {
  const catalog = {
    ...release.catalog,
    languages: [{ ...release.catalog.languages[0]!, titles: { en: 'English', he: 'אנגלית' } }],
    courses: release.catalog.courses.map((c) => ({
      ...c,
      locales: ['ru' as const, 'en' as const],
      texts: { en: { title: 'Mysterious forest' } },
    })),
  };
  assert.equal(visibleCatalog(catalog, 'ru'), catalog);
  const en = visibleCatalog(catalog, 'en');
  assert.equal(en.courses.length, catalog.courses.length);
  assert.equal(en.courses[0]!.title, 'Mysterious forest');
  assert.equal(en.courses[0]!.description, catalog.courses[0]!.description);
  assert.equal(en.previews!.length, 0, 'previews without texts are hidden');
  assert.equal(visibleCatalog(catalog, 'he').courses.length, 0);
  // Sets published before translations existed count as Russian only.
  assert.equal(visibleCatalog(release.catalog, 'en').courses.length, 0);
  assert.equal(languageTitle(catalog.languages[0]!, 'he'), 'אנגלית');
  assert.equal(languageTitle(catalog.languages[0]!, 'ru'), catalog.languages[0]!.title);
});

test('a release must publish the locales and titles its packages have', () => {
  const lessons = release.lessons.map(translated);
  const course = release.catalog.courses[0]!;
  const good = {
    catalog: {
      ...release.catalog,
      courses: [
        {
          ...course,
          locales: ['ru', 'en'],
          lessons: course.lessons.map((ref) => ({
            ...ref,
            titles: { en: lessons.find((l) => l.id === ref.id)!.texts!.en!.title },
          })),
        },
      ],
    },
    lessons,
  };
  assert.equal(releaseSchema.safeParse(good).success, true);
  const wrongLocales = {
    ...good,
    catalog: { ...good.catalog, courses: [{ ...good.catalog.courses[0]!, locales: ['ru'] }] },
  };
  assert.equal(releaseSchema.safeParse(wrongLocales).success, false);
  const noTitles = {
    ...good,
    catalog: {
      ...good.catalog,
      courses: [{ ...good.catalog.courses[0]!, lessons: course.lessons }],
    },
  };
  assert.equal(releaseSchema.safeParse(noTitles).success, false);
});
