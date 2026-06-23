import { z } from 'zod';

export const outputTypes = ['boolean', 'numeric'] as const;
export type OutputType = (typeof outputTypes)[number];

export type NodeId = string;

export const leafNodeTypes = [
  'bernoulli',
  'binomial',
  'poisson',
  'normal',
  'lognormal',
  'beta',
  'uniform',
  'triangular',
  'pert',
] as const;
export type LeafNodeType = (typeof leafNodeTypes)[number];

export const compositeNodeTypes = [
  'and',
  'or',
  'not',
  'k_of_n',
  'count_true',
  'sum',
  'threshold',
] as const;
export type CompositeNodeType = (typeof compositeNodeTypes)[number];

export const thresholdOperators = ['>=', '>', '<=', '<', '=='] as const;
export type ThresholdOperator = (typeof thresholdOperators)[number];

type LeafParamsByType = {
  bernoulli: { p: number };
  binomial: { n: number; p: number };
  poisson: { lambda: number };
  normal: { mu: number; sigma: number };
  lognormal: { muLog: number; sigmaLog: number };
  beta: { alpha: number; beta: number };
  uniform: { a: number; b: number };
  triangular: { min: number; mode: number; max: number };
  pert: { min: number; mode: number; max: number };
};

type ElicitationByType = {
  bernoulli: { p: number };
  binomial: { n: number; p: number };
  poisson: { lambda?: number; p10?: number; p50?: number; p90?: number };
  normal: { p10: number; p50: number; p90: number };
  lognormal: { p10: number; p50: number; p90: number };
  beta:
    | { mean: number; concentration: number }
    | {
        successes: number;
        failures: number;
        priorAlpha?: number;
        priorBeta?: number;
      };
  uniform: { a: number; b: number };
  triangular: { min: number; mode: number; max: number };
  pert: { min: number; mode: number; max: number };
};

type CompositeConfigByType = {
  and: undefined;
  or: undefined;
  not: undefined;
  k_of_n: { k: number };
  count_true: undefined;
  sum: undefined;
  threshold: { op: ThresholdOperator; value: number };
};

export interface BaseNode {
  id: NodeId;
  label: string;
}

export type LeafNode<TType extends LeafNodeType = LeafNodeType> = BaseNode & {
  kind: 'leaf';
  type: TType;
  params: LeafParamsByType[TType];
  elicitation?: ElicitationByType[TType];
  children: [];
};

export type CompositeNode<TType extends CompositeNodeType = CompositeNodeType> = BaseNode & {
  kind: 'composite';
  type: TType;
  config: CompositeConfigByType[TType];
  children: TreeNode[];
};

export type TreeNode = LeafNode | CompositeNode;
export type Tree = { root: TreeNode };

const finiteNumber = z.number().finite();
const nonNegativeInteger = z.number().int().min(0);
const positiveNumber = z.number().positive();
const probability = z.number().min(0).max(1);

const baseNodeShape = {
  id: z.string().min(1),
  label: z.string(),
};

const bernoulliLeafSchema = z.object({
  ...baseNodeShape,
  kind: z.literal('leaf'),
  type: z.literal('bernoulli'),
  params: z.object({ p: probability }),
  elicitation: z.object({ p: probability }).optional(),
  children: z.tuple([]),
});

const binomialLeafSchema = z.object({
  ...baseNodeShape,
  kind: z.literal('leaf'),
  type: z.literal('binomial'),
  params: z.object({ n: nonNegativeInteger, p: probability }),
  elicitation: z.object({ n: nonNegativeInteger, p: probability }).optional(),
  children: z.tuple([]),
});

const poissonLeafSchema = z.object({
  ...baseNodeShape,
  kind: z.literal('leaf'),
  type: z.literal('poisson'),
  params: z.object({ lambda: finiteNumber.min(0) }),
  elicitation: z
    .union([
      z.object({ lambda: finiteNumber.min(0) }),
      z.object({
        p10: finiteNumber,
        p50: finiteNumber,
        p90: finiteNumber,
      }),
    ])
    .optional(),
  children: z.tuple([]),
});

const normalLeafSchema = z.object({
  ...baseNodeShape,
  kind: z.literal('leaf'),
  type: z.literal('normal'),
  params: z.object({ mu: finiteNumber, sigma: positiveNumber }),
  elicitation: z.object({ p10: finiteNumber, p50: finiteNumber, p90: finiteNumber }).optional(),
  children: z.tuple([]),
});

const lognormalLeafSchema = z.object({
  ...baseNodeShape,
  kind: z.literal('leaf'),
  type: z.literal('lognormal'),
  params: z.object({ muLog: finiteNumber, sigmaLog: positiveNumber }),
  elicitation: z.object({ p10: positiveNumber, p50: positiveNumber, p90: positiveNumber }).optional(),
  children: z.tuple([]),
});

const betaLeafSchema = z.object({
  ...baseNodeShape,
  kind: z.literal('leaf'),
  type: z.literal('beta'),
  params: z.object({ alpha: positiveNumber, beta: positiveNumber }),
  elicitation: z
    .union([
      z.object({ mean: probability, concentration: positiveNumber }),
      z.object({
        successes: finiteNumber.min(0),
        failures: finiteNumber.min(0),
        priorAlpha: positiveNumber.optional(),
        priorBeta: positiveNumber.optional(),
      }),
    ])
    .optional(),
  children: z.tuple([]),
});

