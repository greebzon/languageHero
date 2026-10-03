import { and, asc, eq, inArray, ne, sql } from 'drizzle-orm';
import { OVERLAY_LOCALES } from '@lingvohero/contracts';
import type {
  DraftExercise,
  GenerationLessonPlan,
  GenerationOutput,
  GenerationWord,
  LessonDocument,
} from '@lingvohero/contracts';
import { storeAsset } from '../admin/asset-store.js';
import { AdminError } from '../admin/errors.js';
import { wavPeak } from '../admin/media.js';
import { loadAssetRefs } from '../admin/routes/shared.js';
import type { Db } from '../db/client.js';
import {
  courses,
  generationJobs,
  generationTasks,
  languages,
  lessons,
  type GenerationStage,
} from '../db/schema.js';
import { distribute, wordCountFor } from '../generation/distribute.js';
import {
  MaterialError,
  buildDocument,
  buildExercises,
  buildLessonPlans,
  buildTranslatedExercises,
  buildTranslatedWords,
  buildVocabulary,
  courseTranslationDtoSchema,
  lessonDtoSchema,
  lessonTranslationDtoSchema,
  planDtoSchema,
  toJsonSchema,
} from '../generation/dto.js';
import type { CostRates } from '../generation/estimate.js';
import {
  coverPrompt,
  imagePrompt,
  lessonPrompt,
  lessonTranslationPrompt,
  planPrompt,
  speechInstructions,
  translationPrompt,
  type LessonPayload,
  type LessonTranslationPayload,
  type PlanPayload,
  type TranslationPayload,
} from '../generation/prompts.js';
import {
  ProviderError,
  type GenerationProvider,
  type RequestContext,
} from '../generation/provider.js';
import { reviewMaterial } from '../generation/review.js';
import { toCourseLesson } from '../publishing/convert.js';
import { canonicalJson, sha256 } from '../publishing/hash.js';
import { addTasks, addUsage, type JobRow, type TaskRow } from './queue.js';
import { runAssetStage } from './asset-stages.js';
import { queueTextsJob, runTextStage } from './text-stages.js';

export type StageContext = {
  db: Db;
  provider: GenerationProvider;
  storageRoot: string;
  rates: CostRates;
  workerId: string;
};

export type StageResult = {
  output: Record<string, unknown> | null;
  requestId: string | null;
  /** The task wants to run again after earlier stages were re-opened (review → repair). */
  requeue?: boolean;
};

const permanent = (message: string) => new ProviderError(message, 'permanent');

export async function runStage(ctx: StageContext, task: TaskRow): Promise<StageResult> {
  const job = await ctx.db.query.generationJobs.findFirst({
    where: eq(generationJobs.id, task.jobId),
  });
  if (!job) throw permanent('Работа не найдена');
  if (job.kind === 'texts') return runTextStage(ctx, job, task);
  if (job.kind !== 'course' || !job.courseId) return runAssetStage(ctx, job, task);
  const course = (await ctx.db.query.courses.findFirst({ where: eq(courses.id, job.courseId) }))!;
  const language = (await ctx.db.query.languages.findFirst({
    where: eq(languages.code, course.languageCode),
  }))!;
  const context: RequestContext = {
    jobId: job.id,
    stage: task.stage,
    targetId: task.targetId,
    simulate: job.input.simulate,
  };
  const env = { ctx, job, course, language, task, context };
  switch (task.stage) {
    case 'plan':
      return plan(env);
    case 'text':
      return text(env);
    case 'review':
      return review(env);
    case 'media-plan':
      return mediaPlan(env);
    case 'cover':
    case 'image':
      return image(env);
    case 'audio':
      return audio(env);
    case 'assemble':
      return assemble(env);
    default:
      throw permanent(`Стадия ${task.stage} не относится к сетам`);
  }
}

type Env = {
  ctx: StageContext;
  job: JobRow;
  course: typeof courses.$inferSelect;
  language: typeof languages.$inferSelect;
  task: TaskRow;
  context: RequestContext;
};

/** Serialised read-modify-write of the job output (text tasks run in parallel). */
async function updateOutput(
  db: Db,
  jobId: string,
  update: (output: GenerationOutput) => GenerationOutput,
) {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({ output: generationJobs.output })
      .from(generationJobs)
      .where(eq(generationJobs.id, jobId))
      .for('update');
    if (!row?.output) throw permanent('План работы отсутствует');
    const next = update(row.output);
    await tx.update(generationJobs).set({ output: next }).where(eq(generationJobs.id, jobId));
    return next;
  });
}

