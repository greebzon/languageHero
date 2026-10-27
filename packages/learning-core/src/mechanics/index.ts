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
import { catchWord } from './catch-word';
import { choice } from './choice';
import { listenAndSelect } from './listen-and-select';
import { matchPairs } from './match-pairs';
import { memory } from './memory';
import type { Assessment, Rules } from './types';

/* Grading per mechanic; the data side of each mechanic lives in contracts/src/mechanics. */
const RULES: { [K in ExerciseType]: Rules<K> } = {
  'listen-and-select': listenAndSelect,
  'match-pairs': matchPairs,
  'build-word': buildWord,
  choice,
  'build-sentence': buildSentence,
  memory,
  'catch-word': catchWord,
};
export function assessExercise(
  exercise: CourseExercise,
  answer: Answer,
  lesson: CourseLesson,
): Assessment {
  return (RULES[exercise.type] as Rules<ExerciseType>).assess(exercise, answer, lesson);
}
/** A right answer to the exercise (as shown, i.e. after `adaptExercise`). */
export function solveExercise(exercise: CourseExercise, lesson: CourseLesson): Answer {
  return (RULES[exercise.type] as Rules<ExerciseType>).solve(exercise, lesson);
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
