/* «Перевести тексты»: queues the translation of a set's child-facing texts into the
   interface locales (only what is missing or outdated, unless forced). */
import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { textsGenerateSchema } from '@lingvohero/contracts';
import type { AdminOptions } from '../plugin.js';
import { courses } from '../../db/schema.js';
import type { GenerationSettings } from '../../generation/factory.js';
import { AdminError, parseInput } from '../errors.js';
import { queueTextsJob } from '../../worker/text-stages.js';
import { jobWithTasks } from './generations.js';
import { notFound } from './shared.js';

export async function textsRoutes(
  app: FastifyInstance,
  options: AdminOptions & { generation: GenerationSettings },
) {
  const { db, generation } = options;
  app.post<{ Params: { id: string } }>('/courses/:id/texts/generate', async (request, reply) => {
    const course = await db.query.courses.findFirst({ where: eq(courses.id, request.params.id) });
    if (!course) notFound('Сет');
    const input = parseInput(textsGenerateSchema, request.body);
    if (!generation.provider)
      throw new AdminError(503, 'provider_unavailable', generation.unavailableReason!);
    const { job, created } = await queueTextsJob(db, {
      course,
      locales: input.locales,
      force: input.force,
      modelConfig: generation.modelConfig,
      idempotencyKey: input.idempotencyKey,
      requestedBy: request.admin!.id,
      costLimitUsd: generation.costLimitUsd,
    });
    return reply.code(created ? 202 : 200).send(await jobWithTasks(db, job));
  });
}
