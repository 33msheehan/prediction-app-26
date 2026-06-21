'use client';

import { useMemo, useRef, useState } from 'react';
import { validateTree } from '@/lib/engine/validate';
import type {
  CompositeNodeType,
  LeafNodeType,
  OutputType,
  Tree,
  TreeNode,
} from '@/lib/engine/tree';
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
} from '@/lib/forecasts/tree-editor';

type TreeEditorShellProps = {
  initialTree: Tree;
};

function pathHasError(path: string, errorPath: string) {
  return errorPath === path || errorPath.startsWith(`${path}.`) || errorPath.startsWith(`${path}[`);
}

function outputTone(outputType: OutputType) {
  return outputType === 'boolean' ? 'bg-emerald-100 text-emerald-900' : 'bg-sky-100 text-sky-900';
}

export function TreeEditorShell({ initialTree }: TreeEditorShellProps) {
  const [tree, setTree] = useState(initialTree);
  const [collapsedIds, setCollapsedIds] = useState<Record<string, boolean>>({});
  const [blockedMessage, setBlockedMessage] = useState<string | null>(null);
  const [newChildTypes, setNewChildTypes] = useState<Record<string, string>>({});
  const nextIdRef = useRef(1);

  const validation = useMemo(() => validateTree(tree), [tree]);

  function nextNodeId() {
    nextIdRef.current += 1;
    return `node-${nextIdRef.current}`;
  }

  function updateTree(nextTree: Tree) {
    setBlockedMessage(null);
    setTree(nextTree);
  }

  function toggleCollapsed(nodeId: string) {
    setCollapsedIds((current) => ({ ...current, [nodeId]: !current[nodeId] }));
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

    updateTree(
      addChildNode(
        tree,
        node.id,
        createNode(
          requestedType as LeafNodeType | CompositeNodeType,
          nextNodeId(),
          `New ${requestedType.replaceAll('_', ' ')}`,
        ),
      ),
    );
  }

  function renderNode(
    node: TreeNode,
    parent: TreeNode | null,
    path: string,
    depth: number,
    siblingIndex: number,
    siblingCount: number,
  ): React.ReactNode {
    const expectedOutputType = parent ? getExpectedChildOutputType(parent) : 'boolean';
    const inlineErrors = validation.errors.filter((error) => pathHasError(path, error.path));
    const collapsed = collapsedIds[node.id] ?? false;
    const outputType = getNodeOutputType(node);

    return (
      <li key={node.id} className="space-y-3">
        <div
          className="space-y-3 rounded border border-black/10 bg-white p-4"
          style={{ marginLeft: `${depth * 20}px` }}
        >
          <div className="flex flex-wrap items-center gap-2">
            {node.kind === 'composite' ? (
              <button
                className="rounded border border-black/10 px-2 py-1 text-xs"
                onClick={() => toggleCollapsed(node.id)}
                type="button"
              >
                {collapsed ? 'Expand' : 'Collapse'}
              </button>
            ) : (
              <span className="rounded border border-transparent px-2 py-1 text-xs text-black/45">
                Leaf
              </span>
            )}

            <span
              className={`rounded-full px-2 py-1 text-xs font-medium ${outputTone(outputType)}`}
            >
              {outputType}
            </span>
            <span className="text-xs text-black/55">{node.kind}</span>
            <span className="text-xs text-black/40">{node.id}</span>
          </div>

          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr),14rem,auto]">
            <label className="space-y-1 text-sm">
              <span className="font-medium">Label</span>
              <input
                aria-label={`Label for ${node.id}`}
                className="w-full rounded border border-black/15 px-3 py-2"
                onChange={(event) => updateTree(renameNode(tree, node.id, event.target.value))}
                type="text"
                value={node.label}
              />
            </label>

            <label className="space-y-1 text-sm">
              <span className="font-medium">Type</span>
              <select
                aria-label={`Type for ${node.id}`}
                className="w-full rounded border border-black/15 px-3 py-2"
                onChange={(event) =>
                  handleTypeChange(
                    node,
                    event.target.value as LeafNodeType | CompositeNodeType,
                    expectedOutputType,
                  )
                }
                value={node.type}
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

            <div className="flex flex-wrap items-end gap-2">
              <button
                className="rounded border border-black/15 px-3 py-2 text-sm"
                disabled={siblingIndex === 0 || parent === null}
                onClick={() => updateTree(moveNode(tree, node.id, 'up'))}
                type="button"
              >
                Move up
              </button>
              <button
                className="rounded border border-black/15 px-3 py-2 text-sm"
                disabled={siblingIndex === siblingCount - 1 || parent === null}
                onClick={() => updateTree(moveNode(tree, node.id, 'down'))}
                type="button"
              >
                Move down
              </button>
              <button
                className="rounded border border-red-200 px-3 py-2 text-sm text-red-700"
                disabled={parent === null}
                onClick={() => updateTree(deleteNode(tree, node.id))}
                type="button"
              >
                Delete
              </button>
            </div>
          </div>

          {node.kind === 'composite' ? (
            <div className="rounded border border-dashed border-black/10 p-3">
              <div className="flex flex-wrap items-end gap-3">
                <label className="space-y-1 text-sm">
                  <span className="font-medium">Add child</span>
                  <select
                    aria-label={`Child type for ${node.id}`}
                    className="rounded border border-black/15 px-3 py-2"
                    onChange={(event) =>
                      setNewChildTypes((current) => ({ ...current, [node.id]: event.target.value }))
                    }
                    value={newChildTypes[node.id] ?? 'bernoulli'}
                  >
                    {nodeTypeOptions.map((option) => {
                      const disabled =
                        getExpectedChildOutputType(node) !== null &&
                        !canUseNodeType(option.type, getExpectedChildOutputType(node));

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
                  onClick={() => handleAddChild(node)}
                  type="button"
                >
                  Add child
                </button>
              </div>

              <p className="mt-2 text-sm text-black/60">
                {getExpectedChildOutputType(node) === null
                  ? 'This node does not accept children.'
                  : `This ${node.type.replaceAll('_', ' ')} node accepts ${getExpectedChildOutputType(node)} children.`}
              </p>
            </div>
          ) : null}

          {inlineErrors.length > 0 ? (
            <div className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <p className="font-medium">Validation</p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {inlineErrors.map((error) => (
                  <li key={`${error.path}-${error.message}`}>
                    <span className="font-mono text-xs">{error.path}</span>: {error.message}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>

        {node.kind === 'composite' && !collapsed && node.children.length > 0 ? (
          <ul className="space-y-3">
            {node.children.map((child, index) =>
              renderNode(
                child,
                node,
                `${path}.children[${index}]`,
                depth + 1,
                index,
                node.children.length,
              ),
            )}
          </ul>
        ) : null}
      </li>
    );
  }

  return (
    <section className="space-y-4">
      <div className="rounded border border-black/10 p-4">
        <h2 className="text-lg font-semibold">Tree editor shell</h2>
        <p className="mt-2 text-sm text-black/65">
          Build the outline here: rename nodes, change their type, add children, reorder siblings,
          collapse branches, and watch validation update inline.
        </p>
      </div>

      {blockedMessage ? (
        <div className="rounded border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {blockedMessage}
        </div>
      ) : null}

      {!validation.valid ? (
        <div className="rounded border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-medium">Tree needs attention</p>
          <p className="mt-1">
            Invalid wiring and arity problems show up inline below so you can repair them before
            saving.
          </p>
        </div>
      ) : (
        <div className="rounded border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          Tree is currently valid.
        </div>
      )}

      <ul className="space-y-3">{renderNode(tree.root, null, 'root', 0, 0, 1)}</ul>
    </section>
  );
}
