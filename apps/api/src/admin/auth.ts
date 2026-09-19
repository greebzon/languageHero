import {
  createHash,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
  type ScryptOptions,
} from 'node:crypto';
import { and, eq, gt, isNull } from 'drizzle-orm';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Db } from '../db/client.js';
import { adminSessions, adminUsers } from '../db/schema.js';
import { AdminError } from './errors.js';

const scrypt = (password: string, salt: Buffer, keylen: number, options: ScryptOptions) =>
  new Promise<Buffer>((resolve, reject) =>
    scryptCallback(password, salt, keylen, options, (error, key) =>
      error ? reject(error) : resolve(key),
    ),
  );
const SCRYPT = { N: 2 ** 15, r: 8, p: 1, keylen: 64, maxmem: 64 * 1024 * 1024 };
export const SESSION_COOKIE = 'lh_admin';

export type AdminUser = { id: string; login: string };
declare module 'fastify' {
  interface FastifyRequest {
    admin: AdminUser | null;
  }
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const hash = await scrypt(password.normalize('NFC'), salt, SCRYPT.keylen, SCRYPT);
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [scheme, N, r, p, salt, expected] = stored.split('$');
  if (scheme !== 'scrypt' || !salt || !expected) return false;
  const expectedBytes = Buffer.from(expected, 'base64');
  const hash = await scrypt(
    password.normalize('NFC'),
    Buffer.from(salt, 'base64'),
    expectedBytes.length,
    { N: Number(N), r: Number(r), p: Number(p), maxmem: SCRYPT.maxmem },
  );
  return hash.length === expectedBytes.length && timingSafeEqual(hash, expectedBytes);
}

export const normalizeLogin = (login: string) => login.trim().toLowerCase();

export async function createAdminUser(db: Db, login: string, password: string) {
  if (password.length < 8) throw new Error('Password must be at least 8 characters');
  const [user] = await db
    .insert(adminUsers)
    .values({ login: normalizeLogin(login), passwordHash: await hashPassword(password) })
    .returning({ id: adminUsers.id, login: adminUsers.login });
  return user!;
}

const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');

export async function authenticate(db: Db, login: string, password: string) {
  const user = await db.query.adminUsers.findFirst({
    where: eq(adminUsers.login, normalizeLogin(login)),
  });
  // Always run the hash so a missing account takes as long as a wrong password.
  const ok = await verifyPassword(
    password,
    user?.passwordHash ?? (await hashPassword('x'.repeat(8))),
  );
  if (!user || !ok || user.disabledAt) return null;
  return { id: user.id, login: user.login } satisfies AdminUser;
}

export async function createSession(db: Db, userId: string, ttlHours: number) {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + ttlHours * 3600_000);
  await db.insert(adminSessions).values({ tokenHash: tokenHash(token), userId, expiresAt });
  return { token, expiresAt };
}

export async function resolveSession(db: Db, token: string): Promise<AdminUser | null> {
  const [row] = await db
    .select({ id: adminUsers.id, login: adminUsers.login, disabledAt: adminUsers.disabledAt })
    .from(adminSessions)
    .innerJoin(adminUsers, eq(adminUsers.id, adminSessions.userId))
    .where(
      and(
        eq(adminSessions.tokenHash, tokenHash(token)),
        isNull(adminSessions.revokedAt),
        gt(adminSessions.expiresAt, new Date()),
      ),
    )
    .limit(1);
  if (!row || row.disabledAt) return null;
  return { id: row.id, login: row.login };
}

export async function revokeSession(db: Db, token: string) {
  await db
    .update(adminSessions)
    .set({ revokedAt: new Date() })
    .where(eq(adminSessions.tokenHash, tokenHash(token)));
}

/** Loads the session for every admin request; routes behind `requireAdmin` reject anonymous calls. */
export function sessionLoader(db: Db) {
  return async (request: FastifyRequest) => {
    const token = request.cookies[SESSION_COOKIE];
    request.admin = token ? await resolveSession(db, token) : null;
  };
}

export async function requireAdmin(request: FastifyRequest, _reply: FastifyReply) {
  if (!request.admin) throw new AdminError(401, 'unauthorized', 'Нужно войти в панель');
}

/**
 * CSRF guard for cookie-authenticated writes: the Origin header must match the API host itself
 * (panel served by the API or through the Vite proxy) or the configured ADMIN_ORIGIN.
 */
export function originGuard(adminOrigin?: string) {
  const safe = new Set(['GET', 'HEAD', 'OPTIONS']);
  return async (request: FastifyRequest) => {
    if (safe.has(request.method)) return;
    const origin = request.headers.origin;
    const self = `${request.protocol}://${request.host}`;
    if (!origin || (origin !== self && origin !== adminOrigin))
      throw new AdminError(403, 'bad_origin', 'Запрос отклонён: недопустимый источник');
  };
}
