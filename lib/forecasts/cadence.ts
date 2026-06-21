import type { Cadence } from '@/lib/validation/forecast';

export type ForecastCadenceRecord = {
  cadenceKind: 'none' | 'interval' | 'dates';
  cadenceInterval: number | null;
  cadenceDates: unknown;
};

function parseCadenceDates(input: unknown): string[] {
  if (!Array.isArray(input)) {
    return [];
  }

  return input.filter((value): value is string => typeof value === 'string');
}

export function cadenceFromRecord(record: ForecastCadenceRecord): Cadence {
  switch (record.cadenceKind) {
    case 'interval':
      return {
        kind: 'interval',
        intervalDays: record.cadenceInterval ?? 1,
      };
    case 'dates':
      return {
        kind: 'dates',
        dates: parseCadenceDates(record.cadenceDates),
      };
    case 'none':
    default:
      return { kind: 'none' };
  }
}

function startOfDay(dateString: string): Date {
  return new Date(`${dateString}T00:00:00.000Z`);
}

export function getNextDueAt(cadence: Cadence, lastVersionAt: Date): Date | null {
  switch (cadence.kind) {
    case 'none':
      return null;
    case 'interval':
      return new Date(lastVersionAt.getTime() + cadence.intervalDays * 24 * 60 * 60 * 1000);
    case 'dates':
      return (
        cadence.dates
          .map(startOfDay)
          .find((candidate) => candidate.getTime() > lastVersionAt.getTime()) ?? null
      );
  }
}

export function isDueForReview(cadence: Cadence, lastVersionAt: Date, now = new Date()): boolean {
  const nextDueAt = getNextDueAt(cadence, lastVersionAt);
  return nextDueAt !== null && nextDueAt.getTime() <= now.getTime();
}
