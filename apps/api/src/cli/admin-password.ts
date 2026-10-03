import { createInterface } from 'node:readline/promises';
import { and, eq, isNull } from 'drizzle-orm';
import { env } from '../env.js';
import { createDb } from '../db/client.js';
import { adminSessions, adminUsers } from '../db/schema.js';
import { audit } from '../admin/audit.js';
import { hashPassword, normalizeLogin } from '../admin/auth.js';

// Usage: pnpm admin:password <login>
// Sets a new password for an existing admin and signs them out everywhere. The password is read
// from ADMIN_NEW_PASSWORD or prompted twice, never taken from argv (shell history).
const login = process.argv[2];
if (!login) throw new Error('Usage: pnpm admin:password <login>');
if (!env.DATABASE_URL) throw new Error('DATABASE_URL is not set (see apps/api/.env.example)');

async function ask(prompt: string) {
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  const muted = rl as unknown as { _writeToOutput: (text: string) => void };
  const original = muted._writeToOutput;
  process.stdout.write(prompt);
  muted._writeToOutput = () => undefined;
  try {
    return await rl.question('');
  } finally {
    muted._writeToOutput = original;
    rl.close();
    process.stdout.write('\n');
  }
}
async function readPassword() {
  if (process.env.ADMIN_NEW_PASSWORD) return process.env.ADMIN_NEW_PASSWORD;
  if (!process.stdin.isTTY) throw new Error('Set ADMIN_NEW_PASSWORD when stdin is not a TTY');
  const first = await ask('New password (min 8 chars): ');
  if ((await ask('Repeat the password: ')) !== first) throw new Error('Passwords do not match');
  return first;
}

const handle = createDb(env.DATABASE_URL);
try {
  const user = await handle.db.query.adminUsers.findFirst({
    where: eq(adminUsers.login, normalizeLogin(login)),
  });
  if (!user) throw new Error(`Admin "${normalizeLogin(login)}" does not exist`);
  const password = await readPassword();
  if (password.length < 8) throw new Error('Password must be at least 8 characters');
  const passwordHash = await hashPassword(password);
  await handle.db.transaction(async (tx) => {
    await tx
      .update(adminUsers)
      .set({ passwordHash, updatedAt: new Date() })
      .where(eq(adminUsers.id, user.id));
    // Whoever knew the old password is signed out.
    await tx
      .update(adminSessions)
      .set({ revokedAt: new Date() })
      .where(and(eq(adminSessions.userId, user.id), isNull(adminSessions.revokedAt)));
    await audit(tx, {
      actorId: null,
      entityType: 'catalog',
      entityId: 'admin-password',
      action: 'admin-password',
      payload: { login: user.login },
    });
  });
  console.log(`Password changed for "${user.login}"; its sessions are signed out`);
} finally {
  await handle.close();
}
