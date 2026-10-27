import { z } from 'zod';
import { base, draftBase, draftRef, id, unique, type Fail, type LessonRefs } from './shared';

/* «Мемори»: cards face down, a picture and a written word for each word; the child turns two
   at a time and keeps the pairs that belong together. A game break without wrong answers:
   the answer is the found pairs (`{pairs}`, as in match-pairs), complete only when all are. */
export const memoryCard = (wordId: string, face: 'image' | 'text') => `${wordId}-${face}`;
export const memoryCards = (wordIds: string[]) =>
  wordIds.flatMap((w) => [memoryCard(w, 'image'), memoryCard(w, 'text')]);

type Memory = { wordIds: string[]; order: string[] };

export const memory = {
  exercise: z.object({
    ...base,
    type: z.literal('memory'),
    wordIds: z.array(id).min(2).max(6),
    /** The cards in table order: `<word>-image` and `<word>-text` for every word. */
    order: z.array(z.string().max(90)).min(4).max(12),
  }),
  draft: z.object({
    ...draftBase,
    type: z.literal('memory'),
    wordIds: z.array(draftRef).max(6),
    order: z.array(z.string().max(90)).max(12),
  }),
  answer: z.object({ pairs: z.record(id, id) }),
  validate(ex: Memory, { words }: LessonRefs, fail: Fail) {
    const cards = memoryCards(ex.wordIds);
    if (
      !unique(ex.wordIds) ||
      ex.wordIds.some((w) => !words.has(w)) ||
      ex.order.length !== cards.length ||
      !cards.every((c) => ex.order.includes(c))
    )
      fail('Invalid memory cards');
  },
  words: (ex: Pick<Memory, 'wordIds'>) => ex.wordIds,
  mapWords: <T extends Memory>(ex: T, f: (id: string) => string) => {
    const card = (c: string) => {
      const face = c.endsWith('-image') ? 'image' : 'text';
      return memoryCard(f(c.slice(0, -face.length - 1)), face);
    };
    return { ...ex, wordIds: ex.wordIds.map(f), order: ex.order.map(card) };
  },
};