async function chargeText(env: Env, usage: { inputTokens: number; outputTokens: number }) {
  const estimatedUsd =
    ((usage.inputTokens + usage.outputTokens) / 1000) * env.ctx.rates.textPer1kTokensUsd;
  await charge(env, { ...usage, estimatedUsd });
}

async function charge(
  env: Env,
  delta: {
    inputTokens?: number;
    outputTokens?: number;
    images?: number;
    ttsChars?: number;
    estimatedUsd: number;
  },
) {
  const usage = await addUsage(env.ctx.db, env.job.id, delta);
  if (usage && usage.estimatedUsd > env.job.costLimitUsd)
    throw permanent(
      `Превышен лимит стоимости работы (${usage.estimatedUsd.toFixed(2)} $ из ${env.job.costLimitUsd} $)`,
    );
}

async function structured<T>(
  env: Env,
  schemaName: string,
  schema: ReturnType<typeof toJsonSchema>,
  prompt: { system: string; user: string },
  payload: unknown,
  parse: (data: unknown) => T,
) {
  const result = await env.ctx.provider.generateText({
    context: env.context,
    model: env.job.modelConfig.text,
    schemaName,
    schema,
    system: prompt.system,
    user: prompt.user,
    payload,
  });
  if (!result.ok)
    throw new ProviderError(
      `Модель отказалась: ${result.refusal}`,
      'permanent',
      null,
      result.requestId,
    );
  await chargeText(env, result.usage);
  try {
    return { data: parse(result.data), requestId: result.requestId };
  } catch (error) {
    throw new ProviderError(
      `Ответ модели не соответствует схеме: ${(error as Error).message.slice(0, 200)}`,
      'permanent',
      null,
      result.requestId,
    );
  }
}

const material = <T>(fn: () => T): T => {
  try {
    return fn();
  } catch (error) {
    if (error instanceof MaterialError)
      throw permanent(`${error.message}: ${error.problems.join('; ')}`);
    throw error;
  }
};

async function plan(env: Env): Promise<StageResult> {
  if (env.job.input.source) return translatePlan(env, env.job.input.source.courseId);
  const { job, course, language, ctx } = env;
  const distribution = distribute(job.input.totalExercises, job.input.lessonSize);
  const existing = await ctx.db
    .select({ document: lessons.document })
    .from(lessons)
    .innerJoin(courses, eq(courses.id, lessons.courseId))
    .where(eq(courses.languageCode, course.languageCode));
  const existingWords = [
    ...new Set(existing.flatMap((l) => l.document.words.map((w) => w.spelling))),
  ].slice(0, 200);
  const payload: PlanPayload = {
    language: language.code,
    languageTitle: language.title,
    topic: job.input.topic,
    distribution,
    wordCount: wordCountFor(distribution, job.input.targetWords.length, {
      requested: job.input.wordCount,
    }),
    targetWords: job.input.targetWords,
    existingWords,
    level: job.input.level,
    ageRange: job.input.ageRange,
    style: job.input.style,
  };
  const { data, requestId } = await structured(
    env,
    'course_plan',
    toJsonSchema(planDtoSchema),
    planPrompt(payload),
    payload,
    (d) => planDtoSchema.parse(d),
  );
  const { words, keyMap } = material(() => buildVocabulary(data, payload.wordCount));
  const plans = material(() => buildLessonPlans(data, words, distribution, course.id, keyMap));
  const output: GenerationOutput = { words, lessons: plans, distribution };
  await ctx.db.transaction(async (tx) => {
    await tx.update(generationJobs).set({ output }).where(eq(generationJobs.id, job.id));
    await addTasks(tx, job.id, [
      ...plans.map((l, i) => ({ stage: 'text' as const, targetId: l.lessonId, position: i })),
      { stage: 'review', targetId: 'review' },
      { stage: 'media-plan', targetId: 'media-plan' },
    ]);
  });
  return { output: { words: words.length, lessons: plans.length }, requestId };
}

