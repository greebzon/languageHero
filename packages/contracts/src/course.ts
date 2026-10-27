import { z } from 'zod';
import { answerSchema, courseExerciseSchema, validateExercise } from './mechanics';
import { AGE_BANDS, ageBandSchema } from './mechanics/shared';
import { id, unique } from './mechanics/shared';

export * from './mechanics';

/* Languages of the app's interface and of the texts a child reads (prompts, hints, Tim's
   lines, word translations). Lesson packages keep Russian in their base fields; other
   locales come as an optional overlay (`texts`) that old clients simply drop. */
export const LOCALES = ['ru', 'en', 'he'] as const;
export const localeSchema = z.enum(LOCALES);
export type Locale = z.infer<typeof localeSchema>;
/** The locale of the base (non-overlay) texts of every lesson and set. */
export const BASE_LOCALE: Locale = 'ru';
export const OVERLAY_LOCALES = LOCALES.filter((l) => l !== BASE_LOCALE) as Exclude<Locale, 'ru'>[];
export const overlayLocaleSchema = z.enum(['en', 'he']);
export const mediaSchema = z
  .object({
    id,
    path: z.string().regex(/^\/v1\/media\/[a-f0-9]{64}\.(png|wav)$/),
    kind: z.enum(['image', 'audio']),
    // An atlas region permits new artwork without changing the rendering code.
    region: z
      .object({
        columns: z.number().int().min(1).max(8),
        rows: z.number().int().min(1).max(8),
        column: z.number().int().min(0),
        row: z.number().int().min(0),
      })
      .optional(),
  })
  .superRefine((asset, ctx) => {
    if (
      asset.region &&
      (asset.kind !== 'image' ||
        asset.region.column >= asset.region.columns ||
        asset.region.row >= asset.region.rows)
    )
      ctx.addIssue({ code: 'custom', message: 'Invalid atlas region' });
    if (!asset.path.endsWith(asset.kind === 'image' ? '.png' : '.wav'))
      ctx.addIssue({ code: 'custom', message: 'Media kind and extension disagree' });
  });
export const wordSchema = z.object({
  id,
  text: z.string().min(1).max(80),
  spelling: z.string().min(1).max(24),
  translation: z.string().min(1).max(100),
  imageId: id,
  audioId: id,
});
export const presentationSchema = z.object({
  intro: z.string().min(1).max(300),
  completionTitle: z.string().min(1).max(100),
  completionMessage: z.string().min(1).max(400),
});
/** One locale's texts of a lesson; complete when it covers every field the base has. */
export const lessonTextsSchema = z.object({
  title: z.string().min(1).max(100).optional(),
  presentation: presentationSchema.optional(),
  exercises: z
    .record(id, z.object({ prompt: z.string().min(1).max(200), hint: z.string().min(1).max(300) }))
    .optional(),
  words: z.record(id, z.object({ translation: z.string().min(1).max(100) })).optional(),
});
export type LessonTexts = z.infer<typeof lessonTextsSchema>;
export const courseLessonSchema = z
  .object({
    schemaVersion: z.literal(2),
    id,
    version: z.number().int().positive(),
    language: id,
    title: z.string().min(1).max(100),
    presentation: presentationSchema.optional(),
    texts: z.partialRecord(overlayLocaleSchema, lessonTextsSchema).optional(),
    words: z.array(wordSchema).min(1).max(40),
    media: z.array(mediaSchema).min(1).max(100),
    exercises: z.array(courseExerciseSchema).min(1).max(30),
  })
  .superRefine((lesson, ctx) => {
    const fail = (message: string) => ctx.addIssue({ code: 'custom', message });
    for (const items of [lesson.words, lesson.media, lesson.exercises])
      if (!unique(items.map((x) => x.id))) fail('Duplicate IDs');
    const words = new Map(lesson.words.map((w) => [w.id, w]));
    for (const texts of Object.values(lesson.texts ?? {})) {
      if (Object.keys(texts.exercises ?? {}).some((k) => !lesson.exercises.some((e) => e.id === k)))
        fail('Texts for an unknown exercise');
      if (Object.keys(texts.words ?? {}).some((k) => !words.has(k)))
        fail('Texts for an unknown word');
    }
    for (const word of lesson.words) {
      if (
        !lesson.media.some((a) => a.id === word.imageId && a.kind === 'image') ||
        !lesson.media.some((a) => a.id === word.audioId && a.kind === 'audio')
      )
        fail('Missing word media');
    }
    const media = new Map(lesson.media.map((m) => [m.id, m.kind]));
    for (const ex of lesson.exercises) validateExercise(ex, { words, media }, fail);
    // Every age group must have something to play.
    for (const band of AGE_BANDS)
      if (!lesson.exercises.some((e) => !e.ageBands || e.ageBands.includes(band)))
        fail(`No exercises for age ${band}`);
  });
