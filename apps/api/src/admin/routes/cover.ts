/* A new cover for an existing set, drawn by the generation worker. */
import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { coverGenerateSchema } from '@lingvohero/contracts';
import type { AdminOptions } from '../plugin.js';
import { courses } from '../../db/schema.js';
import type { GenerationSettings } from '../../generation/factory.js';
import { AdminError, parseInput } from '../errors.js';
import { createAssetJob } from '../../worker/queue.js';
import { jobWithTasks } from './generations.js';
import { notFound } from './shared.js';

export async function coverRoutes(
  app: FastifyInstance,
  options: AdminOptions & { generation: GenerationSettings },
) {
  const { db, generation } = options;
  app.post<{ Params: { id: string } }>('/courses/:id/cover/generate', async (request, reply) => {
    const course = await db.query.courses.findFirst({ where: eq(courses.id, request.params.id) });
    if (!course) notFound('Сет');
    const input = parseInput(coverGenerateSchema, request.body);
    if (!generation.provider)
      throw new AdminError(503, 'provider_unavailable', generation.unavailableReason!);
    const { job, created } = await createAssetJob(db, {
      kind: 'cover',
      subjectId: course.id,
      courseId: course.id,
      brief: { topic: course.topic || course.title, hint: input.hint },
      tasks: [{ stage: 'course-cover', targetId: 'cover' }],
      modelConfig: generation.modelConfig,
      idempotencyKey: input.idempotencyKey,
      requestedBy: request.admin!.id,
      costLimitUsd: generation.costLimitUsd,
    });
    return reply.code(created ? 202 : 200).send(await jobWithTasks(db, job));
  });
}
