import type { Tree } from '@/lib/engine/tree';

export function buildInitialTree(title: string): Tree {
  return {
    root: {
      id: 'root',
      kind: 'leaf',
      type: 'bernoulli',
      label: title.trim() || 'Untitled forecast',
      params: { p: 0.5 },
      elicitation: { p: 0.5 },
      children: [],
    },
  };
}
