import { describe, expect, it } from 'vitest';

import type { Tree } from './tree';
import { validateTree } from './validate';

function validTree(): Tree {
  return {
    root: {
      id: 'root',
      label: 'Root',
      kind: 'composite',
      type: 'and',
      config: undefined,
      children: [
        {
          id: 'bernoulli-1',
          label: 'Leaf A',
          kind: 'leaf',
          type: 'bernoulli',
          params: { p: 0.6 },
          children: [],
        },
        {
          id: 'threshold-1',
          label: 'Threshold',
          kind: 'composite',
          type: 'threshold',
          config: { op: '>=', value: 2 },
          children: [
            {
              id: 'sum-1',
              label: 'Sum',
              kind: 'composite',
              type: 'sum',
              config: undefined,
              children: [
                {
                  id: 'uniform-1',
                  label: 'Uniform',
                  kind: 'leaf',
                  type: 'uniform',
                  params: { a: 0, b: 2 },
                  children: [],
                },
                {
                  id: 'poisson-1',
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
      ],
    },
  } as Tree;
}

describe('validateTree', () => {
  it('passes a valid tree', () => {
    expect(validateTree(validTree())).toEqual({ valid: true, errors: [] });
  });

  it('rejects a non-boolean root', () => {
    const tree = validTree();
    tree.root = {
      id: 'sum-root',
      label: 'Sum root',
      kind: 'composite',
      type: 'sum',
      config: undefined,
      children: [
        {
          id: 'uniform-1',
          label: 'Uniform',
          kind: 'leaf',
          type: 'uniform',
          params: { a: 0, b: 1 },
          children: [],
        },
      ],
    } as unknown as typeof tree.root;

    expect(validateTree(tree)).toEqual({
      valid: false,
      errors: [{ path: 'root', message: 'root must produce boolean output, got numeric' }],
    });
  });

  it('rejects child type mismatches', () => {
    const tree = validTree();
    tree.root.children[0] = {
      id: 'uniform-bad',
      label: 'Wrong type',
      kind: 'leaf',
      type: 'uniform',
      params: { a: 0, b: 1 },
      children: [],
    } as unknown as (typeof tree.root.children)[number];

    expect(validateTree(tree)).toEqual({
      valid: false,
      errors: [
        {
          path: 'root.children[0]',
          message: 'and expects boolean children, got numeric',
        },
      ],
    });
  });

  it('rejects invalid unary arity', () => {
    const tree = validTree();
    tree.root.children[1] = {
      id: 'not-bad',
      label: 'Not',
      kind: 'composite',
      type: 'not',
      config: undefined,
      children: [
        {
          id: 'a',
          label: 'A',
          kind: 'leaf',
          type: 'bernoulli',
          params: { p: 0.2 },
          children: [],
        },
        {
          id: 'b',
          label: 'B',
          kind: 'leaf',
          type: 'bernoulli',
          params: { p: 0.4 },
          children: [],
        },
      ],
    } as unknown as (typeof tree.root.children)[number];

    expect(validateTree(tree)).toEqual({
      valid: false,
      errors: [{ path: 'root.children[1].children', message: 'not requires exactly 1 child' }],
    });
  });

  it('rejects empty variadic composites', () => {
    const tree = validTree();
    tree.root.children = [] as unknown as typeof tree.root.children;

    expect(validateTree(tree)).toEqual({
      valid: false,
      errors: [{ path: 'root.children', message: 'and requires at least 1 child' }],
    });
  });

  it('rejects k_of_n when k exceeds the child count', () => {
    const tree = validTree();
    tree.root.children[1] = {
      id: 'k-node',
      label: 'K of N',
      kind: 'composite',
      type: 'k_of_n',
      config: { k: 3 },
      children: [
        {
          id: 'a',
          label: 'A',
          kind: 'leaf',
          type: 'bernoulli',
          params: { p: 0.2 },
          children: [],
        },
        {
          id: 'b',
          label: 'B',
          kind: 'leaf',
          type: 'bernoulli',
          params: { p: 0.4 },
          children: [],
        },
      ],
    } as unknown as (typeof tree.root.children)[number];

    expect(validateTree(tree)).toEqual({
      valid: false,
      errors: [
        {
          path: 'root.children[1].config.k',
          message: 'k_of_n requires k <= child count (2)',
        },
      ],
    });
  });

  it('surfaces param range errors from the schema', () => {
    const tree = validTree();
    tree.root.children[0] = {
      id: 'bad-probability',
      label: 'Bad probability',
      kind: 'leaf',
      type: 'bernoulli',
      params: { p: 1.2 },
      children: [],
    } as unknown as (typeof tree.root.children)[number];

    expect(validateTree(tree)).toEqual({
      valid: false,
      errors: [
        {
          path: 'root.children[0].params.p',
          message: 'Too big: expected number to be <=1',
        },
      ],
    });
  });

  it('rejects duplicate node ids', () => {
    const tree = validTree();
    tree.root.children[0] = {
      ...tree.root.children[0],
      id: 'threshold-1',
    } as unknown as (typeof tree.root.children)[number];

    expect(validateTree(tree)).toEqual({
      valid: false,
      errors: [
        {
          path: 'root.children[1]',
          message: 'duplicate node id "threshold-1" (first seen at root.children[0])',
        },
      ],
    });
  });
});
