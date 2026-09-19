import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import type { AdminOptions } from '../plugin.js';
import { adminUsers, courses, lessons, publications } from '../../db/schema.js';
import { buildRelease } from '../../publishing/build-release.js';
import {
  currentRevision,
  diffCatalogs,
  listPublications,
  loadBuildInput,
  lockPresent,
  preparePlan,
  prepareRestorePlan,
  publicationDto,
  readCatalogRevision,
  recoverPublications,
} from '../../publishing/plan.js';
import { publishPlan } from '../../publishing/publish.js';
import { AdminError, parseInput } from '../errors.js';
import { notFound, paging, uuidParam } from './shared.js';

const restoreInput = z.object({ revision: z.number().int().positive() });
const publishInput = z.object({ planId: z.uuid() });

export async function publicationRoutes(app: FastifyInstance, options: AdminOptions) {
  const { db, contentRoot } = options;

  /** Full build with the errors/warnings filtered to one set and its lessons. */
  app.post<{ Params: { id: string } }>('/courses/:id/validate', async (request) => {
    const course = await db.query.courses.findFirst({ where: eq(courses.id, request.params.id) });
    if (!course) notFound('Сет');
    const own = new Set(
      (
        await db.select({ id: lessons.id }).from(lessons).where(eq(lessons.courseId, course.id))
      ).map((l) => l.id),
    );
    const mine = (issue: { entity: string; id: string }) =>
      (issue.entity === 'course' && issue.id === course.id) ||
      (issue.entity === 'lesson' && own.has(issue.id)) ||
      issue.entity === 'catalog';
    const built = buildRelease(await loadBuildInput(db, (await currentRevision(contentRoot)) + 1));
    const errors = built.errors.filter(mine);
    return { ok: errors.length === 0, errors, warnings: built.warnings.filter(mine) };
  });

  app.post('/publication-plans', async (request, reply) => {
    const result = await preparePlan(db, contentRoot, request.admin!.id);
    if (!result.publication)
      return reply.code(422).send({
        code: 'invalid_release',
        message: 'Выпуск не проходит проверку',
        errors: result.errors,
        warnings: result.warnings,
        requestId: request.id,
      });
    return reply.code(201).send({
      publication: publicationDto(result.publication, request.admin!.login),
      diff: result.diff,
      warnings: result.warnings,
    });
  });

  app.post('/publication-plans/restore', async (request, reply) => {
    const { revision } = parseInput(restoreInput, request.body);
    const result = await prepareRestorePlan(db, contentRoot, revision, request.admin!.id);
    if (!result.publication)
      throw new AdminError(422, 'invalid_release', 'Старый выпуск не проходит проверку');
    return reply.code(201).send({
      publication: publicationDto(result.publication, request.admin!.login),
      diff: result.diff,
      warnings: [],
    });
  });

  app.post('/publications', async (request) => {
    const { planId } = parseInput(publishInput, request.body);
    const row = await publishPlan(db, options, planId, request.admin!.id);
    return { publication: publicationDto(row, request.admin!.login) };
  });

  app.get('/publications', async (request) => {
    await recoverPublications(db, contentRoot);
    const { limit, offset } = paging(request.query);
    return {
      items: await listPublications(db, limit, offset),
      currentRevision: await currentRevision(contentRoot),
      lockPresent: await lockPresent(contentRoot),
    };
  });

  app.get<{ Params: { id: string } }>('/publications/:id', async (request) => {
    const row = await db.query.publications.findFirst({
      where: eq(publications.id, uuidParam(request.params.id)),
    });
    if (!row) throw new AdminError(404, 'not_found', 'Выпуск не найден');
    const actor = row.actorId
      ? await db.query.adminUsers.findFirst({ where: eq(adminUsers.id, row.actorId) })
      : null;
    return {
      publication: publicationDto(row, actor?.login ?? null),
      diff: diffCatalogs(
        await readCatalogRevision(contentRoot, row.baseCatalogRevision),
        row.snapshot.catalog,
      ),
    };
  });
}
