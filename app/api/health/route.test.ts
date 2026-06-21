// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { GET } from './route';

// Real integration test against a Postgres connection — needs POSTGRES_URL
// (set once T0.2's Vercel/Neon provisioning is done). Skips until then so
// the suite stays green without faking a pass.
describe('/api/health', () => {
  it.skipIf(!process.env.POSTGRES_URL)('reports the database as connected', async () => {
    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: true, db: 'connected' });
  });
});
