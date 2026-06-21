import { defineConfig } from 'drizzle-kit';
import 'dotenv/config';

// Schema lives in lib/db/schema.ts (added in T1.2). Pointing at it now keeps
// the migration workflow ready; drizzle-kit tolerates an as-yet-empty schema.
export default defineConfig({
  schema: './lib/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.POSTGRES_URL ?? process.env.DATABASE_URL ?? '',
  },
  strict: true,
  verbose: true,
});
