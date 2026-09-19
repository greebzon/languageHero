import type { FastifyInstance } from 'fastify';
import { asc, count, eq, inArray } from 'drizzle-orm';
import { languageInputSchema, languagePatchSchema, orderInputSchema } from '@lingvohero/contracts';
import type { AdminOptions } from '../plugin.js';
import { courses, languages } from '../../db/schema.js';
import { audit } from '../audit.js';
import { AdminError, parseInput } from '../errors.js';
import { notFound } from './shared.js';

export async function languageRoutes(app: FastifyInstance, { db }: AdminOptions) {
  app.get('/languages', async () => {
    const rows = await db
      .select()
      .from(languages)
      .orderBy(asc(languages.position), asc(languages.code));
    const counts = await db
      .select({ languageCode: courses.languageCode, count: count() })
      .from(courses)
      .groupBy(courses.languageCode);
    const byLanguage = new Map(counts.map((c) => [c.languageCode, c.count]));
    return { items: rows.map((row) => ({ ...row, courseCount: byLanguage.get(row.code) ?? 0 })) };
  });

  app.post('/languages', async (request, reply) => {
    const input = parseInput(languageInputSchema, request.body);
    const existing = await db.query.languages.findFirst({ where: eq(languages.code, input.code) });
    if (existing) throw new AdminError(409, 'already_exists', 'Язык с таким кодом уже есть');
    const row = await db.transaction(async (tx) => {
      const [{ position }] = await tx.select({ position: count() }).from(languages);
      const [created] = await tx
        .insert(languages)
        .values({ ...input, position })
        .returning();
      await audit(tx, {
        actorId: request.admin!.id,
        entityType: 'language',
        entityId: input.code,
        action: 'create',
        payload: input,
      });
      return created!;
    });
    return reply.code(201).send({ language: row });
  });

  app.patch<{ Params: { code: string } }>('/languages/:code', async (request) => {
    const input = parseInput(languagePatchSchema, request.body);
    const row = await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(languages)
        .set({ ...input, updatedAt: new Date() })
        .where(eq(languages.code, request.params.code))
        .returning();
      if (!updated) notFound('Язык');
      await audit(tx, {
        actorId: request.admin!.id,
        entityType: 'language',
        entityId: updated.code,
        action: 'update',
        payload: input,
      });
      return updated;
    });
    return { language: row };
  });

  app.put<{ Params: { code: string } }>('/languages/:code/course-order', async (request) => {
    const { ids } = parseInput(orderInputSchema, request.body);
    await db.transaction(async (tx) => {
      const current = await tx
        .select({ id: courses.id })
        .from(courses)
        .where(eq(courses.languageCode, request.params.code));
      if (!current.length) notFound('Язык');
      const known = new Set(current.map((c) => c.id));
      if (ids.length !== known.size || ids.some((id) => !known.has(id)))
        throw new AdminError(400, 'invalid_input', 'Список сетов не совпадает с текущим', {
          ids: ['Нужно передать все сеты языка ровно по одному разу'],
        });
      for (const [position, id] of ids.entries())
        await tx
          .update(courses)
          .set({ position, updatedAt: new Date() })
          .where(inArray(courses.id, [id]));
      await audit(tx, {
        actorId: request.admin!.id,
        entityType: 'language',
        entityId: request.params.code,
        action: 'reorder-courses',
        payload: { ids },
      });
    });
    return { ok: true };
  });
}
