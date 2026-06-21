// @vitest-environment node
import { eq } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';
import { db } from './client';
import { forecasts, forecastVersions, users } from './schema';

// Real integration tests against Postgres — needs POSTGRES_URL (set once
// T0.2's Vercel/Neon provisioning is done, and the T1.2 migration applied).
// Skips until then so the suite stays green without faking a pass.
const skip = !process.env.POSTGRES_URL;

describe.skipIf(skip)('forecasts schema', () => {
  const createdUserIds: string[] = [];

  afterEach(async () => {
    for (const id of createdUserIds.splice(0)) {
      await db.delete(users).where(eq(users.id, id));
    }
  });

  it('inserts user -> forecast -> version and reads them back', async () => {
    const [user] = await db
      .insert(users)
      .values({ email: `t1.2-${crypto.randomUUID()}@example.com` })
      .returning();
    createdUserIds.push(user.id);

    const [forecast] = await db
      .insert(forecasts)
      .values({ userId: user.id, title: 'Will it rain tomorrow?' })
      .returning();

    const [version] = await db
      .insert(forecastVersions)
      .values({
        forecastId: forecast.id,
        versionNo: 1,
        tree: { root: { id: 'root', kind: 'leaf', type: 'bernoulli', label: 'r', children: [], params: { p: 0.5 } } },
        headlineP: 0.5,
        headlineSE: 0.01,
        trials: 10_000,
        source: 'initial',
      })
      .returning();

    await db
      .update(forecasts)
      .set({ currentVersionId: version.id })
      .where(eq(forecasts.id, forecast.id));

    const [reloaded] = await db.select().from(forecasts).where(eq(forecasts.id, forecast.id));
    expect(reloaded.currentVersionId).toBe(version.id);
    expect(reloaded.userId).toBe(user.id);
  });

  it('rejects a forecast with a non-existent userId (FK violation)', async () => {
    await expect(
      db.insert(forecasts).values({ userId: crypto.randomUUID(), title: 'Orphan' }),
    ).rejects.toThrow();
  });

  it('enforces versionNo uniqueness per forecast', async () => {
    const [user] = await db
      .insert(users)
      .values({ email: `t1.2-${crypto.randomUUID()}@example.com` })
      .returning();
    createdUserIds.push(user.id);

    const [forecast] = await db
      .insert(forecasts)
      .values({ userId: user.id, title: 'Duplicate version test' })
      .returning();

    const versionInput = {
      forecastId: forecast.id,
      versionNo: 1,
      tree: { root: { id: 'root', kind: 'leaf', type: 'bernoulli', label: 'r', children: [], params: { p: 0.5 } } },
      headlineP: 0.5,
      headlineSE: 0.01,
      trials: 10_000,
      source: 'initial',
    };

    await db.insert(forecastVersions).values(versionInput);
    await expect(db.insert(forecastVersions).values(versionInput)).rejects.toThrow();
  });
});
