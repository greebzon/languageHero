import { inArray } from 'drizzle-orm';
import { z } from 'zod';
import { listQuerySchema } from '@lingvohero/contracts';
import type { Db, Tx } from '../../db/client.js';
import { assets } from '../../db/schema.js';
import type { AssetRef } from '../../publishing/convert.js';
import { AdminError, parseInput } from '../errors.js';

export type AssetRow = typeof assets.$inferSelect;

export const paging = (query: unknown) => parseInput(listQuerySchema, query);

export function uuidParam(value: string) {
  const result = z.uuid().safeParse(value);
  if (!result.success) throw new AdminError(404, 'not_found', 'Файл не найден');
  return result.data;
}

export const assetExt = (asset: Pick<AssetRow, 'kind'>) =>
  asset.kind === 'image' ? ('png' as const) : ('wav' as const);

export function assetDto(asset: AssetRow) {
  return {
    id: asset.id,
    sha256: asset.sha256,
    kind: asset.kind,
    mime: asset.mime,
    byteSize: asset.byteSize,
    width: asset.width,
    height: asset.height,
    durationMs: asset.durationMs,
    status: asset.status,
    provenance: asset.provenance,
    altText: asset.altText,
    transcript: asset.transcript,
    createdAt: asset.createdAt,
    url: `/v1/admin/assets/${asset.id}/file`,
  };
}
export type AssetDto = ReturnType<typeof assetDto>;

/** Asset references for `toCourseLesson`; missing IDs are simply absent (reported as errors). */
export async function loadAssetRefs(db: Db | Tx, ids: Iterable<string>) {
  const unique = [...new Set(ids)].filter((id) => z.uuid().safeParse(id).success);
  const refs = new Map<string, AssetRef>();
  if (!unique.length) return refs;
  for (const row of await db.select().from(assets).where(inArray(assets.id, unique)))
    refs.set(row.id, { id: row.id, sha256: row.sha256, ext: assetExt(row) });
  return refs;
}

export function notFound(entity: string): never {
  throw new AdminError(404, 'not_found', `${entity} не найден`);
}

export function staleRevision(): never {
  throw new AdminError(
    409,
    'stale_revision',
    'Запись изменена в другом окне. Обновите страницу и повторите правку',
  );
}
