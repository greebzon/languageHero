import { keep } from './adapt';
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
  adapt(exercise, { limits, lesson, rand }) {
    // The tiles that spell the word stay; of the extra letters only `extraTiles` remain.
    const needed = new Set<string>();
    const spelling = lesson.words.find((w) => w.id === exercise.wordId)!.spelling;
    for (const letter of Array.from(spelling.normalize('NFC'))) {
      const tile = exercise.tiles.find(
        (t) => !needed.has(t.id) && t.letter.normalize('NFC') === letter,
      );
      if (tile) needed.add(tile.id);
    }
    const tiles = keep(
      exercise.tiles,
      needed.size + limits.extraTiles,
      (t) => needed.has(t.id),
      rand,
    );
    return { ...exercise, tiles };
  },
};
