import test from 'node:test';
import assert from 'node:assert/strict';
import {
  courseLessonSchema,
  releaseSchema,
  type Answer,
  type CourseExercise,
  type CourseLesson,
  type LearningState,
} from '@lingvohero/contracts';
import {
  assess,
  learn,
  learningRewards,
  migrateDemo,
  newLearningState,
  restoreLearningState,
} from './course';
import data from '../../../content/seed.json';

const { lessons } = releaseSchema.parse(data);
function answerFor(ex: CourseExercise, lesson: CourseLesson): Answer {
  if (ex.type === 'listen-and-select') return { choiceId: ex.wordId };
  if (ex.type === 'match-pairs')
    return { pairs: Object.fromEntries(ex.wordIds.map((id) => [id, id])) };
  const letters = Array.from(lesson.words.find((w) => w.id === ex.wordId)!.spelling);
  const available = [...ex.tiles];
  return {
    tileIds: letters.map((letter) => {
      const i = available.findIndex((t) => t.letter === letter);
      return available.splice(i, 1)[0].id;
    }),
  };
}
function finish(state: LearningState) {
  let count = 0;
  while (!state.session!.finished) {
    assert.ok(++count < 100);
    const s = state.session!;
    state = learn(state, {
      type: 'draft',
      answer: answerFor(s.lesson.exercises[s.queue[s.exerciseIndex]], s.lesson),
    });
    state = learn(state, { type: 'answer' });
    state = learn(state, { type: 'next' });
  }
  return state;
}
test('all five packages are solvable; rewards are per lesson, never per replay or version', () => {
  let state = newLearningState();
  for (const lesson of lessons) state = finish(learn(state, { type: 'start', lesson }));
  assert.deepEqual(learningRewards(state), { xp: 500, coins: 150, stars: 15, lessons: 5 });
  state = finish(learn(state, { type: 'start', lesson: { ...lessons[0], version: 2 } }));
  assert.equal(learningRewards(state).coins, 150);
});
test('wrong answers add one review, cannot skip, and retain the exact package on restore', () => {
  let state = learn(newLearningState(), { type: 'start', lesson: lessons[0] });
  assert.equal(learn(state, { type: 'next' }), state);
  state = learn(state, { type: 'draft', answer: { choiceId: 'bear' } });
  state = learn(state, { type: 'answer' });
  state = learn(state, { type: 'answer' });
  assert.equal(state.session!.queue.length, 7);
  assert.equal(state.session!.mistakes, 2);
  assert.equal(learn(state, { type: 'start', lesson: { ...lessons[0], version: 99 } }), state);
  const restored = restoreLearningState(JSON.parse(JSON.stringify(state)))!;
  assert.deepEqual(restored, state);
  assert.equal(finish(restored).session!.exerciseIndex, 6);
  assert.equal(
    restoreLearningState({ ...restored, session: { ...restored.session, queue: [9] } }),
    null,
  );
});
test('matching requires a complete bijection, and answers cannot reuse a spelling tile', () => {
  const match = lessons[2].exercises[0];
  assert.equal(assess(match, { pairs: { fox: 'fox', bear: 'fox' } }, lessons[2]), 'invalid');
  assert.equal(assess(match, { pairs: { fox: 'bear', bear: 'fox' } }, lessons[2]), 'wrong');
  assert.equal(assess(match, { pairs: { fox: 'fox', bear: 'bear' } }, lessons[2]), 'correct');
  const spelling = lessons[3].exercises[2];
  const valid = answerFor(spelling, lessons[3]) as { tileIds: string[] };
  assert.equal(assess(spelling, valid, lessons[3]), 'correct');
  valid.tileIds[3] = valid.tileIds[2];
  assert.equal(assess(spelling, valid, lessons[3]), 'invalid');
});
test('partial answers survive restart; tampered correct/finished sessions are rejected', () => {
  let state = learn(newLearningState(), { type: 'start', lesson: lessons[2] });
  state = learn(state, { type: 'draft', answer: { pairs: { fox: 'bear' } } });
  assert.deepEqual(restoreLearningState(state), state);
  assert.equal(
    restoreLearningState({ ...state, session: { ...state.session, correct: true } }),
    null,
  );
  assert.equal(
    restoreLearningState({ ...state, session: { ...state.session, finished: true } }),
    null,
  );
});
test('legacy demo migrates sound, position and rewards without awarding twice', () => {
  const migrated = migrateDemo(
    {
      version: 1,
      soundEnabled: false,
      completed: true,
      bestStars: 2,
      session: {
        lessonId: lessons[0].id,
        contentVersion: 1,
        exerciseIndex: 2,
        mistakes: 1,
        correct: true,
        finished: false,
      },
    },
    lessons[0],
  )!;
  assert.equal(migrated.soundEnabled, false);
  assert.equal(migrated.session!.exerciseIndex, 2);
  assert.equal(learningRewards(finish(migrated)).coins, 30);
});
test('incomplete media, unsolvable spelling and unknown mechanics fail validation', () => {
  const broken = structuredClone(lessons[3]);
  broken.media.pop();
  assert.equal(courseLessonSchema.safeParse(broken).success, false);
  const ex = lessons[3].exercises[0];
  assert.equal(
    courseLessonSchema.safeParse({
      ...lessons[3],
      exercises: [
        {
          ...ex,
          tiles: [
            { id: 'a', letter: 'a' },
            { id: 'b', letter: 'b' },
          ],
        },
      ],
    }).success,
    false,
  );
  assert.equal(
    courseLessonSchema.safeParse({
      ...lessons[0],
      exercises: [{ ...lessons[0].exercises[0], type: 'unknown' }],
    }).success,
    false,
  );
});
