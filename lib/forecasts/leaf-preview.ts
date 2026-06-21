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
} from '@/lib/engine/distributions';
import { createRng } from '@/lib/engine/rng';
import type { LeafNode } from '@/lib/engine/tree';

const DEFAULT_SAMPLES = 1200;
const HISTOGRAM_BINS = 10;

export type PreviewBar = {
  label: string;
  proportion: number;
};

export type LeafPreview = {
  bars: PreviewBar[];
  impliedProbability?: number;
  impliedQuantiles?: {
    p10: number;
    p50: number;
    p90: number;
  };
};

function quantile(sortedValues: number[], probability: number): number {
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

function formatValue(value: number) {
  if (!Number.isFinite(value)) {
    return 'n/a';
  }

  if (Math.abs(value) >= 100 || Number.isInteger(value)) {
    return value.toFixed(0);
  }

  if (Math.abs(value) >= 10) {
    return value.toFixed(1);
  }

  return value.toFixed(2);
}

function sampleLeaf(node: LeafNode, seed: string): number[] | boolean[] {
  const rng = createRng(seed);

  switch (node.type) {
    case 'bernoulli': {
      const typedNode = node as LeafNode<'bernoulli'>;
      return Array.from({ length: DEFAULT_SAMPLES }, () => sampleBernoulli(rng, typedNode.params.p));
    }
    case 'binomial': {
      const typedNode = node as LeafNode<'binomial'>;
      return Array.from({ length: DEFAULT_SAMPLES }, () =>
        sampleBinomial(rng, typedNode.params.n, typedNode.params.p),
      );
    }
    case 'poisson': {
      const typedNode = node as LeafNode<'poisson'>;
      return Array.from({ length: DEFAULT_SAMPLES }, () =>
        samplePoisson(rng, typedNode.params.lambda),
      );
    }
    case 'normal': {
      const typedNode = node as LeafNode<'normal'>;
      return Array.from({ length: DEFAULT_SAMPLES }, () =>
        sampleNormal(rng, typedNode.params.mu, typedNode.params.sigma),
      );
    }
    case 'lognormal': {
      const typedNode = node as LeafNode<'lognormal'>;
      return Array.from({ length: DEFAULT_SAMPLES }, () =>
        sampleLogNormal(rng, typedNode.params.muLog, typedNode.params.sigmaLog),
      );
    }
    case 'beta': {
      const typedNode = node as LeafNode<'beta'>;
      return Array.from({ length: DEFAULT_SAMPLES }, () =>
        sampleBeta(rng, typedNode.params.alpha, typedNode.params.beta),
      );
    }
    case 'uniform': {
      const typedNode = node as LeafNode<'uniform'>;
      return Array.from({ length: DEFAULT_SAMPLES }, () =>
        sampleUniform(rng, typedNode.params.a, typedNode.params.b),
      );
    }
    case 'triangular': {
      const typedNode = node as LeafNode<'triangular'>;
      return Array.from({ length: DEFAULT_SAMPLES }, () =>
        sampleTriangular(rng, typedNode.params.min, typedNode.params.mode, typedNode.params.max),
      );
    }
    case 'pert': {
      const typedNode = node as LeafNode<'pert'>;
      return Array.from({ length: DEFAULT_SAMPLES }, () =>
        samplePert(rng, typedNode.params.min, typedNode.params.mode, typedNode.params.max),
      );
    }
  }
}

function probabilityBars(samples: boolean[]): PreviewBar[] {
  const yesCount = samples.filter(Boolean).length;
  const noCount = samples.length - yesCount;

  return [
    { label: 'No', proportion: noCount / samples.length },
    { label: 'Yes', proportion: yesCount / samples.length },
  ];
}

function histogramBars(samples: number[]): PreviewBar[] {
  const min = Math.min(...samples);
  const max = Math.max(...samples);

  if (min === max) {
    return [{ label: formatValue(min), proportion: 1 }];
  }

  const width = (max - min) / HISTOGRAM_BINS;
  const counts = new Array(HISTOGRAM_BINS).fill(0);

  for (const sample of samples) {
    const index = Math.min(HISTOGRAM_BINS - 1, Math.floor((sample - min) / width));
    counts[index] += 1;
  }

  return counts.map((count, index) => {
    const start = min + width * index;
    const end = start + width;
    return {
      label: `${formatValue(start)}-${formatValue(end)}`,
      proportion: count / samples.length,
    };
  });
}

export function buildLeafPreview(node: LeafNode, seed = 'leaf-preview'): LeafPreview {
  const samples = sampleLeaf(node, `${seed}:${node.id}:${node.type}`);

  if (typeof samples[0] === 'boolean') {
    const typed = samples as boolean[];
    const probability = typed.filter(Boolean).length / typed.length;

    return {
      bars: probabilityBars(typed),
      impliedProbability: probability,
    };
  }

  const typed = (samples as number[]).sort((left, right) => left - right);

  return {
    bars: histogramBars(typed),
    impliedQuantiles: {
      p10: quantile(typed, 0.1),
      p50: quantile(typed, 0.5),
      p90: quantile(typed, 0.9),
    },
  };
}
