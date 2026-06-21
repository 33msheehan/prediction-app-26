import { describe, expect, it } from 'vitest';
import { createForecastInputSchema } from './forecast';

describe('createForecastInputSchema', () => {
  it('accepts a no-cadence forecast', () => {
    const result = createForecastInputSchema.safeParse({
      title: 'Will it rain?',
      cadence: { kind: 'none' },
    });
    expect(result.success).toBe(true);
  });

  it('accepts an interval cadence with a positive integer interval', () => {
    const result = createForecastInputSchema.safeParse({
      title: 'Will it rain?',
      cadence: { kind: 'interval', intervalDays: 7 },
    });
    expect(result.success).toBe(true);
  });

  it('rejects an interval cadence with a non-positive interval', () => {
    const result = createForecastInputSchema.safeParse({
      title: 'Will it rain?',
      cadence: { kind: 'interval', intervalDays: 0 },
    });
    expect(result.success).toBe(false);
  });

  it('accepts a dates cadence with at least one date', () => {
    const result = createForecastInputSchema.safeParse({
      title: 'Will it rain?',
      cadence: { kind: 'dates', dates: ['2026-07-01'] },
    });
    expect(result.success).toBe(true);
  });

  it('rejects a dates cadence with an empty list', () => {
    const result = createForecastInputSchema.safeParse({
      title: 'Will it rain?',
      cadence: { kind: 'dates', dates: [] },
    });
    expect(result.success).toBe(false);
  });

  it('rejects an empty title', () => {
    const result = createForecastInputSchema.safeParse({
      title: '',
      cadence: { kind: 'none' },
    });
    expect(result.success).toBe(false);
  });

  it('rejects an unknown cadence kind', () => {
    const result = createForecastInputSchema.safeParse({
      title: 'Will it rain?',
      cadence: { kind: 'weekly' },
    });
    expect(result.success).toBe(false);
  });
});
