import { cp, mkdir, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { buildApp, type AppOptions } from '../apps/api/src/app';
import { defaultContentRoot, publishRelease } from '../apps/api/src/content';
import { releaseSchema } from '../packages/contracts/src';
import seed from '../content/seed.json' with { type: 'json' };
import { env } from '../apps/api/src/env';
import { createDb } from '../apps/api/src/db/client';
import { createAdminUser } from '../apps/api/src/admin/auth';
import { importPublishedContent } from '../apps/api/src/admin/import';
import { createTestDatabase } from '../apps/api/src/admin/testing';
import { generationSettings } from '../apps/api/src/generation/factory';
import { runWorkerLoop } from '../apps/api/src/worker/runner';
import { createMailer } from '../apps/api/src/account/mail';

export const E2E_ADMIN = {
  login: 'admin',
  password: process.env.E2E_ADMIN_PASSWORD ?? 'e2e-admin-pass',
};

async function main() {
  const cache = resolve('.cache');
  const contentRoot = resolve(cache, 'e2e-content');
  const storageRoot = resolve(cache, 'e2e-drafts');
  for (const dir of [contentRoot, storageRoot])
    if (dirname(dir) !== cache) throw new Error('Unexpected test directory');
  await mkdir(cache, { recursive: true });
  await rm(contentRoot, { recursive: true, force: true });
  await rm(storageRoot, { recursive: true, force: true });
  await mkdir(contentRoot, { recursive: true });
  await cp(resolve(defaultContentRoot, 'media'), resolve(contentRoot, 'media'), {
    recursive: true,
  });
  await publishRelease(releaseSchema.parse(seed), contentRoot);

  // With a test database the admin panel is available too (tests/e2e/panel.spec.ts).
  let admin: AppOptions['admin'];
  let account: AppOptions['account'];
  let cleanup = async () => {};
  if (env.DATABASE_URL_TEST) {
    const database = await createTestDatabase(env.DATABASE_URL_TEST, 'lingvohero_e2e');
    const handle = createDb(database.url);
    await handle.migrate();
    await importPublishedContent(handle.db, contentRoot);
    await createAdminUser(handle.db, E2E_ADMIN.login, E2E_ADMIN.password);
    // The fake provider needs no key; the worker runs inline so the e2e suite is one process.
    const generation = generationSettings({ ...env, GENERATION_PROVIDER: 'fake' });
    admin = { db: handle.db, storageRoot, cookieSecure: false, sessionTtlHours: 1, generation };
    account = {
      db: handle.db,
      secret: 'e2e-secret-used-only-in-isolated-test-database',
      origins: ['http://localhost:8082'],
      secure: false,
      sessionDays: 30,
      levelStep: 300,
      // Playwright pins the browser clock to this moment (course.spec); quests count «сегодня»
      // on the server, so it must agree.
      clock: () => new Date(2026, 8, 18, 12, 0, 0),
      mailer: createMailer({
        mode: 'file',
        directory: resolve(cache, 'e2e-mail'),
        port: 587,
        secure: false,
      }),
    };
    const controller = new AbortController();
    const worker = runWorkerLoop(
      {
        db: handle.db,
        provider: generation.provider!,
        storageRoot,
        rates: generation.rates,
        workerId: 'e2e-worker',
      },
      { concurrency: 3, pollMs: 300, signal: controller.signal },
    );
    cleanup = async () => {
      controller.abort();
      await worker;
      await handle.close();
      await database.drop();
    };
  } else console.warn('DATABASE_URL_TEST is not set: admin e2e tests will be skipped');

  const app = buildApp({ contentRoot, admin, account });
  await app.listen({ host: '127.0.0.1', port: 3002 });
  for (const signal of ['SIGINT', 'SIGTERM'] as const)
    process.once(signal, () => {
      void app.close().then(cleanup);
    });
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
