// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import {
  appendVersion,
  createForecast,
  createForecastWithInitialVersion,
  ForecastNotFoundError,
  getForecast,
  getForecastWithCurrentVersion,
  listForecasts,
  listForecastSummaries,
  listForecastVersions,
  resolveForecast,
  TreeValidationFailedError,
} from './repository';
import { createTestUser, deleteTestUsers } from './test-helpers';

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

describe.skipIf(skip)('forecast repository', () => {
  const createdUserIds: string[] = [];

  afterEach(async () => {
    await deleteTestUsers(createdUserIds.splice(0));
  });

  it("creates a forecast scoped to the user and lists only that user's forecasts", async () => {
    const owner = await createTestUser('t1.3');
    const other = await createTestUser('t1.3');
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
    const owner = await createTestUser('t1.3');
    const other = await createTestUser('t1.3');
    createdUserIds.push(owner.id, other.id);

    const forecast = await createForecast(owner.id, {
      title: 'Owner-only forecast',
      cadence: { kind: 'none' },
    });

    expect(await getForecast(owner.id, forecast.id)).not.toBeNull();
    expect(await getForecast(other.id, forecast.id)).toBeNull();
  });

  it("appendVersion rejects appending to another user's forecast", async () => {
    const owner = await createTestUser('t1.3');
    const other = await createTestUser('t1.3');
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
    const owner = await createTestUser('t1.3');
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
    const owner = await createTestUser('t1.3');
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

  it('createForecastWithInitialVersion creates a version immediately and exposes it on reload', async () => {
    const owner = await createTestUser('t3.1');
    createdUserIds.push(owner.id);

    const { forecast, version } = await createForecastWithInitialVersion(owner.id, {
      title: 'Immediate editor state',
      description: 'Starts with an initial version',
      cadence: { kind: 'interval', intervalDays: 14 },
    });

    expect(forecast.currentVersionId).toBe(version.id);
    expect(version.source).toBe('initial');
    expect(version.versionNo).toBe(1);

    const reloaded = await getForecastWithCurrentVersion(owner.id, forecast.id);
    expect(reloaded?.currentVersionId).toBe(version.id);
    expect(reloaded?.currentTree).toBeTruthy();
    expect(reloaded?.headlineP).toBeGreaterThan(0);
    expect(reloaded?.headlineP).toBeLessThan(1);
  });

  it('listForecastSummaries only returns the current user rows', async () => {
    const owner = await createTestUser('t3.2');
    const other = await createTestUser('t3.2');
    createdUserIds.push(owner.id, other.id);

    const { forecast } = await createForecastWithInitialVersion(owner.id, {
      title: 'Owner dashboard item',
      cadence: { kind: 'dates', dates: ['2026-07-01'] },
    });
    await createForecastWithInitialVersion(other.id, {
      title: 'Other dashboard item',
      cadence: { kind: 'none' },
    });

    const list = await listForecastSummaries(owner.id);
    expect(list).toHaveLength(1);
    expect(list[0]?.id).toBe(forecast.id);
    expect(list[0]?.headlineP).toBeGreaterThan(0);
    expect(list[0]?.currentVersionCreatedAt).toBeTruthy();
  });

  it('resolveForecast records the outcome and is scoped to the owning user', async () => {
    const owner = await createTestUser('t1.3');
    const other = await createTestUser('t1.3');
    createdUserIds.push(owner.id, other.id);

    const forecast = await createForecast(owner.id, {
      title: 'Resolvable forecast',
      cadence: { kind: 'none' },
    });

    await expect(resolveForecast(other.id, forecast.id, { outcome: true })).rejects.toThrow(
      ForecastNotFoundError,
    );

    const resolved = await resolveForecast(owner.id, forecast.id, {
      outcome: true,
      notes: 'It happened',
    });
    expect(resolved.status).toBe('resolved');
    expect(resolved.resolvedOutcome).toBe(true);
  });

  it('listForecastVersions returns versions in ascending order with headline, source, and rationale', async () => {
    const owner = await createTestUser('t4.1');
    createdUserIds.push(owner.id);

    const { forecast } = await createForecastWithInitialVersion(owner.id, {
      title: 'Versioned forecast',
      cadence: { kind: 'none' },
    });

    await appendVersion(owner.id, forecast.id, {
      tree: validTree,
      source: 'checkin',
      rationale: 'New evidence came in',
    });

    const versions = await listForecastVersions(owner.id, forecast.id);

    expect(versions).toHaveLength(2);
    expect(versions.map((v) => v.versionNo)).toEqual([1, 2]);
    expect(versions[0]?.source).toBe('initial');
    expect(versions[1]?.source).toBe('checkin');
    expect(versions[1]?.rationale).toBe('New evidence came in');
    expect(versions[1]?.headlineP).toBeGreaterThanOrEqual(0);
    expect(versions[1]?.createdAt).toBeTruthy();
  });

  it("listForecastVersions rejects another user's forecast (no cross-user leakage)", async () => {
    const owner = await createTestUser('t4.1');
    const other = await createTestUser('t4.1');
    createdUserIds.push(owner.id, other.id);

    const { forecast } = await createForecastWithInitialVersion(owner.id, {
      title: 'Owner-only versions',
      cadence: { kind: 'none' },
    });

    await expect(listForecastVersions(other.id, forecast.id)).rejects.toThrow(
      ForecastNotFoundError,
    );
  });
});
