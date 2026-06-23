'use client';

import { type CSSProperties, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  fitBetaFromMeanConcentration,
  fitBetaFromPseudoCounts,
  fitLogNormalFromQuantiles,
  fitNormalFromQuantiles,
  fitPertFromThreePoint,
  fitPoissonFromExpectedCount,
  fitTriangularFromThreePoint,
} from '@/lib/engine/fitters';
import { runForecast, type RunForecastResult } from '@/lib/engine/runner';
import {
  flattenTree,
  thresholdOperators,
  type CompositeNode,
  type CompositeNodeType,
  type LeafNode,
  type LeafNodeType,
  type OutputType,
  type ThresholdOperator,
  type Tree,
  type TreeNode,
} from '@/lib/engine/tree';
import { validateTree } from '@/lib/engine/validate';
import { buildLeafPreview } from '@/lib/forecasts/leaf-preview';
import {
  addChildNode,
  canUseNodeType,
  changeNodeType,
  createNode,
  deleteNode,
  describeBlockedTypeChange,
  getExpectedChildOutputType,
  getNodeOutputType,
  getNodeTypeOption,
  moveNode,
  nodeTypeOptions,
  renameNode,
  replaceNode,
  updateCompositeNodeConfig,
} from '@/lib/forecasts/tree-editor';

const HEADLINE_DEBOUNCE_MS = 250;

type FocusMode = 'tree' | 'split' | 'node';

type TreeEditorShellProps = {
  forecastId: string;
  initialTree: Tree | null;
  initialTreeError?: string;
};

type ForecastTreeEditorProps = {
  forecastId: string;
  initialTree: Tree;
};

type FieldErrors = Record<string, string>;
type FieldDrafts = Record<string, string>;
type HeadlineState =
  | { status: 'idle' }
  | { status: 'ready'; result: RunForecastResult }
  | { status: 'error'; message: string };

type SaveState =
  | { status: 'idle' }
  | { status: 'saving' }
  | { status: 'saved'; versionNo: number }
  | { status: 'error'; message: string };

function formatPercent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function formatNumber(value: number) {
  if (!Number.isFinite(value)) {
    return 'n/a';
  }

  if (Math.abs(value) >= 100 || Number.isInteger(value)) {
    return value.toFixed(0);
  }

  if (Math.abs(value) >= 10) {
    return value.toFixed(1);
  }

  return value.toFixed(2);
}

function formatNodeType(type: LeafNodeType | CompositeNodeType) {
  return type.replaceAll('_', ' ');
}

function draftKey(nodeId: string, field: string) {
  return `${nodeId}:${field}`;
}

function displayNodeLabel(node: TreeNode) {
  return node.label || 'Untitled';
}

function nodeActionLabel(action: string, node: TreeNode) {
  return `${action} ${displayNodeLabel(node)} (${node.id})`;
}

function nextNodeIdSeed(tree: Tree) {
  let max = 0;
  for (const node of flattenTree(tree.root)) {
    const match = /^node-(\d+)$/.exec(node.id);
    if (match) {
      max = Math.max(max, Number(match[1]));
    }
  }
  return max;
}

function repairDuplicateNodeIds(tree: Tree): Tree {
  const allIds = new Set(flattenTree(tree.root).map((node) => node.id));
  const seenIds = new Set<string>();
  let nextNumericId = nextNodeIdSeed(tree);

  function allocateId() {
    let id: string;
    do {
      nextNumericId += 1;
      id = `node-${nextNumericId}`;
    } while (allIds.has(id));
    allIds.add(id);
    return id;
  }

  function repairNode(node: TreeNode): TreeNode {
    const id = seenIds.has(node.id) ? allocateId() : node.id;
    seenIds.add(id);

    if (node.kind === 'leaf') {
      return { ...node, id };
    }

    return {
      ...node,
      id,
      children: node.children.map(repairNode),
    };
  }

  return { root: repairNode(tree.root) };
}

function parseFiniteNumber(rawValue: string, label: string) {
  const trimmed = rawValue.trim();
  if (trimmed.length === 0) {
    throw new RangeError(`${label} is required`);
  }

  const parsed = Number(trimmed);

  if (!Number.isFinite(parsed)) {
    throw new RangeError(`${label} must be a finite number`);
  }

  return parsed;
}

function parsePositiveInteger(rawValue: string, label: string) {
  const parsed = parseFiniteNumber(rawValue, label);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new RangeError(`${label} must be a positive integer`);
  }

  return parsed;
}

function parseNonNegativeInteger(rawValue: string, label: string) {
  const parsed = parseFiniteNumber(rawValue, label);

  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new RangeError(`${label} must be a non-negative integer`);
  }

  return parsed;
}

function parseProbability(rawValue: string, label: string) {
  const parsed = parseFiniteNumber(rawValue, label);

  if (parsed < 0 || parsed > 1) {
    throw new RangeError(`${label} must be between 0 and 1`);
  }

  return parsed;
}

function parseNonNegativeNumber(rawValue: string, label: string) {
  const parsed = parseFiniteNumber(rawValue, label);

  if (parsed < 0) {
    throw new RangeError(`${label} must be >= 0`);
  }

  return parsed;
}

function parsePositiveNumber(rawValue: string, label: string) {
  const parsed = parseFiniteNumber(rawValue, label);

  if (parsed <= 0) {
    throw new RangeError(`${label} must be > 0`);
  }

  return parsed;
}

function betaMode(node: LeafNode<'beta'>) {
  return node.elicitation && 'mean' in node.elicitation ? 'mean' : 'counts';
}

const operatorSymbols: Record<ThresholdOperator, string> = {
  '>=': '≥',
  '>': '>',
  '<=': '≤',
  '<': '<',
  '==': '=',
};

function describeCombineRule(node: CompositeNode): string {
  switch (node.type) {
    case 'and':
      return 'all true';
    case 'or':
      return 'any true';
    case 'not':
      return 'negate';
    case 'count_true':
      return 'count true';
    case 'sum':
      return 'sum';
    case 'k_of_n':
      return `${(node as CompositeNode<'k_of_n'>).config.k} of ${node.children.length}`;
    case 'threshold': {
      const config = (node as CompositeNode<'threshold'>).config;
      return `${operatorSymbols[config.op] ?? config.op} ${config.value}`;
    }
  }
}

function outputDotClass(outputType: OutputType) {
  return outputType === 'boolean' ? 'bg-bool' : 'bg-num';
}

function outputRailClass(outputType: OutputType) {
  return outputType === 'boolean' ? 'border-bool/50' : 'border-num/50';
}

function outputBadgeClass(outputType: OutputType) {
  return outputType === 'boolean'
    ? 'bg-bool-soft text-bool-soft-fg'
    : 'bg-num-soft text-num-soft-fg';
}

