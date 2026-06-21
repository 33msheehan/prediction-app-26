import type { CompositeNode, ThresholdOperator } from './tree';

export type TrialValue = boolean | number;
type KOfNNode = CompositeNode<'k_of_n'>;
type ThresholdNode = CompositeNode<'threshold'>;

function assertBoolean(value: TrialValue, nodeType: string): boolean {
  if (typeof value !== 'boolean') {
    throw new TypeError(`${nodeType} expects boolean child values`);
  }

  return value;
}

function assertNumber(value: TrialValue, nodeType: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`${nodeType} expects finite numeric child values`);
  }

  return value;
}

function compareThreshold(left: number, op: ThresholdOperator, right: number): boolean {
  switch (op) {
    case '>=':
      return left >= right;
    case '>':
      return left > right;
    case '<=':
      return left <= right;
    case '<':
      return left < right;
    case '==':
      return left === right;
  }
}

export function evaluateCompositeNode(node: CompositeNode, childValues: TrialValue[]): TrialValue {
  switch (node.type) {
    case 'and':
      return childValues.every((value) => assertBoolean(value, node.type));
    case 'or':
      return childValues.some((value) => assertBoolean(value, node.type));
    case 'not': {
      if (childValues.length !== 1) {
        throw new RangeError('not expects exactly one child value');
      }

      return !assertBoolean(childValues[0], node.type);
    }
    case 'k_of_n': {
      const { config } = node as KOfNNode;
      const trues = childValues.filter((value) => assertBoolean(value, node.type)).length;
      return trues >= config.k;
    }
    case 'count_true':
      return childValues.filter((value) => assertBoolean(value, node.type)).length;
    case 'sum':
      return childValues
        .map((value) => assertNumber(value, node.type))
        .reduce((total, value) => total + value, 0);
    case 'threshold': {
      const { config } = node as ThresholdNode;
      if (childValues.length !== 1) {
        throw new RangeError('threshold expects exactly one child value');
      }

      return compareThreshold(assertNumber(childValues[0], node.type), config.op, config.value);
    }
  }
}

export function evaluateAnd(childValues: boolean[]): boolean {
  return childValues.every(Boolean);
}

export function evaluateOr(childValues: boolean[]): boolean {
  return childValues.some(Boolean);
}

export function evaluateNot(childValue: boolean): boolean {
  return !childValue;
}

export function evaluateKOfN(childValues: boolean[], k: number): boolean {
  if (!Number.isInteger(k) || k < 1) {
    throw new RangeError('k must be a positive integer');
  }

  return childValues.filter(Boolean).length >= k;
}

export function evaluateCountTrue(childValues: boolean[]): number {
  return childValues.filter(Boolean).length;
}

export function evaluateSum(childValues: number[]): number {
  return childValues.reduce((total, value) => {
    if (!Number.isFinite(value)) {
      throw new TypeError('sum expects finite numeric child values');
    }

    return total + value;
  }, 0);
}

export function evaluateThreshold(value: number, op: ThresholdOperator, threshold: number): boolean {
  if (!Number.isFinite(value)) {
    throw new TypeError('threshold expects a finite numeric child value');
  }

  if (!Number.isFinite(threshold)) {
    throw new TypeError('threshold comparison value must be finite');
  }

  return compareThreshold(value, op, threshold);
}
