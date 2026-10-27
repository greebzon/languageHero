import test from 'node:test';
import assert from 'node:assert/strict';
import { releaseSchema } from '@lingvohero/contracts';
import { assess } from './course';
import { ageFrom, birthYearFor, spellingHelp, spellingTiles } from './spelling';
import data from '../../../content/seed.json';

const { lessons } = releaseSchema.parse(data);
const now = new Date('2026-10-03T12:00:00Z');

test('the age the child taps becomes a birth year that keeps growing', () => {
  assert.equal(birthYearFor(6, now), 2020);
  assert.equal(ageFrom(2020, now), 6);
  assert.equal(ageFrom(2020, new Date('2027-03-01T12:00:00Z')), 7);
});

test('up to six «Собери слово» shows the model, from seven on the plain exercise', () => {
  assert.equal(spellingHelp(birthYearFor(5, now), now), 'model');
  assert.equal(spellingHelp(birthYearFor(6, now), now), 'model');
  assert.equal(spellingHelp(birthYearFor(7, now), now), 'self');
  assert.equal(spellingHelp(birthYearFor(9, now), now), 'self');
  // Accounts from before the age question keep the exercise they knew.
  assert.equal(spellingHelp(null, now), 'self');
});

test('the model keeps exactly the letters of the word, and following it is a correct answer', () => {
  let checked = 0;
  for (const lesson of lessons)
    for (const exercise of lesson.exercises) {
      if (exercise.type !== 'build-word') continue;
      const spelling = lesson.words.find((w) => w.id === exercise.wordId)!.spelling;
      const tiles = spellingTiles(exercise, spelling);
      const letters = Array.from(spelling.normalize('NFC'));
      assert.deepEqual(tiles.map((t) => t.letter).sort(), [...letters].sort());
      // The child fills the slots left to right with matching shapes, any of equal letters.
      const left = [...tiles];
      const tileIds = letters.map((letter) => {
        const index = left.findIndex((t) => t.letter === letter);
        return left.splice(index, 1)[0]!.id;
      });
      assert.equal(assess(exercise, { tileIds }, lesson), 'correct');
      checked++;
    }
  assert.ok(checked > 0);
});

test('repeated letters keep one tile each, distractors go', () => {
  const exercise = {
    id: 'ex',
    type: 'build-word' as const,
    prompt: 'p',
    hint: 'h',
    wordId: 'w',
    tiles: [
      { id: 'a', letter: 'p' },
      { id: 'b', letter: 'x' },
      { id: 'c', letter: 'a' },
      { id: 'd', letter: 'p' },
      { id: 'e', letter: 'p' },
    ],
  };
  assert.deepEqual(
    spellingTiles(exercise, 'pap').map((t) => t.id),
    ['a', 'c', 'd'],
  );
});