function MiniHistogram({ bars }: { bars: Array<{ label: string; proportion: number }> }) {
  if (bars.length === 0) {
    return (
      <div className="flex h-28 items-center justify-center rounded-md border border-line bg-surface text-sm text-muted">
        Preview unavailable
      </div>
    );
  }

  const maxProportion = Math.max(...bars.map((bar) => bar.proportion), 0.01);

  return (
    <div className="space-y-2" role="img" aria-label="Distribution histogram">
      <div className="flex h-32 items-end gap-1.5 rounded-md border border-line bg-surface px-2 pt-3 pb-2">
        {bars.map((bar) => (
          <div className="flex h-full min-w-0 flex-1 flex-col justify-end" key={bar.label}>
            <div
              aria-label={`${bar.label} ${(bar.proportion * 100).toFixed(1)}%`}
              className="min-h-2 w-full rounded-t-sm bg-num shadow-[inset_0_1px_0_rgba(255,255,255,0.35)]"
              style={{ height: `${Math.max(8, (bar.proportion / maxProportion) * 100)}%` }}
              title={`${bar.label}: ${formatPercent(bar.proportion)}`}
            />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs text-subtle md:grid-cols-5">
        {bars.map((bar) => (
          <div key={`${bar.label}-label`}>
            <div className="truncate font-medium text-muted">{bar.label}</div>
            <div>{formatPercent(bar.proportion)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

const inputClass =
  'w-full rounded-md border border-line bg-surface px-3 py-2 text-fg outline-none focus:border-accent focus:ring-2 focus:ring-accent/30';
const fieldLabelClass = 'space-y-1 text-sm text-fg';

const typeLabels: Record<LeafNodeType | CompositeNodeType, string> = {
  and: 'And',
  bernoulli: 'Bernoulli',
  beta: 'Beta',
  binomial: 'Binomial',
  count_true: 'Count True',
  k_of_n: 'K of N',
  lognormal: 'Lognormal',
  normal: 'Normal',
  not: 'Not',
  or: 'Or',
  pert: 'PERT',
  poisson: 'Poisson',
  sum: 'Sum',
  threshold: 'Threshold',
  triangular: 'Triangular',
  uniform: 'Uniform',
};

const typeHints: Record<LeafNodeType | CompositeNodeType, string> = {
  and: 'Use when every condition must be true.',
  bernoulli: 'A direct yes/no probability.',
  beta: 'A probability or proportion with uncertainty.',
  binomial: 'Count successes across fixed trials.',
  count_true: 'Turn several yes/no events into a number.',
  k_of_n: 'Use when at least some conditions must be true.',
  lognormal: 'Estimate a positive skewed quantity.',
  normal: 'Estimate a quantity with P10 / P50 / P90.',
  not: 'Invert one yes/no condition.',
  or: 'Use when any condition can make the forecast true.',
  pert: 'Estimate from minimum, likely, and maximum values.',
  poisson: 'Estimate how many times something happens.',
  sum: 'Add quantities together.',
  threshold: 'Compare a quantity or total against a target.',
  triangular: 'A simple minimum, likely, maximum estimate.',
  uniform: 'Any value in a range is equally plausible.',
};

const typeExamples: Record<LeafNodeType | CompositeNodeType, string> = {
  and: 'Example: launch happens AND pricing is approved.',
  bernoulli: 'Example: “the launch happens” with p = 60%.',
  beta: 'Example: conversion rate is around 5%, but uncertain.',
  binomial: 'Example: 30 calls, each with a 20% close chance.',
  count_true: 'Example: count how many milestones complete.',
  k_of_n: 'Example: at least 2 of 3 suppliers deliver.',
  lognormal: 'Example: revenue, traffic, or sales with a long upside tail.',
  normal: 'Example: copies sold with P10 / P50 / P90 estimates.',
  not: 'Example: “the launch does not happen.”',
  or: 'Example: launch happens if A OR B succeeds.',
  pert: 'Example: low / likely / high delivery time.',
  poisson: 'Example: expected number of customer signups.',
  sum: 'Example: add sales from multiple channels.',
  threshold: 'Example: total copies sold is at least 10.',
  triangular: 'Example: low / likely / high cost.',
  uniform: 'Example: value is somewhere between 5 and 10.',
};

function TypeHelpGraphic({ type }: { type: LeafNodeType | CompositeNodeType }) {
  if (type === 'bernoulli') {
    return (
      <svg aria-hidden="true" className="h-12 w-20 text-bool" viewBox="0 0 80 48">
        <line x1="8" x2="72" y1="40" y2="40" stroke="currentColor" strokeOpacity="0.35" />
        <rect x="18" y="24" width="14" height="16" rx="2" fill="currentColor" opacity="0.35" />
        <rect x="48" y="10" width="14" height="30" rx="2" fill="currentColor" />
        <text x="25" y="46" textAnchor="middle" fontSize="7" fill="currentColor">
          no
        </text>
        <text x="55" y="46" textAnchor="middle" fontSize="7" fill="currentColor">
          yes
        </text>
      </svg>
    );
  }

  if (type === 'normal' || type === 'lognormal' || type === 'beta' || type === 'pert') {
    const path =
      type === 'lognormal'
        ? 'M8 40 C16 40 18 10 28 10 C44 10 48 40 72 40'
        : 'M8 40 C24 40 28 10 40 10 C52 10 56 40 72 40';
    return (
      <svg aria-hidden="true" className="h-12 w-20 text-num" viewBox="0 0 80 48">
        <line x1="8" x2="72" y1="40" y2="40" stroke="currentColor" strokeOpacity="0.35" />
        <path d={path} fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="3" />
        <circle cx="40" cy="10" r="3" fill="currentColor" />
      </svg>
    );
  }

  if (type === 'binomial' || type === 'poisson' || type === 'count_true') {
    return (
      <svg aria-hidden="true" className="h-12 w-20 text-num" viewBox="0 0 80 48">
        <line x1="8" x2="72" y1="40" y2="40" stroke="currentColor" strokeOpacity="0.35" />
        <rect x="16" y="24" width="8" height="16" rx="1.5" fill="currentColor" opacity="0.5" />
        <rect x="30" y="14" width="8" height="26" rx="1.5" fill="currentColor" />
        <rect x="44" y="20" width="8" height="20" rx="1.5" fill="currentColor" opacity="0.75" />
        <rect x="58" y="30" width="8" height="10" rx="1.5" fill="currentColor" opacity="0.35" />
      </svg>
    );
  }

  if (type === 'sum' || type === 'threshold') {
    return (
      <svg aria-hidden="true" className="h-12 w-20 text-num" viewBox="0 0 80 48">
        <line x1="10" x2="70" y1="38" y2="38" stroke="currentColor" strokeOpacity="0.35" />
        <path d="M14 30 H28 M21 23 V37" stroke="currentColor" strokeLinecap="round" strokeWidth="3" />
        <path d="M34 30 H48 M41 23 V37" stroke="currentColor" strokeLinecap="round" strokeWidth="3" />
        <path d="M54 24 H68 M54 32 H68" stroke="currentColor" strokeLinecap="round" strokeWidth="3" />
        {type === 'threshold' ? (
          <path d="M50 12 H70 M50 12 L58 6 M50 12 L58 18" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
        ) : null}
      </svg>
    );
  }

  if (type === 'and' || type === 'or' || type === 'not' || type === 'k_of_n') {
    const label = type === 'and' ? 'AND' : type === 'or' ? 'OR' : type === 'not' ? 'NOT' : 'K/N';
    return (
      <svg aria-hidden="true" className="h-12 w-20 text-bool" viewBox="0 0 80 48">
        <circle cx="22" cy="24" r="8" fill="currentColor" opacity="0.35" />
        <circle cx="58" cy="24" r="8" fill="currentColor" opacity="0.35" />
        <line x1="30" x2="50" y1="24" y2="24" stroke="currentColor" strokeWidth="2" />
        <text x="40" y="44" textAnchor="middle" fontSize="9" fontWeight="700" fill="currentColor">
          {label}
        </text>
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" className="h-12 w-20 text-num" viewBox="0 0 80 48">
      <line x1="8" x2="72" y1="40" y2="40" stroke="currentColor" strokeOpacity="0.35" />
      <path d="M12 40 L40 12 L68 40" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="3" />
    </svg>
  );
}

function TypeHelpContent({ type }: { type: LeafNodeType | CompositeNodeType }) {
  return (
    <div className="flex gap-3">
      <div
        className={`flex h-14 w-24 shrink-0 items-center justify-center rounded-md ${
          getNodeTypeOption(type).outputType === 'boolean' ? 'bg-bool-soft' : 'bg-num-soft'
        }`}
      >
        <TypeHelpGraphic type={type} />
      </div>
      <div>
        <p className="font-medium text-fg">{typeLabels[type]}</p>
        <p className="mt-1 text-xs leading-5 text-muted">
          {typeHints[type]} {typeExamples[type]}
        </p>
      </div>
    </div>
  );
}

function TypeHelpHover({ type }: { type: LeafNodeType | CompositeNodeType }) {
  return (
    <div className="pointer-events-none absolute left-0 top-full z-30 mt-2 hidden w-72 rounded-lg border border-line bg-surface p-3 text-sm shadow-xl group-hover:block">
      <TypeHelpContent type={type} />
    </div>
  );
}

function TypeLabelWithHelp({
  type,
  iconClassName,
}: {
  type: LeafNodeType | CompositeNodeType;
  iconClassName?: string;
}) {
  return (
    <span className="relative flex min-w-0 items-center gap-2">
      <NodeTypeIcon type={type} className={iconClassName} />
      <span>{typeLabels[type]}</span>
      <span
        aria-label={`About ${typeLabels[type]}`}
        className="flex h-4 w-4 items-center justify-center rounded-full border border-line text-[10px] text-subtle"
      >
        ?
      </span>
      <TypeHelpHover type={type} />
    </span>
  );
}

type LeafEditorProps = {
  node: LeafNode;
  error?: string;
  getDraftValue: (nodeId: string, field: string, fallback: number | string) => string;
  onFieldChange: (node: LeafNode, field: string, value: string) => void;
  onBetaModeChange: (node: LeafNode<'beta'>, mode: 'mean' | 'counts') => void;
};

function LeafNodeEditor({
  node,
  error,
  getDraftValue,
  onFieldChange,
  onBetaModeChange,
}: LeafEditorProps) {
  const previewState = useMemo(() => {
    try {
      return { preview: buildLeafPreview(node), error: null };
    } catch (error) {
      return {
        preview: null,
        error: error instanceof Error ? error.message : 'Unable to build the preview.',
      };
    }
  }, [node]);
  const preview = previewState.preview;
  const bernoulliNode = node.type === 'bernoulli' ? (node as LeafNode<'bernoulli'>) : null;
  const binomialNode = node.type === 'binomial' ? (node as LeafNode<'binomial'>) : null;
  const poissonNode = node.type === 'poisson' ? (node as LeafNode<'poisson'>) : null;
  const quantileNode =
    node.type === 'normal' || node.type === 'lognormal'
      ? (node as LeafNode<'normal'> | LeafNode<'lognormal'>)
      : null;
  const betaNode = node.type === 'beta' ? (node as LeafNode<'beta'>) : null;
  const uniformNode = node.type === 'uniform' ? (node as LeafNode<'uniform'>) : null;
  const threePointNode =
    node.type === 'triangular' || node.type === 'pert'
      ? (node as LeafNode<'triangular'> | LeafNode<'pert'>)
      : null;

  if (bernoulliNode) {
    const probability = bernoulliNode.params.p;
    const noProbability = 1 - probability;

    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-line bg-panel p-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-muted">Probability</p>
              <p className="mt-1 text-4xl font-semibold text-fg">{formatPercent(probability)}</p>
            </div>
            <label className="w-36 space-y-1 text-sm text-fg">
              <span className="font-medium">p</span>
              <input
                aria-label={`Probability for ${node.id}`}
                className={inputClass}
                max="1"
                min="0"
                onChange={(event) => onFieldChange(node, 'p', event.target.value)}
                step="0.01"
                type="number"
                value={getDraftValue(node.id, 'p', bernoulliNode.elicitation?.p ?? bernoulliNode.params.p)}
              />
            </label>
          </div>

          <input
            aria-label={`Probability slider for ${node.id}`}
            className="mt-5 w-full accent-bool"
            max="1"
            min="0"
            onChange={(event) => onFieldChange(node, 'p', event.target.value)}
            step="0.01"
            type="range"
            value={getDraftValue(node.id, 'p', bernoulliNode.elicitation?.p ?? bernoulliNode.params.p)}
          />

          <div className="mt-4 overflow-hidden rounded-lg border border-line bg-surface">
            <div className="flex h-16">
              <div
                className="flex min-w-8 items-center justify-center bg-panel text-xs font-medium text-muted"
                style={{ width: `${Math.max(4, noProbability * 100)}%` }}
              >
                No
              </div>
              <div
                className="flex min-w-8 items-center justify-center bg-bool text-xs font-medium text-white"
                style={{ width: `${Math.max(4, probability * 100)}%` }}
              >
                Yes
              </div>
            </div>
            <div className="grid grid-cols-2 border-t border-line text-sm">
              <div className="p-3">
                <p className="text-subtle">No</p>
                <p className="font-medium text-fg">{formatPercent(noProbability)}</p>
              </div>
              <div className="border-l border-line p-3">
                <p className="text-subtle">Yes</p>
                <p className="font-medium text-fg">{formatPercent(probability)}</p>
              </div>
            </div>
          </div>
        </div>

        {error ? (
          <div className="rounded-md border border-bad/40 bg-bad-soft p-3 text-sm text-bad-soft-fg">
            {error}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-line bg-panel p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-muted">Estimate inputs</p>
            <p className="mt-1 text-xs text-subtle">{typeHints[node.type]}</p>
          </div>
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${outputBadgeClass('numeric')}`}>
            numeric
          </span>
        </div>
        <div className="mt-4">
      {binomialNode ? (
        <div className="grid gap-3 md:grid-cols-2">
          <label className={fieldLabelClass}>
            <span className="font-medium">Trials (n)</span>
            <input
              aria-label={`Trials for ${node.id}`}
              className={inputClass}
              onChange={(event) => onFieldChange(node, 'n', event.target.value)}
              type="number"
              value={getDraftValue(node.id, 'n', binomialNode.elicitation?.n ?? binomialNode.params.n)}
            />
          </label>
          <label className={fieldLabelClass}>
            <span className="font-medium">Success probability (p)</span>
            <input
              aria-label={`Success probability for ${node.id}`}
              className={inputClass}
              onChange={(event) => onFieldChange(node, 'p', event.target.value)}
              type="number"
              value={getDraftValue(node.id, 'p', binomialNode.elicitation?.p ?? binomialNode.params.p)}
            />
          </label>
        </div>
      ) : null}

      {poissonNode ? (
        <label className={fieldLabelClass}>
          <span className="font-medium">Expected count</span>
          <input
            aria-label={`Expected count for ${node.id}`}
            className={inputClass}
            onChange={(event) => onFieldChange(node, 'lambda', event.target.value)}
            type="number"
            value={getDraftValue(
              node.id,
              'lambda',
              poissonNode.elicitation?.lambda ?? poissonNode.params.lambda,
            )}
          />
        </label>
      ) : null}

      {quantileNode ? (
        <div className="space-y-1">
          <p className="text-xs text-muted">
            Your 10th, 50th and 90th percentile estimates — the spread sets the uncertainty.
          </p>
          <div className="grid gap-3 md:grid-cols-3">
            <label className={fieldLabelClass}>
              <span className="font-medium">P10</span>
              <input
                aria-label={`P10 for ${node.id}`}
                className={inputClass}
                onChange={(event) => onFieldChange(node, 'p10', event.target.value)}
                type="number"
                value={getDraftValue(node.id, 'p10', quantileNode.elicitation?.p10 ?? '')}
              />
            </label>
            <label className={fieldLabelClass}>
              <span className="font-medium">P50</span>
              <input
                aria-label={`P50 for ${node.id}`}
                className={inputClass}
                onChange={(event) => onFieldChange(node, 'p50', event.target.value)}
                type="number"
                value={getDraftValue(node.id, 'p50', quantileNode.elicitation?.p50 ?? '')}
              />
            </label>
            <label className={fieldLabelClass}>
              <span className="font-medium">P90</span>
              <input
                aria-label={`P90 for ${node.id}`}
                className={inputClass}
                onChange={(event) => onFieldChange(node, 'p90', event.target.value)}
                type="number"
                value={getDraftValue(node.id, 'p90', quantileNode.elicitation?.p90 ?? '')}
              />
            </label>
          </div>
        </div>
      ) : null}

      {betaNode ? (
        <div className="space-y-3">
          <label className={fieldLabelClass}>
            <span className="font-medium">Elicitation mode</span>
            <select
              aria-label={`Beta mode for ${node.id}`}
              className={inputClass}
              onChange={(event) =>
                onBetaModeChange(betaNode, event.target.value === 'counts' ? 'counts' : 'mean')
              }
              value={betaMode(betaNode)}
            >
              <option value="mean">Mean + concentration</option>
              <option value="counts">Pseudo-counts</option>
            </select>
          </label>

          {betaMode(betaNode) === 'mean' ? (
            <div className="grid gap-3 md:grid-cols-2">
              <label className={fieldLabelClass}>
                <span className="font-medium">Mean</span>
                <input
                  aria-label={`Mean for ${node.id}`}
                  className={inputClass}
                  onChange={(event) => onFieldChange(node, 'mean', event.target.value)}
                  type="number"
                  value={getDraftValue(
                    node.id,
                    'mean',
                    betaNode.elicitation && 'mean' in betaNode.elicitation
                      ? betaNode.elicitation.mean
                      : 0.5,
                  )}
                />
              </label>
              <label className={fieldLabelClass}>
                <span className="font-medium">Concentration</span>
                <input
                  aria-label={`Concentration for ${node.id}`}
                  className={inputClass}
                  onChange={(event) => onFieldChange(node, 'concentration', event.target.value)}
                  type="number"
                  value={getDraftValue(
                    node.id,
                    'concentration',
                    betaNode.elicitation && 'mean' in betaNode.elicitation
                      ? betaNode.elicitation.concentration
                      : 4,
                  )}
                />
              </label>
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-4">
              <label className={fieldLabelClass}>
                <span className="font-medium">Successes</span>
                <input
                  aria-label={`Successes for ${node.id}`}
                  className={inputClass}
                  onChange={(event) => onFieldChange(node, 'successes', event.target.value)}
                  type="number"
                  value={getDraftValue(
                    node.id,
                    'successes',
                    betaNode.elicitation && 'successes' in betaNode.elicitation
                      ? betaNode.elicitation.successes
                      : 1,
                  )}
                />
              </label>
              <label className={fieldLabelClass}>
                <span className="font-medium">Failures</span>
                <input
                  aria-label={`Failures for ${node.id}`}
                  className={inputClass}
                  onChange={(event) => onFieldChange(node, 'failures', event.target.value)}
                  type="number"
                  value={getDraftValue(
                    node.id,
                    'failures',
                    betaNode.elicitation && 'successes' in betaNode.elicitation
                      ? betaNode.elicitation.failures
                      : 1,
                  )}
                />
              </label>
              <label className={fieldLabelClass}>
                <span className="font-medium">Prior alpha</span>
                <input
                  aria-label={`Prior alpha for ${node.id}`}
                  className={inputClass}
                  onChange={(event) => onFieldChange(node, 'priorAlpha', event.target.value)}
                  type="number"
                  value={getDraftValue(
                    node.id,
                    'priorAlpha',
                    betaNode.elicitation && 'successes' in betaNode.elicitation
                      ? betaNode.elicitation.priorAlpha ?? 1
                      : 1,
                  )}
                />
              </label>
              <label className={fieldLabelClass}>
                <span className="font-medium">Prior beta</span>
                <input
                  aria-label={`Prior beta for ${node.id}`}
                  className={inputClass}
                  onChange={(event) => onFieldChange(node, 'priorBeta', event.target.value)}
                  type="number"
                  value={getDraftValue(
                    node.id,
                    'priorBeta',
                    betaNode.elicitation && 'successes' in betaNode.elicitation
                      ? betaNode.elicitation.priorBeta ?? 1
                      : 1,
                  )}
                />
              </label>
            </div>
          )}
        </div>
      ) : null}

      {uniformNode ? (
        <div className="grid gap-3 md:grid-cols-2">
          <label className={fieldLabelClass}>
            <span className="font-medium">Minimum (a)</span>
            <input
              aria-label={`Minimum for ${node.id}`}
              className={inputClass}
              onChange={(event) => onFieldChange(node, 'a', event.target.value)}
              type="number"
              value={getDraftValue(node.id, 'a', uniformNode.elicitation?.a ?? uniformNode.params.a)}
            />
          </label>
          <label className={fieldLabelClass}>
            <span className="font-medium">Maximum (b)</span>
            <input
              aria-label={`Maximum for ${node.id}`}
              className={inputClass}
              onChange={(event) => onFieldChange(node, 'b', event.target.value)}
              type="number"
              value={getDraftValue(node.id, 'b', uniformNode.elicitation?.b ?? uniformNode.params.b)}
            />
          </label>
        </div>
      ) : null}

      {threePointNode ? (
        <div className="grid gap-3 md:grid-cols-3">
          <label className={fieldLabelClass}>
            <span className="font-medium">Minimum</span>
            <input
              aria-label={`Minimum for ${node.id}`}
              className={inputClass}
              onChange={(event) => onFieldChange(node, 'min', event.target.value)}
              type="number"
              value={getDraftValue(node.id, 'min', threePointNode.elicitation?.min ?? threePointNode.params.min)}
            />
          </label>
          <label className={fieldLabelClass}>
            <span className="font-medium">Mode</span>
            <input
              aria-label={`Mode for ${node.id}`}
              className={inputClass}
              onChange={(event) => onFieldChange(node, 'mode', event.target.value)}
              type="number"
              value={getDraftValue(node.id, 'mode', threePointNode.elicitation?.mode ?? threePointNode.params.mode)}
            />
          </label>
          <label className={fieldLabelClass}>
            <span className="font-medium">Maximum</span>
            <input
              aria-label={`Maximum for ${node.id}`}
              className={inputClass}
              onChange={(event) => onFieldChange(node, 'max', event.target.value)}
              type="number"
              value={getDraftValue(node.id, 'max', threePointNode.elicitation?.max ?? threePointNode.params.max)}
            />
          </label>
        </div>
      ) : null}
        </div>
      </div>

      {error ? (
        <div className="rounded-md border border-bad/40 bg-bad-soft p-3 text-sm text-bad-soft-fg">
          {error}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr),16rem]">
        <div className="rounded-lg border border-line bg-panel p-3">
          <p className="text-sm font-medium text-muted">Distribution preview</p>
          <div className="mt-3">
            {preview ? (
              <MiniHistogram bars={preview.bars} />
            ) : (
              <div className="rounded-md border border-bad/40 bg-bad-soft p-3 text-sm text-bad-soft-fg">
                {previewState.error}
              </div>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-line bg-panel p-3 text-sm">
          <p className="font-medium text-muted">Implied values</p>
          {preview?.impliedQuantiles ? (
            <dl className="mt-3 space-y-2">
              <div className="flex justify-between gap-3">
                <dt className="text-subtle">P10</dt>
                <dd className="font-medium">{formatNumber(preview.impliedQuantiles.p10)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-subtle">P50</dt>
                <dd className="font-medium">{formatNumber(preview.impliedQuantiles.p50)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-subtle">P90</dt>
                <dd className="font-medium">{formatNumber(preview.impliedQuantiles.p90)}</dd>
              </div>
            </dl>
          ) : (
            <p className="mt-3 text-muted">
              {previewState.error ??
                'Boolean leaves show their implied yes-rate rather than numeric quantiles.'}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

type CompositeEditorProps = {
  node: CompositeNode;
  error?: string;
  getDraftValue: (nodeId: string, field: string, fallback: number | string) => string;
  onFieldChange: (node: CompositeNode, field: string, value: string) => void;
  onThresholdOperatorChange: (node: CompositeNode<'threshold'>, value: string) => void;
};

function CompositeNodeEditor({
  node,
  error,
  getDraftValue,
  onFieldChange,
  onThresholdOperatorChange,
}: CompositeEditorProps) {
  const childOutput = getExpectedChildOutputType(node);
  const kOfNNode = node.type === 'k_of_n' ? (node as CompositeNode<'k_of_n'>) : null;
  const thresholdNode = node.type === 'threshold' ? (node as CompositeNode<'threshold'>) : null;

  return (
    <div className="space-y-4">
      {kOfNNode ? (
        <label className={fieldLabelClass}>
          <span className="font-medium">Required true children (k)</span>
          <input
            aria-label={`K for ${node.id}`}
            className={inputClass}
            onChange={(event) => onFieldChange(node, 'k', event.target.value)}
            type="number"
            value={getDraftValue(node.id, 'k', kOfNNode.config.k)}
          />
          <span className="block text-xs text-subtle">
            Must be between 1 and {node.children.length}.
          </span>
        </label>
      ) : null}

      {thresholdNode ? (
        <div className="grid gap-3 md:grid-cols-2">
          <label className={fieldLabelClass}>
            <span className="font-medium">Operator</span>
            <select
              aria-label={`Threshold operator for ${node.id}`}
              className={inputClass}
              onChange={(event) => onThresholdOperatorChange(thresholdNode, event.target.value)}
              value={thresholdNode.config.op}
            >
              {thresholdOperators.map((operator) => (
                <option key={operator} value={operator}>
                  {operator}
                </option>
              ))}
            </select>
          </label>
          <label className={fieldLabelClass}>
            <span className="font-medium">Threshold value</span>
            <input
              aria-label={`Threshold value for ${node.id}`}
              className={inputClass}
              onChange={(event) => onFieldChange(node, 'value', event.target.value)}
              type="number"
              value={getDraftValue(node.id, 'value', thresholdNode.config.value)}
            />
          </label>
        </div>
      ) : null}

      <p className="text-sm text-muted">
        {childOutput === null
          ? 'This node does not accept children.'
          : `This ${node.type.replaceAll('_', ' ')} node combines ${childOutput} children.`}
      </p>

      {error ? (
        <div className="rounded-md border border-bad/40 bg-bad-soft p-3 text-sm text-bad-soft-fg">
          {error}
        </div>
      ) : null}
    </div>
  );
}

const focusModes: Array<{ mode: FocusMode; label: string; icon: string }> = [
  { mode: 'tree', label: 'Tree', icon: '⌗' },
  { mode: 'split', label: 'Split', icon: '◫' },
  { mode: 'node', label: 'Node', icon: '⚙' },
];

const compositeGlyphs: Record<CompositeNodeType, string> = {
  and: '∧',
  or: '∨',
  not: '¬',
  k_of_n: 'k/n',
  count_true: '#',
  sum: 'Σ',
  threshold: '≥',
};

// A small at-a-glance icon per node type: distribution leaves get a silhouette
// of their shape; composites get their logical/math symbol. Inherits color via
// currentColor so it adapts to light/dark and selected states.
function NodeTypeIcon({ type, className }: { type: LeafNodeType | CompositeNodeType; className?: string }) {
  const stroke = {
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.4,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  const svgProps = { width: 16, height: 16, viewBox: '0 0 16 16', 'aria-hidden': true, className };

  switch (type) {
    case 'normal':
    case 'pert':
    case 'beta':
      return (
        <svg {...svgProps}>
          <path d="M1 13 Q8 1 15 13" {...stroke} />
        </svg>
      );
    case 'lognormal':
      return (
        <svg {...svgProps}>
          <path d="M1 13 C2 13 3 3 5 3 C8 3 11 13 15 13" {...stroke} />
        </svg>
      );
    case 'uniform':
      return (
        <svg {...svgProps}>
          <path d="M1 13 L1 6 L15 6 L15 13" {...stroke} />
        </svg>
      );
    case 'triangular':
      return (
        <svg {...svgProps}>
          <path d="M1 13 L8 3 L15 13" {...stroke} />
        </svg>
      );
    case 'bernoulli':
      return (
        <svg {...svgProps}>
          <path d="M4 13 L4 9 M12 13 L12 4" {...stroke} strokeWidth={2} />
        </svg>
      );
    case 'binomial':
      return (
        <svg {...svgProps}>
          <path d="M3 13 L3 9 M8 13 L8 4 M13 13 L13 7" {...stroke} strokeWidth={2} />
        </svg>
      );
    case 'poisson':
      return (
        <svg {...svgProps}>
          <path d="M3 13 L3 5 M8 13 L8 7 M13 13 L13 10" {...stroke} strokeWidth={2} />
        </svg>
      );
    default:
      return (
        <svg {...svgProps}>
          <text
            x="8"
            y="8"
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={type === 'k_of_n' ? 8 : 12}
            fill="currentColor"
          >
            {compositeGlyphs[type as CompositeNodeType] ?? '?'}
          </text>
        </svg>
      );
  }
}

function RootChooser({
  onChoose,
  notice,
}: {
  onChoose: (type: LeafNodeType | CompositeNodeType) => void;
  notice?: string;
}) {
  const rootTypes = nodeTypeOptions.filter((option) => option.outputType === 'boolean');

  return (
    <section className="rounded-xl border border-line bg-surface p-6">
      <h2 className="text-lg font-medium text-fg">Start your forecast</h2>
      <p className="mt-1 max-w-2xl text-sm text-muted">
        Pick how the top-level question resolves. Composites let you decompose it into conditions;
        you can always change the type or nest more later.
      </p>
      {notice ? (
        <div className="mt-4 rounded-md border border-warn/40 bg-warn-soft p-3 text-sm text-warn-soft-fg">
          {notice}
        </div>
      ) : null}
      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {rootTypes.map((option) => (
          <button
            aria-label={`Start with ${typeLabels[option.type]}`}
            className="group relative flex items-start gap-3 rounded-lg border border-line bg-surface p-3 text-left transition hover:border-accent hover:bg-accent-soft"
            key={option.type}
            onClick={() => onChoose(option.type)}
            type="button"
          >
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-panel text-fg">
              <NodeTypeIcon type={option.type} />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-medium text-fg">{typeLabels[option.type]}</span>
              <span className="block text-xs text-muted">{typeHints[option.type]}</span>
            </span>
            <TypeHelpHover type={option.type} />
          </button>
        ))}
      </div>
    </section>
  );
}

function buildStarterNode(
  type: LeafNodeType | CompositeNodeType,
  id: string,
  label: string,
  nextId: () => string,
): TreeNode {
  const node = createNode(type, id, label);

  if (node.kind === 'leaf') {
    return node;
  }

  switch (type) {
    case 'and':
    case 'or':
      return {
        ...node,
        children: [createNode('bernoulli', nextId(), 'New yes/no event')],
      };
    case 'not':
      return {
        ...node,
        children: [createNode('bernoulli', nextId(), 'Event to invert')],
      };
    case 'k_of_n':
      return {
        ...node,
        children: [
          createNode('bernoulli', nextId(), 'Condition 1'),
          createNode('bernoulli', nextId(), 'Condition 2'),
        ],
      };
    case 'count_true':
      return {
        ...node,
        children: [createNode('bernoulli', nextId(), 'Event to count')],
      };
    case 'sum':
      return {
        ...node,
        children: [createNode('normal', nextId(), 'Quantity estimate')],
      };
    case 'threshold': {
      const total = createNode('sum', nextId(), 'Total quantity') as CompositeNode<'sum'>;
      return {
        ...node,
        config: { op: '>=', value: 10 },
        children: [
          {
            ...total,
            children: [createNode('normal', nextId(), 'Quantity estimate')],
          },
        ],
      };
    }
  }

  return node;
}

export function TreeEditorShell({ forecastId, initialTree, initialTreeError }: TreeEditorShellProps) {
  const [tree, setTree] = useState<Tree | null>(() =>
    initialTree ? repairDuplicateNodeIds(initialTree) : null,
  );

  if (!tree) {
    return (
      <RootChooser
        notice={initialTreeError}
        onChoose={(type) => {
          let nextId = 1;
          const allocateId = () => {
            const id = `node-${nextId}`;
            nextId += 1;
            return id;
          };

          setTree({ root: buildStarterNode(type, 'root', 'Untitled forecast', allocateId) });
        }}
      />
    );
  }

  return <ForecastTreeEditor forecastId={forecastId} initialTree={tree} />;
}

function ForecastTreeEditor({ forecastId, initialTree }: ForecastTreeEditorProps) {
  const router = useRouter();
  const [tree, setTree] = useState(initialTree);
  const [selectedId, setSelectedId] = useState(initialTree.root.id);
  const [focusMode, setFocusMode] = useState<FocusMode>('split');
  const [collapsedIds, setCollapsedIds] = useState<Record<string, boolean>>({});
  const [blockedMessage, setBlockedMessage] = useState<string | null>(null);
  const [addMenuFor, setAddMenuFor] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [fieldDrafts, setFieldDrafts] = useState<FieldDrafts>({});
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [headline, setHeadline] = useState<HeadlineState>({ status: 'idle' });
  const [headlinePending, setHeadlinePending] = useState(() => validateTree(initialTree).valid);
  const [saveState, setSaveState] = useState<SaveState>({ status: 'idle' });
  const usedNodeIdsRef = useRef(new Set(flattenTree(initialTree.root).map((node) => node.id)));
  const nextIdRef = useRef(nextNodeIdSeed(initialTree));

  const storageKey = `forecast-editor:focus:${forecastId}`;

  const validation = useMemo(() => validateTree(tree), [tree]);

  useEffect(() => {
    const stored = window.localStorage.getItem(storageKey);
    if (stored === 'tree' || stored === 'split' || stored === 'node') {
      // Hydrate the persisted focus preference once on mount. Done in an effect
      // (not a lazy initializer) to avoid a server/client hydration mismatch,
      // since localStorage is unavailable during SSR.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFocusMode(stored);
    }
  }, [storageKey]);

  function changeFocusMode(mode: FocusMode) {
    setFocusMode(mode);
    window.localStorage.setItem(storageKey, mode);
  }

  useEffect(() => {
    if (!validation.valid) {
      return;
    }

    const timeout = window.setTimeout(() => {
      try {
        const result = runForecast(tree, { seed: `editor:${forecastId}` });
        setHeadline({ status: 'ready', result });
        setHeadlinePending(false);
      } catch (error) {
        setHeadline({
          status: 'error',
          message: error instanceof Error ? error.message : 'Unable to recompute the headline.',
        });
        setHeadlinePending(false);
      }
    }, HEADLINE_DEBOUNCE_MS);

    return () => window.clearTimeout(timeout);
  }, [forecastId, tree, validation.valid]);

  function nextNodeId() {
    let nextId: string;
    do {
      nextIdRef.current += 1;
      nextId = `node-${nextIdRef.current}`;
    } while (usedNodeIdsRef.current.has(nextId));
    usedNodeIdsRef.current.add(nextId);
    return nextId;
  }

  function clearNodeFeedback(nodeId: string) {
    setFieldErrors((current) => {
      const next: FieldErrors = {};
      for (const [key, value] of Object.entries(current)) {
        if (!key.startsWith(`${nodeId}:`)) {
          next[key] = value;
        }
      }
      return next;
    });

    setFieldDrafts((current) => {
      const next: FieldDrafts = {};
      for (const [key, value] of Object.entries(current)) {
        if (!key.startsWith(`${nodeId}:`)) {
          next[key] = value;
        }
      }
      return next;
    });
  }

  function updateTree(nextTree: Tree) {
    setBlockedMessage(null);
    setSaveState({ status: 'idle' });
    setHeadlinePending(validateTree(nextTree).valid);
    setTree(nextTree);
  }

  function toggleCollapsed(nodeId: string) {
    setCollapsedIds((current) => ({ ...current, [nodeId]: !current[nodeId] }));
  }

  function getDraftValue(nodeId: string, field: string, fallback: number | string) {
    return fieldDrafts[draftKey(nodeId, field)] ?? String(fallback);
  }

  function commitNode(nodeId: string, nextNode: TreeNode, touchedFields: string[]) {
    updateTree(replaceNode(tree, nodeId, nextNode));

    setFieldErrors((current) => {
      const next = { ...current };
      for (const field of touchedFields) {
        delete next[draftKey(nodeId, field)];
      }
      return next;
    });

    setFieldDrafts((current) => {
      const next = { ...current };
      for (const field of touchedFields) {
        delete next[draftKey(nodeId, field)];
      }
      return next;
    });
  }

  function setNodeError(nodeId: string, field: string, message: string) {
    setFieldErrors((current) => ({ ...current, [draftKey(nodeId, field)]: message }));
  }

  function handleTypeChange(
    node: TreeNode,
    nextType: LeafNodeType | CompositeNodeType,
    expectedOutputType: OutputType | null,
  ) {
    if (expectedOutputType !== null && !canUseNodeType(nextType, expectedOutputType)) {
      setBlockedMessage(describeBlockedTypeChange(nextType, expectedOutputType));
      return;
    }

    clearNodeFeedback(node.id);
    updateTree(changeNodeType(tree, node.id, nextType));
  }

  function buildTypedNode(type: LeafNodeType | CompositeNodeType): TreeNode {
    return buildStarterNode(
      type,
      nextNodeId(),
      `New ${typeLabels[type].toLowerCase()}`,
      nextNodeId,
    );
  }

  function canAddChild(node: TreeNode): boolean {
    if (node.kind !== 'composite') {
      return false;
    }
    // threshold / not are full once they have their single child.
    if ((node.type === 'threshold' || node.type === 'not') && node.children.length >= 1) {
      return false;
    }
    return true;
  }

  function validChildTypes(node: TreeNode) {
    const expected = getExpectedChildOutputType(node);
    return nodeTypeOptions.filter(
      (option) => expected === null || canUseNodeType(option.type, expected),
    );
  }

  function compatibleTypeOptions(expectedOutputType: OutputType | null) {
    return nodeTypeOptions.filter(
      (option) => expectedOutputType === null || option.outputType === expectedOutputType,
    );
  }

  function addTypedChild(node: TreeNode, type: LeafNodeType | CompositeNodeType) {
    setAddMenuFor(null);
    if (!canAddChild(node)) {
      return;
    }

    const expectedOutputType = getExpectedChildOutputType(node);
    if (expectedOutputType !== null && !canUseNodeType(type, expectedOutputType)) {
      setBlockedMessage(
        `Cannot add ${type} here. ${describeBlockedTypeChange(type, expectedOutputType)}`,
      );
      return;
    }

    const child = buildTypedNode(type);
    updateTree(addChildNode(tree, node.id, child));
    setSelectedId(child.id);
    setCollapsedIds((current) => ({ ...current, [node.id]: false }));
  }

  function cloneSubtree(node: TreeNode): TreeNode {
    if (node.kind === 'leaf') {
      return { ...node, id: nextNodeId() };
    }
    return { ...node, id: nextNodeId(), children: node.children.map(cloneSubtree) };
  }

  function handleDuplicate(node: TreeNode, parent: TreeNode | null) {
    if (parent === null) {
      return;
    }
    const clone = cloneSubtree(node);
    updateTree(addChildNode(tree, parent.id, clone));
    setSelectedId(clone.id);
  }

  function startRename(node: TreeNode) {
    setRenamingId(node.id);
    setRenameDraft(node.label);
  }

  function commitRename() {
    if (renamingId) {
      updateTree(renameNode(tree, renamingId, renameDraft));
    }
    setRenamingId(null);
  }

  function handleDelete(node: TreeNode, parent: TreeNode | null) {
    if (parent === null) {
      return;
    }
    if (selectedId === node.id) {
      setSelectedId(parent.id);
    }
    updateTree(deleteNode(tree, node.id));
  }

  function handleLeafFieldChange(node: LeafNode, field: string, rawValue: string) {
    const key = draftKey(node.id, field);
    setFieldDrafts((current) => ({ ...current, [key]: rawValue }));

    try {
      switch (node.type) {
        case 'bernoulli': {
          const typedNode = node as LeafNode<'bernoulli'>;
          const p = parseProbability(rawValue, 'Probability');
          commitNode(typedNode.id, { ...typedNode, params: { p }, elicitation: { p } }, ['p']);
          return;
        }
        case 'binomial': {
          const typedNode = node as LeafNode<'binomial'>;
          const n = parseNonNegativeInteger(
            field === 'n'
              ? rawValue
              : getDraftValue(typedNode.id, 'n', typedNode.elicitation?.n ?? typedNode.params.n),
            'Trials',
          );
          const p = parseProbability(
            field === 'p'
              ? rawValue
              : getDraftValue(typedNode.id, 'p', typedNode.elicitation?.p ?? typedNode.params.p),
            'Success probability',
          );
          commitNode(typedNode.id, { ...typedNode, params: { n, p }, elicitation: { n, p } }, ['n', 'p']);
          return;
        }
        case 'poisson': {
          const typedNode = node as LeafNode<'poisson'>;
          const lambda = parseNonNegativeNumber(rawValue, 'Expected count');
          const fitted = fitPoissonFromExpectedCount({ lambda });
          commitNode(
            typedNode.id,
            { ...typedNode, params: fitted.params, elicitation: { lambda } },
            ['lambda'],
          );
          return;
        }
        case 'normal': {
          const typedNode = node as LeafNode<'normal'>;
          const p10 = parseFiniteNumber(
            field === 'p10' ? rawValue : getDraftValue(typedNode.id, 'p10', typedNode.elicitation?.p10 ?? ''),
            'P10',
          );
          const p50 = parseFiniteNumber(
            field === 'p50' ? rawValue : getDraftValue(typedNode.id, 'p50', typedNode.elicitation?.p50 ?? ''),
            'P50',
          );
          const p90 = parseFiniteNumber(
            field === 'p90' ? rawValue : getDraftValue(typedNode.id, 'p90', typedNode.elicitation?.p90 ?? ''),
            'P90',
          );
          const fitted = fitNormalFromQuantiles({ p10, p50, p90 });
          commitNode(
            typedNode.id,
            { ...typedNode, params: fitted.params, elicitation: { p10, p50, p90 } },
            ['p10', 'p50', 'p90'],
          );
          return;
        }
        case 'lognormal': {
          const typedNode = node as LeafNode<'lognormal'>;
          const p10 = parseFiniteNumber(
            field === 'p10' ? rawValue : getDraftValue(typedNode.id, 'p10', typedNode.elicitation?.p10 ?? ''),
            'P10',
          );
          const p50 = parseFiniteNumber(
            field === 'p50' ? rawValue : getDraftValue(typedNode.id, 'p50', typedNode.elicitation?.p50 ?? ''),
            'P50',
          );
          const p90 = parseFiniteNumber(
            field === 'p90' ? rawValue : getDraftValue(typedNode.id, 'p90', typedNode.elicitation?.p90 ?? ''),
            'P90',
          );
          const fitted = fitLogNormalFromQuantiles({ p10, p50, p90 });
          commitNode(
            typedNode.id,
            { ...typedNode, params: fitted.params, elicitation: { p10, p50, p90 } },
            ['p10', 'p50', 'p90'],
          );
          return;
        }
        case 'beta': {
          const typedNode = node as LeafNode<'beta'>;

          if (betaMode(typedNode) === 'mean') {
            const mean = parseProbability(
              field === 'mean' ? rawValue : getDraftValue(typedNode.id, 'mean', 0.5),
              'Mean',
            );
            const concentration = parsePositiveNumber(
              field === 'concentration' ? rawValue : getDraftValue(typedNode.id, 'concentration', 4),
              'Concentration',
            );
            const fitted = fitBetaFromMeanConcentration({ mean, concentration });
            commitNode(
              typedNode.id,
              { ...typedNode, params: fitted.params, elicitation: { mean, concentration } },
              ['mean', 'concentration'],
            );
            return;
          }

          const successes = parseNonNegativeNumber(
            field === 'successes' ? rawValue : getDraftValue(typedNode.id, 'successes', 1),
            'Successes',
          );
          const failures = parseNonNegativeNumber(
            field === 'failures' ? rawValue : getDraftValue(typedNode.id, 'failures', 1),
            'Failures',
          );
          const priorAlpha = parsePositiveNumber(
            field === 'priorAlpha' ? rawValue : getDraftValue(typedNode.id, 'priorAlpha', 1),
            'Prior alpha',
          );
          const priorBeta = parsePositiveNumber(
            field === 'priorBeta' ? rawValue : getDraftValue(typedNode.id, 'priorBeta', 1),
            'Prior beta',
          );
          const fitted = fitBetaFromPseudoCounts({ successes, failures, priorAlpha, priorBeta });
          commitNode(
            typedNode.id,
            {
              ...typedNode,
              params: fitted.params,
              elicitation: { successes, failures, priorAlpha, priorBeta },
            },
            ['successes', 'failures', 'priorAlpha', 'priorBeta'],
          );
          return;
        }
        case 'uniform': {
          const typedNode = node as LeafNode<'uniform'>;
          const a = parseFiniteNumber(
            field === 'a' ? rawValue : getDraftValue(typedNode.id, 'a', typedNode.elicitation?.a ?? typedNode.params.a),
            'Minimum',
          );
          const b = parseFiniteNumber(
            field === 'b' ? rawValue : getDraftValue(typedNode.id, 'b', typedNode.elicitation?.b ?? typedNode.params.b),
            'Maximum',
          );
          if (a > b) {
            throw new RangeError('Minimum must be <= maximum');
          }
          commitNode(typedNode.id, { ...typedNode, params: { a, b }, elicitation: { a, b } }, ['a', 'b']);
          return;
        }
        case 'triangular': {
          const typedNode = node as LeafNode<'triangular'>;
          const min = parseFiniteNumber(
            field === 'min' ? rawValue : getDraftValue(typedNode.id, 'min', typedNode.elicitation?.min ?? typedNode.params.min),
            'Minimum',
          );
          const mode = parseFiniteNumber(
            field === 'mode' ? rawValue : getDraftValue(typedNode.id, 'mode', typedNode.elicitation?.mode ?? typedNode.params.mode),
            'Mode',
          );
          const max = parseFiniteNumber(
            field === 'max' ? rawValue : getDraftValue(typedNode.id, 'max', typedNode.elicitation?.max ?? typedNode.params.max),
            'Maximum',
          );
          const fitted = fitTriangularFromThreePoint({ min, mode, max });
          commitNode(
            typedNode.id,
            { ...typedNode, params: fitted.params, elicitation: { min, mode, max } },
            ['min', 'mode', 'max'],
          );
          return;
        }
        case 'pert': {
          const typedNode = node as LeafNode<'pert'>;
          const min = parseFiniteNumber(
            field === 'min' ? rawValue : getDraftValue(typedNode.id, 'min', typedNode.elicitation?.min ?? typedNode.params.min),
            'Minimum',
          );
          const mode = parseFiniteNumber(
            field === 'mode' ? rawValue : getDraftValue(typedNode.id, 'mode', typedNode.elicitation?.mode ?? typedNode.params.mode),
            'Mode',
          );
          const max = parseFiniteNumber(
            field === 'max' ? rawValue : getDraftValue(typedNode.id, 'max', typedNode.elicitation?.max ?? typedNode.params.max),
            'Maximum',
          );
          const fitted = fitPertFromThreePoint({ min, mode, max });
          commitNode(
            typedNode.id,
            { ...typedNode, params: fitted.params, elicitation: { min, mode, max } },
            ['min', 'mode', 'max'],
          );
          return;
        }
      }
    } catch (error) {
      setNodeError(node.id, field, error instanceof Error ? error.message : 'Invalid input');
    }
  }

  function handleBetaModeChange(node: LeafNode<'beta'>, mode: 'mean' | 'counts') {
    clearNodeFeedback(node.id);

    if (mode === 'mean') {
      const fitted = fitBetaFromMeanConcentration({ mean: 0.5, concentration: 4 });
      updateTree(
        replaceNode(tree, node.id, {
          ...node,
          params: fitted.params,
          elicitation: { mean: 0.5, concentration: 4 },
        }),
      );
      return;
    }

    const fitted = fitBetaFromPseudoCounts({ successes: 1, failures: 1, priorAlpha: 1, priorBeta: 1 });
    updateTree(
      replaceNode(tree, node.id, {
        ...node,
        params: fitted.params,
        elicitation: { successes: 1, failures: 1, priorAlpha: 1, priorBeta: 1 },
      }),
    );
  }

  function handleCompositeFieldChange(node: CompositeNode, field: string, rawValue: string) {
    const key = draftKey(node.id, field);
    setFieldDrafts((current) => ({ ...current, [key]: rawValue }));

    try {
      if (node.type === 'k_of_n') {
        const k = parsePositiveInteger(rawValue, 'K');

        if (k > node.children.length) {
          throw new RangeError(`K must be between 1 and ${node.children.length}`);
        }

        updateTree(updateCompositeNodeConfig(tree, node.id, { k }));
        setFieldErrors((current) => {
          const next = { ...current };
          delete next[key];
          return next;
        });
        setFieldDrafts((current) => {
          const next = { ...current };
          delete next[key];
          return next;
        });
        return;
      }

      if (node.type === 'threshold') {
        const typedNode = node as CompositeNode<'threshold'>;
        const value = parseFiniteNumber(rawValue, 'Threshold value');
        updateTree(updateCompositeNodeConfig(tree, typedNode.id, { ...typedNode.config, value }));
        setFieldErrors((current) => {
          const next = { ...current };
          delete next[key];
          return next;
        });
        setFieldDrafts((current) => {
          const next = { ...current };
          delete next[key];
          return next;
        });
      }
    } catch (error) {
      setNodeError(node.id, field, error instanceof Error ? error.message : 'Invalid input');
    }
  }

  function handleThresholdOperatorChange(node: CompositeNode<'threshold'>, value: string) {
    if (thresholdOperators.includes(value as ThresholdOperator)) {
      updateTree(
        updateCompositeNodeConfig(tree, node.id, {
          ...node.config,
          op: value as ThresholdOperator,
        }),
      );
    }
  }

  async function handleSave() {
    if (saveState.status === 'saving') {
      return;
    }

    const currentValidation = validateTree(tree);
    if (!currentValidation.valid) {
      setSaveState({
        status: 'error',
        message: currentValidation.errors.map((error) => error.message).join(' '),
      });
      return;
    }

    setSaveState({ status: 'saving' });

    try {
      const response = await fetch(`/api/forecasts/${forecastId}/versions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tree }),
      });

      const payload = await response.json();

      if (!response.ok) {
        throw new Error(
          payload && typeof payload.error === 'string' ? payload.error : 'Save failed.',
        );
      }

      setSaveState({ status: 'saved', versionNo: payload.versionNo });
      router.refresh();
    } catch (error) {
      setSaveState({
        status: 'error',
        message: error instanceof Error ? error.message : 'Save failed.',
      });
    }
  }

  function findNode(node: TreeNode, id: string): TreeNode | null {
    if (node.id === id) {
      return node;
    }
    if (node.kind === 'leaf') {
      return null;
    }
    for (const child of node.children) {
      const found = findNode(child, id);
      if (found) {
        return found;
      }
    }
    return null;
  }

  function findParent(node: TreeNode, id: string): TreeNode | null {
    if (node.kind === 'leaf') {
      return null;
    }
    for (const child of node.children) {
      if (child.id === id) {
        return node;
      }
      const found = findParent(child, id);
      if (found) {
        return found;
      }
    }
    return null;
  }

  function findNodePath(node: TreeNode, id: string, path: string): string | null {
    if (node.id === id) {
      return path;
    }
    if (node.kind === 'leaf') {
      return null;
    }
    for (const [index, child] of node.children.entries()) {
      const found = findNodePath(child, id, `${path}.children[${index}]`);
      if (found) {
        return found;
      }
    }
    return null;
  }

  function findNodeByPath(path: string): TreeNode | null {
    if (!path.startsWith('root')) {
      return null;
    }

    let current: TreeNode = tree.root;
    for (const match of path.matchAll(/children\[(\d+)\]/g)) {
      if (current.kind === 'leaf') {
        return current;
      }
      const child = current.children[Number(match[1])];
      if (!child) {
        return current;
      }
      current = child;
    }
    return current;
  }

  function pathMatchesNode(errorPath: string, nodePath: string) {
    return errorPath === nodePath || errorPath.startsWith(`${nodePath}.`);
  }

  const selectedNode = findNode(tree.root, selectedId) ?? tree.root;
  const selectedParent = findParent(tree.root, selectedNode.id);
  const selectedPath = findNodePath(tree.root, selectedNode.id, 'root') ?? 'root';
  const selectedExpectedOutputType = selectedParent
    ? getExpectedChildOutputType(selectedParent)
    : 'boolean';
  const validationIssues = validation.errors.map((error) => {
    const node = findNodeByPath(error.path);
    return {
      ...error,
      nodeId: node?.id ?? null,
      nodeLabel: node?.label ?? null,
      nodeType: node?.type ?? null,
    };
  });
  const selectedValidationErrors = validationIssues
    .filter((error) => pathMatchesNode(error.path, selectedPath))
    .map((error) => error.message);
  const selectedFieldError =
    Object.entries(fieldErrors).find(([key]) => key.startsWith(`${selectedNode.id}:`))?.[1] ??
    undefined;
  const selectedError = [selectedFieldError, ...selectedValidationErrors]
    .filter((message): message is string => Boolean(message))
    .join(' ');

  function renderTreeNode(
    node: TreeNode,
    parent: TreeNode | null,
    path: string,
    siblingIndex: number,
    siblingCount: number,
  ): React.ReactNode {
    const outputType = getNodeOutputType(node);
    const collapsed = collapsedIds[node.id] ?? false;
    const isSelected = node.id === selectedId;
    const hasNodeError = Object.keys(fieldErrors).some((key) => key.startsWith(`${node.id}:`));
    const hasValidationError = validation.errors.some((error) => pathMatchesNode(error.path, path));
    const isComposite = node.kind === 'composite';

    return (
      <li key={node.id}>
        <div
          className={`group relative flex items-center gap-1.5 rounded-lg border px-2 py-1.5 transition ${
            isSelected
              ? 'border-accent/60 bg-accent-soft'
              : 'border-transparent hover:border-line hover:bg-panel'
          }`}
        >
          {isComposite ? (
            <button
              aria-label={
                collapsed ? nodeActionLabel('Expand', node) : nodeActionLabel('Collapse', node)
              }
              className="flex h-5 w-5 items-center justify-center rounded text-subtle hover:text-fg"
              onClick={() => toggleCollapsed(node.id)}
              type="button"
            >
              {collapsed ? '▸' : '▾'}
            </button>
          ) : (
            <span className="h-5 w-5" aria-hidden="true" />
          )}

          {renamingId === node.id ? (
            <input
              aria-label={`Rename ${node.id}`}
              autoFocus
              className="min-w-0 flex-1 rounded border border-accent bg-surface px-2 py-0.5 text-sm text-fg outline-none"
              onBlur={commitRename}
              onChange={(event) => setRenameDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  commitRename();
                } else if (event.key === 'Escape') {
                  setRenamingId(null);
                }
              }}
              value={renameDraft}
            />
          ) : (
            <button
              aria-label={nodeActionLabel('Select', node)}
              aria-pressed={isSelected}
              className="flex min-w-0 flex-1 items-center gap-2 text-left"
              onClick={() => setSelectedId(node.id)}
              onDoubleClick={() => startRename(node)}
              title="Double-click to rename"
              type="button"
            >
              <span className={`h-2 w-2 shrink-0 rounded-full ${outputDotClass(outputType)}`} aria-hidden="true" />
              <span
                className={`min-w-0 truncate text-sm ${isSelected ? 'font-medium text-accent-soft-fg' : 'text-fg'}`}
              >
                {displayNodeLabel(node)}
              </span>
              {isComposite ? (
                <span className="shrink-0 rounded-full bg-warn-soft px-2 py-0.5 text-[11px] font-medium text-warn-soft-fg">
                  {describeCombineRule(node)}
                </span>
              ) : (
                <span className="shrink-0 text-[11px] text-subtle">{node.type}</span>
              )}
              {hasNodeError || hasValidationError ? (
                <span className="shrink-0 text-bad" title="Needs attention" aria-label="Needs attention">
                  ⚠
                </span>
              ) : null}
            </button>
          )}

          <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
            {canAddChild(node) ? (
              <button
                aria-label={nodeActionLabel('Add child to', node)}
                className="flex h-6 w-6 items-center justify-center rounded text-subtle hover:bg-surface hover:text-accent"
                onClick={() => setAddMenuFor(addMenuFor === node.id ? null : node.id)}
                type="button"
              >
                +
              </button>
            ) : null}
            {parent ? (
              <>
                <button
                  aria-label={nodeActionLabel('Duplicate', node)}
                  className="flex h-6 w-6 items-center justify-center rounded text-subtle hover:bg-surface hover:text-fg"
                  onClick={() => handleDuplicate(node, parent)}
                  type="button"
                >
                  ⧉
                </button>
                <button
                  aria-label={nodeActionLabel('Move', { ...node, label: `${displayNodeLabel(node)} up` })}
                  className="flex h-6 w-6 items-center justify-center rounded text-subtle hover:bg-surface hover:text-fg disabled:opacity-30"
                  disabled={siblingIndex === 0}
                  onClick={() => updateTree(moveNode(tree, node.id, 'up'))}
                  type="button"
                >
                  ↑
                </button>
                <button
                  aria-label={nodeActionLabel('Move', { ...node, label: `${displayNodeLabel(node)} down` })}
                  className="flex h-6 w-6 items-center justify-center rounded text-subtle hover:bg-surface hover:text-fg disabled:opacity-30"
                  disabled={siblingIndex === siblingCount - 1}
                  onClick={() => updateTree(moveNode(tree, node.id, 'down'))}
                  type="button"
                >
                  ↓
                </button>
                <button
                  aria-label={nodeActionLabel('Delete', node)}
                  className="flex h-6 w-6 items-center justify-center rounded text-subtle hover:bg-bad-soft hover:text-bad"
                  onClick={() => handleDelete(node, parent)}
                  type="button"
                >
                  ×
                </button>
              </>
            ) : null}
          </div>

          {addMenuFor === node.id ? (
            <>
              <button
                aria-hidden="true"
                className="fixed inset-0 z-10 cursor-default"
                onClick={() => setAddMenuFor(null)}
                tabIndex={-1}
                type="button"
              />
              <div className="absolute top-9 right-2 z-20 w-44 rounded-lg border border-line bg-surface p-1 shadow-lg">
                <p className="px-2 py-1 text-[11px] font-medium tracking-wide text-subtle uppercase">
                  Add child
                </p>
                {validChildTypes(node).map((option) => (
                  <button
                    aria-label={`Add ${typeLabels[option.type]} to ${displayNodeLabel(node)} (${node.id})`}
                    className="flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-sm text-fg hover:bg-panel"
                    key={option.type}
                    onClick={() => addTypedChild(node, option.type)}
                    type="button"
                  >
                    <span className="flex items-center gap-2">
                      <NodeTypeIcon type={option.type} className="text-muted" />
                      {typeLabels[option.type]}
                    </span>
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${outputDotClass(option.outputType)}`}
                      aria-hidden="true"
                    />
                  </button>
                ))}
              </div>
            </>
          ) : null}
        </div>

        {isComposite && !collapsed && node.children.length > 0 ? (
          <ul className={`ml-3 space-y-0.5 border-l-2 pl-2 ${outputRailClass(getExpectedChildOutputType(node) ?? outputType)}`}>
            {node.children.map((child, index) =>
              renderTreeNode(child, node, `${path}.children[${index}]`, index, node.children.length),
            )}
          </ul>
        ) : null}
      </li>
    );
  }

  const treePane = (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-3 pt-3 pb-2">
        <span className="text-xs font-medium tracking-wide text-muted uppercase">Structure</span>
        {validation.valid ? (
          <span className="inline-flex items-center gap-1 text-xs text-ok">● valid</span>
        ) : (
          <span className="inline-flex items-center gap-1 text-xs text-bad">● needs fixing</span>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-2 pb-3">
        <ul className="space-y-0.5">
          {renderTreeNode(tree.root, null, 'root', 0, 1)}
        </ul>
      </div>
    </div>
  );

  const detailPane = (
    <div className="flex h-full flex-col overflow-auto">
      <div className="space-y-4 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-medium ${outputBadgeClass(getNodeOutputType(selectedNode))}`}
          >
            {selectedNode.kind === 'leaf' ? `${selectedNode.type} leaf` : `${selectedNode.type.replaceAll('_', ' ')} · ${getNodeOutputType(selectedNode)}`}
          </span>
          {selectedParent === null ? (
            <span className="rounded-full bg-panel px-2.5 py-1 text-xs text-subtle">root</span>
          ) : null}
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <label className={fieldLabelClass}>
            <span className="font-medium">Label</span>
            <input
              aria-label={`Label for ${selectedNode.id}`}
              className={inputClass}
              onChange={(event) => updateTree(renameNode(tree, selectedNode.id, event.target.value))}
              type="text"
              value={selectedNode.label}
            />
          </label>
          <label className={fieldLabelClass}>
              <span className="font-medium">Model this as</span>
            <select
              aria-label={`Model type for ${selectedNode.id}`}
              className={inputClass}
              onChange={(event) =>
                handleTypeChange(
                  selectedNode,
                  event.target.value as LeafNodeType | CompositeNodeType,
                  selectedExpectedOutputType,
                )
              }
              value={selectedNode.type}
            >
              <optgroup label="Leaves">
                {compatibleTypeOptions(selectedExpectedOutputType)
                  .filter((option) => option.kind === 'leaf')
                  .map((option) => (
                    <option key={option.type} value={option.type}>
                      {typeLabels[option.type]}
                    </option>
                  ))}
              </optgroup>
              <optgroup label="Composites">
                {compatibleTypeOptions(selectedExpectedOutputType)
                  .filter((option) => option.kind === 'composite')
                  .map((option) => (
                    <option key={option.type} value={option.type}>
                      {typeLabels[option.type]}
                    </option>
                  ))}
              </optgroup>
            </select>
            <span className="block text-xs text-subtle">
              Only choices that fit this part of the tree are shown.
            </span>
          </label>
        </div>

        {selectedNode.type ? (
          <div className="rounded-lg border border-line bg-panel p-3">
            <TypeHelpContent type={selectedNode.type} />
          </div>
        ) : null}

        {blockedMessage ? (
          <div className="rounded-md border border-bad/40 bg-bad-soft p-3 text-sm text-bad-soft-fg">
            {blockedMessage}
          </div>
        ) : null}

        {selectedNode.kind === 'leaf' ? (
          <LeafNodeEditor
            error={selectedError || undefined}
            getDraftValue={getDraftValue}
            node={selectedNode}
            onBetaModeChange={handleBetaModeChange}
            onFieldChange={handleLeafFieldChange}
          />
        ) : (
          <>
            <CompositeNodeEditor
              error={selectedError || undefined}
              getDraftValue={getDraftValue}
              node={selectedNode}
              onFieldChange={handleCompositeFieldChange}
              onThresholdOperatorChange={handleThresholdOperatorChange}
            />

            {canAddChild(selectedNode) ? (
              <div className="rounded-lg border border-line bg-panel p-3">
                <p className="text-sm font-medium text-fg">Add child</p>
                <p className="mt-0.5 text-xs text-muted">
                  One click adds a child of that type, ready to configure.
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {validChildTypes(selectedNode).map((option) => (
                    <button
                      aria-label={`Add ${typeLabels[option.type]} to ${selectedNode.id}`}
                      className="group relative inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-1 text-xs text-fg transition hover:border-accent hover:text-accent"
                      key={option.type}
                      onClick={() => addTypedChild(selectedNode, option.type)}
                      type="button"
                    >
                      <TypeLabelWithHelp type={option.type} />
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </>
        )}

        {!validation.valid ? (
          <div className="space-y-2 rounded-md border border-warn/40 bg-warn-soft p-3 text-sm text-warn-soft-fg">
            <p className="font-medium">Fix these tree issues before saving:</p>
            <ul className="space-y-1">
              {validationIssues.map((error) => (
                <li key={`${error.path}:${error.message}`}>
                  <button
                    className="text-left underline decoration-warn-soft-fg/40 underline-offset-2 hover:decoration-warn-soft-fg"
                    onClick={() => {
                      if (error.nodeId) {
                        setSelectedId(error.nodeId);
                      }
                    }}
                    type="button"
                  >
                    {error.nodeLabel
                      ? `${error.nodeLabel} (${formatNodeType(error.nodeType ?? selectedNode.type)}): `
                      : ''}
                    {error.message}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </div>
  );

  const treeCollapsed = focusMode === 'node';
  const detailCollapsed = focusMode === 'tree';
  const gridColumns =
    focusMode === 'node'
      ? '3rem minmax(0,1fr)'
      : focusMode === 'tree'
        ? 'minmax(0,1fr) 3rem'
        : 'minmax(24rem,32rem) minmax(0,1fr)';

  return (
    <section className="flex min-h-[42rem] flex-1 flex-col space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface p-4">
        <div className="min-w-0">
          <p className="text-xs font-medium tracking-wide text-muted uppercase">Live headline</p>
          {!validation.valid ? (
            <p className="mt-1 text-sm text-bad">Fix the highlighted nodes to recompute.</p>
          ) : headlinePending ? (
            <p className="mt-1 text-sm text-muted">Recomputing headline…</p>
          ) : headline.status === 'ready' ? (
            <div className="mt-1 flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <span className="text-3xl font-medium text-fg">{formatPercent(headline.result.p)}</span>
              <span className="text-sm text-muted">SE {formatPercent(headline.result.se)}</span>
              <span className="text-sm text-muted">
                95% CI {formatPercent(headline.result.ci95[0])}–{formatPercent(headline.result.ci95[1])}
              </span>
            </div>
          ) : headline.status === 'error' ? (
            <p className="mt-1 text-sm text-bad">{headline.message}</p>
          ) : (
            <p className="mt-1 text-sm text-muted">Waiting for the first valid tree.</p>
          )}
        </div>

        <div className="flex items-center gap-3">
          <div className="inline-flex overflow-hidden rounded-lg border border-line">
            {focusModes.map((option) => (
              <button
                aria-label={`${option.label} focus`}
                aria-pressed={focusMode === option.mode}
                className={`px-3 py-1.5 text-xs font-medium transition ${
                  focusMode === option.mode
                    ? 'bg-accent text-accent-fg'
                    : 'bg-surface text-muted hover:bg-panel hover:text-fg'
                }`}
                key={option.mode}
                onClick={() => changeFocusMode(option.mode)}
                type="button"
              >
                <span aria-hidden="true" className="mr-1">
                  {option.icon}
                </span>
                {option.label}
              </button>
            ))}
          </div>

          <button
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-fg hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            disabled={saveState.status === 'saving'}
            onClick={handleSave}
            type="button"
          >
            {saveState.status === 'saving' ? 'Saving…' : 'Save version'}
          </button>
        </div>
      </div>

      {saveState.status === 'saved' ? (
        <p className="text-sm text-ok">Saved version {saveState.versionNo}.</p>
      ) : null}
      {saveState.status === 'error' ? <p className="text-sm text-bad">{saveState.message}</p> : null}

      <div
        className="grid min-h-0 flex-1 grid-cols-1 gap-3 xl:[grid-template-columns:var(--editor-columns)]"
        style={{ '--editor-columns': gridColumns } as CSSProperties}
      >
        {treeCollapsed ? (
          <button
            aria-label="Expand tree"
            className="flex flex-col items-center gap-2 rounded-xl border border-line bg-panel py-3 text-lg text-subtle hover:text-fg"
            onClick={() => changeFocusMode('split')}
            type="button"
          >
            <span aria-hidden="true">⌗</span>
            <span aria-hidden="true" className="text-xs">
              ▸
            </span>
          </button>
        ) : (
          <div className="min-h-0 min-w-0 rounded-xl border border-line bg-surface">{treePane}</div>
        )}

        {detailCollapsed ? (
          <button
            aria-label="Expand node editor"
            className="flex flex-col items-center gap-2 rounded-xl border border-line bg-panel py-3 text-lg text-subtle hover:text-fg"
            onClick={() => changeFocusMode('split')}
            type="button"
          >
            <span aria-hidden="true">⚙</span>
            <span aria-hidden="true" className="text-xs">
              ◂
            </span>
          </button>
        ) : (
          <div className="min-h-0 min-w-0 rounded-xl border border-line bg-surface">{detailPane}</div>
        )}
      </div>
    </section>
  );
}
