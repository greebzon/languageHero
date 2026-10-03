import { readFile } from 'node:fs/promises';
import { and, eq, inArray } from 'drizzle-orm';
import sharp from 'sharp';
import type { Db, Tx } from '../db/client.js';
import { assetRenditions, assets } from '../db/schema.js';
import { storeAsset } from './asset-store.js';
import { assetFilePath } from './routes/assets.js';

export type Box = { width: number; height: number };
type AssetRow = typeof assets.$inferSelect;

/**
 * The largest picture the app needs for each use: about 3× the biggest size it is drawn at on
 * a phone. Generated originals are 1024–1536 px and 1–3 MB; the app gets these instead.
 */
export const DELIVERY = {
  /** Set cover: the full width of a card. */
  cover: { width: 1024, height: 1024 },
  /** One word picture (or one atlas cell): at most 110 pt in a lesson. */
  word: { width: 384, height: 384 },
  /** Mascot body and outfit layers (drawn over each other, so the same box): the fitting room. */
  body: { width: 512, height: 768 },
  portrait: { width: 384, height: 384 },
  icon: { width: 320, height: 320 },
} satisfies Record<string, Box>;

const boxKey = (box: Box) => `${box.width}x${box.height}`;

/** The bigger of two boxes, for a picture used in two places. */
export const largerBox = (a: Box | undefined, b: Box): Box =>
  a ? { width: Math.max(a.width, b.width), height: Math.max(a.height, b.height) } : b;

/**
 * Shrinks a PNG into `box` and re-encodes it with a 256-colour palette (libimagequant, dithered):
 * 10–20× smaller, still a PNG, so every app version and the publisher's checks accept it.
 * Null when that does not make the file smaller.
 */
export async function shrinkPng(bytes: Buffer, box: Box): Promise<Buffer | null> {
  const out = await sharp(bytes)
    .resize({ ...box, fit: 'inside', withoutEnlargement: true })
    .png({ palette: true, quality: 90, effort: 10, compressionLevel: 9 })
    .toBuffer();
  return out.length < bytes.length * 0.9 ? out : null;
}

/**
 * For each picture (asset id → the box it is needed in) the asset the app should get: a stored
 * smaller copy, made on first use and remembered in `asset_renditions`, or the original itself.
 * Audio, missing files and pictures that do not shrink map to the original.
 */
export async function deliveryAssets(
  db: Db | Tx,
  options: { storageRoot: string; contentRoot: string },
  wanted: ReadonlyMap<string, Box>,
): Promise<Map<string, AssetRow>> {
  const out = new Map<string, AssetRow>();
  const ids = [...wanted.keys()];
  if (!ids.length) return out;
  const rows = new Map(
    (await db.select().from(assets).where(inArray(assets.id, ids))).map((a) => [a.id, a]),
  );
  const known = await db
    .select({ source: assetRenditions.sourceAssetId, box: assetRenditions.box, asset: assets })
    .from(assetRenditions)
    .innerJoin(assets, eq(assets.id, assetRenditions.assetId))
    .where(inArray(assetRenditions.sourceAssetId, ids));
  const made = new Map(known.map((r) => [`${r.source} ${r.box}`, r.asset]));
  for (const [id, box] of wanted) {
    const source = rows.get(id);
    if (!source) continue;
    out.set(id, source);
    if (source.kind !== 'image' || source.mime !== 'image/png') continue;
    const key = boxKey(box);
    const existing = made.get(`${id} ${key}`);
    if (existing) {
      out.set(id, existing);
      continue;
    }
    const bytes = await readFile(assetFilePath(options, source)).catch(() => null);
    if (!bytes) continue;
    const smaller = await shrinkPng(bytes, box);
    const rendition = smaller
      ? (
          await storeAsset(db, options.storageRoot, smaller, {
            source: 'rendition',
            renditionOf: source.id,
            originalName: source.provenance.originalName,
          })
        ).asset
      : source;
    await db
      .insert(assetRenditions)
      .values({ sourceAssetId: id, box: key, assetId: rendition.id })
      .onConflictDoNothing();
    // A concurrent publish may have stored its own copy first: use whichever was recorded.
    const [recorded] = await db
      .select({ asset: assets })
      .from(assetRenditions)
      .innerJoin(assets, eq(assets.id, assetRenditions.assetId))
      .where(and(eq(assetRenditions.sourceAssetId, id), eq(assetRenditions.box, key)));
    out.set(id, recorded?.asset ?? rendition);
  }
  return out;
}
