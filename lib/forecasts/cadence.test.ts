import { describe, expect, it } from 'vitest';
import { cadenceFromRecord, getNextDueAt, isDueForReview } from './cadence';

describe('cadenceFromRecord', () => {
  it('maps interval records into cadence objects', () => {
    expect(
      cadenceFromRecord({
        cadenceKind: 'interval',
        cadenceInterval: 7,
        cadenceDates: null,
      }),
    ).toEqual({ kind: 'interval', intervalDays: 7 });
  });

  it('maps date-based records into cadence objects', () => {
    expect(
      cadenceFromRecord({
        cadenceKind: 'dates',
        cadenceInterval: null,
        cadenceDates: ['2026-07-01', '2026-07-10'],
      }),
    ).toEqual({ kind: 'dates', dates: ['2026-07-01', '2026-07-10'] });
  });
});

describe('getNextDueAt', () => {
  it('returns null for no cadence', () => {
    expect(getNextDueAt({ kind: 'none' }, new Date('2026-06-21T09:00:00.000Z'))).toBeNull();
  });

  it('computes the next interval-based due date from the latest version time', () => {
    expect(
      getNextDueAt(
        { kind: 'interval', intervalDays: 3 },
        new Date('2026-06-21T09:30:00.000Z'),
      )?.toISOString(),
    ).toBe('2026-06-24T09:30:00.000Z');
  });

  it('returns the first specific date after the latest version time', () => {
    expect(
      getNextDueAt(
        { kind: 'dates', dates: ['2026-07-01', '2026-07-15'] },
        new Date('2026-07-01T12:00:00.000Z'),
      )?.toISOString(),
    ).toBe('2026-07-15T00:00:00.000Z');
  });
});

describe('isDueForReview', () => {
  it('marks interval forecasts due once the next due date has passed', () => {
    expect(
      isDueForReview(
        { kind: 'interval', intervalDays: 7 },
        new Date('2026-06-01T00:00:00.000Z'),
        new Date('2026-06-09T00:00:00.000Z'),
      ),
    ).toBe(true);
  });

  it('does not mark future specific dates as due', () => {
    expect(
      isDueForReview(
        { kind: 'dates', dates: ['2026-07-01'] },
        new Date('2026-06-20T00:00:00.000Z'),
        new Date('2026-06-25T00:00:00.000Z'),
      ),
    ).toBe(false);
  });
});
