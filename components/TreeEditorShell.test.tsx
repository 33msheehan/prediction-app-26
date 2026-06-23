import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Tree } from '@/lib/engine/tree';
import { TreeEditorShell } from './TreeEditorShell';

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    refresh: vi.fn(),
  }),
}));

function editorTree(): Tree {
  return {
    root: {
      id: 'root',
      label: 'Root',
      kind: 'composite',
      type: 'and',
      config: undefined,
      children: [
        {
          id: 'child-a',
          label: 'Child A',
          kind: 'leaf',
          type: 'bernoulli',
          params: { p: 0.5 },
          children: [],
        },
        {
          id: 'child-b',
          label: 'Child B',
          kind: 'leaf',
          type: 'bernoulli',
          params: { p: 0.4 },
          children: [],
        },
      ],
    },
  };
}

function thresholdEditorTree(): Tree {
  return {
    root: {
      id: 'root',
      label: 'Root threshold',
      kind: 'composite',
      type: 'threshold',
      config: { op: '>=', value: 10 },
      children: [
        {
          id: 'leaf-normal',
          label: 'Normal estimate',
          kind: 'leaf',
          type: 'normal',
          params: { mu: 0, sigma: 1 },
          elicitation: { p10: -1.2816, p50: 0, p90: 1.2816 },
          children: [],
        },
      ],
    },
  };
}

function kOfNEditorTree(): Tree {
  return {
    root: {
      id: 'root',
      label: 'Two of two',
      kind: 'composite',
      type: 'k_of_n',
      config: { k: 2 },
      children: [
        {
          id: 'child-a',
          label: 'Child A',
          kind: 'leaf',
          type: 'bernoulli',
          params: { p: 0.5 },
          elicitation: { p: 0.5 },
          children: [],
        },
        {
          id: 'child-b',
          label: 'Child B',
          kind: 'leaf',
          type: 'bernoulli',
          params: { p: 0.5 },
          elicitation: { p: 0.5 },
          children: [],
        },
      ],
    },
  };
}

function selectNode(label: string) {
  return screen.getByRole('button', { name: new RegExp(`^Select ${label} \\(`) });
}

function headlinePanel() {
  const panel = screen.getByText('Live headline').closest('div');
  expect(panel).not.toBeNull();
  return panel!;
}

