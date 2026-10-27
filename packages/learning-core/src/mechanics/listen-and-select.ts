import type { Rules } from './types';

export const listenAndSelect: Rules<'listen-and-select'> = {
  assess(exercise, answer) {
    if (!('choiceId' in answer) || !exercise.choices.includes(answer.choiceId)) return 'invalid';
    return answer.choiceId === exercise.wordId ? 'correct' : 'wrong';
  },
};
