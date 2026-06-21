import {
  compositeNodeTypes,
  computeOutputType,
  leafNodeTypes,
  type CompositeNode,
  type CompositeNodeType,
  type LeafNode,
  type LeafNodeType,
  type OutputType,
  type Tree,
  type TreeNode,
} from '@/lib/engine/tree';

export type NodeTypeOption = {
  kind: 'leaf' | 'composite';
  type: LeafNodeType | CompositeNodeType;
  label: string;
  outputType: OutputType;
};

export const nodeTypeOptions: NodeTypeOption[] = [
  { kind: 'leaf', type: 'bernoulli', label: 'Bernoulli', outputType: 'boolean' },
  { kind: 'leaf', type: 'binomial', label: 'Binomial', outputType: 'numeric' },
  { kind: 'leaf', type: 'poisson', label: 'Poisson', outputType: 'numeric' },
  { kind: 'leaf', type: 'normal', label: 'Normal', outputType: 'numeric' },
  { kind: 'leaf', type: 'lognormal', label: 'Lognormal', outputType: 'numeric' },
  { kind: 'leaf', type: 'beta', label: 'Beta', outputType: 'numeric' },
  { kind: 'leaf', type: 'uniform', label: 'Uniform', outputType: 'numeric' },
  { kind: 'leaf', type: 'triangular', label: 'Triangular', outputType: 'numeric' },
  { kind: 'leaf', type: 'pert', label: 'PERT', outputType: 'numeric' },
  { kind: 'composite', type: 'and', label: 'And', outputType: 'boolean' },
  { kind: 'composite', type: 'or', label: 'Or', outputType: 'boolean' },
  { kind: 'composite', type: 'not', label: 'Not', outputType: 'boolean' },
  { kind: 'composite', type: 'k_of_n', label: 'K of N', outputType: 'boolean' },
  { kind: 'composite', type: 'count_true', label: 'Count True', outputType: 'numeric' },
  { kind: 'composite', type: 'sum', label: 'Sum', outputType: 'numeric' },
  { kind: 'composite', type: 'threshold', label: 'Threshold', outputType: 'boolean' },
];

export function getNodeTypeOption(type: LeafNodeType | CompositeNodeType): NodeTypeOption {
  const match = nodeTypeOptions.find((option) => option.type === type);
  if (!match) {
    throw new Error(`Unknown node type: ${type}`);
  }
  return match;
}

export function getExpectedChildOutputType(node: TreeNode): OutputType | null {
  if (node.kind === 'leaf') {
    return null;
  }

  switch (node.type) {
    case 'and':
    case 'or':
    case 'not':
    case 'k_of_n':
    case 'count_true':
      return 'boolean';
    case 'sum':
    case 'threshold':
      return 'numeric';
  }
}

function defaultLeaf(type: LeafNodeType, id: string, label: string): LeafNode {
  switch (type) {
    case 'bernoulli':
      return {
        id,
        label,
        kind: 'leaf',
        type,
        params: { p: 0.5 },
        elicitation: { p: 0.5 },
        children: [],
      };
    case 'binomial':
      return { id, label, kind: 'leaf', type, params: { n: 1, p: 0.5 }, children: [] };
    case 'poisson':
      return { id, label, kind: 'leaf', type, params: { lambda: 1 }, children: [] };
    case 'normal':
      return { id, label, kind: 'leaf', type, params: { mu: 0, sigma: 1 }, children: [] };
    case 'lognormal':
      return { id, label, kind: 'leaf', type, params: { muLog: 0, sigmaLog: 1 }, children: [] };
    case 'beta':
      return { id, label, kind: 'leaf', type, params: { alpha: 2, beta: 2 }, children: [] };
    case 'uniform':
      return { id, label, kind: 'leaf', type, params: { a: 0, b: 1 }, children: [] };
    case 'triangular':
      return {
        id,
        label,
        kind: 'leaf',
        type,
        params: { min: 0, mode: 0.5, max: 1 },
        children: [],
      };
    case 'pert':
      return {
        id,
        label,
        kind: 'leaf',
        type,
        params: { min: 0, mode: 0.5, max: 1 },
        children: [],
      };
  }
}

