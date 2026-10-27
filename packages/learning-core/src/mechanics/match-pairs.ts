import { keep } from './adapt';
import type { Rules } from './types';

export const matchPairs: Rules<'match-pairs'> = {
  assess(exercise, answer) {
    // Only a complete one-to-one matching counts as an answer.
    if (
      !('pairs' in answer) ||
      Object.keys(answer.pairs).length !== exercise.wordIds.length ||
      exercise.wordIds.some((id) => !exercise.imageOrder.includes(answer.pairs[id])) ||
      new Set(Object.values(answer.pairs)).size !== exercise.wordIds.length
    )
      return 'invalid';
    return exercise.wordIds.every((id) => answer.pairs[id] === id) ? 'correct' : 'wrong';
  },
  solve: (exercise) => ({ pairs: Object.fromEntries(exercise.wordIds.map((id) => [id, id])) }),
  adapt(exercise, { limits, rand }) {
    const wordIds = keep(exercise.wordIds, limits.pairs, () => false, rand);
    return {
      ...exercise,
      wordIds,
      imageOrder: exercise.imageOrder.filter((id) => wordIds.includes(id)),
    };
  },
};
