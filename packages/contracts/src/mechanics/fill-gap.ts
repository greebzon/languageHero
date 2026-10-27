import { z } from 'zod';
import { base, draftBase, draftRef, id, unique, type Fail, type LessonRefs } from './shared';
import { sentenceKey } from './build-sentence';

/* «Вставь пропущенное слово»: a short sentence in the language being learned with one gap
   (`before ___ after`) and a few words to put in it; options of lesson words show their
   picture. Optional `audioId`: the whole sentence heard. The answer is `{choiceId}`. */
type Gap = {
  before: string;
  after: string;
  options: { id: string; text: string; wordId?: string }[];
  answerId: string;
  audioId?: string;
};

/** The sentence with the gap filled by `word` (what the recording says). */
export const filledGap = (ex: Pick<Gap, 'before' | 'after'>, word: string) =>
  [ex.before, word, ex.after].filter((part) => part.trim()).join(' ');

const option = (ref: z.ZodString) =>
  z.object({ id, text: z.string().min(1).max(30), wordId: ref.optional() });

export const fillGap = {
  exercise: z.object({
    ...base,
    type: z.literal('fill-gap'),
    before: z.string().max(120),
    after: z.string().max(120),
    options: z.array(option(id)).min(2).max(6),
    answerId: id,
    audioId: id.optional(),
  }),
  draft: z.object({
    ...draftBase,
    type: z.literal('fill-gap'),
    before: z.string().max(120),
    after: z.string().max(120),
    options: z.array(option(draftRef)).max(6),
    answerId: draftRef,
    audioId: draftRef.optional(),
  }),
  answer: z.object({ choiceId: id }),
  validate(ex: Gap, { words, media }: LessonRefs, fail: Fail) {
    if (!ex.before.trim() && !ex.after.trim()) return fail('A gap needs a sentence around it');
    const ids = ex.options.map((o) => o.id);
    if (
      !unique(ids) ||
      !ids.includes(ex.answerId) ||
      !unique(ex.options.map((o) => sentenceKey(o.text))) ||
      ex.options.some((o) => o.wordId !== undefined && !words.has(o.wordId))
    )
      return fail('Invalid gap options');
    if (ex.audioId !== undefined && media.get(ex.audioId) !== 'audio')
      fail('Missing sentence audio');
  },
  /** The word practised: the one that fills the gap, when it is a lesson word. */
  words: (ex: Pick<Gap, 'options' | 'answerId'>) => {
    const answer = ex.options.find((o) => o.id === ex.answerId)?.wordId;
    return answer ? [answer] : [];
  },
  mapWords: <T extends Pick<Gap, 'options'>>(ex: T, f: (id: string) => string) => ({
    ...ex,
    options: ex.options.map((o) => (o.wordId ? { ...o, wordId: f(o.wordId) } : o)),
  }),
};
