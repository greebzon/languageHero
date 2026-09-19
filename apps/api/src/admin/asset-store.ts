import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import type { Db, Tx } from '../db/client.js';
import { assets, type AssetProvenance } from '../db/schema.js';
import { inspectMedia, mediaFilename } from './media.js';

/**
 * Validates bytes by content, writes them into the draft storage and records the asset.
 * Content-addressed: the same file (by SHA-256) is stored and recorded once, whoever brings it.
 */
export async function storeAsset(
  db: Db | Tx,
  storageRoot: string,
  bytes: Buffer,
  provenance: AssetProvenance,
  extra: {
    transcript?: string | null;
    altText?: string | null;
    generationTaskId?: string | null;
  } = {},
) {
  const info = inspectMedia(bytes);
  const existing = await db.query.assets.findFirst({ where: eq(assets.sha256, info.sha256) });
  if (existing) return { asset: existing, created: false, info };
  await mkdir(storageRoot, { recursive: true });
  await writeFile(join(storageRoot, mediaFilename(info.sha256, info.ext)), bytes);
  const [created] = await db
    .insert(assets)
    .values({
      sha256: info.sha256,
      kind: info.kind,
      mime: info.mime,
      byteSize: info.byteSize,
      width: info.width,
      height: info.height,
      durationMs: info.durationMs,
      storageKey: 'draft',
      status: 'draft',
      provenance,
      transcript: extra.transcript ?? null,
      altText: extra.altText ?? null,
      generationTaskId: extra.generationTaskId ?? null,
    })
    .returning();
  return { asset: created!, created: true, info };
}
