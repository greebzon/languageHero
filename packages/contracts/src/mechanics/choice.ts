import { z } from 'zod';
import { base, draftBase, draftRef, id, unique, type Fail, type LessonWords } from './shared';

/* «Выбор»: one mechanic for a whole family of tasks. What the child is shown (`show`) and what
   the options look like (`as`) are data, so a new kind of choice task is a new combination,
   not new code. Every piece comes from the lesson's own words, so no extra media is needed. */

/** One piece of the question: a lesson word heard, seen, read or given in translation. */
export const choiceViewSchema = z.enum(['audio', 'image', 'text', 'translation']);
/** How the options look: pictures or written words, letters, or a yes/no pair. */
export const choiceOptionsSchema = z.enum(['image', 'text', 'letter', 'yes-no']);
export type ChoiceView = z.infer<typeof choiceViewSchema>;
export type ChoiceOptions = z.infer<typeof choiceOptionsSchema>;

/** Ready-made combinations. `generated`: the model may pick it when generating a set. */
export const CHOICE_PRESETS = {
  /* Read a word, pick its picture. */
  'find-picture': { show: ['text'], as: 'image', generated: true },
  /* See a picture, pick the written word. */
  'name-picture': { show: ['image'], as: 'text', generated: true },
  /* Read the translation, pick the word. */
  translate: { show: ['translation'], as: 'text', generated: true },
  /* A picture with a word under it: is that the right word? */
  'is-it': { show: ['image', 'text'], as: 'yes-no', generated: true },
  /* See and hear a word, pick its first letter. */
  'first-sound': { show: ['image', 'audio'], as: 'letter', generated: true },
  /* Which picture does not belong? Needs words from different groups, so only by hand. */
  'odd-one-out': { show: [], as: 'image', generated: false },
} as const satisfies Record<
  string,
  { show: readonly ChoiceView[]; as: ChoiceOptions; generated: boolean }
>;
export type ChoicePreset = keyof typeof CHOICE_PRESETS;
export const CHOICE_PRESET_KEYS = Object.keys(CHOICE_PRESETS) as ChoicePreset[];

type Choice = {
  show: { view: string; wordId: string }[];
  as: ChoiceOptions;
  options: { id: string; wordId?: string; letter?: string }[];
  answerId: string;
};

/** The preset an exercise follows, if any (the panel shows it as the exercise's kind). */
export function choicePresetOf(ex: Pick<Choice, 'show' | 'as'>): ChoicePreset | undefined {
  const views = ex.show.map((s) => s.view).join('+');
  return CHOICE_PRESET_KEYS.find(
    (key) => CHOICE_PRESETS[key].as === ex.as && CHOICE_PRESETS[key].show.join('+') === views,
  );
}

const show = (ref: z.ZodString) =>
  z.array(z.object({ view: choiceViewSchema, wordId: ref })).max(3);

export const choice = {
  exercise: z.object({
    ...base,
    type: z.literal('choice'),
    show: show(id),
    as: choiceOptionsSchema,
    options: z
      .array(
        z.object({
          id,
          wordId: id.optional(),
          letter: z.string().min(1).max(4).optional(),
        }),
      )
      .min(2)
      .max(6),
    answerId: id,
  }),
  draft: z.object({
    ...draftBase,
    type: z.literal('choice'),
    show: show(draftRef),
    as: choiceOptionsSchema,
    options: z
      .array(z.object({ id, wordId: draftRef.optional(), letter: z.string().max(4).optional() }))
      .max(6),
    answerId: draftRef,
  }),
  answer: z.object({ choiceId: id }),
  validate(ex: Choice, words: LessonWords, fail: Fail) {
    const ids = ex.options.map((o) => o.id);
    if (!unique(ids) || !ids.includes(ex.answerId)) return fail('Invalid choice options');
    if (ex.show.some((s) => !words.has(s.wordId))) return fail('Unknown word in choice');
    if (ex.as === 'image' || ex.as === 'text') {
      const refs = ex.options.map((o) => o.wordId);
      if (
        refs.some((w) => !w || !words.has(w)) ||
        !unique(refs) ||
        ex.options.some((o) => o.letter !== undefined)
      )
        fail('Invalid choice options');
      const answer = ex.options.find((o) => o.id === ex.answerId)?.wordId;
      if (ex.show.some((s) => s.wordId !== answer)) fail('The answer is not the word asked about');
    } else if (ex.as === 'letter') {
      const letters = ex.options.map((o) => o.letter?.normalize('NFC'));
      if (ex.show.length === 0) fail('Nothing to answer about');
      if (
        letters.some((l) => !l) ||
        !unique(letters) ||
        ex.options.some((o) => o.wordId !== undefined)
      )
        fail('Invalid choice options');
    } else {
      // Yes/no compares the shown pieces: «yes» exactly when they are all the same word.
      if (
        ids.length !== 2 ||
        !ids.includes('yes') ||
        !ids.includes('no') ||
        ex.options.some((o) => o.wordId !== undefined || o.letter !== undefined)
      )
        return fail('Invalid choice options');
      if (ex.show.length < 2) return fail('Yes/no needs two pieces to compare');
      const same = ex.show.every((s) => s.wordId === ex.show[0]!.wordId);
      if ((ex.answerId === 'yes') !== same) fail('Yes/no answer disagrees with the question');
    }
  },
  /** The words practised: the one asked about, or all the pictures of an odd-one-out. */
  words: (ex: Choice) =>
    ex.show.length
      ? [...new Set(ex.show.map((s) => s.wordId))]
      : ex.options.flatMap((o) => (o.wordId ? [o.wordId] : [])),
  mapWords: <T extends Choice>(ex: T, f: (id: string) => string) => ({
    ...ex,
    show: ex.show.map((s) => ({ ...s, wordId: f(s.wordId) })),
    options: ex.options.map((o) => (o.wordId ? { ...o, wordId: f(o.wordId) } : o)),
  }),
};
