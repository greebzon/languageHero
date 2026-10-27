import type { Answer, CourseExercise, CourseLesson, ExerciseType } from '@lingvohero/contracts';
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
};
export function assessExercise(
  exercise: CourseExercise,
  answer: Answer,
  lesson: CourseLesson,
): Assessment {
  return (RULES[exercise.type] as Rules<ExerciseType>).assess(exercise, answer, lesson);
}
export type { Assessment } from './types';
