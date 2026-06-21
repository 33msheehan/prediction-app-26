// @vitest-environment node
import { eq } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';
import { db } from './client';
import {
  appendVersion,
  createForecast,
  ForecastNotFoundError,
  getForecast,
  listForecasts,
  resolveForecast,
  TreeValidationFailedError,
} from './repository';
import { users } from './schema';

const skip = !process.env.POSTGRES_URL;

const validTree = {
  root: {
    id: 'root',
    kind: 'leaf',
    type: 'bernoulli',
    label: 'root',
    children: [],
    params: { p: 0.5 },
  },
};

async function createTestUser() {
  const [user] = await db
    .insert(users)
    .values({ email: `t1.3-${crypto.randomUUID()}@example.com` })
    .returning();
  return user;
}

describe.skipIf(skip)('forecast repository', () => {
  const createdUserIds: string[] = [];

  afterEach(async () => {
    for (const id of createdUserIds.splice(0)) {
      await db.delete(users).where(eq(users.id, id));
    }
  });

  it('creates a forecast scoped to the user and lists only that user\'s forecasts', async () => {
    const owner = await createTestUser();
    const other = await createTestUser();
    createdUserIds.push(owner.id, other.id);

    const forecast = await createForecast(owner.id, {
      title: 'Will it rain tomorrow?',
      cadence: { kind: 'none' },
    });
    expect(forecast.userId).toBe(owner.id);

    const ownerList = await listForecasts(owner.id);
    expect(ownerList.map((f) => f.id)).toContain(forecast.id);

    const otherList = await listForecasts(other.id);
    expect(otherList.map((f) => f.id)).not.toContain(forecast.id);
  });

  it("getForecast returns null for another user's forecast (no cross-user leakage)", async () => {
    const owner = await createTestUser();
    const other = await createTestUser();
    createdUserIds.push(owner.id, other.id);

    const forecast = await createForecast(owner.id, {
      title: 'Owner-only forecast',
      cadence: { kind: 'none' },
    });

    expect(await getForecast(owner.id, forecast.id)).not.toBeNull();
    expect(await getForecast(other.id, forecast.id)).toBeNull();
  });

  it("appendVersion rejects appending to another user's forecast", async () => {
    const owner = await createTestUser();
    const other = await createTestUser();
    createdUserIds.push(owner.id, other.id);

    const forecast = await createForecast(owner.id, {
      title: 'Owner-only forecast',
      cadence: { kind: 'none' },
    });

    await expect(
      appendVersion(other.id, forecast.id, { tree: validTree, source: 'initial' }),
    ).rejects.toThrow(ForecastNotFoundError);
  });

  it('appendVersion persists a version with the computed headline and bumps currentVersionId', async () => {
    const owner = await createTestUser();
    createdUserIds.push(owner.id);

    const forecast = await createForecast(owner.id, {
      title: 'Coin flip',
      cadence: { kind: 'none' },
    });

    const version = await appendVersion(owner.id, forecast.id, {
      tree: validTree,
      source: 'initial',
      trials: 5_000,
    });

    expect(version.headlineP).toBeGreaterThan(0.4);
    expect(version.headlineP).toBeLessThan(0.6);
    expect(version.versionNo).toBe(1);

    const reloaded = await getForecast(owner.id, forecast.id);
    expect(reloaded?.currentVersionId).toBe(version.id);
  });

  it('appendVersion rejects a malformed tree without persisting anything', async () => {
    const owner = await createTestUser();
    createdUserIds.push(owner.id);

    const forecast = await createForecast(owner.id, {
      title: 'Malformed tree test',
      cadence: { kind: 'none' },
    });

    await expect(
      appendVersion(owner.id, forecast.id, {
        tree: { root: { id: 'root', kind: 'leaf', type: 'not-a-real-type' } },
        source: 'initial',
      }),
    ).rejects.toThrow(TreeValidationFailedError);
  });

  it('resolveForecast records the outcome and is scoped to the owning user', async () => {
    const owner = await createTestUser();
    const other = await createTestUser();
    createdUserIds.push(owner.id, other.id);

    const forecast = await createForecast(owner.id, {
      title: 'Resolvable forecast',
      cadence: { kind: 'none' },
    });

    await expect(
      resolveForecast(other.id, forecast.id, { outcome: true }),
    ).rejects.toThrow(ForecastNotFoundError);

    const resolved = await resolveForecast(owner.id, forecast.id, {
      outcome: true,
      notes: 'It happened',
    });
    expect(resolved.status).toBe('resolved');
    expect(resolved.resolvedOutcome).toBe(true);
  });
});
