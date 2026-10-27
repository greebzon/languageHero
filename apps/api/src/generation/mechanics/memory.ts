import { memoryCards } from '@lingvohero/contracts';
import type { GenerationMechanic } from './types.js';
import { shuffle } from './util.js';

export const memory: GenerationMechanic<'memory'> = {
  label: 'memory (a game: turn cards two at a time to find each word with its picture)',
  rules:
    'wordKey = ""; pairKeys = 3–4 distinct keys (one card pair each); choiceKeys = []; distractorLetters = ""; variant = "".',
  build(item, ctx) {
    const keys = [...new Set(item.pairKeys.map((k) => ctx.key(k) ?? ''))].filter(Boolean);
    if (keys.length < 2) return '(memory) needs 2–4 known words';
    const wordIds = keys.slice(0, 4);
    return {
      id: ctx.id,
      type: 'memory',
      prompt: ctx.prompt,
      hint: ctx.hint,
      wordIds,
      order: shuffle(memoryCards(wordIds), ctx.seed),
    };
  },
  fake: (i, word, others) => ({
    prompt: `Мемори ${i + 1}`,
    hint: 'Запоминай, где какая карточка',
    wordKey: '',
    choiceKeys: [],
    pairKeys: [word, ...others].slice(0, 3),
    distractorLetters: '',
    variant: '',
  }),
};
