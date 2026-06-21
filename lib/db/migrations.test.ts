// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { sql } from '@vercel/postgres';

// Verifies the migration workflow's acceptance criterion: applying migrations
// is idempotent. Run `npm run db:migrate` at least once before this (CI does
// this as a setup step once T0.4 exists); skips locally without a DB so the
// suite stays green.
describe('drizzle migrations', () => {
  it.skipIf(!process.env.POSTGRES_URL)(
    'records exactly one entry for the initial migration',
    async () => {
      const { rows } = await sql`select hash from drizzle.__drizzle_migrations`;
      expect(rows.length).toBe(1);
    },
  );
});
