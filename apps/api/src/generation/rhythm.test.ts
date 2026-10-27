import test from 'node:test';
import assert from 'node:assert/strict';
import { choicePresetOf, type DraftExercise, type ExerciseType } from '@lingvohero/contracts';
import { GENERATION_MECHANICS } from './mechanics/index.js';
import { arrangeExercises, lessonMechanics } from './rhythm.js';

const MIX: ExerciseType[] = [
  'listen-and-select',
  'match-pairs',
  'build-word',
  'choice',
  'memory',
  'catch-word',
  'fill-gap',
  'build-sentence',
];

test('each lesson of a set gets its own mechanics, the set uses them all', () => {
  for (const count of [2, 3, 5]) {
    const lessons = Array.from({ length: count }, (_, i) => lessonMechanics(MIX, i, count));
    assert.ok(lessons.every((l) => l.length === 4 && !l.includes('build-sentence')));
    assert.notDeepEqual(lessons[0], lessons[1]);
    assert.equal(new Set(lessons.flat()).size, 7, `every word mechanic in a set of ${count}`);
  }
  assert.deepEqual(lessonMechanics(['listen-and-select', 'choice'], 3, 4), [
    'listen-and-select',
    'choice',
  ]);
});

test('a lesson never repeats a task back to back, peaks in the middle and ends easy', () => {
  const ex = (type: ExerciseType, n: number, variant?: 'is-it' | 'find-picture') =>
    ({
      id: `x-${type}-${n}`,
      type,
      prompt: '',
      hint: '',
      ...(variant === 'is-it'
        ? {
            show: [
              { view: 'image', wordId: 'a' },
              { view: 'text', wordId: 'b' },
            ],
            as: 'yes-no',
          }
        : variant
          ? { show: [{ view: 'text', wordId: 'a' }], as: 'image' }
          : {}),
    }) as unknown as DraftExercise;
  const input = [
    ex('build-word', 1),
    ex('build-word', 2),
    ex('listen-and-select', 1),
    ex('listen-and-select', 2),
    ex('memory', 1),
    ex('choice', 1, 'is-it'),
    ex('choice', 2, 'find-picture'),
  ];
  for (const seed of ['a', 'b', 'c', 'd']) {
    const order = arrangeExercises(input, seed);
    assert.deepEqual(
      order.map((e) => e.id),
      input.map((_, i) => `ex-${i + 1}`),
    );
    const kinds = order.map((e) => (e.type === 'choice' ? choicePresetOf(e) : e.type));
    assert.ok(
      kinds.every((k, i) => i === 0 || k !== kinds[i - 1]),
      kinds.join(),
    );
    const effort = order.map((e) => GENERATION_MECHANICS[e.type].effort);
    assert.equal(effort.at(-1), 1, `ends easy: ${kinds.join()}`);
    assert.ok(Math.max(...effort.slice(1, -1)) === 3, 'the hard tasks are inside');
  }
});
