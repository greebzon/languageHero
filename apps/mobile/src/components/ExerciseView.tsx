import type { Answer, CourseExercise, CourseLesson } from '@lingvohero/contracts';
import { mechanicFor } from '../mechanics';

/** The current exercise, drawn by its mechanic (src/mechanics). */
export function ExerciseView(props: {
  lesson: CourseLesson;
  exercise: CourseExercise;
  draft: Answer | null;
  correct: boolean;
  onChange: (answer: Answer | null) => void;
}) {
  const { View } = mechanicFor(props.exercise.type);
  return <View {...props} />;
}
