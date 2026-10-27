import type { GenerationMechanic } from './types.js';
import { shuffle } from './util.js';

export const catchWord: GenerationMechanic<'catch-word'> = {
  effort: 2,
  label:
    'catch-word (an arcade game: hear a word, pop the bubble with its picture; one round per word)',
  rules:
    'wordKey = ""; choiceKeys = 3–4 distinct keys, one round each in this order; pairKeys = []; distractorLetters = ""; variant = "".',
  build(item, ctx) {
    const keys = [...new Set(item.choiceKeys.map((k) => ctx.key(k) ?? ''))].filter(Boolean);
    if (keys.length < 2) return '(catch) needs 2–4 known words';
    // Each round shows its word among two other words of the lesson.
    const rounds = keys.slice(0, 4).map((wordId, i) => {
      const others = shuffle(
        ctx.lesson.wordKeys.filter((k) => k !== wordId),
        `${ctx.seed}:${i}`,
      ).slice(0, 2);
      return { wordId, choices: shuffle([wordId, ...others], `${ctx.seed}:${i}:order`) };
    });
    return { id: ctx.id, type: 'catch-word', prompt: ctx.prompt, hint: ctx.hint, rounds };
  },
  fake: (i, word, others) => ({
    prompt: `Поймай слово ${i + 1}`,
    hint: 'Слушай внимательно',
    wordKey: '',
    choiceKeys: [word, ...others].slice(0, 3),
    pairKeys: [],
    distractorLetters: '',
    variant: '',
  }),
};