async function text(env: Env): Promise<StageResult> {
  if (env.job.input.source) return translateText(env);
  const { job, language, task } = env;
  const output = job.output;
  const lesson = output?.lessons.find((l) => l.lessonId === task.targetId);
  if (!output || !lesson) throw permanent('Урок отсутствует в плане');
  const feedback = (task.output?.feedback as string | undefined) ?? null;
  const payload: LessonPayload = {
    language: language.code,
    languageTitle: language.title,
    topic: job.input.topic,
    lesson: { title: lesson.title, goal: lesson.goal, wordKeys: lesson.wordKeys },
    words: output.words,
    exerciseCount: lesson.exerciseCount,
    mix: job.input.mix,
    feedback,
  };
  const keyMap = new Map(output.words.map((w) => [w.key, w.key]));
  const { data, requestId } = await structured(
    env,
    'lesson_exercises',
    toJsonSchema(lessonDtoSchema),
    lessonPrompt(payload),
    payload,
    (d) => lessonDtoSchema.parse(d),
  );
  const exercises = material(() =>
    buildExercises(data, lesson, output.words, keyMap, job.input.mix),
  );
  const document = buildDocument(lesson, output.words, exercises);
  await updateOutput(env.ctx.db, job.id, (current) => ({
    ...current,
    lessons: current.lessons.map((l) => (l.lessonId === lesson.lessonId ? { ...l, document } : l)),
  }));
  return { output: { exercises: exercises.length, feedback }, requestId };
}

async function review(env: Env): Promise<StageResult> {
  const { job, course, ctx, task } = env;
  if (!job.output) throw permanent('План работы отсутствует');
  const problems = reviewMaterial(job.output, job.input, course.languageCode);
  if (!problems.length) return { output: { problems: 0 }, requestId: null };
  const repaired = task.output?.repaired === true;
  const summary = problems.map((p) => `${p.lessonId ?? 'сет'}: ${p.message}`).join('; ');
  if (repaired) throw permanent(`Материал не прошёл проверку и после исправления: ${summary}`);
  // One repair round: re-open the text tasks of the affected lessons with the feedback attached.
  const affected = problems.some((p) => p.lessonId === null)
    ? job.output.lessons.map((l) => l.lessonId)
    : [...new Set(problems.map((p) => p.lessonId!))];
  await ctx.db.transaction(async (tx) => {
    for (const lessonId of affected)
      await tx
        .update(generationTasks)
        .set({
          status: 'pending',
          output: {
            feedback: problems
              .filter((p) => p.lessonId === lessonId || p.lessonId === null)
              .map((p) => p.message)
              .join('; '),
          },
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(generationTasks.jobId, job.id),
            eq(generationTasks.stage, 'text'),
            eq(generationTasks.targetId, lessonId),
          ),
        );
    await tx
      .update(generationTasks)
      .set({ output: { repaired: true, problems: summary } })
      .where(eq(generationTasks.id, task.id));
  });
  return { output: { repaired: true, problems: summary }, requestId: null, requeue: true };
}

export function artifactHash(parts: {
  stage: GenerationStage;
  targetId: string;
  promptVersion: string;
  model: string;
  payload: unknown;
  /** Set only for the fake provider: its placeholders must never be reused by a real job
      (a fake run once lent its beeps and checkered squares to real sets). Undefined keeps
      the real provider's hashes unchanged. */
  provider?: 'fake';
}) {
  return sha256(canonicalJson(parts));
}

