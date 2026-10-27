import { keep } from './adapt';
import type { Rules } from './types';

export const choice: Rules<'choice'> = {
  assess(exercise, answer) {
    if (!('choiceId' in answer) || !exercise.options.some((o) => o.id === answer.choiceId))
      return 'invalid';
    return answer.choiceId === exercise.answerId ? 'correct' : 'wrong';
  },
  adapt: (exercise, { limits, rand }) => ({
    ...exercise,
    options: keep(exercise.options, limits.options, (o) => o.id === exercise.answerId, rand),
  }),
};
