import type { Rules } from './types';

export const choice: Rules<'choice'> = {
  assess(exercise, answer) {
    if (!('choiceId' in answer) || !exercise.options.some((o) => o.id === answer.choiceId))
      return 'invalid';
    return answer.choiceId === exercise.answerId ? 'correct' : 'wrong';
  },
};
