import Fastify, { type FastifyError, type FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { defaultContentRoot, readCatalog, readLesson } from './content.js';
import { adminPlugin, type AdminOptions } from './admin/plugin.js';
import { accountPlugin, type AccountOptions } from './account/plugin.js';
import { shopPublicRoutes } from './shop-public.js';

export type AppOptions = {
  contentRoot?: string;
  /** Enables `/v1/admin`; omitted when there is no database (public API only). */
  admin?: Omit<AdminOptions, 'contentRoot'>;
  /** Built panel (`apps/admin/dist`) served under `/admin/` on the API's own origin. */
  adminDist?: string;
  account?: Omit<AccountOptions, 'contentRoot'>;
};

export function buildApp({
  contentRoot = defaultContentRoot,
  admin,
  adminDist,
  account,
}: AppOptions = {}) {
  const app = Fastify({ logger: { redact: ['req.headers.authorization', 'req.headers.cookie'] } });
  app.setErrorHandler((error, request, reply) => {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT')
      return reply.code(404).send({ error: 'Content not found' });
    if ((error as FastifyError).validation)
      return reply.code(400).send({ error: 'Invalid request' });
    request.log.error(error);
    return reply.code(503).send({ error: 'Content temporarily unavailable' });
  });
  app.register(publicRoutes, { contentRoot });
  if (account) app.register(accountPlugin, { ...account, contentRoot, prefix: '/v1/account' });
  if (admin) app.register(adminPlugin, { ...admin, contentRoot, prefix: '/v1/admin' });
  if (admin)
    app.register(shopPublicRoutes, { db: admin.db, storageRoot: admin.storageRoot, contentRoot });
  if (adminDist) {
    app.register(fastifyStatic, { root: adminDist, prefix: '/admin/', index: ['index.html'] });
    // Client-side routes of the SPA resolve to its index page.
    app.setNotFoundHandler((request, reply) =>
      request.method === 'GET' && request.url.startsWith('/admin')
        ? reply.sendFile('index.html')
        : reply.code(404).send({ error: 'Not found' }),
    );
  }
  return app;
}

async function publicRoutes(app: FastifyInstance, { contentRoot }: { contentRoot: string }) {
  // These routes expose only curated public learning material, never profile data,
  // so the open CORS policy is scoped to them and never reaches /v1/admin.
  app.addHook('onRequest', async (_request, reply) => {
    reply.header('Access-Control-Allow-Origin', '*');
    reply.header('Access-Control-Expose-Headers', 'ETag');
  });
  app.get('/health', async () => ({ status: 'ok', service: 'lingvohero-api', version: '0.1.0' }));
  app.get<{ Querystring: { schemaVersion?: string } }>('/v1/catalog', async (request, reply) => {
    if (request.query.schemaVersion !== '2')
      return reply.code(409).send({ error: 'Unsupported content schema', supported: [2] });
    const catalog = await readCatalog(contentRoot);
    reply.header('Cache-Control', 'no-cache').header('ETag', `"catalog-${catalog.revision}"`);
    if (request.headers['if-none-match'] === `"catalog-${catalog.revision}"`)
      return reply.code(304).send();
    return catalog;
  });
  app.get<{ Params: { id: string; version: string } }>(
    '/v1/lessons/:id/versions/:version',
    {
      schema: {
        params: {
          type: 'object',
          required: ['id', 'version'],
          properties: {
            id: { type: 'string', pattern: '^[a-z0-9][a-z0-9-]{0,79}$' },
            version: { type: 'string', pattern: '^[1-9][0-9]{0,8}$' },
          },
        },
      },
    },
    async (request, reply) => {
      const lesson = await readLesson(
        contentRoot,
        request.params.id,
        Number(request.params.version),
      );
      return reply.header('Cache-Control', 'public, max-age=31536000, immutable').send(lesson);
    },
  );
  app.get<{ Params: { filename: string } }>(
    '/v1/media/:filename',
    {
      schema: {
        params: {
          type: 'object',
          required: ['filename'],
          properties: { filename: { type: 'string', pattern: '^[a-f0-9]{64}\\.(png|wav)$' } },
        },
      },
    },
    async (request, reply) => {
      const { filename } = request.params;
      const bytes = await readFile(join(contentRoot, 'media', filename));
      if (createHash('sha256').update(bytes).digest('hex') !== filename.split('.')[0])
        throw new Error('Media checksum mismatch');
      return reply
        .type(filename.endsWith('.png') ? 'image/png' : 'audio/wav')
        .header('Cache-Control', 'public, max-age=31536000, immutable')
        .send(bytes);
    },
  );
}
