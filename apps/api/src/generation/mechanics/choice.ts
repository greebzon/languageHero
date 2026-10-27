import {
  CHOICE_PRESET_KEYS,
  CHOICE_PRESETS,
  choicePresetOf,
  type ChoicePreset,
  type DraftExerciseOf,
} from '@lingvohero/contracts';
import type { GenerationMechanic } from './types.js';
import { bareLetters, coin, shuffle } from './util.js';

export const GENERATED_CHOICES = CHOICE_PRESET_KEYS.filter((k) => CHOICE_PRESETS[k].generated);
const firstLetter = (spelling: string) => Array.from(spelling.normalize('NFC'))[0] ?? '';

/** Letter options: the right first letter plus up to two others from `pool`, shuffled. */
function letterOptions(answer: string, pool: string[], seed: string) {
  const others = [...new Set(pool.filter((l) => l !== answer))].slice(0, 2);
  const options = shuffle(
    [answer, ...(others.length ? others : ['x'])].map((letter, i) => ({ id: `l${i + 1}`, letter })),
    seed,
  );
  return { options, answerId: options.find((o) => o.letter === answer)!.id };
}

/* The model names a preset and the word; the server builds the options itself, so every
   variant is solvable by construction (and checked again by the strict schema). */
export const choice: GenerationMechanic<'choice'> = {
  effort: 1,
  label:
    'choice (a quick question about one word; pick a variant: find-picture — read the word, pick its picture; name-picture — see the picture, pick the written word; translate — read the Russian translation, pick the word; is-it — a picture with a word under it, answer yes or no; first-sound — see and hear the word, pick its first letter)',
  rules: `variant = one of ${GENERATED_CHOICES.join(', ')} (vary them across the lesson); wordKey = the word asked about; choiceKeys = 1–3 other keys of the lesson for the wrong options (for is-it the server sometimes shows one of them instead of the right word); distractorLetters = for first-sound 2 lowercase letters that are not the word's first letter, otherwise ""; pairKeys = [].`,
  build(item, ctx) {
    const preset = item.variant as ChoicePreset;
    if (!GENERATED_CHOICES.includes(preset))
      return `(choice) has unknown variant "${item.variant}"`;
    const wordId = ctx.key(item.wordKey);
    if (!wordId) return `refers to unknown word "${item.wordKey}"`;
    const others = [...new Set(item.choiceKeys.map((k) => ctx.key(k) ?? ''))].filter(
      (k) => k && k !== wordId,
    );
    // Borrow another lesson word so there is always a wrong option.
    if (!others.length) others.push(...ctx.lesson.wordKeys.filter((k) => k !== wordId).slice(0, 1));
    const base = { id: ctx.id, type: 'choice' as const, prompt: ctx.prompt, hint: ctx.hint };
    const { show, as } = CHOICE_PRESETS[preset];
    if (as === 'letter') {
      const spelling = ctx.word(wordId).spelling;
      const pool = [
        ...Array.from(bareLetters(item.distractorLetters)),
        ...others.map((k) => firstLetter(ctx.word(k).spelling)),
      ];
      return {
        ...base,
        show: show.map((view) => ({ view, wordId })),
        as,
        ...letterOptions(firstLetter(spelling), pool, ctx.seed),
      };
    }
    if (as === 'yes-no') {
      // The server, not the model, decides yes or no, so the answers stay balanced.
      const yes = !others.length || coin(ctx.seed);
      return {
        ...base,
        show: [
          { view: 'image', wordId },
          { view: 'text', wordId: yes ? wordId : others[0]! },
        ],
        as,
        options: [{ id: 'yes' }, { id: 'no' }],
        answerId: yes ? 'yes' : 'no',
      };
    }
    if (!others.length) return '(choice) needs at least 2 words';
    const words = shuffle([wordId, ...others].slice(0, 4), ctx.seed);
    return {
      ...base,
      show: show.map((view) => ({ view, wordId })),
      as,
      options: words.map((w) => ({ id: w, wordId: w })),
      answerId: wordId,
    };
  },
  needsLetters: (exercise) => exercise.as === 'letter',
  retranslate(exercise, item, { words, seed }) {
    if (exercise.as !== 'letter' || choicePresetOf(exercise) !== 'first-sound') return exercise;
    const spelling = words.find((w) => w.key === exercise.show[0]?.wordId)?.spelling ?? '';
    const pool = [
      ...Array.from(bareLetters(item.distractorLetters)),
      ...words.map((w) => firstLetter(w.spelling)),
    ];
    return {
      ...exercise,
      ...letterOptions(firstLetter(spelling), pool, seed),
    } satisfies DraftExerciseOf<'choice'>;
  },
  fake: (i, word, others) => ({
    prompt: `Выбери ответ ${i + 1}`,
    hint: 'Посмотри внимательно',
    wordKey: word,
    choiceKeys: others.slice(0, 2),
    pairKeys: [],
    distractorLetters: 'qz',
    variant: GENERATED_CHOICES[i % GENERATED_CHOICES.length]!,
  }),
};
