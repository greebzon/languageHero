import type {
  DraftExerciseOf,
  ExerciseType,
  GenerationLessonPlan,
  GenerationWord,
} from '@lingvohero/contracts';
import type { LessonDto, LessonTranslationDto } from '../dto.js';

export type ExerciseDto = LessonDto['exercises'][number];
export type TranslationItem = LessonTranslationDto['exercises'][number];
export type BuildContext = {
  /** Server-assigned id, prompt and hint of the exercise being built. */
  id: string;
  prompt: string;
  hint: string;
  lesson: GenerationLessonPlan;
  /** The server key for one of the model's keys, when that word belongs to the lesson. */
  key(modelKey: string): string | undefined;
  word(key: string): GenerationWord;
  /** Seed for deterministic shuffles and choices of this exercise. */
  seed: string;
};
export type RetranslateContext = { words: GenerationWord[]; seed: string };

/** How generation produces one mechanic from the model's flat exercise objects. */
export type GenerationMechanic<K extends ExerciseType> = {
  /** Shown to the model in the list of allowed mechanics. */
  label: string;
  /** false: never a task of a word lesson (sentences have a lesson of their own). */
  wordLessons?: false;
  /** How hard the task feels (1 quick, 3 demanding): a lesson rises, then ends easy. */
  effort: 1 | 2 | 3;
  /** Field rules for the model; every DTO field must be mentioned. */
  rules: string;
  /** The draft exercise, or why the model's item cannot become one. */
  build(item: ExerciseDto, ctx: BuildContext): DraftExerciseOf<K> | string;
  /** Translated clone: whether the model should suggest distractor letters for it. */
  needsLetters?(exercise: DraftExerciseOf<K>): boolean;
  /** Translated clone: the sentence the model must say again in the new language (with ___). */
  sentenceOf?(exercise: DraftExerciseOf<K>): string;
  /** Translated clone: rebuild what depends on the new spelling (prompt and hint are done). */
  retranslate?(
    exercise: DraftExerciseOf<K>,
    item: TranslationItem,
    ctx: RetranslateContext,
  ): DraftExerciseOf<K>;
  /** The fake provider's answer for exercise `i` about `word` (the type is added by the caller). */
  fake(
    i: number,
    word: string,
    others: string[],
  ): Omit<ExerciseDto, 'type' | 'sentence'> & { sentence?: string };
};
