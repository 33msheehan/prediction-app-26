import { and, desc, eq } from 'drizzle-orm';
import { runForecast } from '@/lib/engine/runner';
import { TreeSchema } from '@/lib/engine/tree';
import { buildInitialTree } from '@/lib/forecasts/defaults';
import {
  appendVersionInputSchema,
  createForecastInputSchema,
  resolveForecastInputSchema,
  type AppendVersionInput,
  type Cadence,
  type CreateForecastInput,
  type ResolveForecastInput,
} from '@/lib/validation/forecast';
import { db } from './client';
import { forecasts, forecastVersions } from './schema';

export class ForecastNotFoundError extends Error {
  constructor(forecastId: string) {
    super(`Forecast ${forecastId} not found`);
  }
}

export class TreeValidationFailedError extends Error {}

function cadenceColumns(cadence: Cadence) {
  switch (cadence.kind) {
    case 'none':
      return { cadenceKind: 'none' as const, cadenceInterval: null, cadenceDates: null };
    case 'interval':
      return {
        cadenceKind: 'interval' as const,
        cadenceInterval: cadence.intervalDays,
        cadenceDates: null,
      };
    case 'dates':
      return { cadenceKind: 'dates' as const, cadenceInterval: null, cadenceDates: cadence.dates };
  }
}

export async function listForecasts(userId: string) {
  return db
    .select()
    .from(forecasts)
    .where(eq(forecasts.userId, userId))
    .orderBy(desc(forecasts.createdAt));
}

export async function listForecastSummaries(userId: string) {
  return db
    .select({
      id: forecasts.id,
      title: forecasts.title,
      description: forecasts.description,
      status: forecasts.status,
      cadenceKind: forecasts.cadenceKind,
      cadenceInterval: forecasts.cadenceInterval,
      cadenceDates: forecasts.cadenceDates,
      updatedAt: forecasts.updatedAt,
      currentVersionCreatedAt: forecastVersions.createdAt,
      headlineP: forecastVersions.headlineP,
      headlineSE: forecastVersions.headlineSE,
      trials: forecastVersions.trials,
    })
    .from(forecasts)
    .leftJoin(forecastVersions, eq(forecasts.currentVersionId, forecastVersions.id))
    .where(eq(forecasts.userId, userId))
    .orderBy(desc(forecasts.updatedAt), desc(forecasts.createdAt));
}

export async function getForecast(userId: string, forecastId: string) {
  const [forecast] = await db
    .select()
    .from(forecasts)
    .where(and(eq(forecasts.id, forecastId), eq(forecasts.userId, userId)));
  return forecast ?? null;
}

export async function getForecastWithCurrentVersion(userId: string, forecastId: string) {
  const [forecast] = await db
    .select({
      id: forecasts.id,
      userId: forecasts.userId,
      title: forecasts.title,
      description: forecasts.description,
      questionType: forecasts.questionType,
      status: forecasts.status,
      cadenceKind: forecasts.cadenceKind,
      cadenceInterval: forecasts.cadenceInterval,
      cadenceDates: forecasts.cadenceDates,
      currentVersionId: forecasts.currentVersionId,
      resolvedOutcome: forecasts.resolvedOutcome,
      resolvedAt: forecasts.resolvedAt,
      resolutionNotes: forecasts.resolutionNotes,
      createdAt: forecasts.createdAt,
      updatedAt: forecasts.updatedAt,
      currentTree: forecastVersions.tree,
      headlineP: forecastVersions.headlineP,
      headlineSE: forecastVersions.headlineSE,
      trials: forecastVersions.trials,
      versionCreatedAt: forecastVersions.createdAt,
    })
    .from(forecasts)
    .leftJoin(forecastVersions, eq(forecasts.currentVersionId, forecastVersions.id))
    .where(and(eq(forecasts.id, forecastId), eq(forecasts.userId, userId)));

  return forecast ?? null;
}

export async function createForecast(userId: string, input: CreateForecastInput) {
  const parsed = createForecastInputSchema.parse(input);
  const [forecast] = await db
    .insert(forecasts)
    .values({
      userId,
      title: parsed.title,
      description: parsed.description,
      ...cadenceColumns(parsed.cadence),
    })
    .returning();
  return forecast;
}

export async function createForecastWithInitialVersion(userId: string, input: CreateForecastInput) {
  const parsed = createForecastInputSchema.parse(input);
  const initialTree = buildInitialTree(parsed.title);

  return db.transaction(async (tx) => {
    const [forecast] = await tx
      .insert(forecasts)
      .values({
        userId,
        title: parsed.title,
        description: parsed.description,
        ...cadenceColumns(parsed.cadence),
      })
      .returning();

    const result = runForecast(initialTree, { seed: forecast.id });

    const [version] = await tx
      .insert(forecastVersions)
      .values({
        forecastId: forecast.id,
        versionNo: 1,
        tree: initialTree,
        headlineP: result.p,
        headlineSE: result.se,
        trials: result.trials,
        source: 'initial',
      })
      .returning();

    const [updatedForecast] = await tx
      .update(forecasts)
      .set({ currentVersionId: version.id, updatedAt: new Date() })
      .where(eq(forecasts.id, forecast.id))
      .returning();

    return { forecast: updatedForecast, version };
  });
}

export async function appendVersion(userId: string, forecastId: string, input: AppendVersionInput) {
  const forecast = await getForecast(userId, forecastId);
  if (!forecast) throw new ForecastNotFoundError(forecastId);

  const parsed = appendVersionInputSchema.parse(input);
  const treeResult = TreeSchema.safeParse(parsed.tree);
  if (!treeResult.success) {
    throw new TreeValidationFailedError(treeResult.error.message);
  }
  const tree = treeResult.data;

  let result;
  try {
    result = runForecast(tree, { trials: parsed.trials, seed: parsed.seed ?? forecastId });
  } catch (error) {
    throw new TreeValidationFailedError(error instanceof Error ? error.message : String(error));
  }

  return db.transaction(async (tx) => {
    const [lastVersion] = await tx
      .select({ versionNo: forecastVersions.versionNo })
      .from(forecastVersions)
      .where(eq(forecastVersions.forecastId, forecastId))
      .orderBy(desc(forecastVersions.versionNo))
      .limit(1);

    const [version] = await tx
      .insert(forecastVersions)
      .values({
        forecastId,
        versionNo: (lastVersion?.versionNo ?? 0) + 1,
        tree,
        headlineP: result.p,
        headlineSE: result.se,
        trials: result.trials,
        source: parsed.source,
        rationale: parsed.rationale,
      })
      .returning();

    await tx
      .update(forecasts)
      .set({ currentVersionId: version.id, updatedAt: new Date() })
      .where(eq(forecasts.id, forecastId));

    return version;
  });
}

export async function resolveForecast(
  userId: string,
  forecastId: string,
  input: ResolveForecastInput,
) {
  const forecast = await getForecast(userId, forecastId);
  if (!forecast) throw new ForecastNotFoundError(forecastId);

  const parsed = resolveForecastInputSchema.parse(input);
  const [updated] = await db
    .update(forecasts)
    .set({
      status: 'resolved',
      resolvedOutcome: parsed.outcome,
      resolvedAt: new Date(),
      resolutionNotes: parsed.notes,
      updatedAt: new Date(),
    })
    .where(eq(forecasts.id, forecastId))
    .returning();

  return updated;
}
