import { randomBytes } from 'node:crypto';
import { cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import type { TestContext } from 'node:test';
import pg from 'pg';
import { releaseSchema } from '@lingvohero/contracts';
import seed from '../../../../content/seed.json' with { type: 'json' };
import { buildApp } from '../app.js';
import { defaultContentRoot, publishRelease } from '../content.js';
import { createDb } from '../db/client.js';
import { env } from '../env.js';
import { FakeProvider } from '../generation/fake-provider.js';
import type { GenerationSettings } from '../generation/factory.js';
import { SESSION_COOKIE, createAdminUser } from './auth.js';
import type { AccountMail } from '../account/mail.js';

export const TEST_ADMIN = { login: 'admin', password: 'correct horse battery' };
/** Simulates a browser on the API's own origin (what the Vite proxy / static panel produce). */
export const sameOrigin = { host: 'admin.test', origin: 'http://admin.test' };

/**
 * Creates a throwaway database next to the one in `url` (generated migrations reference
 * `"public"."table"`, so schema-level isolation is not possible) and returns its URL plus a drop.
 */
export async function createTestDatabase(
  url: string,
  name = `test_${randomBytes(6).toString('hex')}`,
) {
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(name)) throw new Error('Invalid database name');
  const admin = new pg.Client({ connectionString: url });
  await admin.connect();
  // A fixed name (e2e) may survive a killed run; start clean.
  await admin.query(`drop database if exists "${name}" with (force)`);
  await admin.query(`create database "${name}"`);
  await admin.end();
  const testUrl = new URL(url);
  testUrl.pathname = `/${name}`;
  return {
    url: testUrl.toString(),
    async drop() {
      const client = new pg.Client({ connectionString: url });
      await client.connect();
      await client.query(`drop database if exists "${name}" with (force)`);
      await client.end();
    },
  };
}

/**
 * A fresh database, a temp content store seeded from `content/seed.json`, a temp draft storage
 * and an app with the admin plugin. Skips the test when DATABASE_URL_TEST is unset.
 */
export async function createTestContext(t: TestContext) {
  if (!env.DATABASE_URL_TEST) {
    t.skip('DATABASE_URL_TEST is not set');
    return null;
  }
  const database = await createTestDatabase(env.DATABASE_URL_TEST);
  const handle = createDb(database.url);
  await handle.migrate();
  const contentRoot = await mkdtemp(join(tmpdir(), 'lingvo-content-'));
  const storageRoot = await mkdtemp(join(tmpdir(), 'lingvo-drafts-'));
  await cp(join(defaultContentRoot, 'media'), join(contentRoot, 'media'), { recursive: true });
  await publishRelease(releaseSchema.parse(seed), contentRoot);
  const provider = new FakeProvider();
  const generation: GenerationSettings = {
    provider,
    unavailableReason: null,
    modelConfig: { text: 'fake', image: 'fake', imageQuality: 'low', tts: 'fake', voice: 'fake' },
    rates: { imageUsd: 0.04, ttsPer1kCharsUsd: 0.015, textPer1kTokensUsd: 0.01 },
    limits: {
      minExercises: 6,
      maxExercises: 60,
      lessonSize: 6,
      maxPerLesson: 30,
      wordsPerLesson: 4,
      maxWords: 40,
    },
    costLimitUsd: 5,
  };
  const mails: AccountMail[] = [];
  const app = buildApp({
    contentRoot,
    account: {
      db: handle.db,
      secret: 'test-account-secret-not-for-real-accounts',
      origins: ['http://localhost:8082'],
      secure: false,
      sessionDays: 30,
      levelStep: 300,
      mailer: async (mail) => {
        mails.push(mail);
      },
    },
    admin: { db: handle.db, storageRoot, cookieSecure: false, sessionTtlHours: 1, generation },
  });
  await app.ready();
  const user = await createAdminUser(handle.db, TEST_ADMIN.login, TEST_ADMIN.password);
  t.after(async () => {
    await app.close();
    await handle.close();
    await database.drop();
    for (const dir of [contentRoot, storageRoot]) {
      if (dirname(resolve(dir)) !== resolve(tmpdir())) throw new Error('Unexpected test directory');
      await rm(dir, { recursive: true, force: true });
    }
  });
  async function login(credentials = TEST_ADMIN) {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/admin/auth/login',
      headers: sameOrigin,
      payload: credentials,
    });
    const cookie = response.cookies.find((c) => c.name === SESSION_COOKIE);
    return { response, cookie: cookie ? `${SESSION_COOKIE}=${cookie.value}` : '' };
  }
  const { cookie } = await login();
  /** Headers for an authenticated same-origin request. */
  const headers = { ...sameOrigin, cookie };
  return {
    app,
    db: handle.db,
    contentRoot,
    storageRoot,
    user,
    login,
    headers,
    provider,
    generation,
    mails,
  };
}
