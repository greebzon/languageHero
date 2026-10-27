import type { Answer, CourseLesson, ExerciseOf, ExerciseType } from '@lingvohero/contracts';

export type Assessment = 'correct' | 'wrong' | 'invalid';
/** The game rules of one mechanic. The answer already has the mechanic's shape. */
export type Rules<K extends ExerciseType> = {
  assess(exercise: ExerciseOf<K>, answer: Answer, lesson: CourseLesson): Assessment;
};