async function mediaPlan(env: Env): Promise<StageResult> {
  const { job, ctx } = env;
  if (!job.output) throw permanent('План работы отсутствует');
  const { words } = job.output;
  const model = job.modelConfig;
  const translated = Boolean(job.input.source);
  const provider = ctx.provider.name === 'fake' ? ('fake' as const) : undefined;
  const hash = (stage: GenerationStage, targetId: string, payload: unknown) =>
    artifactHash({
      stage,
      targetId,
      promptVersion: job.promptVersion,
      model: model.image,
      payload,
      provider,
    });
  const pictures = translated
    ? []
    : [
        {
          stage: 'cover' as const,
          targetId: 'cover',
          inputHash: hash('cover', 'cover', {
            prompt: coverPrompt(job.input.topic, job.input.style),
            quality: model.imageQuality,
          }),
        },
        ...words.map((w, i) => ({
          stage: 'image' as const,
          targetId: w.key,
          position: i,
          inputHash: hash('image', w.key, {
            prompt: imagePrompt(w, job.input.style),
            quality: model.imageQuality,
          }),
        })),
      ];
  const tasks = [
    ...pictures,
    ...words.map((w, i) => ({
      stage: 'audio' as const,
      targetId: w.key,
      position: i,
      inputHash: artifactHash({
        stage: 'audio',
        targetId: w.key,
        promptVersion: job.promptVersion,
        model: `${model.tts}/${model.voice}`,
        payload: { text: w.speechText, language: env.language.code },
        provider,
      }),
    })),
    { stage: 'assemble' as const, targetId: 'assemble' },
  ];
  await ctx.db.transaction(async (tx) => {
    await addTasks(tx, job.id, tasks);
    await tx
      .update(generationJobs)
      .set({
        output: {
          ...job.output!,
          media: {
            images: translated ? 0 : words.length,
            audios: words.length,
            cover: !translated,
          },
        },
      })
      .where(eq(generationJobs.id, job.id));
  });
  return {
    output: { images: translated ? 0 : words.length, audios: words.length },
    requestId: null,
  };
}

/** An identical request already produced an asset (in this or an earlier job): reuse it. */
async function reusable(env: Env) {
  if (!env.task.inputHash) return null;
  const previous = await env.ctx.db.query.generationTasks.findFirst({
    where: and(
      eq(generationTasks.inputHash, env.task.inputHash),
      eq(generationTasks.status, 'succeeded'),
      ne(generationTasks.id, env.task.id),
    ),
  });
  const assetId = previous?.output?.assetId as string | undefined;
  if (!assetId) return null;
  const refs = await loadAssetRefs(env.ctx.db, [assetId]);
  return refs.has(assetId) ? { assetId, reusedFrom: previous!.id } : null;
}

async function image(env: Env): Promise<StageResult> {
  const { job, task, ctx } = env;
  const reused = await reusable(env);
  if (reused) return { output: reused, requestId: null };
  const word = job.output?.words.find((w) => w.key === task.targetId);
  if (task.stage === 'image' && !word) throw permanent('Слово отсутствует в плане');
  const prompt =
    task.stage === 'cover'
      ? coverPrompt(job.input.topic, job.input.style)
      : imagePrompt(word!, job.input.style);
  const result = await ctx.provider.generateImage({
    context: env.context,
    model: job.modelConfig.image,
    prompt,
    size: task.stage === 'cover' ? '1536x1024' : '1024x1024',
    quality: job.modelConfig.imageQuality,
  });
  await charge(env, { images: 1, estimatedUsd: ctx.rates.imageUsd });
  const { asset } = await storeAsset(
    ctx.db,
    ctx.storageRoot,
    result.png,
    {
      source: 'generated',
      model: job.modelConfig.image,
      promptVersion: job.promptVersion,
      prompt: prompt.slice(0, 500),
    },
    { altText: word ? word.text : `Обложка: ${job.input.topic}`, generationTaskId: task.id },
  );
  return { output: { assetId: asset.id }, requestId: result.requestId };
}

async function audio(env: Env): Promise<StageResult> {
  const { job, task, ctx, language } = env;
  const reused = await reusable(env);
  if (reused) return { output: reused, requestId: null };
  const word = job.output?.words.find((w) => w.key === task.targetId);
  if (!word) throw permanent('Слово отсутствует в плане');
  const result = await ctx.provider.synthesizeSpeech({
    context: env.context,
    model: job.modelConfig.tts,
    voice: job.modelConfig.voice,
    text: word.speechText,
    instructions: speechInstructions(language.title),
  });
  await charge(env, {
    ttsChars: word.speechText.length,
    estimatedUsd: (word.speechText.length / 1000) * ctx.rates.ttsPer1kCharsUsd,
  });
  // Speech that is all but silent would teach nothing: ask again (the queue's attempts).
  const peak = wavPeak(result.wav);
  if (peak !== null && peak < 0.02)
    throw new ProviderError(
      `Озвучка «${word.speechText}» получилась беззвучной; пробуем ещё раз`,
      'retryable',
      null,
      result.requestId,
    );
  const { asset } = await storeAsset(
    ctx.db,
    ctx.storageRoot,
    result.wav,
    {
      source: 'generated',
      model: `${job.modelConfig.tts}/${job.modelConfig.voice}`,
      promptVersion: job.promptVersion,
      prompt: word.speechText,
    },
    { transcript: word.speechText, generationTaskId: task.id },
  );
  return { output: { assetId: asset.id }, requestId: result.requestId };
}

