import { sentenceKey, tilesForm } from '@lingvohero/contracts';
import { keep } from './adapt';
import type { Rules } from './types';

export const buildSentence: Rules<'build-sentence'> = {
  assess(exercise, answer) {
    if (
      !('tileIds' in answer) ||
      answer.tileIds.length === 0 ||
      new Set(answer.tileIds).size !== answer.tileIds.length ||
      answer.tileIds.some((id) => !exercise.tokens.some((t) => t.id === id))
    )
      return 'invalid';
    // Words are compared, not tiles: two «the» tiles are interchangeable.
    const built = answer.tileIds
      .map((id) => sentenceKey(exercise.tokens.find((t) => t.id === id)!.text))
      .join(' ');
    return [exercise.answer, ...(exercise.alternatives ?? [])].some(
      (order) => order.map(sentenceKey).join(' ') === built,
    )
      ? 'correct'
      : 'wrong';
  },
  solve(exercise) {
    const left = [...exercise.tokens];
    return {
      tileIds: exercise.answer.map(
        (word) =>
          left.splice(
            left.findIndex((t) => sentenceKey(t.text) === sentenceKey(word)),
            1,
          )[0]!.id,
      ),
    };
  },
  adapt(exercise, { limits, rand }) {
    // The tiles of the sentence stay (every right order still fits them); of the extra
    // words only `extraTiles` remain.
    const needed = new Set<string>();
    for (const word of exercise.answer) {
      const tile = exercise.tokens.find(
        (t) => !needed.has(t.id) && sentenceKey(t.text) === sentenceKey(word),
      );
      if (tile) needed.add(tile.id);
    }
    const tokens = keep(
      exercise.tokens,
      needed.size + limits.extraTiles,
      (t) => needed.has(t.id),
      rand,
    );
    const fits = (order: string[]) => tilesForm(tokens, order);
    return {
      ...exercise,
      tokens,
      ...(exercise.alternatives ? { alternatives: exercise.alternatives.filter(fits) } : {}),
    };
  },
};
