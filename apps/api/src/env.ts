import { config } from 'dotenv';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const apiRoot = fileURLToPath(new URL('../', import.meta.url));
// CLIs run from the workspace root, so the API's own .env is loaded explicitly.
config({ path: resolve(apiRoot, '.env'), quiet: true });

const blank = (value: unknown) => (value === '' ? undefined : value);
export const env = z
  .object({
    HOST: z.string().default('127.0.0.1'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3001),
    ACCOUNT_SECRET: z.preprocess(blank, z.string().min(32).optional()),
    ACCOUNT_ORIGINS: z.string().default('http://localhost:8081,http://127.0.0.1:8081'),
    ACCOUNT_SESSION_DAYS: z.coerce.number().int().min(1).max(90).default(30),
    ACCOUNT_LEVEL_STEP: z.coerce.number().int().min(100).default(300),
    ACCOUNT_COOKIE_SECURE: z
      .enum(['true', 'false'])
      .default('false')
      .transform((v) => v === 'true'),
    ACCOUNT_MAIL_MODE: z.enum(['disabled', 'smtp', 'file']).default('disabled'),
    ACCOUNT_MAIL_DIRECTORY: z.string().default('../../.data/account-mail'),
    SMTP_HOST: z.preprocess(blank, z.string().optional()),
    SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
    SMTP_SECURE: z
      .enum(['true', 'false'])
      .default('false')
      .transform((v) => v === 'true'),
    SMTP_USER: z.preprocess(blank, z.string().optional()),
    SMTP_PASSWORD: z.preprocess(blank, z.string().optional()),
    SMTP_FROM: z.preprocess(blank, z.string().optional()),
    DATABASE_URL: z.preprocess(blank, z.string().url().optional()),
    DATABASE_URL_TEST: z.preprocess(blank, z.string().url().optional()),
    ADMIN_STORAGE_ROOT: z.string().default('../../.data/drafts'),
    ADMIN_SESSION_TTL_HOURS: z.coerce
      .number()
      .int()
      .min(1)
      .max(24 * 90)
      .default(72),
    ADMIN_COOKIE_SECURE: z
      .preprocess(blank, z.enum(['true', 'false']).default('false'))
      .transform((v) => v === 'true'),
    ADMIN_ORIGIN: z.preprocess(blank, z.string().url().optional()),
    // Generation (stages C–D). `fake` needs no key and is what the automated tests use.
    GENERATION_PROVIDER: z.preprocess(blank, z.enum(['openai', 'fake']).default('openai')),
    OPENAI_API_KEY: z.preprocess(blank, z.string().optional()),
    OPENAI_TEXT_MODEL: z.preprocess(blank, z.string().default('gpt-5.6-terra')),
    OPENAI_IMAGE_MODEL: z.preprocess(blank, z.string().default('gpt-image-2.5-flare')),
    /* Image edits (mascot bodies, outfit layers); empty = the same model as OPENAI_IMAGE_MODEL. */
    OPENAI_EDIT_MODEL: z.preprocess(blank, z.string().optional()),
    OPENAI_IMAGE_QUALITY: z.preprocess(blank, z.enum(['low', 'medium', 'high']).default('low')),
    OPENAI_TTS_MODEL: z.preprocess(blank, z.string().default('gpt-4o-mini-tts')),
    OPENAI_TTS_VOICE: z.preprocess(blank, z.string().default('coral')),
    GENERATION_CONCURRENCY: z.coerce.number().int().min(1).max(8).default(3),
    GENERATION_MAX_EXERCISES: z.coerce.number().int().min(6).max(60).default(60),
    GENERATION_LESSON_SIZE: z.coerce.number().int().min(3).max(30).default(6),
    GENERATION_WORDS_PER_LESSON: z.coerce.number().int().min(1).max(10).default(4),
    GENERATION_COST_LIMIT_USD: z.coerce.number().min(0.1).default(5),
    OPENAI_IMAGE_COST_USD: z.coerce.number().min(0).default(0.04),
    OPENAI_TTS_COST_PER_1K_CHARS_USD: z.coerce.number().min(0).default(0.015),
    OPENAI_TEXT_COST_PER_1K_TOKENS_USD: z.coerce.number().min(0).default(0.01),
    WORKER_ID: z.preprocess(blank, z.string().max(80).optional()),
  })
  .parse(process.env);

export const storageRoot = resolve(apiRoot, env.ADMIN_STORAGE_ROOT);
