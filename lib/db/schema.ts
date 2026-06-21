// Drizzle schema — tables per BUILD_PLAN.md §5 (users, forecasts, forecast_versions).
//
// forecasts.currentVersionId and forecast_versions.forecastId form a circular
// foreign-key pair (the version row that's "current" lives in the other
// table). Drizzle resolves this because `.references()` takes a callback
// evaluated lazily, so it's fine that `forecastVersions` is declared after
// `forecasts` references it.
import {
  type AnyPgColumn,
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: text('email').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const forecasts = pgTable(
  'forecasts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description'),
    // 'binary' is the only value in v1; column future-proofs categorical.
    questionType: text('question_type').notNull().default('binary'),
    status: text('status').notNull().default('open'), // 'open' | 'resolved'
    cadenceKind: text('cadence_kind').notNull().default('none'), // 'none' | 'interval' | 'dates'
    cadenceInterval: integer('cadence_interval'),
    cadenceDates: jsonb('cadence_dates'),
    currentVersionId: uuid('current_version_id').references(
      (): AnyPgColumn => forecastVersions.id,
    ),
    resolvedOutcome: boolean('resolved_outcome'),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    resolutionNotes: text('resolution_notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('forecasts_user_status_idx').on(table.userId, table.status)],
);

export const forecastVersions = pgTable(
  'forecast_versions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    forecastId: uuid('forecast_id')
      .notNull()
      .references(() => forecasts.id, { onDelete: 'cascade' }),
    versionNo: integer('version_no').notNull(),
    tree: jsonb('tree').notNull(),
    headlineP: doublePrecision('headline_p').notNull(),
    headlineSE: doublePrecision('headline_se').notNull(),
    trials: integer('trials').notNull(),
    source: text('source').notNull(), // 'initial' | 'edit' | 'checkin'
    rationale: text('rationale'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('forecast_versions_forecast_version_idx').on(table.forecastId, table.versionNo),
  ],
);
