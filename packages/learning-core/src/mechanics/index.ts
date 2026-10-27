import type {
  Answer,
  CourseExercise,
  CourseLesson,
  Difficulty,
  ExerciseType,
} from '@lingvohero/contracts';
import { limitsFor, seeded } from './adapt';
import { buildSentence } from './build-sentence';
import { buildWord } from './build-word';
import { choice } from './choice';
import { listenAndSelect } from './listen-and-select';
import { matchPairs } from './match-pairs';
import type { Assessment, Rules } from './types';

/* Grading per mechanic; the data side of each mechanic lives in contracts/src/mechanics. */
const RULES: { [K in ExerciseType]: Rules<K> } = {
  'listen-and-select': listenAndSelect,
  'match-pairs': matchPairs,
  'build-word': buildWord,
  choice,
  'build-sentence': buildSentence,
};
export function assessExercise(
  exercise: CourseExercise,
  answer: Answer,
  lesson: CourseLesson,
): Assessment {
  return (RULES[exercise.type] as Rules<ExerciseType>).assess(exercise, answer, lesson);
}
/**
 * The exercise as a child of this age group plays it. Deterministic for a seed, so the app,
 * a resumed session and the server's replay all see the same options.
 */
export function adaptExercise(
  exercise: CourseExercise,
  lesson: CourseLesson,
  difficulty: Difficulty | undefined,
  seed: string,
): CourseExercise {
  const rules = RULES[exercise.type] as Rules<ExerciseType>;
  if (!difficulty || !rules.adapt) return exercise;
  return rules.adapt(exercise, { limits: limitsFor(difficulty), lesson, rand: seeded(seed) });
}
export type { Assessment } from './types';
export { LIMITS, type Limits } from './adapt';
