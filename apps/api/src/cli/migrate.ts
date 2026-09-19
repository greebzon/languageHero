import { env } from '../env.js';
import { createDb } from '../db/client.js';

if (!env.DATABASE_URL) throw new Error('DATABASE_URL is not set (see apps/api/.env.example)');
const handle = createDb(env.DATABASE_URL);
try {
  await handle.migrate();
  console.log('Migrations applied');
} finally {
  await handle.close();
}
