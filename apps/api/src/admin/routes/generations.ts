import type { FastifyInstance } from 'fastify';
import { desc, eq, sql } from 'drizzle-orm';
import { generationInputSchema, generationRequestSchema } from '@lingvohero/contracts';
import type { AdminOptions } from '../plugin.js';
import type { Db } from '../../db/client.js';
import {
  adminUsers,
  courses,
  generationJobs,
  lessons,
  type GenerationStage,
} from '../../db/schema.js';
import { distribute, minWordsFor, wordCountFor } from '../../generation/distribute.js';
import { estimate } from '../../generation/estimate.js';
import type { GenerationSettings } from '../../generation/factory.js';
import { audit } from '../audit.js';
import {
  ACTIVE_JOB_STATUSES,
  STAGES,
  cancelJob,
  createJob,
  jobTasks,
  retryTask,
  type JobRow,
  type TaskRow,
} from '../../worker/queue.js';
import { AdminError, parseInput } from '../errors.js';
import { notFound, uuidParam } from './shared.js';

const stageLabels: Record<GenerationStage, string> = {
  plan: 'План сета и словарь',
  text: 'Тексты заданий',
  review: 'Проверка материала',
  'media-plan': 'План медиа',
  cover: 'Обложка',
  image: 'Иллюстрации',
  audio: 'Озвучка',
  assemble: 'Сборка уроков',
  'mascot-base': 'Тело маскота',
  'mascot-portrait': 'Портрет маскота',
  'mascot-slots': 'Разметка зон',
  'item-icon': 'Иконка товара',
  'outfit-layer': 'Примерка',
  'course-cover': 'Обложка сета',
  'lesson-texts': 'Перевод урока',
  'course-texts': 'Перевод названия сета',
  'mascot-texts': 'Перевод маскота',
  'item-texts': 'Перевод вещи',
};

export function taskDto(task: TaskRow) {
  return {
    id: task.id,
    stage: task.stage,
    stageLabel: stageLabels[task.stage],
    targetId: task.targetId,
    status: task.status,
    attempts: task.attempts,
    maxAttempts: task.maxAttempts,
    lastError: task.lastError,
    nextAttemptAt: task.nextAttemptAt,
    requestId: task.providerRequestId,
    output: task.output && {
      assetId: task.output.assetId,
      reusedFrom: task.output.reusedFrom,
      exercises: task.output.exercises,
      words: task.output.words,
      lessons: task.output.lessons,
      conflicts: task.output.conflicts,
      problems: task.output.problems,
      drift: task.output.drift,
      scale: task.output.scale,
    },
    updatedAt: task.updatedAt,
  };
}

export function jobDto(job: JobRow, actorLogin: string | null = null) {
  const { output } = job;
  return {
    id: job.id,
    kind: job.kind,
    courseId: job.courseId,
    subjectId: job.subjectId,
    status: job.status,
    input: { ...job.input, simulate: undefined },
    modelConfig: job.modelConfig,
    promptVersion: job.promptVersion,
    usage: job.usage,
    costLimitUsd: job.costLimitUsd,
    warnings: job.warnings,
    error: job.error,
    actorLogin,
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    result:
      output && job.kind === 'course'
        ? {
            distribution: output.distribution,
            words: output.words.map((w) => ({
              key: w.key,
              text: w.text,
              translation: w.translation,
            })),
            lessons: output.lessons.map((l) => ({
              lessonId: l.lessonId,
              title: l.title,
              goal: l.goal,
              exerciseCount: l.exerciseCount,
              hasText: !!l.document,
            })),
            media: output.media ?? null,
            conflicts: (output.conflicts ?? []).map((c) => ({
              lessonId: c.lessonId,
              title: c.title,
            })),
          }
        : null,
  };
}

export async function jobWithTasks(db: Db, job: JobRow) {
  const tasks = (await jobTasks(db, job.id)).map(taskDto);
  const actor = job.requestedBy
    ? await db.query.adminUsers.findFirst({ where: eq(adminUsers.id, job.requestedBy) })
    : null;
  const done = tasks.filter((t) => t.status === 'succeeded').length;
  const active = ACTIVE_JOB_STATUSES.includes(job.status as 'queued' | 'running');
  return {
    job: jobDto(job, actor?.login ?? null),
    tasks,
    progress: { done, total: tasks.length },
    stages: STAGES.map((stage) => ({
      stage,
      label: stageLabels[stage],
      tasks: tasks.filter((t) => t.stage === stage).length,
      done: tasks.filter((t) => t.stage === stage && t.status === 'succeeded').length,
      failed: tasks.filter((t) => t.stage === stage && t.status === 'failed').length,
    })),
    allowed: {
      cancel: active,
      retryTaskIds: tasks
        .filter((t) => ['failed', 'cancelled', 'retry-wait'].includes(t.status) && !active)
        .map((t) => t.id),
      applyConflicts: job.status === 'awaiting-review' && (job.output?.conflicts?.length ?? 0) > 0,
    },
  };
}

