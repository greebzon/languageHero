import type { FastifyInstance } from 'fastify';
import { and, asc, count, desc, eq, sql } from 'drizzle-orm';
import {
  courseInputSchema,
  coursePatchSchema,
  courseVisibilitySchema,
  idSchema,
  lessonInputSchema,
  orderInputSchema,
} from '@lingvohero/contracts';
import { z } from 'zod';
import type { AdminOptions } from '../plugin.js';
import type { Db, Tx } from '../../db/client.js';
import { assets, courses, languages, lessons } from '../../db/schema.js';
import { audit } from '../audit.js';
import { AdminError, parseInput } from '../errors.js';
import { assetDto, notFound, paging, staleRevision } from './shared.js';
import { translationState } from '../../worker/text-stages.js';

const listFilter = z.object({
  language: idSchema.optional(),
  visibility: courseVisibilitySchema.optional(),
});

export type CourseRow = typeof courses.$inferSelect;

export async function courseSummary(db: Db | Tx, row: CourseRow) {
  const cover = row.coverAssetId
    ? await db.query.assets.findFirst({ where: eq(assets.id, row.coverAssetId) })
    : null;
  const [{ lessonCount }] = await db
    .select({ lessonCount: count() })
    .from(lessons)
    .where(eq(lessons.courseId, row.id));
  return { ...row, cover: cover ? assetDto(cover) : null, lessonCount };
}

export const lessonSummary = (row: typeof lessons.$inferSelect) => ({
  id: row.id,
  courseId: row.courseId,
  position: row.position,
  title: row.title,
  exerciseCount: row.document.exercises.length,
  wordCount: row.document.words.length,
  editRevision: row.editRevision,
  lastPublishedVersion: row.lastPublishedVersion,
  updatedAt: row.updatedAt,
  // Interface translations of the lesson: complete, missing or made from older Russian.
  translations: { en: translationState(row, 'en'), he: translationState(row, 'he') },
});

export async function ensureCoverIsImage(db: Db | Tx, coverAssetId: string | null | undefined) {
  if (!coverAssetId) return;
  const cover = await db.query.assets.findFirst({ where: eq(assets.id, coverAssetId) });
  if (!cover || cover.kind !== 'image')
    throw new AdminError(400, 'invalid_input', 'Обложка должна быть PNG-файлом', {
      coverAssetId: ['Выберите загруженное изображение'],
    });
}

