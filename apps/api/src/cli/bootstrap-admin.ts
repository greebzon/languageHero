import { createInterface } from 'node:readline/promises';
import { eq } from 'drizzle-orm';
import { env } from '../env.js';
import { createDb } from '../db/client.js';
import { adminUsers } from '../db/schema.js';
import { audit } from '../admin/audit.js';
import { createAdminUser, normalizeLogin } from '../admin/auth.js';

// Usage: pnpm admin:bootstrap <login>
// The password is read from ADMIN_BOOTSTRAP_PASSWORD or prompted, never taken from argv
// (shell history) and never stored anywhere but as a scrypt hash.
const login = process.argv[2];
if (!login) throw new Error('Usage: pnpm admin:bootstrap <login>');
if (!env.DATABASE_URL) throw new Error('DATABASE_URL is not set (see apps/api/.env.example)');

async function readPassword() {
  if (process.env.ADMIN_BOOTSTRAP_PASSWORD) return process.env.ADMIN_BOOTSTRAP_PASSWORD;
  if (!process.stdin.isTTY) throw new Error('Set ADMIN_BOOTSTRAP_PASSWORD when stdin is not a TTY');
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  const muted = rl as unknown as { _writeToOutput: (text: string) => void };
  const original = muted._writeToOutput;
  process.stdout.write('Password (min 8 chars): ');
  muted._writeToOutput = () => undefined;
  try {
    return await rl.question('');
  } finally {
    muted._writeToOutput = original;
    rl.close();
    process.stdout.write('\n');
  }
}

const handle = createDb(env.DATABASE_URL);
try {
  const existing = await handle.db.query.adminUsers.findFirst({
    where: eq(adminUsers.login, normalizeLogin(login)),
  });
  if (existing) throw new Error(`Admin "${normalizeLogin(login)}" already exists`);
  const user = await createAdminUser(handle.db, login, await readPassword());
  await audit(handle.db, {
    actorId: null,
    entityType: 'catalog',
    entityId: 'bootstrap',
    action: 'bootstrap-admin',
    payload: { login: user.login },
  });
  console.log(`Created admin "${user.login}"`);
} finally {
  await handle.close();
}