describe('TreeEditorShell', () => {
  it('renames the selected node inline', async () => {
    const user = userEvent.setup();
    render(<TreeEditorShell forecastId="forecast-1" initialTree={editorTree()} />);

    await user.click(selectNode('Child A'));
    const input = screen.getByLabelText('Label for child-a');
    await user.clear(input);
    await user.type(input, 'Updated child');

    expect(screen.getByDisplayValue('Updated child')).toBeInTheDocument();
  });

  it('adds a typed child to the selected composite in one click and selects it', async () => {
    const user = userEvent.setup();
    render(<TreeEditorShell forecastId="forecast-1" initialTree={editorTree()} />);

    // Root is selected by default; the quick-add chips add a modeled child directly.
    await user.click(screen.getByRole('button', { name: 'Add Or to root' }));

    expect(screen.getByDisplayValue('New or')).toBeInTheDocument();
  });

  it('auto-adds a total and quantity estimate when a target-reached node is created', async () => {
    const user = userEvent.setup();
    render(<TreeEditorShell forecastId="forecast-1" initialTree={editorTree()} />);

    await user.click(screen.getByRole('button', { name: 'Add Threshold to root' }));

    expect(screen.getByRole('button', { name: /^Select Total quantity \(/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Select Quantity estimate \(/ })).toBeInTheDocument();
  });

  it('duplicates a node as a sibling', async () => {
    const user = userEvent.setup();
    render(<TreeEditorShell forecastId="forecast-1" initialTree={editorTree()} />);

    await user.click(screen.getByRole('button', { name: 'Duplicate Child A (child-a)' }));

    expect(screen.getAllByRole('button', { name: /^Select Child A \(/ })).toHaveLength(2);
  });

  it('keeps controls distinct when sibling nodes have the same visible label', async () => {
    const user = userEvent.setup();
    const tree = editorTree();
    tree.root.children[1] = {
      ...tree.root.children[1],
      label: 'Child A',
    };

    render(<TreeEditorShell forecastId="forecast-1" initialTree={tree} />);

    expect(screen.getAllByText('Child A')).toHaveLength(2);

    await user.click(screen.getByRole('button', { name: 'Select Child A (child-b)' }));

    expect(screen.getByLabelText('Label for child-b')).toBeInTheDocument();
  });

  it('repairs duplicate node ids from older saved trees before rendering', async () => {
    const user = userEvent.setup();
    render(
      <TreeEditorShell
        forecastId="forecast-1"
        initialTree={{
          root: {
            id: 'root',
            label: 'Root',
            kind: 'composite',
            type: 'and',
            config: undefined,
            children: [
              {
                id: 'node-2',
                label: 'Repeated',
                kind: 'leaf',
                type: 'bernoulli',
                params: { p: 0.5 },
                children: [],
              },
              {
                id: 'node-2',
                label: 'Repeated',
                kind: 'leaf',
                type: 'bernoulli',
                params: { p: 0.4 },
                children: [],
              },
            ],
          },
        }}
      />,
    );

    expect(screen.getByRole('button', { name: 'Select Repeated (node-2)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Select Repeated (node-3)' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Select Repeated (node-3)' }));

    expect(screen.getByLabelText('Label for node-3')).toBeInTheDocument();
  });

  it('renames a node inline from the structure pane', async () => {
    const user = userEvent.setup();
    render(<TreeEditorShell forecastId="forecast-1" initialTree={editorTree()} />);

    await user.dblClick(selectNode('Child A'));
    const input = screen.getByLabelText('Rename child-a');
    await user.clear(input);
    await user.type(input, 'Renamed inline{Enter}');

    expect(screen.getByRole('button', { name: /^Select Renamed inline \(/ })).toBeInTheDocument();
  });

  it('deletes a non-root node from the structure pane', async () => {
    const user = userEvent.setup();
    render(<TreeEditorShell forecastId="forecast-1" initialTree={editorTree()} />);

    await user.click(screen.getByRole('button', { name: 'Delete Child A (child-a)' }));

    expect(screen.queryByRole('button', { name: /^Select Child A \(/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Select Child B \(/ })).toBeInTheDocument();
  });

  it('reorders sibling nodes', async () => {
    const user = userEvent.setup();
    render(<TreeEditorShell forecastId="forecast-1" initialTree={editorTree()} />);

    await user.click(screen.getByRole('button', { name: 'Move Child A down (child-a)' }));

    const order = screen
      .getAllByRole('button', { name: /^Select Child [AB] \(/ })
      .map((element) => element.getAttribute('aria-label'));
    expect(order).toEqual(['Select Child B (child-b)', 'Select Child A (child-a)']);
  });

  it('hides invalid output type changes from the model selector', async () => {
    const user = userEvent.setup();
    render(<TreeEditorShell forecastId="forecast-1" initialTree={editorTree()} />);

    await user.click(selectNode('Child A'));

    const selector = screen.getByLabelText('Model type for child-a');
    expect(within(selector).queryByRole('option', { name: 'Normal' })).not.toBeInTheDocument();
    expect(within(selector).getByRole('option', { name: 'Bernoulli' })).toBeInTheDocument();
    expect(selector).toHaveValue('bernoulli');
  });

  it('updates a bernoulli leaf preview from elicitation input', async () => {
    const user = userEvent.setup();
    render(<TreeEditorShell forecastId="forecast-1" initialTree={editorTree()} />);

    await user.click(selectNode('Child A'));
    const probabilityInput = screen.getByLabelText('Probability for child-a');
    fireEvent.change(probabilityInput, { target: { value: '1' } });

    expect(probabilityInput).toHaveValue(1);
    expect(screen.getByLabelText('Probability slider for child-a')).toHaveValue('1');
    expect(screen.getAllByText('100.0%')).toHaveLength(2);
  });

  it('keeps out-of-range probabilities as inline errors instead of committing them', async () => {
    const user = userEvent.setup();
    render(<TreeEditorShell forecastId="forecast-1" initialTree={editorTree()} />);

    await user.click(selectNode('Child A'));
    const probabilityInput = screen.getByLabelText('Probability for child-a');
    fireEvent.change(probabilityInput, { target: { value: '2' } });

    expect(screen.getByDisplayValue('2')).toBeInTheDocument();
    expect(screen.getByText('Probability must be between 0 and 1')).toBeInTheDocument();
  });

  it('renders a visible histogram for numeric distribution previews', async () => {
    const user = userEvent.setup();
    render(<TreeEditorShell forecastId="forecast-1" initialTree={thresholdEditorTree()} />);

    await user.click(selectNode('Normal estimate'));

    expect(screen.getByRole('img', { name: 'Distribution histogram' })).toBeInTheDocument();
  });

  it('rejects invalid k_of_n values in the composite editor', async () => {
    const user = userEvent.setup();
    render(<TreeEditorShell forecastId="forecast-1" initialTree={kOfNEditorTree()} />);

    // Root (k_of_n) is selected by default.
    const kInput = screen.getByLabelText('K for root');
    await user.clear(kInput);
    await user.type(kInput, '3');

    expect(screen.getByText('K must be between 1 and 2')).toBeInTheDocument();
  });

  it('recomputes the live headline after a valid edit', async () => {
    vi.useFakeTimers();

    try {
      render(<TreeEditorShell forecastId="forecast-1" initialTree={editorTree()} />);

      fireEvent.click(selectNode('Child A'));

      await act(async () => {
        vi.advanceTimersByTime(300);
      });

      const panel = headlinePanel();
      const initialHeadline = within(panel).getByText(/^\d+\.\d%$/).textContent;

      const probabilityInput = screen.getByLabelText('Probability for child-a');
      fireEvent.change(probabilityInput, { target: { value: '1' } });

      expect(within(panel).getByText('Recomputing headline…')).toBeInTheDocument();

      await act(async () => {
        vi.advanceTimersByTime(300);
      });

      const updatedHeadline = within(panel).getByText(/^\d+\.\d%$/).textContent;
      expect(updatedHeadline).not.toBe(initialHeadline);
      expect(within(panel).getByText(/95% CI/)).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('renders quantile inputs for numeric leaves and keeps invalid drafts visible', async () => {
    const user = userEvent.setup();
    render(<TreeEditorShell forecastId="forecast-1" initialTree={thresholdEditorTree()} />);

    await user.click(selectNode('Normal estimate'));
    const p50Input = screen.getByLabelText('P50 for leaf-normal');
    fireEvent.change(p50Input, { target: { value: '' } });

    expect(screen.getByDisplayValue('')).toBeInTheDocument();
    expect(screen.getByText('P50 is required')).toBeInTheDocument();
  });

  it('lists exact tree validation issues and links them to the affected node', async () => {
    const user = userEvent.setup();
    render(
      <TreeEditorShell
        forecastId="forecast-1"
        initialTree={{
          root: {
            id: 'root',
            label: 'Root threshold',
            kind: 'composite',
            type: 'threshold',
            config: { op: '>=', value: 1 },
            children: [
              {
                id: 'child-a',
                label: 'Boolean child',
                kind: 'leaf',
                type: 'bernoulli',
                params: { p: 0.5 },
                children: [],
              },
            ],
          },
        }}
      />,
    );

    const issue = screen.getByRole('button', {
      name: 'Boolean child (bernoulli): threshold expects numeric children, got boolean',
    });
    expect(issue).toBeInTheDocument();

    await user.click(issue);

    expect(screen.getByLabelText('Label for child-a')).toBeInTheDocument();
  });

  it('shows validation errors when save is clicked on an invalid tree', async () => {
    const user = userEvent.setup();
    render(
      <TreeEditorShell
        forecastId="forecast-1"
        initialTree={{
          root: {
            id: 'root',
            label: 'Root threshold',
            kind: 'composite',
            type: 'threshold',
            config: { op: '>=', value: 1 },
            children: [],
          },
        }}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Save version' }));

    expect(screen.getAllByText('threshold requires exactly 1 child').length).toBeGreaterThan(0);
  });

  it('starts from an empty canvas and creates the root from the chooser', async () => {
    const user = userEvent.setup();
    render(<TreeEditorShell forecastId="forecast-1" initialTree={null} />);

    expect(screen.getByText('Start your forecast')).toBeInTheDocument();
    // The chooser only offers boolean-output root types.
    expect(screen.queryByRole('button', { name: 'Start with Normal' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Start with And' }));

    expect(screen.getByDisplayValue('Untitled forecast')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Select Untitled forecast \(/ })).toBeInTheDocument();
  });

  it('collapses the panes via the focus-mode toggle', async () => {
    const user = userEvent.setup();
    render(<TreeEditorShell forecastId="forecast-1" initialTree={editorTree()} />);

    await user.click(screen.getByRole('button', { name: 'Node focus' }));
    expect(screen.getByRole('button', { name: 'Expand tree' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Tree focus' }));
    expect(screen.getByRole('button', { name: 'Expand node editor' })).toBeInTheDocument();
  });
});
