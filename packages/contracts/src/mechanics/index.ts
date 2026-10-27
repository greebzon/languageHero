import { z } from 'zod';
import type { Catalog } from '../course';
import { buildSentence } from './build-sentence';
import { buildWord } from './build-word';
import { catchWord } from './catch-word';
import { choice } from './choice';
import { listenAndSelect } from './listen-and-select';
import { matchPairs } from './match-pairs';
import { memory } from './memory';
import type { Fail, LessonRefs } from './shared';

/* The registry of exercise mechanics. A mechanic is described once per layer: here (data
   shape, checks, which words it uses), in learning-core (grading), in the app, the panel and
   generation. Each layer keys its modules by `ExerciseType`, so adding a mechanic below makes
   tsc point at every layer that still lacks it. See docs/CONTENT.md, «Механики». */

export const courseExerciseSchema = z.discriminatedUnion('type', [
  listenAndSelect.exercise,
  matchPairs.exercise,
  buildWord.exercise,
  choice.exercise,
  buildSentence.exercise,
  memory.exercise,
  catchWord.exercise,
]);
export const draftExerciseSchema = z.discriminatedUnion('type', [
  listenAndSelect.draft,
  matchPairs.draft,
  buildWord.draft,
  choice.draft,
  buildSentence.draft,
  memory.draft,
  catchWord.draft,
]);
/* Answers carry no tag: the exercise they answer tells the mechanic, and mechanics may share a
   shape (`choice` reuses `{choiceId}`), so saved sessions stay valid. */
export const answerSchema = z.union([
  listenAndSelect.answer,
  matchPairs.answer,
  buildWord.answer,
  catchWord.answer,
]);
export type CourseExercise = z.infer<typeof courseExerciseSchema>;
export type DraftExercise = z.infer<typeof draftExerciseSchema>;
export type Answer = z.infer<typeof answerSchema>;
export type ExerciseType = CourseExercise['type'];
export type ExerciseOf<K extends ExerciseType> = Extract<CourseExercise, { type: K }>;
export type DraftExerciseOf<K extends ExerciseType> = Extract<DraftExercise, { type: K }>;

type Module<K extends ExerciseType> = {
  answer: z.ZodType;
  validate(ex: ExerciseOf<K>, lesson: LessonRefs, fail: Fail): void;
  /** The words the exercise practises. */
  words(ex: DraftExerciseOf<K>): string[];
  /** The exercise with every word reference passed through `f`. */
  mapWords(ex: DraftExerciseOf<K>, f: (id: string) => string): DraftExerciseOf<K>;
};
const MECHANICS: { [K in ExerciseType]: Module<K> } = {
  'listen-and-select': listenAndSelect,
  'match-pairs': matchPairs,
  'build-word': buildWord,
  choice,
  'build-sentence': buildSentence,
  memory,
  'catch-word': catchWord,
};
export const MECHANIC_TYPES = Object.keys(MECHANICS) as ExerciseType[];
export const exerciseTypeSchema = z.enum(MECHANIC_TYPES as [ExerciseType, ...ExerciseType[]]);
/** What a client that does not say what it can show is assumed to know (the first releases). */
export const BASE_MECHANICS: readonly ExerciseType[] = [
  'listen-and-select',
  'match-pairs',
  'build-word',
];

// One cast per helper: TypeScript cannot correlate `ex.type` with the module it selects.
const moduleOf = (type: ExerciseType) => MECHANICS[type] as unknown as Module<ExerciseType>;
export function validateExercise(ex: CourseExercise, lesson: LessonRefs, fail: Fail) {
  moduleOf(ex.type).validate(ex, lesson, fail);
}
export function exerciseWords(ex: DraftExercise): string[] {
  return moduleOf(ex.type).words(ex);
}
export function mapExerciseWords<T extends DraftExercise>(ex: T, f: (id: string) => string): T {
  return moduleOf(ex.type).mapWords(ex, f) as T;
}
/** The answer has the shape the exercise's mechanic expects. */
export function answerFits(ex: { type: ExerciseType }, answer: Answer): boolean {
  return moduleOf(ex.type).answer.safeParse(answer).success;
}

/**
 * The catalog for a client that can show only `supported` mechanics: lessons needing anything
 * else are left out, and so are sets left without lessons. Lessons inside a set open in order,
 * so a skipped lesson just is not there for that client.
 */
export function catalogForMechanics(catalog: Catalog, supported: readonly string[]): Catalog {
  const known = new Set(supported);
  const courses = catalog.courses
    .map((c) => ({
      ...c,
      lessons: c.lessons.filter((l) => l.requiredTypes.every((t) => known.has(t))),
    }))
    .filter((c) => c.lessons.length > 0);
  return courses.length === catalog.courses.length &&
    courses.every((c, i) => c.lessons.length === catalog.courses[i]!.lessons.length)
    ? catalog
    : { ...catalog, courses };
}

export * from './choice';
export { sentenceKey, tilesForm } from './build-sentence';
export { memoryCard, memoryCards } from './memory';
export { CATCH_MISSES, catchProgress } from './catch-word';
export { AGE_BANDS, ageBandSchema, type AgeBand } from './shared';
export type { Fail, LessonRefs } from './shared';
