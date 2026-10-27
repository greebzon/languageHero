import { memoryCards } from '@lingvohero/contracts';
import { keep } from './adapt';
import type { Rules } from './types';

export const memory: Rules<'memory'> = {
  assess(exercise, answer) {
    // The game only records pairs it found, so a complete answer is the end of the game.
    if (
      !('pairs' in answer) ||
      Object.keys(answer.pairs).length !== exercise.wordIds.length ||
      exercise.wordIds.some((id) => !(id in answer.pairs))
    )
      return 'invalid';
    return exercise.wordIds.every((id) => answer.pairs[id] === id) ? 'correct' : 'wrong';
  },
  solve: (exercise) => ({ pairs: Object.fromEntries(exercise.wordIds.map((id) => [id, id])) }),
  adapt(exercise, { limits, rand }) {
    const wordIds = keep(exercise.wordIds, limits.pairs, () => false, rand);
    const cards = new Set(memoryCards(wordIds));
    return { ...exercise, wordIds, order: exercise.order.filter((c) => cards.has(c)) };
  },
};
