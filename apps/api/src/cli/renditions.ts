import { env, storageRoot } from '../env.js';
import { createDb } from '../db/client.js';
import { defaultContentRoot } from '../content.js';
import { deliveryBoxes, loadBuildInput, loadReleaseInput } from '../publishing/plan.js';
import { buildShopCatalog } from '../shop-public.js';

// Usage: pnpm admin:renditions — makes the app's smaller picture copies ahead of time (lesson
// pictures and covers of the next release, the published shop), so the first «Подготовить
// выпуск» after a deploy does not spend a minute on them. Idempotent; the deploy runs it.
if (!env.DATABASE_URL) throw new Error('DATABASE_URL is not set (see apps/api/.env.example)');
const handle = createDb(env.DATABASE_URL);
const roots = { contentRoot: defaultContentRoot, storageRoot };
try {
  const started = Date.now();
  const pictures = deliveryBoxes(await loadBuildInput(handle.db, 0)).size;
  await loadReleaseInput(handle.db, roots, 0);
  const shop = await buildShopCatalog(handle.db, roots);
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  console.log(
    `Delivery copies ready in ${seconds} s: ${pictures} release pictures, shop with ${shop.mascots.length} mascots and ${shop.items.length} items`,
  );
} finally {
  await handle.close();
}
