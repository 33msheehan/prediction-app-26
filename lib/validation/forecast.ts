import { z } from 'zod';

// Cadence config (none / interval-days / specific dates) per BUILD_PLAN.md §5,
// mapped onto the forecasts table's flat cadenceKind/cadenceInterval/cadenceDates columns.
export const cadenceSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('none') }),
  z.object({ kind: z.literal('interval'), intervalDays: z.number().int().positive() }),
  z.object({ kind: z.literal('dates'), dates: z.array(z.string().min(1)).min(1) }),
]);
export type Cadence = z.infer<typeof cadenceSchema>;

export const createForecastInputSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional(),
  cadence: cadenceSchema,
});
export type CreateForecastInput = z.infer<typeof createForecastInputSchema>;

export const appendVersionInputSchema = z.object({
  tree: z.unknown(),
  source: z.enum(['initial', 'edit', 'checkin']),
  rationale: z.string().optional(),
  trials: z.number().int().positive().optional(),
  seed: z.union([z.string(), z.number()]).optional(),
});
export type AppendVersionInput = z.infer<typeof appendVersionInputSchema>;

export const resolveForecastInputSchema = z.object({
  outcome: z.boolean(),
  notes: z.string().optional(),
});
export type ResolveForecastInput = z.infer<typeof resolveForecastInputSchema>;
