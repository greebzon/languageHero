import type { FastifyInstance } from 'fastify';
import { and, desc, eq, sql } from 'drizzle-orm';
import {
  OVERLAY_LOCALES,
  duplicateInputSchema,
  lessonPatchSchema,
  type DraftTexts,
} from '@lingvohero/contracts';
import type { AdminOptions } from '../plugin.js';
import { courses, lessons } from '../../db/schema.js';
import { baseTextsHash, toCourseLesson } from '../../publishing/convert.js';
import { canonicalJson } from '../../publishing/hash.js';
import { translationState } from '../../worker/text-stages.js';
import { audit } from '../audit.js';
import { AdminError, parseInput } from '../errors.js';
import { loadAssetRefs, notFound, staleRevision } from './shared.js';

/**
 * A translation the admin edited by hand now matches the Russian of this save: stamp it with
 * that fingerprint (untouched locales keep theirs, so they still show as outdated if the
 * Russian changed).
 */
function stampTexts(
  current: typeof lessons.$inferSelect,
  input: {
    title?: string;
    presentation?: typeof current.presentation;
    document?: typeof current.document;
    texts?: DraftTexts;
  },
): DraftTexts {
  const hash = baseTextsHash(
    input.title ?? current.title,
    input.presentation !== undefined ? input.presentation : (current.presentation ?? null),
    input.document ?? current.document,
  );
  const out: DraftTexts = { ...input.texts };
  for (const locale of OVERLAY_LOCALES) {
    const next = input.texts?.[locale];
    if (!next) continue;
    const { sourceHash: _a, ...nextBody } = next;
    const { sourceHash: _b, ...prevBody } = current.texts?.[locale] ?? {};
    out[locale] =
      canonicalJson(nextBody) === canonicalJson(prevBody)
        ? { ...next, sourceHash: current.texts?.[locale]?.sourceHash }
        : { ...next, sourceHash: hash };
  }
  return out;
}

const withTranslations = (row: typeof lessons.$inferSelect) => ({
  ...row,
  translations: { en: translationState(row, 'en'), he: translationState(row, 'he') },
});

export async function lessonRoutes(app: FastifyInstance, { db }: AdminOptions) {
  app.get<{ Params: { id: string } }>('/lessons/:id', async (request) => {
    const row = await db.query.lessons.findFirst({ where: eq(lessons.id, request.params.id) });
    if (!row) notFound('Урок');
    return { lesson: withTranslations(row) };
  });

  app.patch<{ Params: { id: string } }>('/lessons/:id', async (request) => {
    const { editRevision, ...input } = parseInput(lessonPatchSchema, request.body);
    const row = await db.transaction(async (tx) => {
      const current = await tx.query.lessons.findFirst({
        where: eq(lessons.id, request.params.id),
      });
      if (!current) notFound('Урок');
      if (current.editRevision !== editRevision) staleRevision();
      const texts = input.texts ? stampTexts(current, input) : undefined;
      const [updated] = await tx
        .update(lessons)
        .set({
          ...input,
          ...(texts ? { texts } : {}),
          editRevision: sql`${lessons.editRevision} + 1`,
          updatedAt: new Date(),
        })
        .where(and(eq(lessons.id, current.id), eq(lessons.editRevision, editRevision)))
        .returning();
      if (!updated) staleRevision();
      await audit(tx, {
        actorId: request.admin!.id,
        entityType: 'lesson',
        entityId: current.id,
        action: 'update',
        payload: { fields: Object.keys(input) },
      });
      return updated;
    });
    return { lesson: withTranslations(row) };
  });

  app.delete<{ Params: { id: string } }>('/lessons/:id', async (request, reply) => {
    await db.transaction(async (tx) => {
      const current = await tx.query.lessons.findFirst({
        where: eq(lessons.id, request.params.id),
      });
      if (!current) notFound('Урок');
      // Published lessons stay addressable for active sessions; hiding them is a later stage.
      if (current.lastPublishedVersion)
        throw new AdminError(422, 'published_lesson', 'Опубликованный урок нельзя удалить');
      await tx.delete(lessons).where(eq(lessons.id, current.id));
      await audit(tx, {
        actorId: request.admin!.id,
        entityType: 'lesson',
        entityId: current.id,
        action: 'delete',
      });
    });
    return reply.code(204).send();
  });

  app.post<{ Params: { id: string } }>('/lessons/:id/duplicate', async (request, reply) => {
    const input = parseInput(duplicateInputSchema, request.body);
    const row = await db.transaction(async (tx) => {
      const source = await tx.query.lessons.findFirst({ where: eq(lessons.id, request.params.id) });
      if (!source) notFound('Урок');
      if (await tx.query.lessons.findFirst({ where: eq(lessons.id, input.id) }))
        throw new AdminError(409, 'already_exists', 'Урок с таким ID уже есть');
      const [last] = await tx
        .select({ position: lessons.position })
        .from(lessons)
        .where(eq(lessons.courseId, source.courseId))
        .orderBy(desc(lessons.position))
        .limit(1);
      const [created] = await tx
        .insert(lessons)
        .values({
          id: input.id,
          courseId: source.courseId,
          position: last ? last.position + 1 : 0,
          title: input.title ?? `${source.title} (копия)`,
          presentation: source.presentation,
          document: source.document,
          texts: source.texts,
        })
        .returning();
      await audit(tx, {
        actorId: request.admin!.id,
        entityType: 'lesson',
        entityId: input.id,
        action: 'duplicate',
        payload: { sourceId: source.id },
      });
      return created!;
    });
    return reply.code(201).send({ lesson: row });
  });

  /**
   * The draft as the mobile engine would receive it, plus URLs for its not-yet-published media.
   * A draft that does not pass the strict package schema yields 422 with per-field errors.
   */
  app.get<{ Params: { id: string } }>('/lessons/:id/preview', async (request) => {
    const row = await db.query.lessons.findFirst({ where: eq(lessons.id, request.params.id) });
    if (!row) notFound('Урок');
    const course = (await db.query.courses.findFirst({ where: eq(courses.id, row.courseId) }))!;
    const refs = await loadAssetRefs(
      db,
      row.document.media.map((m) => m.assetId),
    );
    const result = toCourseLesson(
      row.document,
      {
        id: row.id,
        version: row.lastPublishedVersion ?? 1,
        language: course.languageCode,
        title: row.title,
        presentation: row.presentation ?? null,
        texts: row.texts,
      },
      refs,
    );
    if (!result.lesson)
      throw new AdminError(422, 'invalid_lesson', 'Урок пока нельзя пройти', result.fieldErrors);
    const mediaUrls = Object.fromEntries(
      row.document.media.map((m) => [m.id, `/v1/admin/assets/${m.assetId}/file`]),
    );
    return { lesson: result.lesson, mediaUrls, courseId: row.courseId };
  });
}
