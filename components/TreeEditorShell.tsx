'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
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

function draftKey(nodeId: string, field: string) {
  return `${nodeId}:${field}`;
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
  return (
    <div className="space-y-2">
      <div className="flex h-28 items-end gap-1.5">
        {bars.map((bar) => (
          <div className="flex min-w-0 flex-1 flex-col items-center gap-2" key={bar.label}>
            <div
              aria-label={`${bar.label} ${(bar.proportion * 100).toFixed(1)}%`}
              className="w-full rounded-t-sm bg-num"
              style={{ height: `${Math.max(6, bar.proportion * 100)}%` }}
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
  const preview = useMemo(() => buildLeafPreview(node), [node]);
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

  return (
    <div className="space-y-4">
      {bernoulliNode ? (
        <div className="grid gap-3 md:grid-cols-2">
          <label className={fieldLabelClass}>
            <span className="font-medium">Probability it happens</span>
            <input
              aria-label={`Probability for ${node.id}`}
              className={inputClass}
              onChange={(event) => onFieldChange(node, 'p', event.target.value)}
              type="number"
              value={getDraftValue(node.id, 'p', bernoulliNode.elicitation?.p ?? bernoulliNode.params.p)}
            />
          </label>
          <div className="rounded-md border border-line bg-panel p-3 text-sm">
            <p className="text-subtle">Implied yes-rate</p>
            <p className="mt-2 text-2xl font-medium">
              {preview.impliedProbability === undefined
                ? 'n/a'
                : formatPercent(preview.impliedProbability)}
            </p>
          </div>
        </div>
      ) : null}

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

      {error ? (
        <div className="rounded-md border border-bad/40 bg-bad-soft p-3 text-sm text-bad-soft-fg">
          {error}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr),16rem]">
        <div className="rounded-lg border border-line bg-panel p-3">
          <p className="text-sm font-medium text-muted">Distribution preview</p>
          <div className="mt-3">
            <MiniHistogram bars={preview.bars} />
          </div>
        </div>

        <div className="rounded-lg border border-line bg-panel p-3 text-sm">
          <p className="font-medium text-muted">Implied values</p>
          {preview.impliedQuantiles ? (
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
              Boolean leaves show their implied yes-rate rather than numeric quantiles.
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

const rootChooserHints: Partial<Record<LeafNodeType | CompositeNodeType, string>> = {
  bernoulli: 'A single yes/no probability',
  and: 'True only if all conditions hold',
  or: 'True if any condition holds',
  not: 'Negate a single condition',
  k_of_n: 'True if at least k of n hold',
  threshold: 'A numeric total clears a cutoff',
};

function RootChooser({ onChoose }: { onChoose: (type: LeafNodeType | CompositeNodeType) => void }) {
  const rootTypes = nodeTypeOptions.filter((option) => option.outputType === 'boolean');

  return (
    <section className="rounded-xl border border-line bg-surface p-6">
      <h2 className="text-lg font-medium text-fg">Start your forecast</h2>
      <p className="mt-1 max-w-2xl text-sm text-muted">
        Pick how the top-level question resolves. Composites let you decompose it into conditions;
        you can always change the type or nest more later.
      </p>
      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {rootTypes.map((option) => (
          <button
            aria-label={`Start with ${option.label}`}
            className="flex items-start gap-3 rounded-lg border border-line bg-surface p-3 text-left transition hover:border-accent hover:bg-accent-soft"
            key={option.type}
            onClick={() => onChoose(option.type)}
            type="button"
          >
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-panel text-fg">
              <NodeTypeIcon type={option.type} />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-medium text-fg">{option.label}</span>
              <span className="block text-xs text-muted">{rootChooserHints[option.type]}</span>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

export function TreeEditorShell({ forecastId, initialTree }: TreeEditorShellProps) {
  const [tree, setTree] = useState<Tree | null>(initialTree);

  if (!tree) {
    return (
      <RootChooser
        onChoose={(type) => {
          const root = createNode(type, 'root', 'Untitled forecast');
          if (root.kind === 'composite' && (type === 'threshold' || type === 'not')) {
            const childType: LeafNodeType = type === 'threshold' ? 'normal' : 'bernoulli';
            const child = createNode(childType, 'node-1', `New ${childType}`);
            setTree({ root: { ...root, children: [child] } });
            return;
          }
          setTree({ root });
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
  const nextIdRef = useRef(1);

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
    nextIdRef.current += 1;
    return `node-${nextIdRef.current}`;
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

  // Fixed-arity boolean composites (threshold / not) take exactly one child, so
  // we drop in a sensible, already-valid starter child when one is created. That
  // keeps the tree valid immediately and saves a separate "add child" step.
  function buildTypedNode(type: LeafNodeType | CompositeNodeType): TreeNode {
    const node = createNode(type, nextNodeId(), `New ${type.replaceAll('_', ' ')}`);

    if (node.kind === 'composite' && (type === 'threshold' || type === 'not')) {
      const childType: LeafNodeType = type === 'threshold' ? 'normal' : 'bernoulli';
      const child = createNode(childType, nextNodeId(), `New ${childType}`);
      return { ...node, children: [child] };
    }

    return node;
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
          const p = parseFiniteNumber(rawValue, 'Probability');
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
          const p = parseFiniteNumber(
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
          const lambda = parseFiniteNumber(rawValue, 'Expected count');
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
            const mean = parseFiniteNumber(
              field === 'mean' ? rawValue : getDraftValue(typedNode.id, 'mean', 0.5),
              'Mean',
            );
            const concentration = parseFiniteNumber(
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

          const successes = parseFiniteNumber(
            field === 'successes' ? rawValue : getDraftValue(typedNode.id, 'successes', 1),
            'Successes',
          );
          const failures = parseFiniteNumber(
            field === 'failures' ? rawValue : getDraftValue(typedNode.id, 'failures', 1),
            'Failures',
          );
          const priorAlpha = parseFiniteNumber(
            field === 'priorAlpha' ? rawValue : getDraftValue(typedNode.id, 'priorAlpha', 1),
            'Prior alpha',
          );
          const priorBeta = parseFiniteNumber(
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
    if (!validation.valid || saveState.status === 'saving') {
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

  const selectedNode = findNode(tree.root, selectedId) ?? tree.root;
  const selectedParent = findParent(tree.root, selectedNode.id);
  const selectedExpectedOutputType = selectedParent
    ? getExpectedChildOutputType(selectedParent)
    : 'boolean';
  const selectedFieldError =
    Object.entries(fieldErrors).find(([key]) => key.startsWith(`${selectedNode.id}:`))?.[1] ??
    undefined;

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
    const hasValidationError = validation.errors.some((error) => error.path === path);
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
              aria-label={collapsed ? `Expand ${node.label}` : `Collapse ${node.label}`}
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
              aria-label={`Select ${node.label || 'Untitled'}`}
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
                {node.label || 'Untitled'}
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
                aria-label={`Add child to ${node.label}`}
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
                  aria-label={`Duplicate ${node.label}`}
                  className="flex h-6 w-6 items-center justify-center rounded text-subtle hover:bg-surface hover:text-fg"
                  onClick={() => handleDuplicate(node, parent)}
                  type="button"
                >
                  ⧉
                </button>
                <button
                  aria-label={`Move ${node.label} up`}
                  className="flex h-6 w-6 items-center justify-center rounded text-subtle hover:bg-surface hover:text-fg disabled:opacity-30"
                  disabled={siblingIndex === 0}
                  onClick={() => updateTree(moveNode(tree, node.id, 'up'))}
                  type="button"
                >
                  ↑
                </button>
                <button
                  aria-label={`Move ${node.label} down`}
                  className="flex h-6 w-6 items-center justify-center rounded text-subtle hover:bg-surface hover:text-fg disabled:opacity-30"
                  disabled={siblingIndex === siblingCount - 1}
                  onClick={() => updateTree(moveNode(tree, node.id, 'down'))}
                  type="button"
                >
                  ↓
                </button>
                <button
                  aria-label={`Delete ${node.label}`}
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
                    aria-label={`Add ${option.label} to ${node.label}`}
                    className="flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-sm text-fg hover:bg-panel"
                    key={option.type}
                    onClick={() => addTypedChild(node, option.type)}
                    type="button"
                  >
                    <span className="flex items-center gap-2">
                      <NodeTypeIcon type={option.type} className="text-muted" />
                      {option.label}
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
            <span className="font-medium">Type</span>
            <select
              aria-label={`Type for ${selectedNode.id}`}
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
                {nodeTypeOptions
                  .filter((option) => option.kind === 'leaf')
                  .map((option) => (
                    <option key={option.type} value={option.type}>
                      {option.label}
                    </option>
                  ))}
              </optgroup>
              <optgroup label="Composites">
                {nodeTypeOptions
                  .filter((option) => option.kind === 'composite')
                  .map((option) => (
                    <option key={option.type} value={option.type}>
                      {option.label}
                    </option>
                  ))}
              </optgroup>
            </select>
          </label>
        </div>

        {blockedMessage ? (
          <div className="rounded-md border border-bad/40 bg-bad-soft p-3 text-sm text-bad-soft-fg">
            {blockedMessage}
          </div>
        ) : null}

        {selectedNode.kind === 'leaf' ? (
          <LeafNodeEditor
            error={selectedFieldError}
            getDraftValue={getDraftValue}
            node={selectedNode}
            onBetaModeChange={handleBetaModeChange}
            onFieldChange={handleLeafFieldChange}
          />
        ) : (
          <>
            <CompositeNodeEditor
              error={selectedFieldError}
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
                      aria-label={`Add ${option.label} to ${selectedNode.id}`}
                      className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-1 text-xs text-fg transition hover:border-accent hover:text-accent"
                      key={option.type}
                      onClick={() => addTypedChild(selectedNode, option.type)}
                      type="button"
                    >
                      <NodeTypeIcon type={option.type} />
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </>
        )}

        {!validation.valid ? (
          <div className="rounded-md border border-warn/40 bg-warn-soft p-3 text-sm text-warn-soft-fg">
            The tree isn’t valid yet — look for the ⚠ markers in the structure pane and fix the
            wiring before saving.
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
        : 'minmax(0,20rem) minmax(0,1fr)';

  return (
    <section className="space-y-3">
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
            disabled={!validation.valid || saveState.status === 'saving'}
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

      <div className="grid min-h-[28rem] gap-3" style={{ gridTemplateColumns: gridColumns }}>
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
          <div className="min-w-0 rounded-xl border border-line bg-surface">{treePane}</div>
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
          <div className="min-w-0 rounded-xl border border-line bg-surface">{detailPane}</div>
        )}
      </div>
    </section>
  );
}
