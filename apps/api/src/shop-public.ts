/* Public shop catalog for the app: published mascots and items with their generated media.
   Read straight from the panel's database (so it needs one), media served from the draft
   storage by content hash. */
import type { FastifyInstance } from 'fastify';
import { readFile } from 'node:fs/promises';
import { and, eq, inArray } from 'drizzle-orm';
import { shopCatalogSchema, type ShopCatalog } from '@lingvohero/contracts';
import { assetFilePath } from './admin/routes/assets.js';
import { mascotReady } from './admin/routes/wardrobe.js';
import type { Db } from './db/client.js';
import { assets, mascots, outfitLayers, shopItems } from './db/schema.js';
import { DELIVERY, deliveryAssets, type Box } from './admin/renditions.js';

type MediaRoots = { storageRoot: string; contentRoot: string };
export type ShopPublicOptions = MediaRoots & { db: Db };
const mediaPath = (sha: string) => `/v1/shop-media/${sha}.png`;

/** Pictures go out as their delivery copies (`deliveryAssets`), never the generated originals. */
export async function buildShopCatalog(db: Db, roots: MediaRoots): Promise<ShopCatalog> {
  const ms = (await db.select().from(mascots).where(eq(mascots.published, 1))).filter(mascotReady);
  const its = (await db.select().from(shopItems).where(eq(shopItems.published, 1))).filter(
    (i) => i.iconAssetId,
  );
  const layers =
    ms.length && its.length
      ? await db
          .select()
          .from(outfitLayers)
          .where(
            and(
              inArray(
                outfitLayers.mascotId,
                ms.map((m) => m.id),
              ),
              inArray(
                outfitLayers.itemId,
                its.map((i) => i.id),
              ),
            ),
          )
      : [];
  // Body and layers are drawn over each other, so they share one box.
  const boxes = new Map<string, Box>([
    ...ms.flatMap((m) => [
      [m.bodyAssetId!, DELIVERY.body] as const,
      [m.portraitAssetId!, DELIVERY.portrait] as const,
    ]),
    ...its.map((i) => [i.iconAssetId!, DELIVERY.icon] as const),
    ...layers.map((l) => [l.assetId, DELIVERY.body] as const),
  ]);
  const delivered = await deliveryAssets(db, roots, boxes);
  const sha = new Map([...delivered].map(([id, row]) => [id, row.sha256]));
  const stamps = [...ms, ...its, ...layers].map((r) => r.updatedAt.getTime());
  const sort = <T extends { position: number; name: string }>(rows: T[]) =>
    [...rows].sort((a, b) => a.position - b.position || a.name.localeCompare(b.name, 'ru'));
  // Only complete translations reach the app; the fingerprint stays in the panel.
  const complete = <T extends Record<string, unknown>>(
    texts: Partial<Record<'en' | 'he', T>> | undefined,
    fields: string[],
  ) =>
    Object.fromEntries(
      Object.entries(texts ?? {})
        .filter(([, t]) => t && fields.every((f) => String(t[f] ?? '').trim()))
        .map(([locale, t]) => [
          locale,
          Object.fromEntries(fields.map((f) => [f, String(t![f]).trim()])),
        ]),
    );
  return shopCatalogSchema.parse({
    version: 1,
    revision: stamps.length ? Math.floor(Math.max(...stamps) / 1000) : 0,
    mascots: sort(ms).map((m) => ({
      id: m.id,
      name: m.name,
      withName: m.withName,
      unlockLevel: m.unlockLevel,
      trait: m.trait,
      perk: m.perk,
      portrait: mediaPath(sha.get(m.portraitAssetId!)!),
      body: mediaPath(sha.get(m.bodyAssetId!)!),
      slots: m.slots,
      texts: complete(m.texts, ['name', 'withName', 'trait', 'perk']),
    })),
    items: sort(its).map((i) => ({
      id: i.id,
      name: i.name,
      description: i.description,
      slot: i.slot,
      rarity: i.rarity,
      price: i.price,
      icon: mediaPath(sha.get(i.iconAssetId!)!),
      texts: complete(i.texts, ['name', 'description']),
    })),
    layers: layers.map((l) => ({
      mascotId: l.mascotId,
      itemId: l.itemId,
      path: mediaPath(sha.get(l.assetId)!),
      box: l.box,
    })),
  });
}

/* Every app start asks for the catalog: build it at most every 30 s instead of per request.
   One cache per database (tests run many); admin writes drop it at once. */
const CATALOG_TTL = 30_000;
type Cached = { at: number; catalog: Promise<ShopCatalog>; media: Promise<Set<string>> };
const caches = new WeakMap<Db, Cached>();
function cachedCatalog({ db, ...roots }: ShopPublicOptions): Cached {
  const hit = caches.get(db);
  if (hit && Date.now() - hit.at <= CATALOG_TTL) return hit;
  const catalog = buildShopCatalog(db, roots);
  // Only pictures the published catalog points at are served (not drafts or uploads).
  const media = catalog.then(
    (c) =>
      new Set(
        [
          ...c.mascots.flatMap((m) => [m.portrait, m.body]),
          ...c.items.map((i) => i.icon),
          ...c.layers.map((l) => l.path),
        ].map((path) => path.slice(path.lastIndexOf('/') + 1, -'.png'.length)),
      ),
  );
  const entry = { at: Date.now(), catalog, media };
  caches.set(db, entry);
  catalog.catch(() => caches.delete(db));
  return entry;
}
/** After a change in the panel the next request rebuilds the catalog. */
export const invalidateShopCatalog = (db: Db) => {
  caches.delete(db);
};

export async function shopPublicRoutes(app: FastifyInstance, o: ShopPublicOptions) {
  app.get('/v1/shop', async (_request, reply) => {
    reply.header('Access-Control-Allow-Origin', '*').header('Cache-Control', 'public, max-age=60');
    return cachedCatalog(o).catalog;
  });
  app.get<{ Params: { file: string } }>('/v1/shop-media/:file', async (request, reply) => {
    const match = /^([a-f0-9]{64})\.png$/.exec(request.params.file);
    const published = match && (await cachedCatalog(o).media).has(match[1]!);
    const row = published
      ? await o.db.query.assets.findFirst({ where: eq(assets.sha256, match[1]!) })
      : undefined;
    if (!row || row.kind !== 'image') return reply.code(404).send({ error: 'Not found' });
    const bytes = await readFile(assetFilePath(o, row)).catch(() => null);
    if (!bytes) return reply.code(404).send({ error: 'Not found' });
    return reply
      .type(row.mime)
      .header('Access-Control-Allow-Origin', '*')
      .header('Cache-Control', 'public, max-age=31536000, immutable')
      .send(bytes);
  });
}
