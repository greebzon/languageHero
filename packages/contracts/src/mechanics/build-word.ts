import { z } from 'zod';
import { base, draftBase, draftRef, id, unique, type Fail, type LessonRefs } from './shared';

type Spell = { wordId: string; tiles: { id: string; letter: string }[] };

/** Spell a word from letter tiles (with a few extra letters). */
export const buildWord = {
  exercise: z.object({
    ...base,
    type: z.literal('build-word'),
    wordId: id,
    tiles: z
      .array(z.object({ id, letter: z.string().min(1).max(4) }))
      .min(2)
      .max(30),
  }),
  draft: z.object({
    ...draftBase,
    type: z.literal('build-word'),
    wordId: draftRef,
    tiles: z.array(z.object({ id, letter: z.string().max(4) })).max(30),
  }),
  answer: z.object({ tileIds: z.array(id).max(30) }),
  validate(ex: Spell, { words }: LessonRefs, fail: Fail) {
    const word = words.get(ex.wordId);
    if (!word || !unique(ex.tiles.map((t) => t.id))) return fail('Invalid spelling exercise');
    // The tiles must hold every letter of the spelling (NFC code points), extras allowed.
    const remaining = ex.tiles.map((t) => t.letter.normalize('NFC'));
    for (const letter of Array.from(word.spelling.normalize('NFC'))) {
      const index = remaining.indexOf(letter);
      if (index < 0) return fail('Tiles cannot form word');
      remaining.splice(index, 1);
    }
  },
  words: (ex: Spell) => [ex.wordId],
  mapWords: <T extends Spell>(ex: T, f: (id: string) => string) => ({
    ...ex,
    wordId: f(ex.wordId),
  }),
};
