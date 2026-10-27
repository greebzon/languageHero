import type { DraftExercise, ExerciseType } from '@lingvohero/contracts';
import { buildSentence } from './build-sentence.js';
import { buildWord } from './build-word.js';
import { choice } from './choice.js';
import { listenAndSelect } from './listen-and-select.js';
import { matchPairs } from './match-pairs.js';
import type { GenerationMechanic, RetranslateContext, TranslationItem } from './types.js';

/* Generation side of each mechanic (contracts/src/mechanics holds the data side). */
export const GENERATION_MECHANICS: { [K in ExerciseType]: GenerationMechanic<K> } = {
  'listen-and-select': listenAndSelect,
  'match-pairs': matchPairs,
  'build-word': buildWord,
  choice,
  'build-sentence': buildSentence,
};
/** The requested mechanics a word lesson may use. */
export const wordLessonMix = <T extends ExerciseType>(mix: readonly T[]) =>
  mix.filter((type) => GENERATION_MECHANICS[type].wordLessons !== false);
// One cast: TypeScript cannot correlate an exercise's `type` with the module it selects.
export const generationMechanic = (type: ExerciseType) =>
  GENERATION_MECHANICS[type] as unknown as GenerationMechanic<ExerciseType>;

export function needsLetters(exercise: DraftExercise): boolean {
  return generationMechanic(exercise.type).needsLetters?.(exercise) ?? false;
}
export function retranslate(
  exercise: DraftExercise,
  item: TranslationItem,
  ctx: RetranslateContext,
): DraftExercise {
  return generationMechanic(exercise.type).retranslate?.(exercise, item, ctx) ?? exercise;
}
export type { BuildContext, ExerciseDto } from './types.js';
export { bareLetters, clip, shuffle, slug } from './util.js';
