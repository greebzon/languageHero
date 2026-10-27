import { filledGap } from '@lingvohero/contracts';
import type { GenerationMechanic } from './types.js';
import { clip, shuffle } from './util.js';

const GAP = /_{2,}/;
/** «I see a ___» → the text around the gap, or null without exactly one gap. */
function splitGap(sentence: string) {
  const parts = sentence.split(GAP);
  if (parts.length !== 2) return null;
  const [before, after] = parts.map((p) => clip(p.replace(/\s+/g, ' '), 120));
  return before || after ? { before: before!, after: after! } : null;
}

export const fillGap: GenerationMechanic<'fill-gap'> = {
  effort: 2,
  label: 'fill-gap (a short sentence with one missing word; pick the word that fits)',
  rules:
    'wordKey = the word that fills the gap; sentence = a short, very simple sentence (3–6 words) in the language being learned with ___ where that word goes (like "I see a ___"); choiceKeys = 1–3 other keys as wrong options; pairKeys = []; distractorLetters = ""; variant = "".',
  build(item, ctx) {
    const wordId = ctx.key(item.wordKey);
    if (!wordId) return `refers to unknown word "${item.wordKey}"`;
    const gap = splitGap(item.sentence);
    if (!gap) return `(gap) needs a sentence with one ___, got "${item.sentence}"`;
    if (filledGap(gap, '').split(/\s+/).length > 8) return '(gap) sentence is too long';
    const others = [...new Set(item.choiceKeys.map((k) => ctx.key(k) ?? ''))].filter(
      (k) => k && k !== wordId,
    );
    if (!others.length) others.push(...ctx.lesson.wordKeys.filter((k) => k !== wordId).slice(0, 1));
    if (!others.length) return '(gap) needs at least 2 words';
    const options = shuffle([wordId, ...others].slice(0, 4), ctx.seed).map((w) => ({
      id: w,
      text: ctx.word(w).spelling,
      wordId: w,
    }));
    return {
      id: ctx.id,
      type: 'fill-gap',
      prompt: ctx.prompt,
      hint: ctx.hint,
      ...gap,
      options,
      answerId: wordId,
    };
  },
  sentenceOf: (exercise) => `${exercise.before} ___ ${exercise.after}`.trim(),
  retranslate(exercise, item, { words }) {
    // The sentence is said again in the new language; the options are the new spellings.
    const gap = splitGap(item.sentence) ?? { before: exercise.before, after: exercise.after };
    return {
      ...exercise,
      ...gap,
      options: exercise.options.map((o) => ({
        ...o,
        text: (o.wordId && words.find((w) => w.key === o.wordId)?.spelling) || o.text,
      })),
    };
  },
  fake: (i, word, others) => ({
    prompt: `Вставь слово ${i + 1}`,
    hint: 'Какое слово подходит?',
    wordKey: word,
    choiceKeys: others.slice(0, 2),
    pairKeys: [],
    distractorLetters: '',
    variant: '',
    sentence: 'I see a ___',
  }),
};
