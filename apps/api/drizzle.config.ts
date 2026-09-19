import { defineConfig } from 'drizzle-kit';

// Only `generate` is used (no DB connection needed); migrations are applied by `pnpm db:migrate`.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
});
