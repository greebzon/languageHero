import type { ComponentType } from 'react';
import type {
  Answer,
  CourseLesson,
  DraftExerciseOf,
  DraftWord,
  ExerciseOf,
  ExerciseType,
} from '@lingvohero/contracts';

export type EditorProps<K extends ExerciseType> = {
  exercise: DraftExerciseOf<K>;
  words: DraftWord[];
  /** Server field errors under this exercise (`wordId`, `tiles`, …). */
  errors: (path: string) => string[] | undefined;
  onChange: (exercise: DraftExerciseOf<K>) => void;
};
export type PreviewProps<K extends ExerciseType> = {
  lesson: CourseLesson;
  exercise: ExerciseOf<K>;
  draft: Answer | null;
  correct: boolean;
  mediaUrls: Record<string, string>;
  onChange: (answer: Answer | null) => void;
};
/** How the panel edits and previews one mechanic. */
export type AdminMechanic<K extends ExerciseType> = {
  label: string;
  /** An empty exercise of this mechanic (prompt and hint are filled by the admin). */
  create: (id: string) => DraftExerciseOf<K>;
  Editor: ComponentType<EditorProps<K>>;
  Preview: ComponentType<PreviewProps<K>>;
};
