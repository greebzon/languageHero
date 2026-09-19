import { hostname } from 'node:os';
import { createDb } from '../db/client.js';
import { env, storageRoot } from '../env.js';
import { generationSettings } from '../generation/factory.js';
import { runWorkerLoop } from './runner.js';

// Usage: pnpm dev:worker — one process, same database as the API, stops gracefully on Ctrl+C.
if (!env.DATABASE_URL) throw new Error('DATABASE_URL is not set (see apps/api/.env.example)');
const settings = generationSettings(env);
if (!settings.provider) throw new Error(settings.unavailableReason!);
const handle = createDb(env.DATABASE_URL);
const controller = new AbortController();
const workerId = env.WORKER_ID ?? `${hostname()}-${process.pid}`;
const log = (message: string) => console.log(`[worker ${workerId}] ${message}`);
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.once(signal, () => {
    log('stopping…');
    controller.abort();
  });
log(`provider ${settings.provider.name}, concurrency ${env.GENERATION_CONCURRENCY}`);
try {
  await runWorkerLoop(
    {
      db: handle.db,
      provider: settings.provider,
      storageRoot,
      rates: settings.rates,
      workerId,
    },
    { concurrency: env.GENERATION_CONCURRENCY, signal: controller.signal, log },
  );
} finally {
  await handle.close();
  log('stopped');
}