/** Exercises per age group, or undefined when no exercise is limited to an age group. */
export function exerciseCountsOf(lesson: {
  exercises: { ageBands?: readonly string[] }[];
}): Partial<Record<(typeof AGE_BANDS)[number], number>> | undefined {
  if (!lesson.exercises.some((e) => e.ageBands)) return undefined;
  return Object.fromEntries(
    AGE_BANDS.map((band) => [
      band,
      lesson.exercises.filter((e) => !e.ageBands || e.ageBands.includes(band)).length,
    ]),
  );
}
const cardTextsSchema = z.object({
  title: z.string().min(1).max(100),
  description: z.string().min(1).max(200).optional(),
});
type LessonForLocales = {
  title: string;
  presentation?: unknown;
  texts?: Partial<Record<Exclude<Locale, 'ru'>, LessonTexts>>;
  words: { id: string }[];
  exercises: { id: string }[];
};
/** Interface locales a lesson can be shown in: the base plus every complete overlay. */
export function lessonLocales(lesson: LessonForLocales): Locale[] {
  const complete = OVERLAY_LOCALES.filter((locale) => {
    const t = lesson.texts?.[locale];
    return (
      !!t?.title &&
      (!lesson.presentation || !!t.presentation) &&
      lesson.exercises.every((e) => !!t.exercises?.[e.id]) &&
      lesson.words.every((w) => !!t.words?.[w.id])
    );
  });
  return [BASE_LOCALE, ...complete];
}
/** Locales a whole set can be shown in: those every one of its lessons has. */
export function courseLocales(lessons: LessonForLocales[]): Locale[] {
  return LOCALES.filter((locale) => lessons.every((l) => lessonLocales(l).includes(locale)));
}
export const catalogSchema = z
  .object({
    schemaVersion: z.literal(2),
    revision: z.number().int().positive(),
    languages: z.array(
      z.object({
        code: id,
        title: z.string().min(1),
        direction: z.enum(['ltr', 'rtl']),
        /* The language's name in other interface locales («Немецкий» → German, גרמנית). */
        titles: z.partialRecord(localeSchema, z.string().min(1).max(100)).optional(),
      }),
    ),
    previews: z
      .array(
        z.object({
          id,
          language: id,
          title: z.string().min(1).max(100),
          description: z.string().min(1).max(200),
          cover: mediaSchema.refine(
            (m) => m.kind === 'image' && !m.region,
            'Cover must be a full image',
          ),
          texts: z.partialRecord(overlayLocaleSchema, cardTextsSchema).optional(),
        }),
      )
      .optional(),
    courses: z.array(
      z.object({
        id,
        language: id,
        title: z.string().min(1),
        description: z.string().min(1).max(200).optional(),
        cover: mediaSchema
          .refine((m) => m.kind === 'image' && !m.region, 'Cover must be a full image')
          .optional(),
        texts: z.partialRecord(overlayLocaleSchema, cardTextsSchema).optional(),
        /* Interface locales every lesson of the set is fully translated to (always has 'ru').
           A child whose interface is in another locale does not see the set. */
        locales: z.array(localeSchema).optional(),
        /* Stars (earned over every completion, repeats included) that open the set. Absent (no
           threshold set, or a release made before thresholds existed): the set opens when the
           previous one is complete. */
        unlockStars: z.number().int().nonnegative().optional(),
        lessons: z
          .array(
            z.object({
              id,
              version: z.number().int().positive(),
              title: z.string().min(1),
              titles: z.partialRecord(overlayLocaleSchema, z.string().min(1)).optional(),
              exerciseCount: z.number().int().positive(),
              /* Exercises each age group plays, when some are for one group only
                 (`exerciseCountsOf`); absent when every child plays all of them. */
              exerciseCounts: z
                .partialRecord(ageBandSchema, z.number().int().positive())
                .optional(),
              /* Mechanics the lesson uses. Any id, not a closed list: an app filters out
                 lessons it cannot show (`catalogForMechanics`) instead of failing the catalog. */
              requiredTypes: z.array(id).min(1),
            }),
          )
          .min(1),
      }),
    ),
  })
  .superRefine((catalog, ctx) => {
    const fail = () =>
      ctx.addIssue({ code: 'custom', message: 'Invalid catalog references or duplicate IDs' });
    if (
      !unique(catalog.languages.map((x) => x.code)) ||
      !unique([...catalog.courses, ...(catalog.previews ?? [])].map((x) => x.id)) ||
      !unique(catalog.courses.flatMap((c) => c.lessons.map((l) => l.id)))
    )
      fail();
    if (
      [...catalog.courses, ...(catalog.previews ?? [])].some(
        (c) => !catalog.languages.some((l) => l.code === c.language),
      )
    )
      fail();
  });