const uniformLeafSchema = z
  .object({
    ...baseNodeShape,
    kind: z.literal('leaf'),
    type: z.literal('uniform'),
    params: z.object({ a: finiteNumber, b: finiteNumber }),
    elicitation: z.object({ a: finiteNumber, b: finiteNumber }).optional(),
    children: z.tuple([]),
  })
  .refine(({ params }) => params.a <= params.b, {
    message: 'uniform params must satisfy a <= b',
    path: ['params', 'b'],
  });

const triangularParamsSchema = z
  .object({
    min: finiteNumber,
    mode: finiteNumber,
    max: finiteNumber,
  })
  .refine(({ min, mode, max }) => min < max && min <= mode && mode <= max, {
    message: 'expected min < max and min <= mode <= max',
    path: ['mode'],
  });

const triangularLeafSchema = z.object({
  ...baseNodeShape,
  kind: z.literal('leaf'),
  type: z.literal('triangular'),
  params: triangularParamsSchema,
  elicitation: triangularParamsSchema.optional(),
  children: z.tuple([]),
});

const pertLeafSchema = z.object({
  ...baseNodeShape,
  kind: z.literal('leaf'),
  type: z.literal('pert'),
  params: triangularParamsSchema,
  elicitation: triangularParamsSchema.optional(),
  children: z.tuple([]),
});

const leafNodeSchema = z.union([
  bernoulliLeafSchema,
  binomialLeafSchema,
  poissonLeafSchema,
  normalLeafSchema,
  lognormalLeafSchema,
  betaLeafSchema,
  uniformLeafSchema,
  triangularLeafSchema,
  pertLeafSchema,
]);

export const LeafNodeSchema = leafNodeSchema;

const omittedUndefinedConfig = z.undefined().optional().transform(() => undefined);

export const TreeNodeSchema: z.ZodType<TreeNode> = z.lazy(() =>
  z.union([
    leafNodeSchema,
    z.object({
      ...baseNodeShape,
      kind: z.literal('composite'),
      type: z.literal('and'),
      config: omittedUndefinedConfig,
      children: z.array(TreeNodeSchema),
    }),
    z.object({
      ...baseNodeShape,
      kind: z.literal('composite'),
      type: z.literal('or'),
      config: omittedUndefinedConfig,
      children: z.array(TreeNodeSchema),
    }),
    z.object({
      ...baseNodeShape,
      kind: z.literal('composite'),
      type: z.literal('not'),
      config: omittedUndefinedConfig,
      children: z.array(TreeNodeSchema),
    }),
    z.object({
      ...baseNodeShape,
      kind: z.literal('composite'),
      type: z.literal('k_of_n'),
      config: z.object({ k: positiveNumber.int() }),
      children: z.array(TreeNodeSchema),
    }),
    z.object({
      ...baseNodeShape,
      kind: z.literal('composite'),
      type: z.literal('count_true'),
      config: omittedUndefinedConfig,
      children: z.array(TreeNodeSchema),
    }),
    z.object({
      ...baseNodeShape,
      kind: z.literal('composite'),
      type: z.literal('sum'),
      config: omittedUndefinedConfig,
      children: z.array(TreeNodeSchema),
    }),
    z.object({
      ...baseNodeShape,
      kind: z.literal('composite'),
      type: z.literal('threshold'),
      config: z.object({
        op: z.enum(thresholdOperators),
        value: finiteNumber,
      }),
      children: z.array(TreeNodeSchema),
    }),
  ]),
);

export const TreeSchema = z.object({
  root: TreeNodeSchema,
});

const outputTypeByNodeType: Record<LeafNodeType | CompositeNodeType, OutputType> = {
  and: 'boolean',
  bernoulli: 'boolean',
  beta: 'numeric',
  binomial: 'numeric',
  count_true: 'numeric',
  k_of_n: 'boolean',
  lognormal: 'numeric',
  normal: 'numeric',
  not: 'boolean',
  or: 'boolean',
  pert: 'numeric',
  poisson: 'numeric',
  sum: 'numeric',
  threshold: 'boolean',
  triangular: 'numeric',
  uniform: 'numeric',
};

export function computeOutputType(node: TreeNode): OutputType {
  return outputTypeByNodeType[node.type];
}

export function walkTree(node: TreeNode, visitor: (node: TreeNode, parent: TreeNode | null) => void): void {
  const visit = (current: TreeNode, parent: TreeNode | null): void => {
    visitor(current, parent);

    for (const child of current.children) {
      visit(child, current);
    }
  };

  visit(node, null);
}

export function flattenTree(node: TreeNode): TreeNode[] {
  const nodes: TreeNode[] = [];
  walkTree(node, (current) => {
    nodes.push(current);
  });
  return nodes;
}

export function findNodeById(tree: Tree, nodeId: NodeId): TreeNode | undefined {
  return flattenTree(tree.root).find((node) => node.id === nodeId);
}
