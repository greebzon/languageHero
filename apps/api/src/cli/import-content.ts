import { env } from '../env.js';
import { createDb } from '../db/client.js';
import { defaultContentRoot } from '../content.js';
import { importPublishedContent } from '../admin/import.js';

// Usage: pnpm admin:import — reads content/store (the published catalog), not seed.json.
if (!env.DATABASE_URL) throw new Error('DATABASE_URL is not set (see apps/api/.env.example)');
const handle = createDb(env.DATABASE_URL);
try {
  const report = await importPublishedContent(handle.db, defaultContentRoot);
  console.log(`Imported catalog revision ${report.revision}`);
  for (const key of ['languages', 'courses', 'lessons', 'assets'] as const)
    console.log(`  ${key}: created ${report.created[key]}, kept ${report.skipped[key]}`);
} finally {
  await handle.close();
}
