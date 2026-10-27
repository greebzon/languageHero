import type { GenerationMechanic } from './types.js';
import { bareLetters, shuffle } from './util.js';

export const buildWord: GenerationMechanic<'build-word'> = {
  label: 'build-word (spell a word from letter tiles with a few distractor letters)',
  rules:
    'wordKey = the word to spell; distractorLetters = 1–3 extra lowercase letters not helping to spell it; choiceKeys = []; pairKeys = []; variant = "".',
  build(item, ctx) {
    const wordId = ctx.key(item.wordKey);
    if (!wordId) return `refers to unknown word "${item.wordKey}"`;
    const letters = Array.from(ctx.word(wordId).spelling.normalize('NFC'));
    const distractors = Array.from(item.distractorLetters.toLowerCase().replace(/[^\p{L}]/gu, ''))
      .filter((l) => !letters.includes(l))
      .slice(0, 3);
    const tiles = shuffle(
      [...letters, ...(distractors.length ? distractors : ['x'])].map((letter, i) => ({
        id: `t${i + 1}`,
        letter,
      })),
      ctx.seed,
    );
    return {
      id: ctx.id,
      type: 'build-word',
      prompt: ctx.prompt,
      hint: ctx.hint,
      wordId,
      tiles: tiles.slice(0, 30),
    };
  },
  needsLetters: () => true,
  retranslate(exercise, item, { words, seed }) {
    const letters = Array.from(words.find((w) => w.key === exercise.wordId)?.spelling ?? '');
    // Distractors from the model, else letters of the other words, so the script stays the same.
    const pool = [
      ...Array.from(bareLetters(item.distractorLetters)),
      ...words.flatMap((w) => Array.from(w.spelling)),
    ];
    const distractors = [...new Set(pool.filter((l) => !letters.includes(l)))].slice(0, 2);
    const tiles = shuffle(
      [...letters, ...distractors].map((letter, i) => ({ id: `t${i + 1}`, letter })),
      seed,
    );
    return { ...exercise, tiles: tiles.slice(0, 30) };
  },
  fake: (i, word) => ({
    prompt: `Собери слово ${i + 1}`,
    hint: 'Начни с первой буквы',
    wordKey: word,
    choiceKeys: [],
    pairKeys: [],
    distractorLetters: 'qz',
    variant: '',
  }),
};