/**
 * Writes the draft lessons. A lesson the admin edited since the last assemble is not overwritten:
 * the AI version is kept in the job for a manual "apply" and the job ends with a warning.
 */
async function assemble(env: Env): Promise<StageResult> {
  const { job, course, ctx } = env;
  if (!job.output) throw permanent('План работы отсутствует');
  const succeeded = await ctx.db
    .select()
    .from(generationTasks)
    .where(
      and(
        eq(generationTasks.jobId, job.id),
        inArray(generationTasks.stage, ['cover', 'image', 'audio']),
        eq(generationTasks.status, 'succeeded'),
      ),
    );
  const assetIds: Record<string, string> = {};
  for (const t of succeeded) {
    const assetId = t.output?.assetId as string | undefined;
    if (assetId) assetIds[t.stage === 'cover' ? 'cover' : `${t.stage}:${t.targetId}`] = assetId;
  }
  // Generated files plus pictures carried over from a source set (translated clones).
  const refs = await loadAssetRefs(ctx.db, [
    ...Object.values(assetIds),
    ...job.output.words.flatMap((w) => (w.image ? [w.image.assetId] : [])),
  ]);
  const warnings: string[] = [];
  const conflicts: NonNullable<GenerationOutput['conflicts']> = [];
  const written: { lessonId: string; editRevision: number }[] = [];
  await ctx.db.transaction(async (tx) => {
    for (const [index, plan] of job.output!.lessons.entries()) {
      if (!plan.document) throw permanent(`Урок ${plan.lessonId} без текста`);
      const document: LessonDocument = buildDocument(
        plan,
        job.output!.words,
        plan.document.exercises,
        assetIds,
      );
      const built = toCourseLesson(
        document,
        {
          id: plan.lessonId,
          version: 1,
          language: course.languageCode,
          title: plan.title,
          presentation: plan.presentation,
        },
        refs,
      );
      if (!built.lesson)
        throw permanent(
          `Урок ${plan.lessonId} не проходит проверку: ${Object.entries(built.fieldErrors)
            .map(([k, v]) => `${k}: ${v.join('; ')}`)
            .join(' · ')}`,
        );
      const existing = await tx.query.lessons.findFirst({ where: eq(lessons.id, plan.lessonId) });
      if (!existing) {
        const [row] = await tx
          .insert(lessons)
          .values({
            id: plan.lessonId,
            courseId: course.id,
            position: index,
            title: plan.title,
            presentation: plan.presentation,
            document,
          })
          .returning();
        written.push({ lessonId: plan.lessonId, editRevision: row!.editRevision });
      } else if (existing.courseId !== course.id) {
        throw permanent(`Урок ${plan.lessonId} принадлежит другому сету`);
      } else if (plan.editRevision !== undefined && existing.editRevision === plan.editRevision) {
        const [row] = await tx
          .update(lessons)
          .set({
            title: plan.title,
            presentation: plan.presentation,
            document,
            editRevision: sql`${lessons.editRevision} + 1`,
            updatedAt: new Date(),
          })
          .where(eq(lessons.id, plan.lessonId))
          .returning();
        written.push({ lessonId: plan.lessonId, editRevision: row!.editRevision });
      } else {
        conflicts.push({
          lessonId: plan.lessonId,
          document,
          title: plan.title,
          presentation: plan.presentation,
        });
        warnings.push(
          `Урок ${plan.lessonId} был изменён вручную во время генерации — версия ИИ сохранена отдельно`,
        );
      }
    }
    const courseUpdate: Partial<typeof courses.$inferInsert> = { updatedAt: new Date() };
    if (!course.topic) courseUpdate.topic = job.input.topic;
    if (!course.coverAssetId && assetIds.cover) courseUpdate.coverAssetId = assetIds.cover;
    else if (!course.coverAssetId) warnings.push('Обложка не сгенерирована — добавьте её вручную');
    await tx.update(courses).set(courseUpdate).where(eq(courses.id, course.id));
    const output: GenerationOutput = {
      ...job.output!,
      assetIds,
      conflicts,
      lessons: job.output!.lessons.map((l) => ({
        ...l,
        editRevision:
          written.find((w) => w.lessonId === l.lessonId)?.editRevision ?? l.editRevision,
      })),
    };
    await tx
      .update(generationJobs)
      .set({ output, warnings, status: 'awaiting-review', finishedAt: new Date(), error: null })
      .where(eq(generationJobs.id, job.id));
  });
  // The new lessons are in Russian only: translate them for the other interface locales in a
  // follow-up job right away (the set allows one job at a time, and this one just finished).
  if (written.length) {
    const fresh = (await ctx.db.query.courses.findFirst({ where: eq(courses.id, course.id) }))!;
    await queueTextsJob(ctx.db, {
      course: fresh,
      locales: [...OVERLAY_LOCALES],
      force: false,
      modelConfig: job.modelConfig,
      idempotencyKey: `texts-after-${job.id}`,
      requestedBy: job.requestedBy,
      costLimitUsd: job.costLimitUsd,
    }).catch((error: unknown) => {
      // Nothing to translate or another job already running: the panel button covers it.
      if (!(error instanceof AdminError)) throw error;
    });
  }
  return { output: { lessons: written.length, conflicts: conflicts.length }, requestId: null };
}

