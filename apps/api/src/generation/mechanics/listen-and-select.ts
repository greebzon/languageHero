import type { GenerationMechanic } from './types.js';
import { shuffle } from './util.js';

export const listenAndSelect: GenerationMechanic<'listen-and-select'> = {
  label: 'listen-and-select (hear a word, pick its picture among 2–4 options)',
  rules:
    'wordKey = the correct word; choiceKeys = 2–4 distinct keys including wordKey (order is the display order); pairKeys = []; distractorLetters = ""; variant = "".',
  build(item, ctx) {
    const wordId = ctx.key(item.wordKey);
    if (!wordId) return `refers to unknown word "${item.wordKey}"`;
    const choices = [...new Set([wordId, ...item.choiceKeys.map((k) => ctx.key(k) ?? '')])].filter(
      Boolean,
    );
    if (choices.length < 2) {
      // Borrow another lesson word so the exercise stays valid.
      const other = ctx.lesson.wordKeys.find((k) => k !== wordId);
      if (other) choices.push(other);
    }
    if (choices.length < 2) return '(listen) needs at least 2 choices';
    return {
      id: ctx.id,
      type: 'listen-and-select',
      prompt: ctx.prompt,
      hint: ctx.hint,
      wordId,
      choices: shuffle(choices.slice(0, 6), ctx.seed),
    };
  },
  fake: (i, word, others) => ({
    prompt: `Послушай и выбери ${i + 1}`,
    hint: `Это слово начинается на «${word[0]}»`,
    wordKey: word,
    choiceKeys: [word, ...others].slice(0, 2 + (i % 3)),
    pairKeys: [],
    distractorLetters: '',
    variant: '',
  }),
};