export const releaseSchema = z
  .object({ catalog: catalogSchema, lessons: z.array(courseLessonSchema) })
  .superRefine((release, ctx) => {
    const refs = release.catalog.courses.flatMap((course) =>
      course.lessons.map((ref) => ({ ...ref, language: course.language })),
    );
    if (refs.length !== release.lessons.length)
      ctx.addIssue({ code: 'custom', message: 'Every package must have one catalog entry' });
    for (const course of release.catalog.courses) {
      if (!course.locales) continue;
      const packages = course.lessons
        .map((ref) => release.lessons.find((l) => l.id === ref.id && l.version === ref.version))
        .filter((l) => !!l);
      if (JSON.stringify(courseLocales(packages)) !== JSON.stringify(course.locales))
        ctx.addIssue({ code: 'custom', message: `Set locales mismatch: ${course.id}` });
    }
    for (const ref of refs) {
      const lesson = release.lessons.find((l) => l.id === ref.id && l.version === ref.version);
      if (
        lesson &&
        OVERLAY_LOCALES.some(
          (l) => (ref.titles?.[l] ?? null) !== (lesson.texts?.[l]?.title ?? null),
        )
      )
        ctx.addIssue({ code: 'custom', message: `Catalog/package title mismatch: ${ref.id}` });
      if (
        !lesson ||
        lesson.language !== ref.language ||
        lesson.title !== ref.title ||
        lesson.exercises.length !== ref.exerciseCount ||
        AGE_BANDS.some((band) => exerciseCountsOf(lesson)?.[band] !== ref.exerciseCounts?.[band]) ||
        JSON.stringify([...new Set(lesson.exercises.map((e) => e.type))].sort()) !==
          JSON.stringify([...ref.requiredTypes].sort())
      )
        ctx.addIssue({ code: 'custom', message: `Catalog/package mismatch: ${ref.id}` });
    }
  });
/* Age group of the child, from the age the child gave. Lessons are the same for everyone; a
   mechanic's `adapt` (learning-core) eases an exercise for the younger group while it is
   played. The group and the seed that picks which options stay are kept in the session (and
   sent with the attempt), so a resumed session and the server's replay show the same
   exercise even when the attempt id changes. */
export const difficultySchema = z.object({
  ageBand: ageBandSchema,
  seed: z.string().min(1).max(100),
});
export type Difficulty = z.infer<typeof difficultySchema>;
export const learningStateSchema = z.object({
  version: z.literal(2),
  soundEnabled: z.boolean(),
  unlockedCourseIds: z.array(id).optional(),
  completedCourseIds: z.array(id).optional(),
  progress: z.record(
    id,
    z.object({
      bestStars: z.number().int().min(1).max(3),
      completedVersion: z.number().int().positive(),
    }),
  ),
  session: z
    .object({
      attemptId: z.string().uuid().optional(),
      /** Absent: the exercises as published (old sessions, the panel's default preview). */
      difficulty: difficultySchema.optional(),
      events: z
        .array(
          z.discriminatedUnion('type', [
            z.object({ type: z.literal('answer'), answer: answerSchema }),
            z.object({ type: z.literal('next') }),
          ]),
        )
        .max(2000)
        .optional(),
      lesson: courseLessonSchema,
      queue: z.array(z.number().int().min(0)).min(1).max(60),
      exerciseIndex: z.number().int().min(0),
      mistakes: z.number().int().min(0),
      correct: z.boolean(),
      finished: z.boolean(),
      draft: answerSchema.nullable(),
    })
    .nullable(),
});
export type CourseLesson = z.infer<typeof courseLessonSchema>;
export type Catalog = z.infer<typeof catalogSchema>;
export type Release = z.infer<typeof releaseSchema>;
export type Media = z.infer<typeof mediaSchema>;
export type Word = z.infer<typeof wordSchema>;
export type LearningState = z.infer<typeof learningStateSchema>;
