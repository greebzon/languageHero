import test from 'node:test';
import assert from 'node:assert/strict';
import { lessonPackageSchema } from '@lingvohero/contracts';
import { demoRewards, initialState, restoreState, transition } from './index.js';

const lesson = lessonPackageSchema.parse({
  schemaVersion: 1,
  id: 'test',
  version: 1,
  language: 'en',
  title: 'Animals',
  exercises: ['one', 'two'].map((id) => ({
    id,
    type: 'listen-and-select',
    prompt: 'Listen',
    audioId: 'fox',
    hint: 'Orange',
    choices: [
      { id: 'fox', label: 'A fox', translation: 'Лиса', imageId: 'fox' },
      { id: 'bear', label: 'A bear', translation: 'Медведь', imageId: 'bear' },
    ],
    correctChoiceId: 'fox',
  })),
});

test('wrong answer keeps the question; next requires a correct answer', () => {
  let state = transition(initialState(), { type: 'start' }, lesson);
  state = transition(state, { type: 'answer', choiceId: 'bear' }, lesson);
  assert.equal(state.session?.mistakes, 1);
  assert.equal(transition(state, { type: 'next' }, lesson), state);
  assert.equal(transition(state, { type: 'answer', choiceId: 'unknown' }, lesson), state);
  state = transition(state, { type: 'answer', choiceId: 'fox' }, lesson);
  assert.equal(transition(state, { type: 'answer', choiceId: 'fox' }, lesson), state);
  state = transition(state, { type: 'next' }, lesson);
  assert.equal(state.session?.exerciseIndex, 1);
});

test('restores an unfinished lesson and awards once across repeat completions', () => {
  let state = transition(initialState(), { type: 'start' }, lesson);
  assert.deepEqual(restoreState(JSON.parse(JSON.stringify(state)), lesson), state);
  for (let round = 0; round < 2; round++) {
    state = transition(state, { type: 'start' }, lesson);
    for (let question = 0; question < 2; question++) {
      state = transition(state, { type: 'answer', choiceId: 'fox' }, lesson);
      state = transition(state, { type: 'next' }, lesson);
    }
    assert.deepEqual(demoRewards(state), { xp: 100, coins: 30, stars: 3 });
    assert.equal(transition(state, { type: 'next' }, lesson), state);
  }
});

test('invalid or incompatible saved states are rejected', () => {
  assert.equal(restoreState({ version: 99 }, lesson), null);
  const state = transition(initialState(), { type: 'start' }, lesson);
  assert.equal(
    restoreState({ ...state, session: { ...state.session, exerciseIndex: 99 } }, lesson),
    null,
  );
  assert.equal(
    restoreState({ ...state, session: { ...state.session, contentVersion: 2 } }, lesson),
    null,
  );
});

test('content rejects nonexistent answer keys and duplicate exercise IDs', () => {
  assert.equal(
    lessonPackageSchema.safeParse({
      ...lesson,
      exercises: [lesson.exercises[0], lesson.exercises[0]],
    }).success,
    false,
  );
  assert.equal(
    lessonPackageSchema.safeParse({
      ...lesson,
      exercises: [{ ...lesson.exercises[0], correctChoiceId: 'cat' }],
    }).success,
    false,
  );
});
