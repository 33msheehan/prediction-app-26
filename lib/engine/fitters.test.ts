import { describe, expect, it } from 'vitest';
import {
  fitBetaFromMeanConcentration,
  fitBetaFromPseudoCounts,
  fitLogNormalFromQuantiles,
  fitNormalFromQuantiles,
  fitPertFromThreePoint,
  fitPoissonFromExpectedCount,
  fitTriangularFromThreePoint,
} from './fitters';
import {
  sampleBeta,
  sampleLogNormal,
  sampleNormal,
  samplePert,
  samplePoisson,
  sampleTriangular,
} from './distributions';
import { createRng } from './rng';

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function quantile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * p;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);

  if (lower === upper) {
    return sorted[lower]!;
  }

  const weight = index - lower;
  return sorted[lower]! * (1 - weight) + sorted[upper]! * weight;
}

function repeat(count: number, sample: () => number): number[] {
  return Array.from({ length: count }, sample);
}

describe('normal quantile fitter', () => {
  it('fits params and recovers elicited quantiles empirically', () => {
    const fit = fitNormalFromQuantiles({ p10: 4, p50: 10, p90: 16 });
    const rng = createRng('normal-fit');
    const observed = repeat(100_000, () => sampleNormal(rng, fit.params.mu, fit.params.sigma));

    expect(fit.params.mu).toBe(10);
    expect(fit.warnings).toEqual([]);
    expect(quantile(observed, 0.1)).toBeCloseTo(4, 0);
    expect(quantile(observed, 0.5)).toBeCloseTo(10, 0);
    expect(quantile(observed, 0.9)).toBeCloseTo(16, 0);
  });

  it('warns on visibly asymmetric quantiles', () => {
    const fit = fitNormalFromQuantiles({ p10: 8, p50: 10, p90: 20 });

    expect(fit.warnings).toHaveLength(1);
  });
});

describe('lognormal quantile fitter', () => {
  it('fits params and recovers elicited quantiles empirically', () => {
    const fit = fitLogNormalFromQuantiles({ p10: 2, p50: 4, p90: 8 });
    const rng = createRng('lognormal-fit');
    const observed = repeat(100_000, () =>
      sampleLogNormal(rng, fit.params.muLog, fit.params.sigmaLog),
    );

    expect(fit.params.muLog).toBeCloseTo(Math.log(4));
    expect(fit.warnings).toEqual([]);
    expect(quantile(observed, 0.1)).toBeCloseTo(2, 0);
    expect(quantile(observed, 0.5)).toBeCloseTo(4, 0);
    expect(quantile(observed, 0.9)).toBeCloseTo(8, 0);
  });
});

describe('three-point fitters', () => {
  it('fits triangular params and samples inside the elicited range', () => {
    const fit = fitTriangularFromThreePoint({ min: 0, mode: 3, max: 12 });
    const rng = createRng('triangular-fit');
    const observed = repeat(50_000, () =>
      sampleTriangular(rng, fit.params.min, fit.params.mode, fit.params.max),
    );

    expect(fit.params).toEqual({ min: 0, mode: 3, max: 12 });
    expect(Math.min(...observed)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...observed)).toBeLessThanOrEqual(12);
    expect(mean(observed)).toBeCloseTo(5, 0);
  });

  it('fits PERT params and samples inside the elicited range', () => {
    const fit = fitPertFromThreePoint({ min: 0, mode: 3, max: 12 });
    const rng = createRng('pert-fit');
    const observed = repeat(50_000, () =>
      samplePert(rng, fit.params.min, fit.params.mode, fit.params.max),
    );

    expect(fit.params).toEqual({ min: 0, mode: 3, max: 12 });
    expect(Math.min(...observed)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...observed)).toBeLessThanOrEqual(12);
    expect(mean(observed)).toBeCloseTo(4, 0);
  });
});

describe('beta fitters', () => {
  it('fits from mean and concentration', () => {
    const fit = fitBetaFromMeanConcentration({ mean: 0.3, concentration: 20 });
    const rng = createRng('beta-mean-fit');
    const observed = repeat(80_000, () => sampleBeta(rng, fit.params.alpha, fit.params.beta));

    expect(fit.params).toEqual({ alpha: 6, beta: 14 });
    expect(mean(observed)).toBeCloseTo(0.3, 1);
  });

  it('fits from pseudo-counts with a beta(1, 1) prior by default', () => {
    const fit = fitBetaFromPseudoCounts({ successes: 2, failures: 5 });
    const rng = createRng('beta-count-fit');
    const observed = repeat(80_000, () => sampleBeta(rng, fit.params.alpha, fit.params.beta));

    expect(fit.params).toEqual({ alpha: 3, beta: 6 });
    expect(mean(observed)).toBeCloseTo(1 / 3, 1);
  });
});

describe('poisson fitter', () => {
  it('uses expected count as lambda', () => {
    const fit = fitPoissonFromExpectedCount({ lambda: 4 });
    const rng = createRng('poisson-fit');
    const observed = repeat(80_000, () => samplePoisson(rng, fit.params.lambda));

    expect(fit.params).toEqual({ lambda: 4 });
    expect(mean(observed)).toBeCloseTo(4, 1);
  });
});

describe('invalid fitter inputs', () => {
  it('rejects malformed inputs with clear range errors', () => {
    expect(() => fitNormalFromQuantiles({ p10: 2, p50: 1, p90: 3 })).toThrow(RangeError);
    expect(() => fitLogNormalFromQuantiles({ p10: 0, p50: 1, p90: 2 })).toThrow(
      RangeError,
    );
    expect(() => fitTriangularFromThreePoint({ min: 0, mode: 2, max: 1 })).toThrow(
      RangeError,
    );
    expect(() => fitPertFromThreePoint({ min: 1, mode: 1, max: 1 })).toThrow(RangeError);
    expect(() => fitBetaFromMeanConcentration({ mean: 0, concentration: 10 })).toThrow(
      RangeError,
    );
    expect(() => fitBetaFromPseudoCounts({ successes: -1, failures: 1 })).toThrow(
      RangeError,
    );
    expect(() => fitPoissonFromExpectedCount({ lambda: -1 })).toThrow(RangeError);
  });
});
