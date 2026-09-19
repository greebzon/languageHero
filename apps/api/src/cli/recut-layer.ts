/* One-off: rebuild an outfit layer from an already generated edit (no provider call).
   Usage: tsx src/cli/recut-layer.ts <mascotId> <itemId> <editAssetId|sha256> */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { eq } from 'drizzle-orm';
import { storeAsset } from '../admin/asset-store.js';
import { createDb } from '../db/client.js';
import { assets, mascots, outfitLayers, shopItems } from '../db/schema.js';
import { env, storageRoot } from '../env.js';
import { decodePng, encodePng } from '../generation/png.js';
import { composeOutfitLayer, zoneFor } from '../generation/outfit-compose.js';

const [mascotId, itemId, editRef] = process.argv.slice(2);
if (!mascotId || !itemId || !editRef) throw new Error('usage: <mascotId> <itemId> <editAsset>');
if (!env.DATABASE_URL) throw new Error('DATABASE_URL is not set');
const handle = createDb(env.DATABASE_URL);
const { db } = handle;
try {
  const mascot = await db.query.mascots.findFirst({ where: eq(mascots.id, mascotId) });
  const item = await db.query.shopItems.findFirst({ where: eq(shopItems.id, itemId) });
  if (!mascot?.bodyAssetId || !mascot.slots || !item) throw new Error('mascot/item not ready');
  const bodyRow = await db.query.assets.findFirst({ where: eq(assets.id, mascot.bodyAssetId) });
  const editRow = await db.query.assets.findFirst({
    where: /^[0-9a-f]{64}$/.test(editRef) ? eq(assets.sha256, editRef) : eq(assets.id, editRef),
  });
  if (!bodyRow || !editRow) throw new Error('asset not found');
  const file = (row: { sha256: string; mime: string }) =>
    resolve(storageRoot, `${row.sha256}.${row.mime === 'image/png' ? 'png' : 'wav'}`);
  const body = decodePng(await readFile(file(bodyRow)));
  const edit = decodePng(await readFile(file(editRow)));
  const iconRow = item.iconAssetId
    ? await db.query.assets.findFirst({ where: eq(assets.id, item.iconAssetId) })
    : undefined;
  const icon = iconRow ? decodePng(await readFile(file(iconRow))) : undefined;
  const zone = zoneFor(mascot.slots, item.slot);
  const box = { x: zone.x, y: zone.y, w: zone.w, h: zone.h };
  const outcome = composeOutfitLayer(
    body,
    edit,
    item.slot,
    zone,
    undefined,
    mascot.slots.eyes.y + mascot.slots.eyes.h,
    icon,
  );
  if (!outcome.ok) throw new Error(`rejected: ${outcome.reason}`);
  const { asset } = await storeAsset(
    db,
    storageRoot,
    encodePng(outcome.layer),
    editRow.provenance,
    { altText: `${mascot.name} в «${item.name}»`, generationTaskId: editRow.generationTaskId },
  );
  await db
    .insert(outfitLayers)
    .values({ mascotId, itemId, assetId: asset.id, box, taskId: editRow.generationTaskId })
    .onConflictDoUpdate({
      target: [outfitLayers.mascotId, outfitLayers.itemId],
      set: { assetId: asset.id, box, taskId: editRow.generationTaskId, updatedAt: new Date() },
    });
  console.log(
    `layer ${asset.id} drift=${outcome.drift.toFixed(1)} scale=${outcome.alignment.scale.toFixed(3)}`,
  );
} finally {
  await handle.close();
}
