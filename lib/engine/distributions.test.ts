import { describe, expect, it } from 'vitest';
import {
  sampleBernoulli,
  sampleBeta,
  sampleBinomial,
  sampleLogNormal,
  sampleNormal,
  samplePert,
  samplePoisson,
  sampleTriangular,
  sampleUniform,
} from './distributions';
import { createRng } from './rng';

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function repeat(count: number, sample: () => number): number[] {
  return Array.from({ length: count }, sample);
}

describe('distribution samplers', () => {
  it('samples Bernoulli with the expected probability', () => {
    const rng = createRng('bernoulli');
    const trials = 100_000;
    const p = 0.3;
    const observed = repeat(trials, () => (sampleBernoulli(rng, p) ? 1 : 0));
    const se = Math.sqrt((p * (1 - p)) / trials);

    expect(Math.abs(mean(observed) - p)).toBeLessThan(3 * se);
  });

  it('samples Binomial with the expected mean', () => {
    const rng = createRng('binomial');
    const observed = repeat(50_000, () => sampleBinomial(rng, 10, 0.4));

    expect(mean(observed)).toBeCloseTo(4, 1);
  });

  it('samples Poisson with the expected mean', () => {
    const rng = createRng('poisson');
    const observed = repeat(80_000, () => samplePoisson(rng, 3));

    expect(mean(observed)).toBeCloseTo(3, 1);
  });

  it('samples Normal with the expected mean and spread', () => {
    const rng = createRng('normal');
    const observed = repeat(80_000, () => sampleNormal(rng, 10, 2));
    const observedMean = mean(observed);
    const variance = mean(observed.map((value) => (value - observedMean) ** 2));

    expect(observedMean).toBeCloseTo(10, 1);
    expect(Math.sqrt(variance)).toBeCloseTo(2, 1);
  });

  it('samples LogNormal values as positive', () => {
    const rng = createRng('lognormal');
    const observed = repeat(5_000, () => sampleLogNormal(rng, 0, 0.5));

    expect(observed.every((value) => value > 0)).toBe(true);
  });

  it('samples Beta with the expected mean', () => {
    const rng = createRng('beta');
    const observed = repeat(80_000, () => sampleBeta(rng, 2, 5));

    expect(mean(observed)).toBeCloseTo(2 / 7, 1);
  });

  it('samples Uniform inside the requested bounds', () => {
    const rng = createRng('uniform');
    const observed = repeat(1_000, () => sampleUniform(rng, -2, 3));

    expect(Math.min(...observed)).toBeGreaterThanOrEqual(-2);
    expect(Math.max(...observed)).toBeLessThan(3);
    expect(mean(observed)).toBeCloseTo(0.5, 1);
  });

  it('samples Triangular inside bounds with the expected mean', () => {
    const rng = createRng('triangular');
    const observed = repeat(80_000, () => sampleTriangular(rng, 0, 2, 10));

    expect(Math.min(...observed)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...observed)).toBeLessThanOrEqual(10);
    expect(mean(observed)).toBeCloseTo(4, 1);
  });

  it('samples PERT inside bounds with the expected mean', () => {
    const rng = createRng('pert');
    const observed = repeat(80_000, () => samplePert(rng, 0, 2, 10));

    expect(Math.min(...observed)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...observed)).toBeLessThanOrEqual(10);
    expect(mean(observed)).toBeCloseTo(3, 1);
  });

  it('rejects invalid parameters', () => {
    const rng = createRng('invalid');

    expect(() => sampleBernoulli(rng, 1.1)).toThrow(RangeError);
    expect(() => sampleBinomial(rng, 1.5, 0.5)).toThrow(RangeError);
    expect(() => samplePoisson(rng, -1)).toThrow(RangeError);
    expect(() => sampleNormal(rng, 0, 0)).toThrow(RangeError);
    expect(() => sampleBeta(rng, 0, 1)).toThrow(RangeError);
    expect(() => sampleUniform(rng, 2, 1)).toThrow(RangeError);
    expect(() => sampleTriangular(rng, 0, 2, 1)).toThrow(RangeError);
    expect(() => samplePert(rng, 0, 2, 1)).toThrow(RangeError);
  });
});
