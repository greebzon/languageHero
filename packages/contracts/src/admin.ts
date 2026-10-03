import { z } from 'zod';
import { localeSchema, overlayLocaleSchema, presentationSchema } from './course';

// Editorial (draft) shapes for the admin panel. They are deliberately lenient: an admin must be
// able to save a half-finished lesson. The strict `courseLessonSchema` is applied when a draft is
// converted into a publishable package (validate, preview, publication plan).
export const idSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{0,79}$/);
const unique = (values: string[]) => new Set(values).size === values.length;
export const exerciseTypeSchema = z.enum(['listen-and-select', 'match-pairs', 'build-word']);
export const draftMediaSchema = z.object({
  id: idSchema,
  kind: z.enum(['image', 'audio']),
  assetId: z.uuid(),
  region: z
    .object({
      columns: z.number().int().min(1).max(8),
      rows: z.number().int().min(1).max(8),
      column: z.number().int().min(0),
      row: z.number().int().min(0),
    })
    .optional(),
});
export const draftWordSchema = z.object({
  id: idSchema,
  text: z.string().max(80),
  spelling: z.string().max(24),
  translation: z.string().max(100),
  imageId: z.string().max(80),
  audioId: z.string().max(80),
});
const base = { id: idSchema, prompt: z.string().max(200), hint: z.string().max(300) };
export const draftExerciseSchema = z.discriminatedUnion('type', [
  z.object({
    ...base,
    type: z.literal('listen-and-select'),
    wordId: z.string().max(80),
    choices: z.array(z.string().max(80)).max(6),
  }),
  z.object({
    ...base,
    type: z.literal('match-pairs'),
    wordIds: z.array(z.string().max(80)).max(4),
    imageOrder: z.array(z.string().max(80)).max(4),
  }),
  z.object({
    ...base,
    type: z.literal('build-word'),
    wordId: z.string().max(80),
    tiles: z.array(z.object({ id: idSchema, letter: z.string().max(4) })).max(30),
  }),
]);
export const lessonDocumentSchema = z
  .object({
    words: z.array(draftWordSchema).max(40),
    media: z.array(draftMediaSchema).max(100),
    exercises: z.array(draftExerciseSchema).max(30),
  })
  .superRefine((doc, ctx) => {
    for (const [key, items] of Object.entries(doc))
      if (!unique(items.map((x) => x.id)))
        ctx.addIssue({ code: 'custom', path: [key], message: 'Duplicate IDs' });
  });
export const emptyLessonDocument = (): LessonDocument => ({ words: [], media: [], exercises: [] });

/* Draft translations of a lesson's texts, per interface locale. Lenient like the rest of the
   draft: a half-translated lesson can be saved; empty strings count as missing when the lesson
   is published. `sourceHash` fingerprints the Russian texts the translation was made from, so
   the panel can tell an outdated translation. */
export const draftLessonTextsSchema = z.object({
  title: z.string().max(100).optional(),
  presentation: z
    .object({
      intro: z.string().max(300),
      completionTitle: z.string().max(100),
      completionMessage: z.string().max(400),
    })
    .optional(),
  exercises: z
    .record(idSchema, z.object({ prompt: z.string().max(200), hint: z.string().max(300) }))
    .optional(),
  words: z.record(idSchema, z.object({ translation: z.string().max(100) })).optional(),
  sourceHash: z.string().max(80).optional(),
});
export type DraftLessonTexts = z.infer<typeof draftLessonTextsSchema>;
export const draftTextsSchema = z.partialRecord(overlayLocaleSchema, draftLessonTextsSchema);
export type DraftTexts = z.infer<typeof draftTextsSchema>;
export const courseTextsSchema = z.partialRecord(
  overlayLocaleSchema,
  z.object({ title: z.string().max(100), description: z.string().max(200).nullable().optional() }),
);
export type CourseTexts = z.infer<typeof courseTextsSchema>;
export const languageTitlesSchema = z.partialRecord(localeSchema, z.string().max(100));
export type LanguageTitles = z.infer<typeof languageTitlesSchema>;

