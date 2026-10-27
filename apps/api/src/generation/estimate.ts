import type { GenerationInput } from '@lingvohero/contracts';
import { distribute, wordCountFor } from './distribute.js';
import { SENTENCE_LESSON_SIZE } from './sentences.js';

export type CostRates = {
  imageUsd: number;
  ttsPer1kCharsUsd: number;
  textPer1kTokensUsd: number;
};

/** What a job will roughly request from the provider; shown before the admin confirms. */
export function estimate(input: GenerationInput, rates: CostRates, wordsPerLesson = 4) {
  const distribution = distribute(input.totalExercises, input.lessonSize);
  const words = wordCountFor(distribution, input.targetWords.length, {
    wordsPerLesson,
    requested: input.wordCount,
  });
  const images = words + 1; // one illustration per word plus the cover
  // The closing sentence lesson: one recording per sentence, no pictures.
  const sentences = input.mix.includes('build-sentence') ? SENTENCE_LESSON_SIZE : 0;
  const audios = words + sentences;
  const ttsChars = words * 16 + sentences * 24;
  const textTokens = 2500 + (distribution.length + (sentences ? 1 : 0)) * 3000;
  const estimatedUsd =
    images * rates.imageUsd +
    (ttsChars / 1000) * rates.ttsPer1kCharsUsd +
    (textTokens / 1000) * rates.textPer1kTokensUsd;
  return {
    distribution,
    lessons: distribution.length,
    words,
    images,
    audios,
    textTokens,
    estimatedUsd: Math.round(estimatedUsd * 100) / 100,
  };
}
