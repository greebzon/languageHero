import { fileURLToPath } from 'node:url';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import * as schema from './schema.js';

export type Db = NodePgDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
export { schema };

const migrationsFolder = fileURLToPath(new URL('../../drizzle/', import.meta.url));

export function createDb(url: string) {
  const pool = new pg.Pool({
    connectionString: url,
    max: 10,
    // A flood of slow requests fails fast instead of queueing every caller forever.
    connectionTimeoutMillis: 5_000,
    statement_timeout: 20_000,
    idle_in_transaction_session_timeout: 30_000,
  });
  const db = drizzle(pool, { schema });
  return {
    db,
    migrate: () => migrate(db, { migrationsFolder }),
    close: () => pool.end(),
  };
}
export type DbHandle = ReturnType<typeof createDb>;