export const languageStatusSchema = z.enum(['draft', 'active', 'archived']);
export const courseVisibilitySchema = z.enum(['draft', 'preview', 'published', 'archived']);
// Patch schemas are built from default-free fields: in zod 4 `.partial()` keeps `.default()`,
// which would silently reset every omitted field (e.g. visibility → draft) on a partial update.
const editRevision = z.number().int().positive();
const languageFields = {
  title: z.string().min(1).max(100),
  direction: z.enum(['ltr', 'rtl']),
  locale: z.string().max(20).nullable(),
  status: languageStatusSchema,
  titles: languageTitlesSchema,
};
export const languageInputSchema = z.object({
  code: idSchema,
  title: languageFields.title,
  direction: languageFields.direction.default('ltr'),
  locale: languageFields.locale.default(null),
  status: languageFields.status.default('draft'),
  titles: languageFields.titles.default({}),
});
export const languagePatchSchema = z.object(languageFields).partial();
const courseFields = {
  topic: z.string().max(200).nullable(),
  title: z.string().min(1).max(100),
  description: z.string().max(200).nullable(),
  coverAssetId: z.uuid().nullable(),
  /** Stars a child needs to open the set; 0 = open from the start, null = after the previous set. */
  unlockStars: z.number().int().min(0).max(100000).nullable(),
  visibility: courseVisibilitySchema,
  texts: courseTextsSchema,
};
export const courseInputSchema = z.object({
  id: idSchema,
  languageCode: idSchema,
  topic: courseFields.topic.default(null),
  title: courseFields.title,
  description: courseFields.description.default(null),
  coverAssetId: courseFields.coverAssetId.default(null),
  unlockStars: courseFields.unlockStars.default(null),
  visibility: courseFields.visibility.default('draft'),
  texts: courseFields.texts.default({}),
});
export const coursePatchSchema = z.object(courseFields).partial().extend({ editRevision });
const lessonFields = {
  title: z.string().min(1).max(100),
  presentation: presentationSchema.nullable(),
  document: lessonDocumentSchema,
  texts: draftTextsSchema,
};
export const lessonInputSchema = z.object({
  id: idSchema,
  title: lessonFields.title,
  presentation: lessonFields.presentation.default(null),
  document: lessonFields.document.default(emptyLessonDocument),
  texts: lessonFields.texts.default({}),
});
export const lessonPatchSchema = z.object(lessonFields).partial().extend({ editRevision });
export const orderInputSchema = z.object({
  ids: z.array(idSchema).min(1),
  // Required when the parent tracks edit revisions (courses); languages do not.
  editRevision: z.number().int().positive().optional(),
});
export const duplicateInputSchema = z.object({
  id: idSchema,
  title: z.string().min(1).max(100).optional(),
});
export const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
export const loginInputSchema = z.object({
  login: z.string().min(1).max(100),
  password: z.string().min(1).max(200),
});
/* «Сменить пароль» in the panel: the current password proves it is the admin at the keyboard. */
export const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(8, 'Не короче 8 символов').max(200),
});

export type LessonDocument = z.infer<typeof lessonDocumentSchema>;
export type DraftMedia = z.infer<typeof draftMediaSchema>;
export type DraftWord = z.infer<typeof draftWordSchema>;
export type DraftExercise = z.infer<typeof draftExerciseSchema>;
export type LessonPresentation = z.infer<typeof presentationSchema>;
export type LanguageStatus = z.infer<typeof languageStatusSchema>;
export type CourseVisibility = z.infer<typeof courseVisibilitySchema>;
export type LanguageInput = z.infer<typeof languageInputSchema>;
export type CourseInput = z.infer<typeof courseInputSchema>;
export type LessonInput = z.infer<typeof lessonInputSchema>;

