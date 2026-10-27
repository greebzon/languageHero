import test from 'node:test';
import assert from 'node:assert/strict';
import {
  courseLessonSchema,
  lessonLocales,
  releaseSchema,
  type Answer,
  type CourseLesson,
} from '@lingvohero/contracts';
import { composeBoss } from './boss';
import {
  currentExercise,
  learn,
  newLearningState,
  playableIndices,
  restoreLearningState,
} from './course';
import { solveExercise } from './mechanics';
import data from '../../../content/seed.json';

const { lessons } = releaseSchema.parse(data);
const audio = lessons[0]!.media.find((m) => m.kind === 'audio')!;
/** The set's closing sentence lesson: one sentence per age group. */
const sentences: CourseLesson = {
  ...lessons[0]!,
  id: 'en-animals-06',
  texts: undefined,
  media: [...lessons[0]!.media, { ...audio, id: 's1-audio' }, { ...audio, id: 's2-audio' }],
  exercises: (['6-7', '8-9'] as const).map((band, i) => ({
    id: `ex-${i + 1}`,
    type: 'build-sentence' as const,
    prompt: 'Собери фразу',
    hint: 'Послушай',
    ageBands: [band],
    tokens: [
      { id: 'w1', text: 'I' },
      { id: 'w2', text: 'see' },
      { id: 'w3', text: 'a' },
      { id: 'w4', text: 'fox', wordId: 'fox' },
      { id: 'w5', text: 'owl', wordId: 'owl' },
    ],
    answer: ['I', 'see', 'a', i ? 'owl' : 'fox'],
    audioId: `s${i + 1}-audio`,
  })),
};
const set = [...lessons, sentences];
const boss = {
  courseId: 'en-forest',
  seed: 'boss-seed',
  lessons: set.map((l) => ({ lessonId: l.id, version: l.version })),
};
const start = (ageBand: '6-7' | '8-9') =>
  learn(newLearningState(), {
    type: 'start',
    lesson: composeBoss(set, boss.seed),
    attemptId: '4d9c2b1a-7e6f-4a3b-9c8d-1e2f3a4b5c6d',
    difficulty: { ageBand },
    boss,
  });

test('the set challenge: ten tasks over the set words and a sentence for each age group', () => {
  const lesson = composeBoss(set, 'boss-seed');
  assert.ok(courseLessonSchema.safeParse(lesson).success);
  assert.deepEqual(composeBoss(set, 'boss-seed'), lesson);
  assert.equal(lesson.id, 'boss');
  assert.equal(lesson.exercises.length, 12);
  for (const band of ['6-7', '8-9'] as const) {
    const played = playableIndices(lesson, { ageBand: band }).map((i) => lesson.exercises[i]!);
    assert.equal(played.length, 11);
    assert.equal(played.filter((e) => e.type === 'build-sentence').length, 1);
  }
  assert.ok(new Set(lesson.exercises.map((e) => e.type)).size >= 6);
  // Texts come from the sources (the made-up sentence lesson here has no translations).
  assert.deepEqual(lessonLocales(composeBoss(lessons, 'boss-seed')), ['ru', 'en', 'he']);
  // Without a sentence lesson the challenge is the ten word tasks.
  assert.equal(composeBoss(lessons, 'boss-seed').exercises.length, 10);
});

test('three hearts: the third mistake ends the challenge, a win leaves no progress entry', () => {
  let state = start('8-9');
  const wrong = (): Answer => {
    const ex = currentExercise(state.session!);
    if (ex.type === 'listen-and-select')
      return { choiceId: ex.choices.find((c) => c !== ex.wordId)! };
    throw new Error(`the plan starts with listening, not ${ex.type}`);
  };
  for (let heart = 0; heart < 3; heart += 1) {
    state = learn(state, { type: 'draft', answer: wrong() });
    state = learn(state, { type: 'answer' });
  }
  assert.equal(state.session!.finished, true);
  assert.equal(state.session!.lost, true);
  assert.deepEqual(state.recent, [1]);
  assert.deepEqual(state.progress, {});
  assert.ok(restoreLearningState(state), 'a lost challenge restores');

  let win = start('6-7');
  while (!win.session!.finished) {
    const ex = currentExercise(win.session!);
    win = learn(win, { type: 'draft', answer: solveExercise(ex, win.session!.lesson) });
    win = learn(win, { type: 'answer' });
    win = learn(win, { type: 'next' });
  }
  assert.equal(win.session!.lost, undefined);
  assert.equal(win.session!.mistakes, 0);
  assert.deepEqual(win.progress, {});
  assert.ok(restoreLearningState(win));
});