// --- Translated clones -------------------------------------------------------------------------

/**
 * Collects the source set's vocabulary (one entry per word id; the same id with another
 * spelling gets a suffixed key) and asks the model for the target-language words and the
 * adapted lesson texts. Pictures, word ids and the exercise structure are carried over.
 */
async function translatePlan(env: Env, sourceCourseId: string): Promise<StageResult> {
  const { job, course, language, ctx } = env;
  const sourceCourse = await ctx.db.query.courses.findFirst({
    where: eq(courses.id, sourceCourseId),
  });
  if (!sourceCourse) throw permanent('Исходный сет не найден');
  const sourceLanguage = (await ctx.db.query.languages.findFirst({
    where: eq(languages.code, sourceCourse.languageCode),
  }))!;
  const sourceLessons = await ctx.db
    .select()
    .from(lessons)
    .where(eq(lessons.courseId, sourceCourseId))
    .orderBy(asc(lessons.position), asc(lessons.id));
  if (!sourceLessons.length) throw permanent('В исходном сете нет уроков');

  const vocabulary = new Map<string, GenerationWord>();
  const plans: GenerationLessonPlan[] = [];
  for (const [index, lesson] of sourceLessons.entries()) {
    const doc = lesson.document;
    if (!doc.exercises.length || !doc.words.length)
      throw permanent(`Урок «${lesson.title}» пустой — заполните или удалите его перед переводом`);
    const remap = new Map<string, string>();
    for (const word of doc.words) {
      let key = word.id;
      for (
        let n = 2;
        vocabulary.has(key) && vocabulary.get(key)!.spelling !== word.spelling;
        n += 1
      )
        key = `${word.id}-${n}`;
      remap.set(word.id, key);
      if (vocabulary.has(key)) continue;
      const media = doc.media.find((m) => m.id === word.imageId && m.kind === 'image');
      if (!media?.assetId) throw permanent(`У слова «${word.text}» нет картинки`);
      vocabulary.set(key, {
        key,
        text: word.text,
        spelling: word.spelling,
        translation: word.translation,
        imagePrompt: word.text,
        speechText: word.text,
        image: { assetId: media.assetId, ...(media.region ? { region: media.region } : {}) },
      });
    }
    const id = (w: string) => remap.get(w) ?? w;
    const sourceExercises: DraftExercise[] = doc.exercises.map((e) =>
      e.type === 'match-pairs'
        ? { ...e, wordIds: e.wordIds.map(id), imageOrder: e.imageOrder.map(id) }
        : e.type === 'listen-and-select'
          ? { ...e, wordId: id(e.wordId), choices: e.choices.map(id) }
          : { ...e, wordId: id(e.wordId) },
    );
    plans.push({
      lessonId: `${course.id}-${String(index + 1).padStart(2, '0')}`,
      title: lesson.title,
      goal: `Перевод урока «${lesson.title}»`,
      presentation: lesson.presentation,
      wordKeys: [...new Set(doc.words.map((w) => id(w.id)))],
      exerciseCount: doc.exercises.length,
      sourceExercises,
    });
  }
  const source = [...vocabulary.values()];
  const payload: TranslationPayload = {
    sourceLanguage: sourceLanguage.code,
    sourceLanguageTitle: sourceLanguage.title,
    language: language.code,
    languageTitle: language.title,
    words: source.map((w) => ({
      key: w.key,
      text: w.text,
      spelling: w.spelling,
      translation: w.translation,
    })),
    lessons: plans.map((p) => ({
      title: p.title,
      intro: p.presentation?.intro ?? null,
      completionTitle: p.presentation?.completionTitle ?? null,
      completionMessage: p.presentation?.completionMessage ?? null,
    })),
  };
  const { data, requestId } = await structured(
    env,
    'course_translation',
    toJsonSchema(courseTranslationDtoSchema),
    translationPrompt(payload),
    payload,
    (d) => courseTranslationDtoSchema.parse(d),
  );
  const words = material(() => buildTranslatedWords(data, source));
  if (data.lessons.length !== plans.length)
    throw permanent(`Модель вернула ${data.lessons.length} уроков вместо ${plans.length}`);
  const clip = (text: string, max: number, fallback: string) =>
    text.trim().slice(0, max) || fallback;
  const lessonsPlan = plans.map((plan, i) => {
    const adapted = data.lessons[i]!;
    return {
      ...plan,
      title: clip(adapted.title, 100, plan.title),
      presentation: plan.presentation && {
        intro: clip(adapted.intro, 300, plan.presentation.intro),
        completionTitle: clip(adapted.completionTitle, 100, plan.presentation.completionTitle),
        completionMessage: clip(
          adapted.completionMessage,
          400,
          plan.presentation.completionMessage,
        ),
      },
    };
  });
  const output: GenerationOutput = {
    words,
    lessons: lessonsPlan,
    distribution: lessonsPlan.map((l) => l.exerciseCount),
  };
  await ctx.db.transaction(async (tx) => {
    await tx.update(generationJobs).set({ output }).where(eq(generationJobs.id, job.id));
    await addTasks(tx, job.id, [
      ...lessonsPlan.map((l, i) => ({ stage: 'text' as const, targetId: l.lessonId, position: i })),
      { stage: 'review', targetId: 'review' },
      { stage: 'media-plan', targetId: 'media-plan' },
    ]);
  });
  return { output: { words: words.length, lessons: lessonsPlan.length }, requestId };
}

