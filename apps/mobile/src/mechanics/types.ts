import type { ComponentType } from 'react';
import type { Answer, CourseLesson, ExerciseOf, ExerciseType } from '@lingvohero/contracts';

export type MechanicProps<K extends ExerciseType> = {
  lesson: CourseLesson;
  exercise: ExerciseOf<K>;
  draft: Answer | null;
  correct: boolean;
  onChange: (answer: Answer | null) => void;
};
/** How the app shows one mechanic. */
export type MobileMechanic<K extends ExerciseType> = {
  View: ComponentType<MechanicProps<K>>;
  /** Extra help under the exercise's hint in «Подсказка друга». */
  Hint?: ComponentType<{ lesson: CourseLesson; exercise: ExerciseOf<K> }>;
};
