import { z } from 'zod';
import { base, draftBase, draftRef, id, unique, type Fail, type LessonRefs } from './shared';

/** Hear a word, pick its picture among the choices. */
export const listenAndSelect = {
  exercise: z.object({
    ...base,
    type: z.literal('listen-and-select'),
    wordId: id,
    choices: z.array(id).min(2).max(6),
  }),
  draft: z.object({
    ...draftBase,
    type: z.literal('listen-and-select'),
    wordId: draftRef,
    choices: z.array(draftRef).max(6),
  }),
  answer: z.object({ choiceId: id }),
  validate(ex: { wordId: string; choices: string[] }, { words }: LessonRefs, fail: Fail) {
    if (
      !unique(ex.choices) ||
      !ex.choices.includes(ex.wordId) ||
      ex.choices.some((w) => !words.has(w))
    )
      fail('Invalid listening choices');
  },
  words: (ex: { wordId: string }) => [ex.wordId],
  mapWords: <T extends { wordId: string; choices: string[] }>(
    ex: T,
    f: (id: string) => string,
  ) => ({
    ...ex,
    wordId: f(ex.wordId),
    choices: ex.choices.map(f),
  }),
};