/** Adapts one lesson's prompts and hints and rebuilds its letter tiles for the new spelling. */
async function translateText(env: Env): Promise<StageResult> {
  const { job, language, task, ctx } = env;
  const output = job.output;
  const lesson = output?.lessons.find((l) => l.lessonId === task.targetId);
  if (!output || !lesson?.sourceExercises) throw permanent('Урок отсутствует в плане');
  const sourceLanguage = (await ctx.db.query.languages.findFirst({
    where: eq(
      languages.code,
      (await ctx.db.query.courses.findFirst({ where: eq(courses.id, job.input.source!.courseId) }))!
        .languageCode,
    ),
  }))!;
  const byKey = new Map(output.words.map((w) => [w.key, w]));
  const payload: LessonTranslationPayload = {
    sourceLanguageTitle: sourceLanguage.title,
    languageTitle: language.title,
    lessonTitle: lesson.title,
    words: lesson.wordKeys.map((key) => ({
      key,
      sourceText: byKey.get(key)?.imagePrompt ?? key,
      text: byKey.get(key)?.text ?? key,
      translation: byKey.get(key)?.translation ?? '',
    })),
    exercises: lesson.sourceExercises.map((e) => ({
      type: e.type,
      prompt: e.prompt,
      hint: e.hint,
      words: e.type === 'match-pairs' ? e.wordIds : [e.wordId],
    })),
  };
  const { data, requestId } = await structured(
    env,
    'lesson_translation',
    toJsonSchema(lessonTranslationDtoSchema),
    lessonTranslationPrompt(payload),
    payload,
    (d) => lessonTranslationDtoSchema.parse(d),
  );
  const exercises = material(() => buildTranslatedExercises(data, lesson, output.words));
  const document = buildDocument(lesson, output.words, exercises);
  await updateOutput(ctx.db, job.id, (current) => ({
    ...current,
    lessons: current.lessons.map((l) => (l.lessonId === lesson.lessonId ? { ...l, document } : l)),
  }));
  return { output: { exercises: exercises.length }, requestId };
}
