import test from 'node:test';
import assert from 'node:assert/strict';
import {
  courseLessonSchema,
  lessonLocales,
  releaseSchema,
  type Answer,
  type CourseExercise,
  type CourseLesson,
} from '@lingvohero/contracts';
import { currentExercise, learn, newLearningState, restoreLearningState } from './course';
import { solveExercise } from './mechanics';
import { composeReview, pickReviewWords, reviewPool } from './review';
import data from '../../../content/seed.json';

const { lessons } = releaseSchema.parse(data);
const byId = (id: string) => lessons.find((l) => l.id === id)!;

const answerTo = (ex: CourseExercise, lesson: CourseLesson): Answer => solveExercise(ex, lesson);

const review = (seed: string) => {
  const words = pickReviewWords(reviewPool(lessons), {}, seed);
  return {
    words,
    lesson: composeReview(
      words.map((w) => ({ lesson: byId(w.lessonId), wordId: w.wordId })),
      seed,
    ),
  };
};

test('a review is a valid lesson of known words, the same for the same seed', () => {
  const { words, lesson } = review('seed-1');
  assert.equal(words.length, 4, 'every distinct word of the seed lessons');
  assert.ok(courseLessonSchema.safeParse(lesson).success);
  assert.deepEqual(review('seed-1').lesson, lesson);
  assert.notDeepEqual(review('seed-2').lesson.exercises, lesson.exercises);
  // Never the same mechanic twice in a row; several kinds of tasks.
  const types = lesson.exercises.map((e) =>
    e.type === 'choice' ? `${e.type}:${e.as}:${e.show.map((s) => s.view)}` : e.type,
  );
  assert.ok(
    types.every((t, i) => i === 0 || t !== types[i - 1]),
    types.join(),
  );
  assert.ok(new Set(types).size >= 5, types.join());
  // Translations come from the source lessons, so the review speaks every locale they do.
  assert.deepEqual(lessonLocales(lesson), ['ru', 'en', 'he']);
});

test('a finished review earns its stars but leaves no progress entry', () => {
  const { words, lesson } = review('seed-3');
  let state = learn(newLearningState(), {
    type: 'start',
    lesson,
    attemptId: '1b0c8e2a-5f3d-4c6b-9a7e-2d1f0e3c4b5a',
    review: { seed: 'seed-3', words },
  });
  while (!state.session!.finished) {
    const ex = currentExercise(state.session!);
    state = learn(state, { type: 'draft', answer: answerTo(ex, lesson) });
    state = learn(state, { type: 'answer' });
    state = learn(state, { type: 'next' });
  }
  assert.equal(state.session!.mistakes, 0);
  assert.deepEqual(state.progress, {});
  assert.ok(restoreLearningState(state), 'a finished review restores without a progress entry');
});

test('words of lessons with fewer stars come up more often', () => {
  const [fox, bear, rabbit, owl] = byId('en-animals-01').words;
  const weak = { ...byId('en-animals-01'), id: 'weak', words: [fox!, bear!] };
  const strong = { ...byId('en-animals-02'), id: 'strong', words: [rabbit!, owl!] };
  const progress = {
    weak: { bestStars: 1, completedVersion: 1 },
    strong: { bestStars: 3, completedVersion: 1 },
  };
  let weakPicks = 0;
  for (let i = 0; i < 300; i += 1)
    weakPicks += pickReviewWords(reviewPool([weak, strong]), progress, `s${i}`, 2).filter(
      (w) => w.lessonId === 'weak',
    ).length;
  // 2 of 4 words per review: by chance half would be weak ones (300); weighted, far more.
  assert.ok(weakPicks > 420, String(weakPicks));
});
