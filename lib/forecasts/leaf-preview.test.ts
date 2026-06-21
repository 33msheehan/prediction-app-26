import { describe, expect, it } from 'vitest';
import type { LeafNode } from '@/lib/engine/tree';
import { buildLeafPreview } from './leaf-preview';

describe('buildLeafPreview', () => {
  it('returns deterministic yes/no bars for bernoulli leaves', () => {
    const node: LeafNode<'bernoulli'> = {
      id: 'bernoulli-1',
      label: 'Binary leaf',
      kind: 'leaf',
      type: 'bernoulli',
      params: { p: 1 },
      elicitation: { p: 1 },
      children: [],
    };

    const preview = buildLeafPreview(node, 'test-seed');

    expect(preview.impliedProbability).toBe(1);
    expect(preview.bars).toEqual([
      { label: 'No', proportion: 0 },
      { label: 'Yes', proportion: 1 },
    ]);
    expect(preview.impliedQuantiles).toBeUndefined();
  });

  it('returns ordered implied quantiles and histogram bins for numeric leaves', () => {
    const node: LeafNode<'normal'> = {
      id: 'normal-1',
      label: 'Numeric leaf',
      kind: 'leaf',
      type: 'normal',
      params: { mu: 10, sigma: 2 },
      elicitation: { p10: 7.4, p50: 10, p90: 12.6 },
      children: [],
    };

    const preview = buildLeafPreview(node, 'test-seed');

    expect(preview.impliedProbability).toBeUndefined();
    expect(preview.bars).toHaveLength(10);
    expect(preview.impliedQuantiles?.p10).toBeLessThan(preview.impliedQuantiles?.p50 ?? 0);
    expect(preview.impliedQuantiles?.p50).toBeLessThan(preview.impliedQuantiles?.p90 ?? 0);
    expect(preview.impliedQuantiles?.p50).toBeCloseTo(10, 1);
  });
});
