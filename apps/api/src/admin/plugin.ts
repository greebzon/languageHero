import type { FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import type { Db } from '../db/client.js';
import type { GenerationSettings } from '../generation/factory.js';
import { originGuard, requireAdmin, sessionLoader } from './auth.js';
import { adminErrorHandler } from './errors.js';
import { assetRoutes } from './routes/assets.js';
import { authRoutes } from './routes/auth.js';
import { cloneRoutes } from './routes/clone.js';
import { coverRoutes } from './routes/cover.js';
import { textsRoutes } from './routes/texts.js';
import { courseRoutes } from './routes/courses.js';
import { generationRoutes } from './routes/generations.js';
import { languageRoutes } from './routes/languages.js';
import { lessonRoutes } from './routes/lessons.js';
import { publicationRoutes } from './routes/publications.js';
import { wardrobeRoutes } from './routes/wardrobe.js';

export type AdminOptions = {
  db: Db;
  /** Draft uploads; copied into `${contentRoot}/media` only by a publication. */
  storageRoot: string;
  contentRoot: string;
  cookieSecure: boolean;
  sessionTtlHours: number;
  adminOrigin?: string;
  /** Provider, models, limits and rates for the generation wizard (stage D). */
  generation: GenerationSettings;
};

/** Everything under `/v1/admin`. Registered only when the API has a database. */
export async function adminPlugin(app: FastifyInstance, registered: AdminOptions) {
  // Fastify passes its own `prefix` inside the options; child plugins must not inherit it.
  const { prefix: _prefix, ...options } = registered as AdminOptions & { prefix?: string };
  app.setErrorHandler(adminErrorHandler);
  app.setNotFoundHandler((request, reply) =>
    reply.code(404).send({ code: 'not_found', message: 'Not found', requestId: request.id }),
  );
  await app.register(cookie);
  await app.register(rateLimit, { global: false });
  app.decorateRequest('admin', null);
  app.addHook('onRequest', originGuard(options.adminOrigin));
  app.addHook('preHandler', sessionLoader(options.db));
  await app.register(authRoutes, options);
  await app.register(async (protectedScope) => {
    protectedScope.addHook('preHandler', requireAdmin);
    await protectedScope.register(languageRoutes, options);
    await protectedScope.register(courseRoutes, options);
    await protectedScope.register(lessonRoutes, options);
    await protectedScope.register(assetRoutes, options);
    await protectedScope.register(publicationRoutes, options);
    await protectedScope.register(generationRoutes, options);
    await protectedScope.register(cloneRoutes, options);
    await protectedScope.register(wardrobeRoutes, options);
    await protectedScope.register(coverRoutes, options);
    await protectedScope.register(textsRoutes, options);
  }, options);
}
