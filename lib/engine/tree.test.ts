import { describe, expect, it } from 'vitest';

import {
  computeOutputType,
  findNodeById,
  flattenTree,
  TreeSchema,
  type TreeNode,
} from './tree';

type TreeNodeFixture = TreeNode;

function leaf(node: TreeNodeFixture): TreeNodeFixture {
  return node;
}

describe('computeOutputType', () => {
  const cases: Array<{ node: TreeNodeFixture; expected: 'boolean' | 'numeric' }> = [
    {
      node: leaf({
        id: 'bernoulli',
        label: 'Bernoulli',
        kind: 'leaf',
        type: 'bernoulli',
        params: { p: 0.4 },
        children: [],
      }),
      expected: 'boolean',
    },
    {
      node: leaf({
        id: 'binomial',
        label: 'Binomial',
        kind: 'leaf',
        type: 'binomial',
        params: { n: 5, p: 0.3 },
        children: [],
      }),
      expected: 'numeric',
    },
    {
      node: leaf({
        id: 'poisson',
        label: 'Poisson',
        kind: 'leaf',
        type: 'poisson',
        params: { lambda: 3 },
        children: [],
      }),
      expected: 'numeric',
    },
    {
      node: leaf({
        id: 'normal',
        label: 'Normal',
        kind: 'leaf',
        type: 'normal',
        params: { mu: 10, sigma: 2 },
        children: [],
      }),
      expected: 'numeric',
    },
    {
      node: leaf({
        id: 'lognormal',
        label: 'Lognormal',
        kind: 'leaf',
        type: 'lognormal',
        params: { muLog: 1, sigmaLog: 0.2 },
        children: [],
      }),
      expected: 'numeric',
    },
    {
      node: leaf({
        id: 'beta',
        label: 'Beta',
        kind: 'leaf',
        type: 'beta',
        params: { alpha: 2, beta: 5 },
        children: [],
      }),
      expected: 'numeric',
    },
    {
      node: leaf({
        id: 'uniform',
        label: 'Uniform',
        kind: 'leaf',
        type: 'uniform',
        params: { a: 1, b: 4 },
        children: [],
      }),
      expected: 'numeric',
    },
    {
      node: leaf({
        id: 'triangular',
        label: 'Triangular',
        kind: 'leaf',
        type: 'triangular',
        params: { min: 1, mode: 3, max: 7 },
        children: [],
      }),
      expected: 'numeric',
    },
    {
      node: leaf({
        id: 'pert',
        label: 'PERT',
        kind: 'leaf',
        type: 'pert',
        params: { min: 1, mode: 4, max: 8 },
        children: [],
      }),
      expected: 'numeric',
    },
    {
      node: {
        id: 'and',
        label: 'And',
        kind: 'composite',
        type: 'and',
        config: undefined,
        children: [],
      },
      expected: 'boolean',
    },
    {
      node: {
        id: 'or',
        label: 'Or',
        kind: 'composite',
        type: 'or',
        config: undefined,
        children: [],
      },
      expected: 'boolean',
    },
    {
      node: {
        id: 'not',
        label: 'Not',
        kind: 'composite',
        type: 'not',
        config: undefined,
        children: [],
      },
      expected: 'boolean',
    },
    {
      node: {
        id: 'k_of_n',
        label: 'K of N',
        kind: 'composite',
        type: 'k_of_n',
        config: { k: 2 },
        children: [],
      },
      expected: 'boolean',
    },
    {
      node: {
        id: 'count_true',
        label: 'Count true',
        kind: 'composite',
        type: 'count_true',
        config: undefined,
        children: [],
      },
      expected: 'numeric',
    },
    {
      node: {
        id: 'sum',
        label: 'Sum',
        kind: 'composite',
        type: 'sum',
        config: undefined,
        children: [],
      },
      expected: 'numeric',
    },
    {
      node: {
        id: 'threshold',
        label: 'Threshold',
        kind: 'composite',
        type: 'threshold',
        config: { op: '>=', value: 3 },
        children: [],
      },
      expected: 'boolean',
    },
  ];

  for (const { node, expected } of cases) {
    it(`returns ${expected} for ${node.type}`, () => {
      expect(computeOutputType(node)).toBe(expected);
    });
  }
});

describe('TreeSchema', () => {
  it('parses a nested tree with leaves and composites', () => {
    const tree = {
      root: {
        id: 'root',
        label: 'Launch is on time',
        kind: 'composite',
        type: 'and',
        config: undefined,
        children: [
          {
            id: 'leaf-1',
            label: 'Approval probability',
            kind: 'leaf',
            type: 'bernoulli',
            params: { p: 0.62 },
            children: [],
          },
          {
            id: 'threshold-1',
            label: 'Tasks complete threshold',
            kind: 'composite',
            type: 'threshold',
            config: { op: '>=', value: 12 },
            children: [
              {
                id: 'sum-1',
                label: 'Task count',
                kind: 'composite',
                type: 'sum',
                config: undefined,
                children: [
                  {
                    id: 'leaf-2',
                    label: 'Feature A',
                    kind: 'leaf',
                    type: 'poisson',
                    params: { lambda: 7 },
                    children: [],
                  },
                  {
                    id: 'leaf-3',
                    label: 'Feature B',
                    kind: 'leaf',
                    type: 'binomial',
                    params: { n: 5, p: 0.7 },
                    children: [],
                  },
                ],
              },
            ],
          },
        ],
      },
    };

    expect(TreeSchema.parse(tree)).toEqual(tree);
  });

  it('rejects malformed leaf children', () => {
    const invalidTree = {
      root: {
        id: 'root',
        label: 'Broken',
        kind: 'leaf',
        type: 'bernoulli',
        params: { p: 0.5 },
        children: [{ id: 'child' }],
      },
    };

    expect(() => TreeSchema.parse(invalidTree)).toThrow();
  });

  it.each(['triangular', 'pert'] as const)('rejects %s params with min === max', (type) => {
    const tree = {
      root: {
        id: 'root',
        label: 'Degenerate',
        kind: 'leaf',
        type,
        params: { min: 3, mode: 3, max: 3 },
        children: [],
      },
    };

    expect(() => TreeSchema.parse(tree)).toThrow();
  });
});

describe('tree traversal helpers', () => {
  it('flattens depth-first and finds nodes by id', () => {
    const tree = TreeSchema.parse({
      root: {
        id: 'root',
        label: 'Root',
        kind: 'composite',
        type: 'or',
        config: undefined,
        children: [
          {
            id: 'child-1',
            label: 'Child 1',
            kind: 'leaf',
            type: 'bernoulli',
            params: { p: 0.3 },
            children: [],
          },
          {
            id: 'child-2',
            label: 'Child 2',
            kind: 'composite',
            type: 'not',
            config: undefined,
            children: [
              {
                id: 'grandchild-1',
                label: 'Grandchild',
                kind: 'leaf',
                type: 'bernoulli',
                params: { p: 0.6 },
                children: [],
              },
            ],
          },
        ],
      },
    });

    expect(flattenTree(tree.root).map((node) => node.id)).toEqual([
      'root',
      'child-1',
      'child-2',
      'grandchild-1',
    ]);
    expect(findNodeById(tree, 'grandchild-1')?.label).toBe('Grandchild');
    expect(findNodeById(tree, 'missing')).toBeUndefined();
  });
});
