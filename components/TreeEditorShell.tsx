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
import { thresholdOperators, type CompositeNode, type CompositeNodeType, type LeafNode, type LeafNodeType, type OutputType, type Tree, type TreeNode } from '@/lib/engine/tree';
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

type TreeEditorShellProps = {
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

function pathHasError(path: string, errorPath: string) {
  return errorPath === path || errorPath.startsWith(`${path}.`) || errorPath.startsWith(`${path}[`);
}

function outputTone(outputType: OutputType) {
  return outputType === 'boolean' ? 'bg-emerald-100 text-emerald-900' : 'bg-sky-100 text-sky-900';
}

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

function MiniHistogram({ bars }: { bars: Array<{ label: string; proportion: number }> }) {
  return (
    <div className="space-y-2">
      <div className="flex h-28 items-end gap-2">
        {bars.map((bar) => (
          <div className="flex min-w-0 flex-1 flex-col items-center gap-2" key={bar.label}>
            <div
              aria-label={`${bar.label} ${(bar.proportion * 100).toFixed(1)}%`}
              className="w-full rounded-t bg-sky-500/80"
              style={{ height: `${Math.max(8, bar.proportion * 100)}%` }}
            />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs text-black/55 md:grid-cols-5">
        {bars.map((bar) => (
          <div key={`${bar.label}-label`}>
            <div className="truncate font-medium text-black/70">{bar.label}</div>
            <div>{formatPercent(bar.proportion)}</div>
          </div>
        ))}
      </div>
    </div>
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
  const preview = useMemo(() => buildLeafPreview(node), [node]);
  const bernoulliNode = node.type === 'bernoulli' ? (node as LeafNode<'bernoulli'>) : null;
  const binomialNode = node.type === 'binomial' ? (node as LeafNode<'binomial'>) : null;
  const poissonNode = node.type === 'poisson' ? (node as LeafNode<'poisson'>) : null;
  const quantileNode =
    node.type === 'normal' || node.type === 'lognormal'
      ? ((node as LeafNode<'normal'> | LeafNode<'lognormal'>))
      : null;
  const betaNode = node.type === 'beta' ? (node as LeafNode<'beta'>) : null;
  const uniformNode = node.type === 'uniform' ? (node as LeafNode<'uniform'>) : null;
  const threePointNode =
    node.type === 'triangular' || node.type === 'pert'
      ? ((node as LeafNode<'triangular'> | LeafNode<'pert'>))
      : null;

  return (
    <div className="space-y-3 rounded border border-dashed border-black/10 bg-black/[0.02] p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium">Leaf configuration</p>
        <p className="text-xs text-black/55">Preview updates from your elicitation inputs.</p>
      </div>

      {bernoulliNode ? (
        <div className="grid gap-3 md:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span className="font-medium">Probability</span>
            <input
              aria-label={`Probability for ${node.id}`}
              className="w-full rounded border border-black/15 px-3 py-2"
              onChange={(event) => onFieldChange(node, 'p', event.target.value)}
              type="number"
              value={getDraftValue(node.id, 'p', bernoulliNode.elicitation?.p ?? bernoulliNode.params.p)}
            />
          </label>
          <div className="rounded border border-black/10 p-3 text-sm">
            <p className="text-black/55">Implied yes-rate</p>
            <p className="mt-2 text-2xl font-semibold">
              {preview.impliedProbability === undefined
                ? 'n/a'
                : formatPercent(preview.impliedProbability)}
            </p>
          </div>
        </div>
      ) : null}

      {binomialNode ? (
        <div className="grid gap-3 md:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span className="font-medium">Trials (n)</span>
            <input
              aria-label={`Trials for ${node.id}`}
              className="w-full rounded border border-black/15 px-3 py-2"
              onChange={(event) => onFieldChange(node, 'n', event.target.value)}
              type="number"
              value={getDraftValue(node.id, 'n', binomialNode.elicitation?.n ?? binomialNode.params.n)}
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">Success probability (p)</span>
            <input
              aria-label={`Success probability for ${node.id}`}
              className="w-full rounded border border-black/15 px-3 py-2"
              onChange={(event) => onFieldChange(node, 'p', event.target.value)}
              type="number"
              value={getDraftValue(node.id, 'p', binomialNode.elicitation?.p ?? binomialNode.params.p)}
            />
          </label>
        </div>
      ) : null}

      {poissonNode ? (
        <label className="space-y-1 text-sm">
          <span className="font-medium">Expected count</span>
          <input
            aria-label={`Expected count for ${node.id}`}
            className="w-full rounded border border-black/15 px-3 py-2"
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
        <div className="grid gap-3 md:grid-cols-3">
          <label className="space-y-1 text-sm">
            <span className="font-medium">P10</span>
            <input
              aria-label={`P10 for ${node.id}`}
              className="w-full rounded border border-black/15 px-3 py-2"
              onChange={(event) => onFieldChange(node, 'p10', event.target.value)}
              type="number"
              value={getDraftValue(node.id, 'p10', quantileNode.elicitation?.p10 ?? '')}
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">P50</span>
            <input
              aria-label={`P50 for ${node.id}`}
              className="w-full rounded border border-black/15 px-3 py-2"
              onChange={(event) => onFieldChange(node, 'p50', event.target.value)}
              type="number"
              value={getDraftValue(node.id, 'p50', quantileNode.elicitation?.p50 ?? '')}
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">P90</span>
            <input
              aria-label={`P90 for ${node.id}`}
              className="w-full rounded border border-black/15 px-3 py-2"
              onChange={(event) => onFieldChange(node, 'p90', event.target.value)}
              type="number"
              value={getDraftValue(node.id, 'p90', quantileNode.elicitation?.p90 ?? '')}
            />
          </label>
        </div>
      ) : null}

      {betaNode ? (
        <div className="space-y-3">
          <label className="space-y-1 text-sm">
            <span className="font-medium">Elicitation mode</span>
            <select
              aria-label={`Beta mode for ${node.id}`}
              className="w-full rounded border border-black/15 px-3 py-2"
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
              <label className="space-y-1 text-sm">
                <span className="font-medium">Mean</span>
                <input
                  aria-label={`Mean for ${node.id}`}
                  className="w-full rounded border border-black/15 px-3 py-2"
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
              <label className="space-y-1 text-sm">
                <span className="font-medium">Concentration</span>
                <input
                  aria-label={`Concentration for ${node.id}`}
                  className="w-full rounded border border-black/15 px-3 py-2"
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
              <label className="space-y-1 text-sm">
                <span className="font-medium">Successes</span>
                <input
                  aria-label={`Successes for ${node.id}`}
                  className="w-full rounded border border-black/15 px-3 py-2"
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
              <label className="space-y-1 text-sm">
                <span className="font-medium">Failures</span>
                <input
                  aria-label={`Failures for ${node.id}`}
                  className="w-full rounded border border-black/15 px-3 py-2"
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
              <label className="space-y-1 text-sm">
                <span className="font-medium">Prior alpha</span>
                <input
                  aria-label={`Prior alpha for ${node.id}`}
                  className="w-full rounded border border-black/15 px-3 py-2"
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
              <label className="space-y-1 text-sm">
                <span className="font-medium">Prior beta</span>
                <input
                  aria-label={`Prior beta for ${node.id}`}
                  className="w-full rounded border border-black/15 px-3 py-2"
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
          <label className="space-y-1 text-sm">
            <span className="font-medium">Minimum (a)</span>
            <input
              aria-label={`Minimum for ${node.id}`}
              className="w-full rounded border border-black/15 px-3 py-2"
              onChange={(event) => onFieldChange(node, 'a', event.target.value)}
              type="number"
              value={getDraftValue(node.id, 'a', uniformNode.elicitation?.a ?? uniformNode.params.a)}
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">Maximum (b)</span>
            <input
              aria-label={`Maximum for ${node.id}`}
              className="w-full rounded border border-black/15 px-3 py-2"
              onChange={(event) => onFieldChange(node, 'b', event.target.value)}
              type="number"
              value={getDraftValue(node.id, 'b', uniformNode.elicitation?.b ?? uniformNode.params.b)}
            />
          </label>
        </div>
      ) : null}

      {threePointNode ? (
        <div className="grid gap-3 md:grid-cols-3">
          <label className="space-y-1 text-sm">
            <span className="font-medium">Minimum</span>
            <input
              aria-label={`Minimum for ${node.id}`}
              className="w-full rounded border border-black/15 px-3 py-2"
              onChange={(event) => onFieldChange(node, 'min', event.target.value)}
              type="number"
              value={getDraftValue(node.id, 'min', threePointNode.elicitation?.min ?? threePointNode.params.min)}
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">Mode</span>
            <input
              aria-label={`Mode for ${node.id}`}
              className="w-full rounded border border-black/15 px-3 py-2"
              onChange={(event) => onFieldChange(node, 'mode', event.target.value)}
              type="number"
              value={getDraftValue(node.id, 'mode', threePointNode.elicitation?.mode ?? threePointNode.params.mode)}
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">Maximum</span>
            <input
              aria-label={`Maximum for ${node.id}`}
              className="w-full rounded border border-black/15 px-3 py-2"
              onChange={(event) => onFieldChange(node, 'max', event.target.value)}
              type="number"
              value={getDraftValue(node.id, 'max', threePointNode.elicitation?.max ?? threePointNode.params.max)}
            />
          </label>
        </div>
      ) : null}

      {error ? (
        <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr),16rem]">
        <div className="rounded border border-black/10 bg-white p-3">
          <p className="text-sm font-medium">Distribution preview</p>
          <div className="mt-3">
            <MiniHistogram bars={preview.bars} />
          </div>
        </div>

        <div className="rounded border border-black/10 bg-white p-3 text-sm">
          <p className="font-medium">Implied values</p>
          {preview.impliedQuantiles ? (
            <dl className="mt-3 space-y-2">
              <div className="flex justify-between gap-3">
                <dt className="text-black/55">P10</dt>
                <dd className="font-medium">{formatNumber(preview.impliedQuantiles.p10)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-black/55">P50</dt>
                <dd className="font-medium">{formatNumber(preview.impliedQuantiles.p50)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-black/55">P90</dt>
                <dd className="font-medium">{formatNumber(preview.impliedQuantiles.p90)}</dd>
              </div>
            </dl>
          ) : (
            <p className="mt-3 text-black/65">
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
    <div className="space-y-3 rounded border border-dashed border-black/10 bg-black/[0.02] p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-medium">Composite configuration</p>
        <p className="text-xs text-black/55">Output type: {getNodeOutputType(node)}</p>
      </div>

      {kOfNNode ? (
        <label className="space-y-1 text-sm">
          <span className="font-medium">Required true children (k)</span>
          <input
            aria-label={`K for ${node.id}`}
            className="w-full rounded border border-black/15 px-3 py-2"
            onChange={(event) => onFieldChange(node, 'k', event.target.value)}
            type="number"
            value={getDraftValue(node.id, 'k', kOfNNode.config.k)}
          />
          <span className="block text-xs text-black/55">Must be between 1 and {node.children.length}.</span>
        </label>
      ) : null}

      {thresholdNode ? (
        <div className="grid gap-3 md:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span className="font-medium">Operator</span>
            <select
              aria-label={`Threshold operator for ${node.id}`}
              className="w-full rounded border border-black/15 px-3 py-2"
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
          <label className="space-y-1 text-sm">
            <span className="font-medium">Threshold value</span>
            <input
              aria-label={`Threshold value for ${node.id}`}
              className="w-full rounded border border-black/15 px-3 py-2"
              onChange={(event) => onFieldChange(node, 'value', event.target.value)}
              type="number"
              value={getDraftValue(node.id, 'value', thresholdNode.config.value)}
            />
          </label>
        </div>
      ) : null}

      <p className="text-sm text-black/60">
        {childOutput === null
          ? 'This node does not accept children.'
          : `This ${node.type.replaceAll('_', ' ')} node accepts ${childOutput} children.`}
      </p>

      {error ? (
        <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>
      ) : null}
    </div>
  );
}

export function TreeEditorShell({ forecastId, initialTree }: TreeEditorShellProps) {
  const router = useRouter();
  const [tree, setTree] = useState(initialTree);
  const [collapsedIds, setCollapsedIds] = useState<Record<string, boolean>>({});
  const [selectedId, setSelectedId] = useState(initialTree.root.id);
  const [blockedMessage, setBlockedMessage] = useState<string | null>(null);
  const [newChildTypes, setNewChildTypes] = useState<Record<string, string>>({});
  const [fieldDrafts, setFieldDrafts] = useState<FieldDrafts>({});
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [headline, setHeadline] = useState<HeadlineState>({ status: 'idle' });
  const [headlinePending, setHeadlinePending] = useState(() => validateTree(initialTree).valid);
  const [saveState, setSaveState] = useState<SaveState>({ status: 'idle' });
  const nextIdRef = useRef(1);

  const validation = useMemo(() => validateTree(tree), [tree]);

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

  function handleAddChild(node: TreeNode) {
    if (node.kind === 'leaf') {
      return;
    }

    const requestedType = newChildTypes[node.id] ?? 'bernoulli';
    const expectedOutputType = getExpectedChildOutputType(node);

    if (
      expectedOutputType !== null &&
      !canUseNodeType(requestedType as LeafNodeType | CompositeNodeType, expectedOutputType)
    ) {
      setBlockedMessage(
        `Cannot add ${requestedType} here. ${describeBlockedTypeChange(
          requestedType as LeafNodeType | CompositeNodeType,
          expectedOutputType,
        )}`,
      );
      return;
    }

    const childId = nextNodeId();
    updateTree(
      addChildNode(
        tree,
        node.id,
        createNode(
          requestedType as LeafNodeType | CompositeNodeType,
          childId,
          `New ${requestedType.replaceAll('_', ' ')}`,
        ),
      ),
    );
    setCollapsedIds((current) => ({ ...current, [node.id]: false }));
    setSelectedId(childId);
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
          const fitted = fitBetaFromPseudoCounts({
            successes,
            failures,
            priorAlpha,
            priorBeta,
          });
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
    if (thresholdOperators.includes(value as (typeof thresholdOperators)[number])) {
      updateTree(
        updateCompositeNodeConfig(tree, node.id, {
          ...node.config,
          op: value as (typeof thresholdOperators)[number],
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

  function selectNode(nodeId: string) {
    setSelectedId(nodeId);
    setBlockedMessage(null);
  }

  function findContext(nodeId: string): {
    node: TreeNode;
    parent: TreeNode | null;
    path: string;
    index: number;
    count: number;
    ancestors: TreeNode[];
  } | null {
    function walk(
      node: TreeNode,
      parent: TreeNode | null,
      path: string,
      index: number,
      count: number,
      ancestors: TreeNode[],
    ): {
      node: TreeNode;
      parent: TreeNode | null;
      path: string;
      index: number;
      count: number;
      ancestors: TreeNode[];
    } | null {
      if (node.id === nodeId) {
        return { node, parent, path, index, count, ancestors };
      }

      if (node.kind === 'composite') {
        for (let childIndex = 0; childIndex < node.children.length; childIndex += 1) {
          const found = walk(
            node.children[childIndex],
            node,
            `${path}.children[${childIndex}]`,
            childIndex,
            node.children.length,
            [...ancestors, node],
          );
          if (found) {
            return found;
          }
        }
      }

      return null;
    }

    return walk(tree.root, null, 'root', 0, 1, []);
  }

  function renderTreeRow(node: TreeNode, path: string): React.ReactNode {
    const collapsed = collapsedIds[node.id] ?? false;
    const outputType = getNodeOutputType(node);
    const isSelected = selectedId === node.id;
    const subtreeHasIssue = validation.errors.some((error) => pathHasError(path, error.path));
    const hasChildren = node.kind === 'composite' && node.children.length > 0;

    return (
      <li key={node.id}>
        <div
          className={`flex items-center gap-1.5 rounded-md px-1.5 py-1.5 ${
            isSelected ? 'bg-black/[0.06]' : 'hover:bg-black/[0.03]'
          }`}
        >
          {hasChildren ? (
            <button
              aria-label={`${collapsed ? 'Expand' : 'Collapse'} ${node.label}`}
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-black/40 hover:bg-black/10"
              onClick={() => toggleCollapsed(node.id)}
              type="button"
            >
              <svg
                aria-hidden="true"
                className={`h-3 w-3 transition-transform ${collapsed ? '' : 'rotate-90'}`}
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                viewBox="0 0 24 24"
              >
                <path d="M9 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          ) : (
            <span className="h-5 w-5 shrink-0" />
          )}

          <button
            aria-label={`Select ${node.label}`}
            className="flex min-w-0 flex-1 items-center gap-2 text-left"
            onClick={() => selectNode(node.id)}
            type="button"
          >
            <span
              className={`truncate text-sm ${isSelected ? 'font-medium' : ''} ${
                subtreeHasIssue ? 'text-red-700' : ''
              }`}
            >
              {node.label}
            </span>
            <span className="ml-auto flex shrink-0 items-center gap-1.5">
              {subtreeHasIssue ? (
                <span aria-label="contains an issue" className="h-2 w-2 rounded-full bg-red-500" />
              ) : null}
              <span className="text-[10px] text-black/40">{node.type.replaceAll('_', ' ')}</span>
              <span
                className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${outputTone(outputType)}`}
              >
                {outputType === 'boolean' ? 'bool' : 'num'}
              </span>
            </span>
          </button>
        </div>

        {hasChildren && !collapsed ? (
          <ul className="ml-3 space-y-0.5 border-l border-black/10 pl-2">
            {node.children.map((child, index) =>
              renderTreeRow(child, `${path}.children[${index}]`),
            )}
          </ul>
        ) : null}
      </li>
    );
  }

  const context =
    findContext(selectedId) ??
    ({
      node: tree.root,
      parent: null,
      path: 'root',
      index: 0,
      count: 1,
      ancestors: [] as TreeNode[],
    } as const);
  const selectedNode = context.node;
  const selectedExpectedOutputType = context.parent
    ? getExpectedChildOutputType(context.parent)
    : 'boolean';
  const selectedFieldError =
    Object.entries(fieldErrors).find(([key]) => key.startsWith(`${selectedNode.id}:`))?.[1] ??
    undefined;
  const selectedInlineErrors = validation.errors.filter((error) =>
    pathHasError(context.path, error.path),
  );

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-black/10 bg-white p-4">
        <div>
          <p className="text-sm font-medium text-black/70">Live headline</p>
          {!validation.valid ? (
            <p className="mt-1 text-sm text-black/60">
              Fix the highlighted node to re-enable the headline.
            </p>
          ) : headlinePending ? (
            <p className="mt-1 text-sm text-black/60">Recomputing headline…</p>
          ) : headline.status === 'ready' ? (
            <div className="mt-1">
              <p className="text-3xl font-semibold leading-none">
                {formatPercent(headline.result.p)}
              </p>
              <p className="mt-1.5 text-xs text-black/55">
                SE {formatPercent(headline.result.se)} &middot; 95% CI:{' '}
                {formatPercent(headline.result.ci95[0])} to {formatPercent(headline.result.ci95[1])}
              </p>
            </div>
          ) : headline.status === 'error' ? (
            <p className="mt-1 text-sm text-red-700">{headline.message}</p>
          ) : (
            <p className="mt-1 text-sm text-black/60">Waiting for the first valid tree.</p>
          )}
        </div>

        <div className="flex items-center gap-3">
          <span
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              validation.valid ? 'bg-emerald-100 text-emerald-900' : 'bg-amber-100 text-amber-900'
            }`}
          >
            {validation.valid
              ? 'Tree valid'
              : `${validation.errors.length} issue${validation.errors.length === 1 ? '' : 's'}`}
          </span>
          <button
            className="rounded bg-black px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-black/20"
            disabled={!validation.valid || saveState.status === 'saving'}
            onClick={handleSave}
            type="button"
          >
            {saveState.status === 'saving' ? 'Saving…' : 'Save version'}
          </button>
        </div>
      </div>

      {saveState.status === 'saved' ? (
        <p className="text-sm text-emerald-700">Saved version {saveState.versionNo}.</p>
      ) : null}
      {saveState.status === 'error' ? (
        <p className="text-sm text-red-700">{saveState.message}</p>
      ) : null}
      {blockedMessage ? (
        <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {blockedMessage}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,320px),minmax(0,1fr)]">
        <div className="rounded-lg border border-black/10 bg-white p-3">
          <p className="mb-2 px-1.5 text-xs font-medium text-black/55">Structure</p>
          <ul className="space-y-0.5">{renderTreeRow(tree.root, 'root')}</ul>
        </div>

        <div className="rounded-lg border border-black/10 bg-white p-4">
          <div className="flex flex-wrap items-center gap-1 text-xs text-black/45">
            {context.ancestors.map((ancestor) => (
              <span className="flex items-center gap-1" key={ancestor.id}>
                <button
                  className="hover:text-black/70 hover:underline"
                  onClick={() => selectNode(ancestor.id)}
                  type="button"
                >
                  {ancestor.label}
                </button>
                <span aria-hidden="true">&rsaquo;</span>
              </span>
            ))}
            <span className="font-medium text-black/70">{selectedNode.label}</span>
          </div>

          <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr),12rem]">
            <label className="space-y-1 text-sm">
              <span className="font-medium">Label</span>
              <input
                aria-label={`Label for ${selectedNode.id}`}
                className="w-full rounded border border-black/15 px-3 py-2"
                onChange={(event) => updateTree(renameNode(tree, selectedNode.id, event.target.value))}
                type="text"
                value={selectedNode.label}
              />
            </label>

            <label className="space-y-1 text-sm">
              <span className="font-medium">Type</span>
              <select
                aria-label={`Type for ${selectedNode.id}`}
                className="w-full rounded border border-black/15 px-3 py-2"
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

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              className="rounded border border-black/15 px-3 py-1.5 text-sm disabled:opacity-40"
              disabled={context.parent === null || context.index === 0}
              onClick={() => updateTree(moveNode(tree, selectedNode.id, 'up'))}
              type="button"
            >
              Move up
            </button>
            <button
              className="rounded border border-black/15 px-3 py-1.5 text-sm disabled:opacity-40"
              disabled={context.parent === null || context.index === context.count - 1}
              onClick={() => updateTree(moveNode(tree, selectedNode.id, 'down'))}
              type="button"
            >
              Move down
            </button>
            <button
              className="rounded border border-red-200 px-3 py-1.5 text-sm text-red-700 disabled:opacity-40"
              disabled={context.parent === null}
              onClick={() => {
                if (!context.parent) {
                  return;
                }
                const parentId = context.parent.id;
                updateTree(deleteNode(tree, selectedNode.id));
                setSelectedId(parentId);
              }}
              type="button"
            >
              Delete
            </button>
          </div>

          <div className="mt-4">
            {selectedNode.kind === 'leaf' ? (
              <LeafNodeEditor
                error={selectedFieldError}
                getDraftValue={getDraftValue}
                node={selectedNode}
                onBetaModeChange={handleBetaModeChange}
                onFieldChange={handleLeafFieldChange}
              />
            ) : (
              <CompositeNodeEditor
                error={selectedFieldError}
                getDraftValue={getDraftValue}
                node={selectedNode}
                onFieldChange={handleCompositeFieldChange}
                onThresholdOperatorChange={handleThresholdOperatorChange}
              />
            )}
          </div>

          {selectedNode.kind === 'composite' ? (
            <div className="mt-3 flex flex-wrap items-end gap-3 rounded border border-dashed border-black/10 p-3">
              <label className="space-y-1 text-sm">
                <span className="font-medium">Add child</span>
                <select
                  aria-label={`Child type for ${selectedNode.id}`}
                  className="rounded border border-black/15 px-3 py-2"
                  onChange={(event) =>
                    setNewChildTypes((current) => ({
                      ...current,
                      [selectedNode.id]: event.target.value,
                    }))
                  }
                  value={newChildTypes[selectedNode.id] ?? 'bernoulli'}
                >
                  {nodeTypeOptions.map((option) => {
                    const expected = getExpectedChildOutputType(selectedNode);
                    const disabled = expected !== null && !canUseNodeType(option.type, expected);

                    return (
                      <option disabled={disabled} key={option.type} value={option.type}>
                        {option.label}
                        {disabled ? ' (wrong output type)' : ''}
                      </option>
                    );
                  })}
                </select>
              </label>

              <button
                className="rounded bg-black px-3 py-2 text-sm font-medium text-white"
                onClick={() => handleAddChild(selectedNode)}
                type="button"
              >
                Add child
              </button>
            </div>
          ) : null}

          {selectedInlineErrors.length > 0 ? (
            <div className="mt-3 rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <p className="font-medium">Validation</p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {selectedInlineErrors.map((error) => (
                  <li key={`${error.path}-${error.message}`}>{error.message}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
