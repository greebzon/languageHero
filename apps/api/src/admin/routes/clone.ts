import type { FastifyInstance } from 'fastify';
import { asc, desc, eq, inArray } from 'drizzle-orm';
import { cloneInputSchema, type GenerationInput } from '@lingvohero/contracts';
import type { AdminOptions } from '../plugin.js';
import { courses, generationJobs, languages, lessons } from '../../db/schema.js';
import { createJob } from '../../worker/queue.js';
import { audit } from '../audit.js';
import { AdminError, parseInput } from '../errors.js';
import { courseSummary } from './courses.js';
import { jobWithTasks } from './generations.js';
import { notFound } from './shared.js';

/**
 * Clones a set into another language. `copy` duplicates the set, its lessons, pictures, audio
 * and exercises as they are (for manual translation); `translate` creates the set and queues an
 * AI job that translates the words, adapts the texts, keeps the pictures and records new audio.
 * The clone is always a draft; nothing is published.
 */
export async function cloneRoutes(app: FastifyInstance, options: AdminOptions) {
  const { db, generation } = options;

  app.post<{ Params: { id: string } }>('/courses/:id/clone', async (request, reply) => {
    const input = parseInput(cloneInputSchema, request.body);
    const previous = await db.query.generationJobs.findFirst({
      where: eq(generationJobs.idempotencyKey, input.idempotencyKey),
    });
    if (previous) {
      const course = (await db.query.courses.findFirst({
        where: eq(courses.id, previous.courseId ?? ''),
      }))!;
      return reply
        .code(200)
        .send({ course: await courseSummary(db, course), job: await jobWithTasks(db, previous) });
    }
    const source = await db.query.courses.findFirst({ where: eq(courses.id, request.params.id) });
    if (!source) notFound('Сет');
    const language = await db.query.languages.findFirst({
      where: eq(languages.code, input.languageCode),
    });
    if (!language)
      throw new AdminError(400, 'invalid_input', 'Язык не найден', {
        languageCode: ['Сначала создайте язык'],
      });
    if (input.mode === 'translate' && language.code === source.languageCode)
      throw new AdminError(400, 'invalid_input', 'Для перевода выберите другой язык', {
        languageCode: ['Совпадает с языком исходного сета'],
      });
    if (await db.query.courses.findFirst({ where: eq(courses.id, input.id) }))
      throw new AdminError(409, 'already_exists', 'Сет с таким ID уже есть', {
        id: ['Такой ID уже занят'],
      });
    const sourceLessons = await db
      .select()
      .from(lessons)
      .where(eq(lessons.courseId, source.id))
      .orderBy(asc(lessons.position), asc(lessons.id));
    if (!sourceLessons.length)
      throw new AdminError(422, 'empty_course', 'В сете нет уроков — клонировать нечего');
    if (input.mode === 'translate') {
      if (!generation.provider)
        throw new AdminError(503, 'provider_unavailable', generation.unavailableReason!);
      const empty = sourceLessons.find(
        (l) => !l.document.exercises.length || !l.document.words.length,
      );
      if (empty)
        throw new AdminError(
          422,
          'empty_lesson',
          `Урок «${empty.title}» пустой — заполните или удалите его перед переводом`,
        );
    }
    const newLessonIds = sourceLessons.map(
      (_, i) => `${input.id}-${String(i + 1).padStart(2, '0')}`,
    );
    const taken = await db
      .select({ id: lessons.id })
      .from(lessons)
      .where(inArray(lessons.id, newLessonIds));
    if (taken.length)
      throw new AdminError(409, 'already_exists', `Урок ${taken[0]!.id} уже существует`, {
        id: ['Выберите другой ID сета'],
      });

    const course = await db.transaction(async (tx) => {
      const [last] = await tx
        .select({ position: courses.position })
        .from(courses)
        .where(eq(courses.languageCode, language.code))
        .orderBy(desc(courses.position))
        .limit(1);
      const [created] = await tx
        .insert(courses)
        .values({
          id: input.id,
          languageCode: language.code,
          topic: source.topic,
          title: input.title,
          description: source.description,
          coverAssetId: source.coverAssetId,
          unlockStars: source.unlockStars,
          position: last ? last.position + 1 : 0,
          visibility: 'draft',
        })
        .returning();
      if (input.mode === 'copy')
        for (const [i, lesson] of sourceLessons.entries())
          await tx.insert(lessons).values({
            id: newLessonIds[i]!,
            courseId: input.id,
            position: i,
            title: lesson.title,
            presentation: lesson.presentation,
            document: structuredClone(lesson.document),
            texts: structuredClone(lesson.texts),
          });
      await audit(tx, {
        actorId: request.admin!.id,
        entityType: 'course',
        entityId: input.id,
        action: `clone-${input.mode}`,
        payload: { sourceId: source.id, languageCode: language.code },
      });
      return created!;
    });

    if (input.mode === 'copy')
      return reply.code(201).send({ course: await courseSummary(db, course), job: null });

    const types = [
      ...new Set(sourceLessons.flatMap((l) => l.document.exercises.map((e) => e.type))),
    ];
    const jobInput: GenerationInput = {
      topic: source.topic ?? source.title,
      totalExercises: sourceLessons.reduce((sum, l) => sum + l.document.exercises.length, 0),
      lessonSize: Math.max(...sourceLessons.map((l) => l.document.exercises.length)),
      wordCount: null,
      level: 'beginner',
      ageRange: '6-9',
      targetWords: [],
      mix: types,
      style: null,
      voice: null,
      source: { courseId: source.id },
    };
    const { job } = await createJob(db, {
      courseId: course.id,
      input: jobInput,
      modelConfig: generation.modelConfig,
      idempotencyKey: input.idempotencyKey,
      requestedBy: request.admin!.id,
      costLimitUsd: generation.costLimitUsd,
    });
    return reply
      .code(202)
      .send({ course: await courseSummary(db, course), job: await jobWithTasks(db, job) });
  });
}