export async function generationRoutes(
  app: FastifyInstance,
  options: AdminOptions & { generation: GenerationSettings },
) {
  const { db, generation } = options;
  const inputWithLimits = generationInputSchema.extend({
    totalExercises: generationInputSchema.shape.totalExercises
      .min(generation.limits.minExercises)
      .max(generation.limits.maxExercises),
  });

  app.get('/generation-settings', async () => ({
    providerReady: generation.provider !== null,
    providerName: generation.provider?.name ?? null,
    unavailableReason: generation.unavailableReason,
    limits: generation.limits,
    costLimitUsd: generation.costLimitUsd,
    models: generation.modelConfig,
    rates: generation.rates,
  }));

  /** The wizard may ask for fewer words than lessons can share without repeating word sets. */
  const checkWordCount = (input: {
    totalExercises: number;
    lessonSize: number;
    wordCount: number | null;
  }) => {
    const distribution = distribute(input.totalExercises, input.lessonSize);
    const min = minWordsFor(distribution);
    if (input.wordCount !== null && input.wordCount < min)
      throw new AdminError(400, 'invalid_input', 'Слишком мало слов для такого числа уроков', {
        wordCount: [`Нужно не меньше ${min} слов на ${distribution.length} урок(ов)`],
      });
    return distribution;
  };

  app.post('/generation-estimates', async (request) => {
    const input = parseInput(inputWithLimits, request.body);
    checkWordCount(input);
    return estimate(input, generation.rates, generation.limits.wordsPerLesson);
  });

  app.get<{ Params: { id: string } }>('/courses/:id/generations', async (request) => {
    const course = await db.query.courses.findFirst({ where: eq(courses.id, request.params.id) });
    if (!course) notFound('Сет');
    const rows = await db
      .select()
      .from(generationJobs)
      .where(eq(generationJobs.courseId, course.id))
      .orderBy(desc(generationJobs.createdAt))
      .limit(20);
    return { items: rows.map((row) => jobDto(row)) };
  });

  app.post<{ Params: { id: string } }>('/courses/:id/generations', async (request, reply) => {
    const { idempotencyKey, ...input } = parseInput(
      generationRequestSchema.extend({ totalExercises: inputWithLimits.shape.totalExercises }),
      request.body,
    );
    const course = await db.query.courses.findFirst({ where: eq(courses.id, request.params.id) });
    if (!course) notFound('Сет');
    if (!generation.provider)
      throw new AdminError(503, 'provider_unavailable', generation.unavailableReason!);
    const distribution = checkWordCount(input);
    const { job, created } = await createJob(db, {
      courseId: course.id,
      input: {
        ...input,
        // Resolved here so the worker needs no environment to agree on the vocabulary size.
        wordCount: wordCountFor(distribution, input.targetWords.length, {
          wordsPerLesson: generation.limits.wordsPerLesson,
          requested: input.wordCount,
        }),
        simulate: generation.provider.name === 'fake' ? input.simulate : undefined,
        source: undefined, // only the clone route sets it
      },
      modelConfig: generation.modelConfig,
      idempotencyKey,
      requestedBy: request.admin!.id,
      costLimitUsd: generation.costLimitUsd,
    });
    return reply.code(created ? 202 : 200).send(await jobWithTasks(db, job));
  });

  app.get<{ Params: { id: string } }>('/generations/:id', async (request) => {
    const job = await db.query.generationJobs.findFirst({
      where: eq(generationJobs.id, uuidParam(request.params.id)),
    });
    if (!job) notFound('Работа');
    return jobWithTasks(db, job);
  });

  app.post<{ Params: { id: string } }>('/generations/:id/cancel', async (request) => {
    const job = await cancelJob(db, uuidParam(request.params.id), request.admin!.id);
    return jobWithTasks(db, job);
  });

  app.post<{ Params: { id: string; taskId: string } }>(
    '/generations/:id/tasks/:taskId/retry',
    async (request) => {
      const job = await retryTask(
        db,
        uuidParam(request.params.id),
        uuidParam(request.params.taskId),
        request.admin!.id,
      );
      return jobWithTasks(db, job);
    },
  );

  /** Overwrite lessons the admin edited during the job with the AI variants kept aside. */
  app.post<{ Params: { id: string } }>('/generations/:id/apply-conflicts', async (request) => {
    const job = await db.query.generationJobs.findFirst({
      where: eq(generationJobs.id, uuidParam(request.params.id)),
    });
    if (!job) notFound('Работа');
    const conflicts = job.output?.conflicts ?? [];
    if (job.status !== 'awaiting-review' || !conflicts.length)
      throw new AdminError(409, 'nothing_to_apply', 'Нет сохранённых вариантов ИИ');
    const updated = await db.transaction(async (tx) => {
      for (const conflict of conflicts)
        await tx
          .update(lessons)
          .set({
            title: conflict.title,
            document: conflict.document,
            // The intro and the completion texts belong to the variant too: keeping the old
            // ones left «ты назвал … красный» on a lesson that no longer had colours.
            ...(conflict.presentation !== undefined ? { presentation: conflict.presentation } : {}),
            editRevision: sql`${lessons.editRevision} + 1`,
            updatedAt: new Date(),
          })
          .where(eq(lessons.id, conflict.lessonId));
      const [row] = await tx
        .update(generationJobs)
        .set({
          output: { ...job.output!, conflicts: [] },
          warnings: job.warnings.filter((w) => !/изменён вручную/.test(w)),
        })
        .where(eq(generationJobs.id, job.id))
        .returning();
      await audit(tx, {
        actorId: request.admin!.id,
        entityType: 'course',
        entityId: job.courseId ?? job.id,
        action: 'generation-apply-conflicts',
        payload: { jobId: job.id, lessonIds: conflicts.map((c) => c.lessonId) },
      });
      return row!;
    });
    return jobWithTasks(db, updated);
  });
}
