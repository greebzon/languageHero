import { z } from 'zod';
import { base, draftBase, draftRef, id, unique, type Fail, type LessonWords } from './shared';

type Pairs = { wordIds: string[]; imageOrder: string[] };

/** Join written words with their pictures. `imageOrder` lists word ids in picture order. */
export const matchPairs = {
  exercise: z.object({
    ...base,
    type: z.literal('match-pairs'),
    wordIds: z.array(id).min(2).max(4),
    imageOrder: z.array(id).min(2).max(4),
  }),
  draft: z.object({
    ...draftBase,
    type: z.literal('match-pairs'),
    wordIds: z.array(draftRef).max(4),
    imageOrder: z.array(draftRef).max(4),
  }),
  answer: z.object({ pairs: z.record(id, id) }),
  validate(ex: Pairs, words: LessonWords, fail: Fail) {
    if (
      !unique(ex.wordIds) ||
      !unique(ex.imageOrder) ||
      ex.wordIds.length !== ex.imageOrder.length ||
      ex.wordIds.some((w) => !words.has(w) || !ex.imageOrder.includes(w))
    )
      fail('Invalid pairs');
  },
  words: (ex: Pairs) => ex.wordIds,
  mapWords: <T extends Pairs>(ex: T, f: (id: string) => string) => ({
    ...ex,
    wordIds: ex.wordIds.map(f),
    imageOrder: ex.imageOrder.map(f),
  }),
};