// --- Generation (stages C–D). The input is snapshotted into the job; the output describes what
// the worker produced so the panel and `assemble` share one vocabulary.
export const generationInputSchema = z.object({
  topic: z.string().trim().min(2).max(200),
  totalExercises: z.number().int().min(6).max(60),
  lessonSize: z.number().int().min(3).max(30).default(6),
  /** Vocabulary size for the whole set; null = server default (`GENERATION_WORDS_PER_LESSON` per lesson). */
  wordCount: z.number().int().min(3).max(40).nullable().default(null),
  level: z.literal('beginner').default('beginner'),
  ageRange: z.literal('6-9').default('6-9'),
  targetWords: z.array(z.string().trim().min(1).max(40)).max(40).default([]),
  mix: z
    .array(exerciseTypeSchema)
    .min(1)
    .default(['listen-and-select', 'match-pairs', 'build-word']),
  style: z.string().trim().max(300).nullable().default(null),
  voice: z.string().trim().max(40).nullable().default(null),
  /** Set by the server for a translated clone: the set whose lessons are translated. */
  source: z.object({ courseId: idSchema }).optional(),
  /** Honoured only by the fake provider: fail a stage N times (or permanently) to test recovery. */
  simulate: z
    .object({
      stage: z.string(),
      /** Limit the failure to one task of the stage (e.g. a word key); all tasks otherwise. */
      targetId: z.string().optional(),
      times: z.number().int().min(1).max(10).default(1),
      permanent: z.boolean().default(false),
      delayMs: z.number().int().min(0).max(60_000).default(0),
    })
    .optional(),
});
export const generationRequestSchema = generationInputSchema.extend({ idempotencyKey: z.uuid() });
/* A new cover for an existing set: the picture is drawn from the set's topic, an optional
   hint describes the scene. */
export const coverGenerateSchema = z.object({
  hint: z.string().trim().max(300).default(''),
  idempotencyKey: z.uuid(),
});
export type CoverGenerateInput = z.infer<typeof coverGenerateSchema>;

/* Translate a set's texts (lessons, card, language name) into interface locales. Without
   `force` only what is missing or outdated is translated. */
export const textsGenerateSchema = z.object({
  locales: z.array(overlayLocaleSchema).min(1).max(2).default(['en', 'he']),
  force: z.boolean().default(false),
  idempotencyKey: z.uuid(),
});
export type TextsGenerateInput = z.infer<typeof textsGenerateSchema>;

export const cloneInputSchema = z.object({
  languageCode: idSchema,
  id: idSchema,
  title: z.string().trim().min(1).max(100),
  /** `copy` duplicates everything as is; `translate` runs an AI translation job. */
  mode: z.enum(['copy', 'translate']),
  idempotencyKey: z.uuid(),
});
export type CloneInput = z.infer<typeof cloneInputSchema>;
export type GenerationInput = z.infer<typeof generationInputSchema>;
export type GenerationRequest = z.infer<typeof generationRequestSchema>;

export type GenerationWord = {
  key: string;
  text: string;
  spelling: string;
  translation: string;
  imagePrompt: string;
  speechText: string;
  /** An existing picture (translated clones keep the source images, atlas region included). */
  image?: { assetId: string; region?: DraftMedia['region'] };
};
export type GenerationLessonPlan = {
  lessonId: string;
  title: string;
  goal: string;
  presentation: LessonPresentation | null;
  wordKeys: string[];
  exerciseCount: number;
  /** Translated clones: the source exercises (word ids already remapped) to adapt. */
  sourceExercises?: DraftExercise[];
  /** Draft document produced by the text stage; media ids resolved at assemble. */
  document?: LessonDocument;
  /** editRevision of the lesson row written by the last assemble (conflict detection). */
  editRevision?: number;
};
export type GenerationOutput = {
  words: GenerationWord[];
  lessons: GenerationLessonPlan[];
  distribution: number[];
  media?: { images: number; audios: number; cover: boolean };
  assetIds?: Record<string, string>; // `image:<key>` | `audio:<key>` | `cover` → asset id
  /* `presentation` is missing on jobs from before it was kept (their texts stay as they are). */
  conflicts?: {
    lessonId: string;
    document: LessonDocument;
    title: string;
    presentation?: LessonPresentation | null;
  }[];
};
