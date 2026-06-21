import { randomOpen01, type Rng } from './rng';

const TWO_PI = 2 * Math.PI;

function assertFiniteNumber(name: string, value: number): void {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${name} must be finite`);
  }
}

function assertProbability(name: string, value: number): void {
  assertFiniteNumber(name, value);

  if (value < 0 || value > 1) {
    throw new RangeError(`${name} must be between 0 and 1`);
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

export function sampleBernoulli(rng: Rng, p: number): boolean {
  assertProbability('p', p);
  return rng() < p;
}

export function sampleBinomial(rng: Rng, n: number, p: number): number {
  if (!Number.isInteger(n) || n < 0) {
    throw new RangeError('n must be a non-negative integer');
  }

  assertProbability('p', p);

  let successes = 0;

  for (let i = 0; i < n; i += 1) {
    if (sampleBernoulli(rng, p)) {
      successes += 1;
    }
  }

  return successes;
}

export function samplePoisson(rng: Rng, lambda: number): number {
  assertNonNegative('lambda', lambda);

  if (lambda === 0) {
    return 0;
  }

  // Knuth's multiplication method. This is simple and adequate for the small
  // lambdas expected in v1; large lambdas should use a transformed-rejection
  // algorithm if profiling shows this path matters.
  const limit = Math.exp(-lambda);
  let product = 1;
  let k = 0;

  do {
    k += 1;
    product *= rng();
  } while (product > limit);

  return k - 1;
}

export function sampleNormal(rng: Rng, mu: number, sigma: number): number {
  assertFiniteNumber('mu', mu);
  assertPositive('sigma', sigma);

  const u1 = randomOpen01(rng);
  const u2 = rng();
  const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(TWO_PI * u2);

  return mu + sigma * z0;
}

export function sampleLogNormal(rng: Rng, muLog: number, sigmaLog: number): number {
  assertFiniteNumber('muLog', muLog);
  assertPositive('sigmaLog', sigmaLog);

  return Math.exp(sampleNormal(rng, muLog, sigmaLog));
}

function sampleGamma(rng: Rng, shape: number): number {
  assertPositive('shape', shape);

  if (shape < 1) {
    return sampleGamma(rng, shape + 1) * randomOpen01(rng) ** (1 / shape);
  }

  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);

  while (true) {
    const x = sampleNormal(rng, 0, 1);
    const v = (1 + c * x) ** 3;

    if (v <= 0) {
      continue;
    }

    const u = rng();
    const xSquared = x * x;

    if (u < 1 - 0.0331 * xSquared * xSquared) {
      return d * v;
    }

    if (Math.log(u) < 0.5 * xSquared + d * (1 - v + Math.log(v))) {
      return d * v;
    }
  }
}

export function sampleBeta(rng: Rng, alpha: number, beta: number): number {
  assertPositive('alpha', alpha);
  assertPositive('beta', beta);

  const x = sampleGamma(rng, alpha);
  const y = sampleGamma(rng, beta);

  return x / (x + y);
}

export function sampleUniform(rng: Rng, a: number, b: number): number {
  assertFiniteNumber('a', a);
  assertFiniteNumber('b', b);

  if (a > b) {
    throw new RangeError('a must be <= b');
  }

  return a + (b - a) * rng();
}

export function sampleTriangular(rng: Rng, min: number, mode: number, max: number): number {
  assertFiniteNumber('min', min);
  assertFiniteNumber('mode', mode);
  assertFiniteNumber('max', max);

  if (min > mode || mode > max) {
    throw new RangeError('expected min <= mode <= max');
  }

  if (min === max) {
    return min;
  }

  const u = rng();
  const modeFraction = (mode - min) / (max - min);

  if (u < modeFraction) {
    return min + Math.sqrt(u * (max - min) * (mode - min));
  }

  return max - Math.sqrt((1 - u) * (max - min) * (max - mode));
}

export function samplePert(rng: Rng, min: number, mode: number, max: number): number {
  assertFiniteNumber('min', min);
  assertFiniteNumber('mode', mode);
  assertFiniteNumber('max', max);

  if (min > mode || mode > max) {
    throw new RangeError('expected min <= mode <= max');
  }

  if (min === max) {
    return min;
  }

  const alpha = 1 + (4 * (mode - min)) / (max - min);
  const beta = 1 + (4 * (max - mode)) / (max - min);

  return min + (max - min) * sampleBeta(rng, alpha, beta);
}
