const Z_90 = 1.2815515655446004;
const ASYMMETRY_WARNING_RATIO = 0.2;

export type NormalParams = {
  mu: number;
  sigma: number;
};

export type LogNormalParams = {
  muLog: number;
  sigmaLog: number;
};

export type BetaParams = {
  alpha: number;
  beta: number;
};

export type ThreePointParams = {
  min: number;
  mode: number;
  max: number;
};

export type FittedParams<T> = {
  params: T;
  warnings: string[];
};

function assertFiniteNumber(name: string, value: number): void {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${name} must be finite`);
  }
}

function assertPositive(name: string, value: number): void {
  assertFiniteNumber(name, value);

  if (value <= 0) {
    throw new RangeError(`${name} must be > 0`);
  }
}

function assertNonNegative(name: string, value: number): void {
  assertFiniteNumber(name, value);

  if (value < 0) {
    throw new RangeError(`${name} must be >= 0`);
  }
}

function assertProbability(name: string, value: number): void {
  assertFiniteNumber(name, value);

  if (value < 0 || value > 1) {
    throw new RangeError(`${name} must be between 0 and 1`);
  }
}

function assertOrderedQuantiles(p10: number, p50: number, p90: number): void {
  assertFiniteNumber('p10', p10);
  assertFiniteNumber('p50', p50);
  assertFiniteNumber('p90', p90);

  if (!(p10 < p50 && p50 < p90)) {
    throw new RangeError('expected p10 < p50 < p90');
  }
}

function asymmetryWarnings(leftSpread: number, rightSpread: number): string[] {
  const averageSpread = (leftSpread + rightSpread) / 2;

  if (averageSpread === 0) {
    return [];
  }

  const relativeDifference = Math.abs(leftSpread - rightSpread) / averageSpread;

  if (relativeDifference <= ASYMMETRY_WARNING_RATIO) {
    return [];
  }

  return ['Input quantiles are asymmetric; v1 fits a symmetric distribution around P50.'];
}

export function fitNormalFromQuantiles(input: {
  p10: number;
  p50: number;
  p90: number;
}): FittedParams<NormalParams> {
  const { p10, p50, p90 } = input;
  assertOrderedQuantiles(p10, p50, p90);

  return {
    params: {
      mu: p50,
      sigma: (p90 - p10) / (2 * Z_90),
    },
    warnings: asymmetryWarnings(p50 - p10, p90 - p50),
  };
}

export function fitLogNormalFromQuantiles(input: {
  p10: number;
  p50: number;
  p90: number;
}): FittedParams<LogNormalParams> {
  const { p10, p50, p90 } = input;
  assertOrderedQuantiles(p10, p50, p90);
  assertPositive('p10', p10);

  const logP10 = Math.log(p10);
  const logP50 = Math.log(p50);
  const logP90 = Math.log(p90);

  return {
    params: {
      muLog: logP50,
      sigmaLog: (logP90 - logP10) / (2 * Z_90),
    },
    warnings: asymmetryWarnings(logP50 - logP10, logP90 - logP50),
  };
}

function fitThreePoint(input: { min: number; mode: number; max: number }): FittedParams<ThreePointParams> {
  const { min, mode, max } = input;
  assertFiniteNumber('min', min);
  assertFiniteNumber('mode', mode);
  assertFiniteNumber('max', max);

  if (!(min <= mode && mode <= max)) {
    throw new RangeError('expected min <= mode <= max');
  }

  if (min === max) {
    throw new RangeError('expected min < max');
  }

  return {
    params: { min, mode, max },
    warnings: [],
  };
}

export function fitTriangularFromThreePoint(input: {
  min: number;
  mode: number;
  max: number;
}): FittedParams<ThreePointParams> {
  return fitThreePoint(input);
}

export function fitPertFromThreePoint(input: {
  min: number;
  mode: number;
  max: number;
}): FittedParams<ThreePointParams> {
  return fitThreePoint(input);
}

export function fitBetaFromMeanConcentration(input: {
  mean: number;
  concentration: number;
}): FittedParams<BetaParams> {
  const { mean, concentration } = input;
  assertProbability('mean', mean);
  assertPositive('concentration', concentration);

  if (mean === 0 || mean === 1) {
    throw new RangeError('mean must be strictly between 0 and 1');
  }

  return {
    params: {
      alpha: mean * concentration,
      beta: (1 - mean) * concentration,
    },
    warnings: [],
  };
}

export function fitBetaFromPseudoCounts(input: {
  successes: number;
  failures: number;
  priorAlpha?: number;
  priorBeta?: number;
}): FittedParams<BetaParams> {
  const { successes, failures, priorAlpha = 1, priorBeta = 1 } = input;
  assertNonNegative('successes', successes);
  assertNonNegative('failures', failures);
  assertPositive('priorAlpha', priorAlpha);
  assertPositive('priorBeta', priorBeta);

  return {
    params: {
      alpha: successes + priorAlpha,
      beta: failures + priorBeta,
    },
    warnings: [],
  };
}

export function fitPoissonFromExpectedCount(input: { lambda: number }): FittedParams<{ lambda: number }> {
  const { lambda } = input;
  assertNonNegative('lambda', lambda);

  return {
    params: { lambda },
    warnings: [],
  };
}
