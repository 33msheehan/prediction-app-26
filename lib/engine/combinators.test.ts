import { describe, expect, it } from 'vitest';

import {
  evaluateAnd,
  evaluateCompositeNode,
  evaluateCountTrue,
  evaluateKOfN,
  evaluateNot,
  evaluateOr,
  evaluateSum,
  evaluateThreshold,
} from './combinators';
import type { CompositeNode } from './tree';

function composite(type: 'and'): CompositeNode<'and'>;
function composite(type: 'or'): CompositeNode<'or'>;
function composite(type: 'not'): CompositeNode<'not'>;
function composite(type: 'count_true'): CompositeNode<'count_true'>;
function composite(type: 'sum'): CompositeNode<'sum'>;
function composite(
  type: 'k_of_n',
  overrides: Partial<CompositeNode<'k_of_n'>>,
): CompositeNode<'k_of_n'>;
function composite(
  type: 'threshold',
  overrides: Partial<CompositeNode<'threshold'>>,
): CompositeNode<'threshold'>;
function composite(type: CompositeNode['type'], overrides: Partial<CompositeNode> = {}): CompositeNode {
  const base = {
    id: `${type}-node`,
    label: type,
    kind: 'composite' as const,
    type,
    children: [],
  };

  switch (type) {
    case 'k_of_n':
      return { ...base, config: { k: 1 }, ...overrides } as CompositeNode<'k_of_n'>;
    case 'threshold':
      return {
        ...base,
        config: { op: '>=', value: 0 },
        ...overrides,
      } as CompositeNode<'threshold'>;
    default:
      return { ...base, config: undefined, ...overrides } as CompositeNode;
  }
}

describe('boolean combinators', () => {
  it('evaluates and truth tables exactly', () => {
    expect(evaluateAnd([])).toBe(true);
    expect(evaluateAnd([true])).toBe(true);
    expect(evaluateAnd([true, true])).toBe(true);
    expect(evaluateAnd([true, false])).toBe(false);
    expect(evaluateAnd([false, false])).toBe(false);
  });

  it('evaluates or truth tables exactly', () => {
    expect(evaluateOr([])).toBe(false);
    expect(evaluateOr([false])).toBe(false);
    expect(evaluateOr([false, false])).toBe(false);
    expect(evaluateOr([true, false])).toBe(true);
    expect(evaluateOr([true, true])).toBe(true);
  });

  it('evaluates not exactly', () => {
    expect(evaluateNot(true)).toBe(false);
    expect(evaluateNot(false)).toBe(true);
  });

  it('evaluates k_of_n boundary cases', () => {
    expect(evaluateKOfN([true, false, true], 1)).toBe(true);
    expect(evaluateKOfN([true, false, true], 2)).toBe(true);
    expect(evaluateKOfN([true, false, true], 3)).toBe(false);
    expect(evaluateKOfN([false, false, false], 1)).toBe(false);
  });

  it('counts true children arithmetically', () => {
    expect(evaluateCountTrue([])).toBe(0);
    expect(evaluateCountTrue([true, false, true, true])).toBe(3);
  });
});

describe('numeric combinators', () => {
  it('sums numeric children exactly', () => {
    expect(evaluateSum([])).toBe(0);
    expect(evaluateSum([1, 2, 3])).toBe(6);
    expect(evaluateSum([1.5, -0.5, 2])).toBe(3);
  });

  it('evaluates threshold for every operator', () => {
    expect(evaluateThreshold(3, '>=', 3)).toBe(true);
    expect(evaluateThreshold(3, '>', 3)).toBe(false);
    expect(evaluateThreshold(3, '<=', 3)).toBe(true);
    expect(evaluateThreshold(3, '<', 4)).toBe(true);
    expect(evaluateThreshold(3, '==', 3)).toBe(true);
  });
});

describe('evaluateCompositeNode', () => {
  it('dispatches boolean composites through the shared node evaluator', () => {
    expect(evaluateCompositeNode(composite('and'), [true, true, false])).toBe(false);
    expect(evaluateCompositeNode(composite('or'), [false, false, true])).toBe(true);
    expect(evaluateCompositeNode(composite('not'), [false])).toBe(true);
    expect(
      evaluateCompositeNode(composite('k_of_n', { config: { k: 2 } }), [true, false, true]),
    ).toBe(true);
    expect(evaluateCompositeNode(composite('count_true'), [true, false, true])).toBe(2);
  });

  it('dispatches numeric composites through the shared node evaluator', () => {
    expect(evaluateCompositeNode(composite('sum'), [1, 2, 3])).toBe(6);
    expect(
      evaluateCompositeNode(
        composite('threshold', { config: { op: '>=', value: 10 } }),
        [10],
      ),
    ).toBe(true);
  });

  it('rejects wrong arity for unary combinators', () => {
    expect(() => evaluateCompositeNode(composite('not'), [true, false])).toThrow(
      'not expects exactly one child value',
    );
    expect(() =>
      evaluateCompositeNode(composite('threshold', { config: { op: '>=', value: 1 } }), [1, 2]),
    ).toThrow('threshold expects exactly one child value');
  });

  it('rejects wrong child value types', () => {
    expect(() => evaluateCompositeNode(composite('and'), [1])).toThrow(
      'and expects boolean child values',
    );
    expect(() => evaluateCompositeNode(composite('sum'), [true])).toThrow(
      'sum expects finite numeric child values',
    );
  });
});

describe('input validation', () => {
  it('rejects invalid k', () => {
    expect(() => evaluateKOfN([true], 0)).toThrow('k must be a positive integer');
  });

  it('rejects non-finite numeric inputs', () => {
    expect(() => evaluateSum([1, Number.NaN])).toThrow('sum expects finite numeric child values');
    expect(() => evaluateThreshold(Number.POSITIVE_INFINITY, '>=', 1)).toThrow(
      'threshold expects a finite numeric child value',
    );
  });
});
