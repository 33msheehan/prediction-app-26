import {
  computeOutputType,
  TreeSchema,
  type CompositeNode,
  type OutputType,
  type Tree,
  type TreeNode,
} from './tree';

export type TreeValidationError = {
  path: string;
  message: string;
};

export type TreeValidationResult = {
  valid: boolean;
  errors: TreeValidationError[];
};

function formatPath(path: Array<string | number>): string {
  if (path.length === 0) {
    return 'tree';
  }

  return path.reduce<string>((result, segment) => {
    if (typeof segment === 'number') {
      return `${result}[${segment}]`;
    }

    return result.length === 0 ? segment : `${result}.${segment}`;
  }, '');
}

function expectedChildOutputType(node: CompositeNode): OutputType | null {
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

function validateArity(node: CompositeNode, path: string): TreeValidationError[] {
  switch (node.type) {
    case 'not':
    case 'threshold':
      return node.children.length === 1
        ? []
        : [{ path: `${path}.children`, message: `${node.type} requires exactly 1 child` }];
    case 'and':
    case 'or':
    case 'k_of_n':
    case 'count_true':
    case 'sum':
      return node.children.length >= 1
        ? []
        : [{ path: `${path}.children`, message: `${node.type} requires at least 1 child` }];
  }
}

function validateKOfN(node: CompositeNode, path: string): TreeValidationError[] {
  const kNode = node as CompositeNode<'k_of_n'>;

  return kNode.config.k <= kNode.children.length
    ? []
    : [
        {
          path: `${path}.config.k`,
          message: `k_of_n requires k <= child count (${kNode.children.length})`,
        },
      ];
}

function validateSemantics(node: TreeNode, path: Array<string | number>, errors: TreeValidationError[]): void {
  if (node.kind === 'leaf') {
    return;
  }

  const nodePath = formatPath(path);

  errors.push(...validateArity(node, nodePath));

  if (node.type === 'k_of_n') {
    errors.push(...validateKOfN(node, nodePath));
  }

  const expected = expectedChildOutputType(node);

  if (expected !== null) {
    node.children.forEach((child, index) => {
      const actual = computeOutputType(child);

      if (actual !== expected) {
        errors.push({
          path: `${nodePath}.children[${index}]`,
          message: `${node.type} expects ${expected} children, got ${actual}`,
        });
      }
    });
  }

  node.children.forEach((child, index) => {
    validateSemantics(child, [...path, 'children', index], errors);
  });
}

export function validateTree(input: unknown): TreeValidationResult {
  const parsed = TreeSchema.safeParse(input);

  if (!parsed.success) {
    return {
      valid: false,
      errors: parsed.error.issues.map((issue) => ({
        path: formatPath(
          issue.path.filter(
            (segment): segment is string | number =>
              typeof segment === 'string' || typeof segment === 'number',
          ),
        ),
        message: issue.message,
      })),
    };
  }

  const tree: Tree = parsed.data;
  const errors: TreeValidationError[] = [];

  if (computeOutputType(tree.root) !== 'boolean') {
    errors.push({
      path: 'root',
      message: `root must produce boolean output, got ${computeOutputType(tree.root)}`,
    });
  }

  validateSemantics(tree.root, ['root'], errors);

  return {
    valid: errors.length === 0,
    errors,
  };
}
