import type { Rules } from './types';

export const buildWord: Rules<'build-word'> = {
  assess(exercise, answer, lesson) {
    if (
      !('tileIds' in answer) ||
      answer.tileIds.length === 0 ||
      new Set(answer.tileIds).size !== answer.tileIds.length ||
      answer.tileIds.some((id) => !exercise.tiles.some((t) => t.id === id))
    )
      return 'invalid';
    // Letters are compared, not tiles: two tiles with the same letter are interchangeable.
    const text = answer.tileIds
      .map((id) => exercise.tiles.find((t) => t.id === id)!.letter)
      .join('')
      .normalize('NFC');
    return text === lesson.words.find((w) => w.id === exercise.wordId)!.spelling.normalize('NFC')
      ? 'correct'
      : 'wrong';
  },
};