function defaultComposite(type: CompositeNodeType, id: string, label: string): CompositeNode {
  switch (type) {
    case 'and':
    case 'or':
    case 'not':
    case 'count_true':
    case 'sum':
      return { id, label, kind: 'composite', type, config: undefined, children: [] };
    case 'k_of_n':
      return { id, label, kind: 'composite', type, config: { k: 1 }, children: [] };
    case 'threshold':
      return { id, label, kind: 'composite', type, config: { op: '>=', value: 0 }, children: [] };
  }
}

export function createNode(
  type: LeafNodeType | CompositeNodeType,
  id: string,
  label?: string,
): TreeNode {
  const option = getNodeTypeOption(type);
  const nodeLabel = label ?? option.label;
  return option.kind === 'leaf'
    ? defaultLeaf(type as LeafNodeType, id, nodeLabel)
    : defaultComposite(type as CompositeNodeType, id, nodeLabel);
}

function mapTreeNode(
  node: TreeNode,
  nodeId: string,
  updater: (node: TreeNode) => TreeNode,
): TreeNode {
  if (node.id === nodeId) {
    return updater(node);
  }

  if (node.kind === 'leaf') {
    return node;
  }

  return {
    ...node,
    children: node.children.map((child) => mapTreeNode(child, nodeId, updater)),
  };
}

export function renameNode(tree: Tree, nodeId: string, label: string): Tree {
  return {
    root: mapTreeNode(tree.root, nodeId, (node) => ({ ...node, label })),
  };
}

export function changeNodeType(
  tree: Tree,
  nodeId: string,
  type: LeafNodeType | CompositeNodeType,
): Tree {
  return {
    root: mapTreeNode(tree.root, nodeId, (node) => createNode(type, node.id, node.label)),
  };
}

export function addChildNode(tree: Tree, parentId: string, child: TreeNode): Tree {
  return {
    root: mapTreeNode(tree.root, parentId, (node) => {
      if (node.kind === 'leaf') {
        return node;
      }

      return {
        ...node,
        children: [...node.children, child],
      };
    }),
  };
}

function removeChild(children: TreeNode[], nodeId: string): TreeNode[] {
  return children
    .filter((child) => child.id !== nodeId)
    .map((child) =>
      child.kind === 'leaf'
        ? child
        : {
            ...child,
            children: removeChild(child.children, nodeId),
          },
    );
}

export function deleteNode(tree: Tree, nodeId: string): Tree {
  if (tree.root.id === nodeId) {
    return tree;
  }

  return {
    root:
      tree.root.kind === 'leaf'
        ? tree.root
        : {
            ...tree.root,
            children: removeChild(tree.root.children, nodeId),
          },
  };
}

function moveAmongChildren(
  children: TreeNode[],
  nodeId: string,
  direction: 'up' | 'down',
): TreeNode[] {
  const index = children.findIndex((child) => child.id === nodeId);
  if (index !== -1) {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= children.length) {
      return children;
    }

    const next = [...children];
    [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
    return next;
  }

  return children.map((child) =>
    child.kind === 'leaf'
      ? child
      : {
          ...child,
          children: moveAmongChildren(child.children, nodeId, direction),
        },
  );
}

export function moveNode(tree: Tree, nodeId: string, direction: 'up' | 'down'): Tree {
  if (tree.root.kind === 'leaf') {
    return tree;
  }

  return {
    root: {
      ...tree.root,
      children: moveAmongChildren(tree.root.children, nodeId, direction),
    },
  };
}

export function canUseNodeType(
  type: LeafNodeType | CompositeNodeType,
  expectedOutputType: OutputType | null,
): boolean {
  if (expectedOutputType === null) {
    return true;
  }

  return getNodeTypeOption(type).outputType === expectedOutputType;
}

export function describeBlockedTypeChange(
  type: LeafNodeType | CompositeNodeType,
  expectedOutputType: OutputType,
): string {
  const attempted = getNodeTypeOption(type);
  return `${attempted.label} produces ${attempted.outputType} output, but this position requires ${expectedOutputType}.`;
}

export function getNodeOutputType(node: TreeNode): OutputType {
  return computeOutputType(node);
}

export function isLeafType(type: string): type is LeafNodeType {
  return (leafNodeTypes as readonly string[]).includes(type);
}

export function isCompositeType(type: string): type is CompositeNodeType {
  return (compositeNodeTypes as readonly string[]).includes(type);
}