export async function courseRoutes(app: FastifyInstance, { db }: AdminOptions) {
  app.get('/courses', async (request) => {
    const filter = parseInput(listFilter, request.query);
    const { limit, offset } = paging(request.query);
    const where = and(
      filter.language ? eq(courses.languageCode, filter.language) : undefined,
      filter.visibility ? eq(courses.visibility, filter.visibility) : undefined,
    );
    const rows = await db
      .select()
      .from(courses)
      .where(where)
      .orderBy(asc(courses.languageCode), asc(courses.position), asc(courses.id))
      .limit(limit)
      .offset(offset);
    const [{ total }] = await db.select({ total: count() }).from(courses).where(where);
    return { items: await Promise.all(rows.map((row) => courseSummary(db, row))), total };
  });

  app.post('/courses', async (request, reply) => {
    const input = parseInput(courseInputSchema, request.body);
    const language = await db.query.languages.findFirst({
      where: eq(languages.code, input.languageCode),
    });
    if (!language)
      throw new AdminError(400, 'invalid_input', 'Язык не найден', {
        languageCode: ['Сначала создайте язык'],
      });
    if (await db.query.courses.findFirst({ where: eq(courses.id, input.id) }))
      throw new AdminError(409, 'already_exists', 'Сет с таким ID уже есть');
    await ensureCoverIsImage(db, input.coverAssetId);
    const row = await db.transaction(async (tx) => {
      const [last] = await tx
        .select({ position: courses.position })
        .from(courses)
        .where(eq(courses.languageCode, input.languageCode))
        .orderBy(desc(courses.position))
        .limit(1);
      const [created] = await tx
        .insert(courses)
        .values({ ...input, position: last ? last.position + 1 : 0 })
        .returning();
      await audit(tx, {
        actorId: request.admin!.id,
        entityType: 'course',
        entityId: input.id,
        action: 'create',
        payload: input,
      });
      return created!;
    });
    return reply.code(201).send({ course: await courseSummary(db, row) });
  });

  app.get<{ Params: { id: string } }>('/courses/:id', async (request) => {
    const row = await db.query.courses.findFirst({ where: eq(courses.id, request.params.id) });
    if (!row) notFound('Сет');
    const items = await db
      .select()
      .from(lessons)
      .where(eq(lessons.courseId, row.id))
      .orderBy(asc(lessons.position), asc(lessons.id));
    return { course: await courseSummary(db, row), lessons: items.map(lessonSummary) };
  });

  app.patch<{ Params: { id: string } }>('/courses/:id', async (request) => {
    const { editRevision, ...input } = parseInput(coursePatchSchema, request.body);
    await ensureCoverIsImage(db, input.coverAssetId);
    const row = await db.transaction(async (tx) => {
      const current = await tx.query.courses.findFirst({
        where: eq(courses.id, request.params.id),
      });
      if (!current) notFound('Сет');
      if (current.editRevision !== editRevision) staleRevision();
      const [updated] = await tx
        .update(courses)
        .set({ ...input, editRevision: sql`${courses.editRevision} + 1`, updatedAt: new Date() })
        .where(and(eq(courses.id, current.id), eq(courses.editRevision, editRevision)))
        .returning();
      if (!updated) staleRevision();
      await audit(tx, {
        actorId: request.admin!.id,
        entityType: 'course',
        entityId: current.id,
        action: 'update',
        payload: input,
      });
      return updated;
    });
    return { course: await courseSummary(db, row) };
  });

  app.put<{ Params: { id: string } }>('/courses/:id/lesson-order', async (request) => {
    const { ids, editRevision } = parseInput(orderInputSchema, request.body);
    if (!editRevision)
      throw new AdminError(400, 'invalid_input', 'Не передана ревизия сета', {
        editRevision: ['Обязательное поле'],
      });
    const row = await db.transaction(async (tx) => {
      const current = await tx.query.courses.findFirst({
        where: eq(courses.id, request.params.id),
      });
      if (!current) notFound('Сет');
      if (current.editRevision !== editRevision) staleRevision();
      const existing = await tx
        .select({ id: lessons.id })
        .from(lessons)
        .where(eq(lessons.courseId, current.id));
      const known = new Set(existing.map((l) => l.id));
      if (ids.length !== known.size || ids.some((id) => !known.has(id)))
        throw new AdminError(400, 'invalid_input', 'Список уроков не совпадает с текущим', {
          ids: ['Нужно передать все уроки сета ровно по одному разу'],
        });
      for (const [position, id] of ids.entries())
        await tx.update(lessons).set({ position, updatedAt: new Date() }).where(eq(lessons.id, id));
      const [updated] = await tx
        .update(courses)
        .set({ editRevision: sql`${courses.editRevision} + 1`, updatedAt: new Date() })
        .where(eq(courses.id, current.id))
        .returning();
      await audit(tx, {
        actorId: request.admin!.id,
        entityType: 'course',
        entityId: current.id,
        action: 'reorder-lessons',
        payload: { ids },
      });
      return updated!;
    });
    return { course: await courseSummary(db, row) };
  });

  app.post<{ Params: { id: string } }>('/courses/:id/lessons', async (request, reply) => {
    const input = parseInput(lessonInputSchema, request.body);
    const row = await db.transaction(async (tx) => {
      const course = await tx.query.courses.findFirst({ where: eq(courses.id, request.params.id) });
      if (!course) notFound('Сет');
      if (await tx.query.lessons.findFirst({ where: eq(lessons.id, input.id) }))
        throw new AdminError(409, 'already_exists', 'Урок с таким ID уже есть');
      const [last] = await tx
        .select({ position: lessons.position })
        .from(lessons)
        .where(eq(lessons.courseId, course.id))
        .orderBy(desc(lessons.position))
        .limit(1);
      const [created] = await tx
        .insert(lessons)
        .values({ ...input, courseId: course.id, position: last ? last.position + 1 : 0 })
        .returning();
      await audit(tx, {
        actorId: request.admin!.id,
        entityType: 'lesson',
        entityId: input.id,
        action: 'create',
        payload: { courseId: course.id, title: input.title },
      });
      return created!;
    });
    return reply.code(201).send({ lesson: row });
  });
}
