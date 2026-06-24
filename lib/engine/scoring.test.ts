import { describe, expect, it } from 'vitest';
import { brier, logScore } from './scoring';

describe('brier', () => {
  it('matches known values', () => {
    expect(brier(0.7, 1)).toBeCloseTo(0.09, 10);
    expect(brier(0.5, 0)).toBeCloseTo(0.25, 10);
  });

  it('is zero for a perfectly confident correct call', () => {
    expect(brier(1, 1)).toBe(0);
    expect(brier(0, 0)).toBe(0);
  });

  it('is one for a perfectly confident wrong call', () => {
    expect(brier(1, 0)).toBe(1);
    expect(brier(0, 1)).toBe(1);
  });
});

describe('logScore', () => {
  it('matches the known value for logScore(0.7, 1)', () => {
    expect(logScore(0.7, 1)).toBeCloseTo(0.3567, 4);
  });

  it('is symmetric for the complementary outcome', () => {
    expect(logScore(0.3, 0)).toBeCloseTo(logScore(0.7, 1), 10);
  });

  it('clamps p away from 0 and 1 to avoid +/- infinity', () => {
    expect(Number.isFinite(logScore(0, 1))).toBe(true);
    expect(Number.isFinite(logScore(1, 1))).toBe(true);
    expect(Number.isFinite(logScore(0, 0))).toBe(true);
    expect(Number.isFinite(logScore(1, 0))).toBe(true);
  });

  it('rewards confident correct calls with a near-zero score', () => {
    expect(logScore(0.99, 1)).toBeLessThan(logScore(0.6, 1));
  });

  it('penalizes confident wrong calls heavily', () => {
    expect(logScore(0.01, 1)).toBeGreaterThan(logScore(0.5, 1));
  });
});
