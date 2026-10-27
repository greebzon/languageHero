import type { Answer, CourseLesson, ExerciseOf, ExerciseType } from '@lingvohero/contracts';
import type { AdaptContext } from './adapt';

export type Assessment = 'correct' | 'wrong' | 'invalid';
/** The game rules of one mechanic. The answer already has the mechanic's shape. */
export type Rules<K extends ExerciseType> = {
  assess(exercise: ExerciseOf<K>, answer: Answer, lesson: CourseLesson): Assessment;
  /** A right answer (tests, and the server's own checks of what a mechanic accepts). */
  solve(exercise: ExerciseOf<K>, lesson: CourseLesson): Answer;
  /** The exercise eased within `limits`; it must stay valid and keep its answer. */
  adapt?(exercise: ExerciseOf<K>, ctx: AdaptContext): ExerciseOf<K>;
};
