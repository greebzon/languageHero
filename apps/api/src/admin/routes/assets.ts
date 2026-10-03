import type { FastifyInstance } from 'fastify';
import multipart from '@fastify/multipart';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { and, count, desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { AdminOptions } from '../plugin.js';
import { assets } from '../../db/schema.js';
import { audit } from '../audit.js';
import { AdminError, parseInput } from '../errors.js';
import { MEDIA_LIMITS, mediaFilename } from '../media.js';
import { storeAsset } from '../asset-store.js';
import { THUMB_WIDTHS, thumbnail } from '../thumbnail.js';
import { assetDto, assetExt, notFound, paging, uuidParam, type AssetRow } from './shared.js';

const listFilter = z.object({ kind: z.enum(['image', 'audio']).optional() });
/** `?w=320|640` asks for a narrower preview of a picture; see `thumbnail`. */
const fileQuery = z.object({ w: z.enum(THUMB_WIDTHS).optional() });

/** Where an asset's bytes live: drafts in the private storage, published ones in the store. */
export function assetFilePath(
  options: Pick<AdminOptions, 'storageRoot' | 'contentRoot'>,
  asset: AssetRow,
) {
  const name = mediaFilename(asset.sha256, assetExt(asset));
  return asset.storageKey === 'store'
    ? join(options.contentRoot, 'media', name)
    : join(options.storageRoot, name);
}

export async function assetRoutes(app: FastifyInstance, options: AdminOptions) {
  const { db } = options;
  await app.register(multipart, {
    limits: { files: 1, fileSize: Math.max(MEDIA_LIMITS.png, MEDIA_LIMITS.wav), fields: 5 },
  });

  app.post('/assets', async (request, reply) => {
    const file = await request.file();
    if (!file)
      throw new AdminError(400, 'invalid_input', 'Нужен файл', { file: ['Выберите файл'] });
    const bytes = await file.toBuffer();
    const { asset, created, info } = await storeAsset(db, options.storageRoot, bytes, {
      source: 'upload',
      uploadedBy: request.admin!.login,
      originalName: file.filename.slice(0, 200),
    });
    if (!created) return { asset: assetDto(asset), created: false };
    await audit(db, {
      actorId: request.admin!.id,
      entityType: 'asset',
      entityId: asset.id,
      action: 'upload',
      payload: { sha256: info.sha256, kind: info.kind, byteSize: info.byteSize },
    });
    return reply.code(201).send({ asset: assetDto(asset), created: true });
  });

  app.get('/assets', async (request) => {
    const filter = parseInput(listFilter, request.query);
    const { limit, offset } = paging(request.query);
    // Delivery copies (`renditions.ts`) are the publisher's business, not library files.
    const where = and(
      filter.kind ? eq(assets.kind, filter.kind) : undefined,
      sql`${assets.provenance}->>'source' <> 'rendition'`,
    );
    const rows = await db
      .select()
      .from(assets)
      .where(where)
      .orderBy(desc(assets.createdAt))
      .limit(limit)
      .offset(offset);
    const [{ total }] = await db.select({ total: count() }).from(assets).where(where);
    return { items: rows.map(assetDto), total };
  });

  app.get<{ Params: { id: string } }>('/assets/:id', async (request) => {
    const row = await db.query.assets.findFirst({
      where: eq(assets.id, uuidParam(request.params.id)),
    });
    if (!row) notFound('Файл');
    return { asset: assetDto(row) };
  });

  app.get<{ Params: { id: string } }>('/assets/:id/file', async (request, reply) => {
    const row = await db.query.assets.findFirst({
      where: eq(assets.id, uuidParam(request.params.id)),
    });
    if (!row) notFound('Файл');
    const { w } = parseInput(fileQuery, request.query);
    const path = assetFilePath(options, row);
    const bytes =
      (w && row.mime === 'image/png'
        ? await thumbnail(options.storageRoot, row.sha256, path, Number(w))
        : null) ?? (await readFile(path).catch(() => notFound('Файл')));
    return reply
      .type(row.mime)
      .header('Cache-Control', 'private, max-age=31536000, immutable')
      .send(bytes);
  });
}
