import { z } from 'zod';
import { base, draftBase, draftRef, id, unique, type Fail, type LessonRefs } from './shared';

/* «Собери фразу»: a sentence from word tiles, made of words the child already knows. The
   sentence is heard (`audioId`), its meaning is in the prompt. Tiles linked to a lesson word
   show its picture. Tiles are compared by text, so two «the» tiles are interchangeable;
   `alternatives` lists other word orders that are right too. */

/** How tiles are compared: case and Unicode form do not matter. */
export const sentenceKey = (text: string) => text.normalize('NFC').trim().toLowerCase();

type Sentence = {
  tokens: { id: string; text: string; wordId?: string }[];
  answer: string[];
  alternatives?: string[][];
  audioId: string;
};

/** The tiles can be put in this order (every word of `order` has its own tile). */
export function tilesForm(tokens: { text: string }[], order: string[]): boolean {
  const pool = tokens.map((t) => sentenceKey(t.text));
  for (const word of order) {
    const index = pool.indexOf(sentenceKey(word));
    if (index < 0) return false;
    pool.splice(index, 1);
  }
  return true;
}

const token = (ref: z.ZodString) =>
  z.object({ id, text: z.string().min(1).max(30), wordId: ref.optional() });

export const buildSentence = {
  exercise: z.object({
    ...base,
    type: z.literal('build-sentence'),
    tokens: z.array(token(id)).min(2).max(14),
    answer: z.array(z.string().min(1).max(30)).min(1).max(10),
    alternatives: z
      .array(z.array(z.string().min(1).max(30)).min(1).max(10))
      .max(4)
      .optional(),
    audioId: id,
  }),
  draft: z.object({
    ...draftBase,
    type: z.literal('build-sentence'),
    tokens: z.array(token(draftRef)).max(14),
    answer: z.array(z.string().max(30)).max(10),
    alternatives: z
      .array(z.array(z.string().max(30)).max(10))
      .max(4)
      .optional(),
    audioId: draftRef,
  }),
  answer: z.object({ tileIds: z.array(id).max(30) }),
  validate(ex: Sentence, { words, media }: LessonRefs, fail: Fail) {
    if (!unique(ex.tokens.map((t) => t.id))) return fail('Invalid sentence tiles');
    if (ex.tokens.some((t) => t.wordId !== undefined && !words.has(t.wordId)))
      return fail('Unknown word in sentence');
    if (media.get(ex.audioId) !== 'audio') fail('Missing sentence audio');
    for (const order of [ex.answer, ...(ex.alternatives ?? [])])
      if (!tilesForm(ex.tokens, order)) return fail('Tiles cannot form sentence');
  },
  /** The lesson words the sentence is made of (extra tiles included). */
  words: (ex: Pick<Sentence, 'tokens'>) => [
    ...new Set(ex.tokens.flatMap((t) => (t.wordId ? [t.wordId] : []))),
  ],
  mapWords: <T extends Pick<Sentence, 'tokens'>>(ex: T, f: (id: string) => string) => ({
    ...ex,
    tokens: ex.tokens.map((t) => (t.wordId ? { ...t, wordId: f(t.wordId) } : t)),
  }),
};
