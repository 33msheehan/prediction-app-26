import { describe, expect, it } from 'vitest';

import type { Tree } from './tree';
import { runForecast } from './runner';

function expectWithinThreeStandardErrors(actual: number, expected: number, se: number): void {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(3 * se);
}

describe('runForecast analytic anchors', () => {
  it('matches bernoulli(0.3)', () => {
    const tree: Tree = {
      root: {
        id: 'root',
        label: 'Root',
        kind: 'leaf',
        type: 'bernoulli',
        params: { p: 0.3 },
        children: [],
      },
    };

    const result = runForecast(tree, { trials: 100_000, seed: 'anchor-bernoulli' });
    expectWithinThreeStandardErrors(result.p, 0.3, result.se);
  });

  it('matches and(b(0.5), b(0.5))', () => {
    const tree: Tree = {
      root: {
        id: 'root',
        label: 'Root',
        kind: 'composite',
        type: 'and',
        config: undefined,
        children: [
          { id: 'a', label: 'A', kind: 'leaf', type: 'bernoulli', params: { p: 0.5 }, children: [] },
          { id: 'b', label: 'B', kind: 'leaf', type: 'bernoulli', params: { p: 0.5 }, children: [] },
        ],
      },
    };

    const result = runForecast(tree, { trials: 100_000, seed: 'anchor-and' });
    expectWithinThreeStandardErrors(result.p, 0.25, result.se);
  });

  it('matches or(b(0.5), b(0.5))', () => {
    const tree: Tree = {
      root: {
        id: 'root',
        label: 'Root',
        kind: 'composite',
        type: 'or',
        config: undefined,
        children: [
          { id: 'a', label: 'A', kind: 'leaf', type: 'bernoulli', params: { p: 0.5 }, children: [] },
          { id: 'b', label: 'B', kind: 'leaf', type: 'bernoulli', params: { p: 0.5 }, children: [] },
        ],
      },
    };

    const result = runForecast(tree, { trials: 100_000, seed: 'anchor-or' });
    expectWithinThreeStandardErrors(result.p, 0.75, result.se);
  });

  it('matches k_of_n(k=2, [b(0.5) x 3])', () => {
    const tree: Tree = {
      root: {
        id: 'root',
        label: 'Root',
        kind: 'composite',
        type: 'k_of_n',
        config: { k: 2 },
        children: [
          { id: 'a', label: 'A', kind: 'leaf', type: 'bernoulli', params: { p: 0.5 }, children: [] },
          { id: 'b', label: 'B', kind: 'leaf', type: 'bernoulli', params: { p: 0.5 }, children: [] },
          { id: 'c', label: 'C', kind: 'leaf', type: 'bernoulli', params: { p: 0.5 }, children: [] },
        ],
      },
    };

    const result = runForecast(tree, { trials: 100_000, seed: 'anchor-kofn' });
    expectWithinThreeStandardErrors(result.p, 0.5, result.se);
  });

  it('matches threshold(poisson(3) >= 2)', () => {
    const tree: Tree = {
      root: {
        id: 'root',
        label: 'Root',
        kind: 'composite',
        type: 'threshold',
        config: { op: '>=', value: 2 },
        children: [
          {
            id: 'poisson',
            label: 'Poisson',
            kind: 'leaf',
            type: 'poisson',
            params: { lambda: 3 },
            children: [],
          },
        ],
      },
    };

    const result = runForecast(tree, { trials: 100_000, seed: 'anchor-threshold' });
    const expected = 1 - 4 * Math.exp(-3);
    expectWithinThreeStandardErrors(result.p, expected, result.se);
  });
});

describe('runForecast behavior', () => {
  it('is deterministic for a fixed seed', () => {
    const tree: Tree = {
      root: {
        id: 'root',
        label: 'Root',
        kind: 'composite',
        type: 'and',
        config: undefined,
        children: [
          { id: 'a', label: 'A', kind: 'leaf', type: 'bernoulli', params: { p: 0.3 }, children: [] },
          {
            id: 'threshold',
            label: 'Threshold',
            kind: 'composite',
            type: 'threshold',
            config: { op: '>=', value: 1 },
            children: [
              {
                id: 'poisson',
                label: 'Poisson',
                kind: 'leaf',
                type: 'poisson',
                params: { lambda: 2 },
                children: [],
              },
            ],
          },
        ],
      },
    };

    const first = runForecast(tree, { trials: 20_000, seed: 'deterministic', includeNodeSummaries: true });
    const second = runForecast(tree, {
      trials: 20_000,
      seed: 'deterministic',
      includeNodeSummaries: true,
    });

    expect(second).toEqual(first);
  });

  it('matches an independently computed mixed-tree expectation', () => {
    const tree: Tree = {
      root: {
        id: 'root',
        label: 'Root',
        kind: 'composite',
        type: 'and',
        config: undefined,
        children: [
          {
            id: 'left',
            label: 'Left',
            kind: 'composite',
            type: 'or',
            config: undefined,
            children: [
              { id: 'a', label: 'A', kind: 'leaf', type: 'bernoulli', params: { p: 0.3 }, children: [] },
              { id: 'b', label: 'B', kind: 'leaf', type: 'bernoulli', params: { p: 0.4 }, children: [] },
            ],
          },
          {
            id: 'right',
            label: 'Right',
            kind: 'composite',
            type: 'threshold',
            config: { op: '>=', value: 1 },
            children: [
              {
                id: 'sum',
                label: 'Sum',
                kind: 'composite',
                type: 'sum',
                config: undefined,
                children: [
                  {
                    id: 'binomial',
                    label: 'Binomial',
                    kind: 'leaf',
                    type: 'binomial',
                    params: { n: 2, p: 0.5 },
                    children: [],
                  },
                  {
                    id: 'poisson',
                    label: 'Poisson',
                    kind: 'leaf',
                    type: 'poisson',
                    params: { lambda: 1 },
                    children: [],
                  },
                ],
              },
            ],
          },
        ],
      },
    };

    const result = runForecast(tree, { trials: 100_000, seed: 'mixed-tree', includeNodeSummaries: true });
    const expectedLeft = 1 - (1 - 0.3) * (1 - 0.4);
    const expectedRight = 1 - 0.25 * Math.exp(-1);
    const expected = expectedLeft * expectedRight;

    expectWithinThreeStandardErrors(result.p, expected, result.se);
    expect(result.nodeSummaries).toBeDefined();
    expect(result.nodeSummaries?.sum.mean).toBeCloseTo(2, 1);
  });

  it('reports ci95 clamped to probability bounds', () => {
    const tree: Tree = {
      root: {
        id: 'root',
        label: 'Root',
        kind: 'leaf',
        type: 'bernoulli',
        params: { p: 0.01 },
        children: [],
      },
    };

    const result = runForecast(tree, { trials: 1_000, seed: 'ci-bounds' });

    expect(result.ci95[0]).toBeGreaterThanOrEqual(0);
    expect(result.ci95[1]).toBeLessThanOrEqual(1);
  });

  it('throws on invalid trees', () => {
    const invalidTree = {
      root: {
        id: 'root',
        label: 'Root',
        kind: 'composite',
        type: 'sum',
        config: undefined,
        children: [],
      },
    } as unknown as Tree;

    expect(() => runForecast(invalidTree, { trials: 1_000, seed: 'invalid' })).toThrow(
      'Tree validation failed at root: root must produce boolean output, got numeric',
    );
  });
});
