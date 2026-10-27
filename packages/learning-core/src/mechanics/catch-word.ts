import { CATCH_MISSES } from '@lingvohero/contracts';
import { keep } from './adapt';
import type { Rules } from './types';

export const catchWord: Rules<'catch-word'> = {
  assess(exercise, answer) {
    if (!('taps' in answer)) return 'invalid';
    let round = 0;
    let misses = 0;
    for (const tap of answer.taps) {
      const current = exercise.rounds[round];
      // A tap after the last round, or on a bubble the round did not show, is not a game.
      if (!current || !current.choices.includes(tap)) return 'invalid';
      if (tap === current.wordId) round += 1;
      else misses += 1;
    }
    if (round < exercise.rounds.length) return 'invalid';
    return misses <= CATCH_MISSES ? 'correct' : 'wrong';
  },
  solve: (exercise) => ({ taps: exercise.rounds.map((r) => r.wordId) }),
  adapt: (exercise, { limits, rand }) => ({
    ...exercise,
    rounds: exercise.rounds.map((r) => ({
      ...r,
      choices: keep(r.choices, limits.options, (w) => w === r.wordId, rand),
    })),
  }),
};
