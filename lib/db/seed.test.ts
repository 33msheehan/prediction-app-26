// @vitest-environment node
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { db } from './client';
import { DEMO_USER_EMAIL, seedDemoData } from './seed';
import { forecastVersions, forecasts, users } from './schema';

const skip = !process.env.POSTGRES_URL;

describe.skipIf(skip)('seedDemoData', () => {
  it('is idempotent and produces a runnable demo forecast with a valid headline', async () => {
    const first = await seedDemoData();
    const second = await seedDemoData();

    expect(second.user.id).toBe(first.user.id);
    expect(second.forecast.id).toBe(first.forecast.id);

    const [user] = await db.select().from(users).where(eq(users.email, DEMO_USER_EMAIL));
    expect(user).toBeDefined();

    const [forecast] = await db
      .select()
      .from(forecasts)
      .where(eq(forecasts.id, first.forecast.id));
    expect(forecast.currentVersionId).not.toBeNull();

    const [version] = await db
      .select()
      .from(forecastVersions)
      .where(eq(forecastVersions.forecastId, forecast.id));
    expect(version.headlineP).toBeGreaterThanOrEqual(0);
    expect(version.headlineP).toBeLessThanOrEqual(1);
    expect(version.trials).toBeGreaterThan(0);
  });
});
