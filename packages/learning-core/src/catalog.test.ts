import test from 'node:test';
import assert from 'node:assert/strict';
import { catalogSchema, courseLessonSchema } from '@lingvohero/contracts';
import seed from '../../../content/seed.json';
import { courseCards, reconcileCourseAccess, resumableSession } from './catalog';
import { learn, newLearningState, restoreLearningState } from './course';

test('sets unlock per language; progress and earned access survive catalog changes', () => {
  const catalog = catalogSchema.parse(seed.catalog);
  const first = catalog.courses[0];
  catalog.courses.push({
    ...first,
    id: 'en-next',
    lessons: [{ ...first.lessons[0], id: 'next-lesson' }],
  });
  catalog.languages.push({ code: 'de', title: 'Deutsch', direction: 'ltr' });
  catalog.courses.push({
    ...first,
    id: 'de-first',
    language: 'de',
    lessons: [{ ...first.lessons[0], id: 'de-lesson' }],
  });
  let state = reconcileCourseAccess(catalog, newLearningState());
  assert.deepEqual(
    courseCards(catalog, state, 'en').map((c) => c.unlocked),
    [true, false],
  );
  assert.equal(courseCards(catalog, state, 'de')[0].unlocked, true);
  for (const l of first.lessons.slice(0, -1))
    state.progress[l.id] = { bestStars: 1, completedVersion: 1 };
  assert.equal(courseCards(catalog, state, 'en')[1].unlocked, false);
  state.progress[first.lessons.at(-1)!.id] = { bestStars: 1, completedVersion: 1 };
  state = reconcileCourseAccess(catalog, state);
  assert.equal(courseCards(catalog, state, 'en')[1].unlocked, true);
  first.lessons.push({ ...first.lessons[0], id: 'new-required-lesson' });
  catalog.courses.unshift({
    ...first,
    id: 'inserted',
    lessons: [{ ...first.lessons[0], id: 'inserted-lesson' }],
  });
  const restored = restoreLearningState(JSON.parse(JSON.stringify(state)))!;
  assert.equal(
    courseCards(catalog, restored, 'en').find((c) => c.course.id === 'en-next')!.unlocked,
    true,
  );
  assert.equal(
    courseCards(catalog, restored, 'en').find((c) => c.course.id === first.id)!.complete,
    true,
  );
  assert.equal(
    reconcileCourseAccess(catalog, reconcileCourseAccess(catalog, restored)).unlockedCourseIds
      ?.length,
    4,
  );
  const legacy = newLearningState();
  legacy.progress['next-lesson'] = { bestStars: 1, completedVersion: 1 };
  assert.equal(
    courseCards(catalog, legacy, 'en').find((c) => c.course.id === 'en-next')!.unlocked,
    true,
  );
});

test('catalog previews cannot collide with published sets or reference another language', () => {
  const catalog = structuredClone(seed.catalog);
  catalog.previews[0].id = catalog.courses[0].id;
  assert.equal(catalogSchema.safeParse(catalog).success, false);
  catalog.previews[0].id = 'upcoming';
  catalog.previews[0].language = 'unknown';
  assert.equal(catalogSchema.safeParse(catalog).success, false);
});

test('a session on an outdated lesson version is not offered for resuming', () => {
  const catalog = catalogSchema.parse(seed.catalog);
  const lesson = courseLessonSchema.parse(seed.lessons[0]);
  const started = learn(newLearningState(), { type: 'start', lesson });
  assert.equal(resumableSession(started, catalog), started.session);
  const republished = structuredClone(catalog);
  republished.courses[0].lessons[0].version = lesson.version + 1;
  assert.equal(resumableSession(started, republished), null);
  const unlisted = structuredClone(catalog);
  unlisted.courses[0].lessons = unlisted.courses[0].lessons.slice(1);
  assert.equal(resumableSession(started, unlisted), started.session);
  assert.equal(resumableSession(newLearningState(), catalog), null);
});
