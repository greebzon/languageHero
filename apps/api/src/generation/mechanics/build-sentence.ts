import type { GenerationMechanic } from './types.js';

/* Sentences are not tasks of a word lesson: they get the set's closing lesson of their own,
   written by the `sentences` path of the text stage (generation/sentences.ts). */
export const buildSentence: GenerationMechanic<'build-sentence'> = {
  effort: 3,
  label: 'build-sentence (build a sentence from word tiles)',
  rules: 'not used in word lessons.',
  wordLessons: false,
  build: () => '(sentence) belongs to the sentence lesson',
  fake: () => ({
    prompt: '',
    hint: '',
    wordKey: '',
    choiceKeys: [],
    pairKeys: [],
    distractorLetters: '',
    variant: '',
  }),
};
