import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  bindsPublicly,
  env,
  isProduction,
  productionProblems,
  storageRoot,
  trustProxy,
} from './env.js';
import { buildApp } from './app.js';
import { createDb } from './db/client.js';
import { generationSettings } from './generation/factory.js';
import { createMailer } from './account/mail.js';
import { resolve } from 'node:path';

// A deployment must be safe by configuration, not by luck: refuse to start otherwise.
const problems = productionProblems(env);
if (isProduction && problems.length)
  throw new Error(`Unsafe production configuration:\n- ${problems.join('\n- ')}`);
const handle = env.DATABASE_URL ? createDb(env.DATABASE_URL) : null;
const adminDist = fileURLToPath(new URL('../../admin/dist/', import.meta.url));
const app = buildApp({
  trustProxy,
  hsts: isProduction,
  account:
    handle && env.ACCOUNT_SECRET
      ? {
          db: handle.db,
          secret: env.ACCOUNT_SECRET,
          origins: env.ACCOUNT_ORIGINS.split(',').map((s) => s.trim()),
          secure: env.ACCOUNT_COOKIE_SECURE,
          sessionDays: env.ACCOUNT_SESSION_DAYS,
          levelStep: env.ACCOUNT_LEVEL_STEP,
          mailer: createMailer({
            mode: env.ACCOUNT_MAIL_MODE,
            directory: resolve(
              fileURLToPath(new URL('../', import.meta.url)),
              env.ACCOUNT_MAIL_DIRECTORY,
            ),
            host: env.SMTP_HOST,
            port: env.SMTP_PORT,
            secure: env.SMTP_SECURE,
            user: env.SMTP_USER,
            password: env.SMTP_PASSWORD,
            from: env.SMTP_FROM,
          }),
        }
      : undefined,
  admin: handle
    ? {
        db: handle.db,
        storageRoot,
        cookieSecure: env.ADMIN_COOKIE_SECURE,
        sessionTtlHours: env.ADMIN_SESSION_TTL_HOURS,
        adminOrigin: env.ADMIN_ORIGIN,
        generation: generationSettings(env),
      }
    : undefined,
  adminDist: handle && existsSync(adminDist) ? adminDist : undefined,
});
if (bindsPublicly && !isProduction && problems.length)
  app.log.warn(
    `HOST=${env.HOST} is reachable from the network but NODE_ENV is not production: ${problems.join('; ')}`,
  );
if (handle) app.addHook('onClose', () => handle.close());
else app.log.warn('DATABASE_URL is not set: admin panel routes are disabled');
if (!env.ACCOUNT_SECRET)
  app.log.warn('ACCOUNT_SECRET is not set: learner account routes are disabled');
else if (env.ACCOUNT_MAIL_MODE === 'disabled')
  app.log.warn('Account mail is disabled: configure SMTP in apps/api/.env');
try {
  await app.listen({ host: env.HOST, port: env.PORT });
} catch (error) {
  app.log.error(error);
  process.exitCode = 1;
}
// An unexpected failure ends the process; the service manager (systemd) starts it again.
process.on('unhandledRejection', (reason) => {
  app.log.fatal({ err: reason }, 'Unhandled rejection');
  process.exit(1);
});
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void app.close();
  });
}
