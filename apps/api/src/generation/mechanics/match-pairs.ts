import type { GenerationMechanic } from './types.js';
import { shuffle } from './util.js';

export const matchPairs: GenerationMechanic<'match-pairs'> = {
  label: 'match-pairs (connect 2–4 words with their pictures)',
  rules:
    'wordKey = ""; pairKeys = 2–4 distinct keys; choiceKeys = []; distractorLetters = ""; variant = "".',
  build(item, ctx) {
    const keys = [...new Set(item.pairKeys.map((k) => ctx.key(k) ?? ''))].filter(Boolean);
    if (keys.length < 2) return '(pairs) needs 2–4 known words';
    const wordIds = keys.slice(0, 4);
    return {
      id: ctx.id,
      type: 'match-pairs',
      prompt: ctx.prompt,
      hint: ctx.hint,
      wordIds,
      imageOrder: shuffle(wordIds, ctx.seed),
    };
  },
  fake: (i, word, others) => ({
    prompt: `Найди пары ${i + 1}`,
    hint: 'Соедини слово с картинкой',
    wordKey: '',
    choiceKeys: [],
    pairKeys: [word, ...others].slice(0, 2 + (i % 3)),
    distractorLetters: '',
    variant: '',
  }),
};
