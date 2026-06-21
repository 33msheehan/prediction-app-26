import { eq } from 'drizzle-orm';
import type { Tree } from '@/lib/engine/tree';
import { db } from './client';
import { appendVersion, createForecast, listForecasts } from './repository';
import { forecasts, users } from './schema';

export const DEMO_USER_EMAIL = 'demo@forecast-workbench.local';
export const DEMO_FORECAST_TITLE = 'Will it rain in San Francisco tomorrow?';

const demoTree: Tree = {
  root: {
    id: 'root',
    kind: 'leaf',
    type: 'bernoulli',
    label: 'Rain tomorrow',
    children: [],
    params: { p: 0.3 },
  },
};

// Idempotent: safe to run repeatedly (e.g. on every `npm run seed`) without
// creating duplicate demo data.
export async function seedDemoData() {
  let [user] = await db.select().from(users).where(eq(users.email, DEMO_USER_EMAIL));
  if (!user) {
    [user] = await db.insert(users).values({ email: DEMO_USER_EMAIL }).returning();
  }

  const existing = (await listForecasts(user.id)).find(
    (forecast) => forecast.title === DEMO_FORECAST_TITLE,
  );
  if (existing) {
    return { user, forecast: existing };
  }

  const created = await createForecast(user.id, {
    title: DEMO_FORECAST_TITLE,
    description: 'A small sample forecast seeded for local development.',
    cadence: { kind: 'none' },
  });

  await appendVersion(user.id, created.id, { tree: demoTree, source: 'initial' });

  const [forecast] = await db.select().from(forecasts).where(eq(forecasts.id, created.id));
  return { user, forecast };
}
