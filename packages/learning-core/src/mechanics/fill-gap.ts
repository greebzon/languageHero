import { keep } from './adapt';
import type { Rules } from './types';

export const fillGap: Rules<'fill-gap'> = {
  assess(exercise, answer) {
    if (!('choiceId' in answer) || !exercise.options.some((o) => o.id === answer.choiceId))
      return 'invalid';
    return answer.choiceId === exercise.answerId ? 'correct' : 'wrong';
  },
  solve: (exercise) => ({ choiceId: exercise.answerId }),
  adapt: (exercise, { limits, rand }) => ({
    ...exercise,
    options: keep(exercise.options, limits.options, (o) => o.id === exercise.answerId, rand),
  }),
};
