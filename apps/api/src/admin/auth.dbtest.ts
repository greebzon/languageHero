import test from 'node:test';
import assert from 'node:assert/strict';
import { eq } from 'drizzle-orm';
import { adminSessions } from '../db/schema.js';
import { SESSION_COOKIE, hashPassword, verifyPassword } from './auth.js';
import { createTestContext, sameOrigin } from './testing.js';

test('password hashes verify and never match another password', async () => {
  const stored = await hashPassword('correct horse battery');
  assert.ok(stored.startsWith('scrypt$'));
  assert.equal(await verifyPassword('correct horse battery', stored), true);
  assert.equal(await verifyPassword('wrong', stored), false);
  assert.equal(await verifyPassword('x', 'garbage'), false);
});

test('login, session cookie, logout and expiry', async (t) => {
  const ctx = await createTestContext(t);
  if (!ctx) return;
  const { app, db, headers, login } = ctx;
  const me = await app.inject({ url: '/v1/admin/auth/me', headers });
  assert.equal(me.statusCode, 200);
  assert.equal(me.json().user.login, 'admin');
  assert.equal(me.headers['access-control-allow-origin'], undefined);
  assert.equal(
    (await app.inject('/v1/catalog?schemaVersion=2')).headers['access-control-allow-origin'],
    '*',
  );

  const anonymous = await app.inject('/v1/admin/auth/me');
  assert.equal(anonymous.statusCode, 401);
  assert.equal(anonymous.json().code, 'unauthorized');
  assert.ok(anonymous.json().requestId);

  const wrong = await login({ login: 'admin', password: 'nope' });
  assert.equal(wrong.response.statusCode, 401);
  assert.equal(wrong.response.json().code, 'invalid_credentials');
  // A missing account and a wrong password are indistinguishable.
  const missing = await login({ login: 'nobody', password: 'nope' });
  assert.equal(missing.response.statusCode, 401);
  assert.equal(missing.response.json().code, wrong.response.json().code);
  assert.equal(missing.response.json().message, wrong.response.json().message);
  assert.equal(wrong.cookie, '');

  const crossOrigin = await app.inject({
    method: 'POST',
    url: '/v1/admin/auth/login',
    headers: { ...sameOrigin, origin: 'http://evil.example' },
    payload: { login: 'admin', password: 'correct horse battery' },
  });
  assert.equal(crossOrigin.statusCode, 403);
  assert.equal(crossOrigin.json().code, 'bad_origin');
  const noOrigin = await app.inject({
    method: 'POST',
    url: '/v1/admin/auth/logout',
    headers: { cookie: headers.cookie },
  });
  assert.equal(noOrigin.statusCode, 403);

  assert.equal(
    (await app.inject({ method: 'POST', url: '/v1/admin/auth/logout', headers })).statusCode,
    204,
  );
  assert.equal((await app.inject({ url: '/v1/admin/auth/me', headers })).statusCode, 401);

  const expired = await login();
  const token = expired.cookie.slice(SESSION_COOKIE.length + 1);
  const { createHash } = await import('node:crypto');
  await db
    .update(adminSessions)
    .set({ expiresAt: new Date(Date.now() - 1000) })
    .where(eq(adminSessions.tokenHash, createHash('sha256').update(token).digest('hex')));
  assert.equal(
    (await app.inject({ url: '/v1/admin/auth/me', headers: { cookie: expired.cookie } }))
      .statusCode,
    401,
  );

  const notFound = await app.inject({ url: '/v1/admin/nothing', headers });
  assert.equal(notFound.statusCode, 404);
  assert.equal(notFound.json().code, 'not_found');
});

test('login is rate limited per client', async (t) => {
  const ctx = await createTestContext(t);
  if (!ctx) return;
  let last = 0;
  for (let i = 0; i < 12; i += 1) {
    const { response } = await ctx.login({ login: 'admin', password: 'nope' });
    last = response.statusCode;
  }
  assert.equal(last, 429);
});
