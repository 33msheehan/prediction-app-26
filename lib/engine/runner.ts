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
import { evaluateCompositeNode, type TrialValue } from './combinators';
import { createRng, type Rng } from './rng';
import { validateTree } from './validate';
import { computeOutputType, type LeafNode, type Tree, type TreeNode } from './tree';

const Z_95 = 1.96;

export type NumericNodeSummary = {
  mean: number;
  p10: number;
  p50: number;
  p90: number;
};

export type RunForecastOptions = {
  trials?: number;
  seed: string | number;
  includeNodeSummaries?: boolean;
};

export type RunForecastResult = {
  p: number;
  se: number;
  ci95: [number, number];
  trials: number;
  nodeSummaries?: Record<string, NumericNodeSummary>;
};

function clampProbability(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function sampleLeafNode(node: LeafNode, rng: Rng): TrialValue {
  switch (node.type) {
    case 'bernoulli': {
      const bernoulliNode = node as LeafNode<'bernoulli'>;
      return sampleBernoulli(rng, bernoulliNode.params.p);
    }
    case 'binomial': {
      const binomialNode = node as LeafNode<'binomial'>;
      return sampleBinomial(rng, binomialNode.params.n, binomialNode.params.p);
    }
    case 'poisson': {
      const poissonNode = node as LeafNode<'poisson'>;
      return samplePoisson(rng, poissonNode.params.lambda);
    }
    case 'normal': {
      const normalNode = node as LeafNode<'normal'>;
      return sampleNormal(rng, normalNode.params.mu, normalNode.params.sigma);
    }
    case 'lognormal': {
      const lognormalNode = node as LeafNode<'lognormal'>;
      return sampleLogNormal(rng, lognormalNode.params.muLog, lognormalNode.params.sigmaLog);
    }
    case 'beta': {
      const betaNode = node as LeafNode<'beta'>;
      return sampleBeta(rng, betaNode.params.alpha, betaNode.params.beta);
    }
    case 'uniform': {
      const uniformNode = node as LeafNode<'uniform'>;
      return sampleUniform(rng, uniformNode.params.a, uniformNode.params.b);
    }
    case 'triangular': {
      const triangularNode = node as LeafNode<'triangular'>;
      return sampleTriangular(
        rng,
        triangularNode.params.min,
        triangularNode.params.mode,
        triangularNode.params.max,
      );
    }
    case 'pert': {
      const pertNode = node as LeafNode<'pert'>;
      return samplePert(rng, pertNode.params.min, pertNode.params.mode, pertNode.params.max);
    }
  }
}

function appendNumericSample(
  node: TreeNode,
  value: TrialValue,
  numericSamples: Map<string, number[]>,
): void {
  if (computeOutputType(node) !== 'numeric') {
    return;
  }

  const sample = typeof value === 'number' ? value : undefined;

  if (sample === undefined) {
    return;
  }

  const existing = numericSamples.get(node.id);

  if (existing) {
    existing.push(sample);
    return;
  }

  numericSamples.set(node.id, [sample]);
}

function evaluateNode(node: TreeNode, rng: Rng, numericSamples?: Map<string, number[]>): TrialValue {
  if (node.kind === 'leaf') {
    const value = sampleLeafNode(node, rng);

    if (numericSamples) {
      appendNumericSample(node, value, numericSamples);
    }

    return value;
  }

  const childValues = node.children.map((child) => evaluateNode(child, rng, numericSamples));
  const value = evaluateCompositeNode(node, childValues);

  if (numericSamples) {
    appendNumericSample(node, value, numericSamples);
  }

  return value;
}

function quantile(sortedValues: number[], probability: number): number {
  if (sortedValues.length === 0) {
    throw new RangeError('cannot compute a quantile from an empty sample');
  }

  if (sortedValues.length === 1) {
    return sortedValues[0];
  }

  const index = (sortedValues.length - 1) * probability;
  const lowerIndex = Math.floor(index);
  const upperIndex = Math.ceil(index);
  const fraction = index - lowerIndex;
  const lower = sortedValues[lowerIndex];
  const upper = sortedValues[upperIndex];

  return lower + (upper - lower) * fraction;
}

function summarizeNumericSamples(numericSamples: Map<string, number[]>): Record<string, NumericNodeSummary> {
  const summaries: Record<string, NumericNodeSummary> = {};

  for (const [nodeId, samples] of numericSamples.entries()) {
    const sorted = [...samples].sort((left, right) => left - right);
    const mean = sorted.reduce((total, value) => total + value, 0) / sorted.length;

    summaries[nodeId] = {
      mean,
      p10: quantile(sorted, 0.1),
      p50: quantile(sorted, 0.5),
      p90: quantile(sorted, 0.9),
    };
  }

  return summaries;
}

export function runForecast(tree: Tree, options: RunForecastOptions): RunForecastResult {
  const { trials = 10_000, seed, includeNodeSummaries = false } = options;

  if (!Number.isInteger(trials) || trials <= 0) {
    throw new RangeError('trials must be a positive integer');
  }

  const validation = validateTree(tree);

  if (!validation.valid) {
    const [firstError] = validation.errors;
    throw new RangeError(
      `Tree validation failed at ${firstError.path}: ${firstError.message}`,
    );
  }

  const rng = createRng(seed);
  const numericSamples = includeNodeSummaries ? new Map<string, number[]>() : undefined;
  let successes = 0;

  for (let trial = 0; trial < trials; trial += 1) {
    const result = evaluateNode(tree.root, rng, numericSamples);

    if (result !== true && result !== false) {
      throw new TypeError('validated trees must evaluate to a boolean root');
    }

    if (result) {
      successes += 1;
    }
  }

  const p = successes / trials;
  const se = Math.sqrt((p * (1 - p)) / trials);
  const ci95: [number, number] = [
    clampProbability(p - Z_95 * se),
    clampProbability(p + Z_95 * se),
  ];

  return {
    p,
    se,
    ci95,
    trials,
    nodeSummaries: numericSamples ? summarizeNumericSamples(numericSamples) : undefined,
  };
}
