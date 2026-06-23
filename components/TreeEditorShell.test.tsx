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
  return screen.getByRole('button', { name: `Select ${label}` });
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

    // Root is selected by default; the quick-add chips add a typed child directly.
    await user.click(screen.getByRole('button', { name: 'Add Or to root' }));

    expect(screen.getByDisplayValue('New or')).toBeInTheDocument();
  });

  it('auto-adds a valid child when a threshold node is created', async () => {
    const user = userEvent.setup();
    render(<TreeEditorShell forecastId="forecast-1" initialTree={editorTree()} />);

    // Adding a threshold (needs exactly one numeric child) should drop in a
    // starter normal leaf so the new branch is valid immediately.
    await user.click(screen.getByRole('button', { name: 'Add Threshold to root' }));

    expect(screen.getByRole('button', { name: 'Select New normal' })).toBeInTheDocument();
  });

  it('duplicates a node as a sibling', async () => {
    const user = userEvent.setup();
    render(<TreeEditorShell forecastId="forecast-1" initialTree={editorTree()} />);

    await user.click(screen.getByRole('button', { name: 'Duplicate Child A' }));

    expect(screen.getAllByRole('button', { name: /^Select Child A$/ })).toHaveLength(2);
  });

  it('renames a node inline from the structure pane', async () => {
    const user = userEvent.setup();
    render(<TreeEditorShell forecastId="forecast-1" initialTree={editorTree()} />);

    await user.dblClick(screen.getByRole('button', { name: 'Select Child A' }));
    const input = screen.getByLabelText('Rename child-a');
    await user.clear(input);
    await user.type(input, 'Renamed inline{Enter}');

    expect(screen.getByRole('button', { name: 'Select Renamed inline' })).toBeInTheDocument();
  });

  it('deletes a non-root node from the structure pane', async () => {
    const user = userEvent.setup();
    render(<TreeEditorShell forecastId="forecast-1" initialTree={editorTree()} />);

    await user.click(screen.getByRole('button', { name: 'Delete Child A' }));

    expect(screen.queryByRole('button', { name: 'Select Child A' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Select Child B' })).toBeInTheDocument();
  });

  it('reorders sibling nodes', async () => {
    const user = userEvent.setup();
    render(<TreeEditorShell forecastId="forecast-1" initialTree={editorTree()} />);

    await user.click(screen.getByRole('button', { name: 'Move Child A down' }));

    const order = screen
      .getAllByRole('button', { name: /^Select Child [AB]$/ })
      .map((element) => element.getAttribute('aria-label'));
    expect(order).toEqual(['Select Child B', 'Select Child A']);
  });

  it('blocks invalid child output type changes with a clear message', async () => {
    const user = userEvent.setup();
    render(<TreeEditorShell forecastId="forecast-1" initialTree={editorTree()} />);

    await user.click(selectNode('Child A'));
    await user.selectOptions(screen.getByLabelText('Type for child-a'), 'normal');

    expect(
      screen.getByText('Normal produces numeric output, but this position requires boolean.'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Type for child-a')).toHaveValue('bernoulli');
  });

  it('updates a bernoulli leaf preview from elicitation input', async () => {
    const user = userEvent.setup();
    render(<TreeEditorShell forecastId="forecast-1" initialTree={editorTree()} />);

    await user.click(selectNode('Child A'));
    const probabilityInput = screen.getByLabelText('Probability for child-a');
    fireEvent.change(probabilityInput, { target: { value: '1' } });

    expect(screen.getByDisplayValue('1')).toBeInTheDocument();
    expect(screen.getAllByText('100.0%')).toHaveLength(2);
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

  it('starts from an empty canvas and creates the root from the chooser', async () => {
    const user = userEvent.setup();
    render(<TreeEditorShell forecastId="forecast-1" initialTree={null} />);

    expect(screen.getByText('Start your forecast')).toBeInTheDocument();
    // The chooser only offers boolean-output root types.
    expect(screen.queryByRole('button', { name: 'Start with Normal' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Start with And' }));

    expect(screen.getByDisplayValue('Untitled forecast')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Select Untitled forecast' })).toBeInTheDocument();
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
