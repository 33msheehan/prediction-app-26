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

describe('TreeEditorShell', () => {
  it('renames a node inline', async () => {
    const user = userEvent.setup();
    render(<TreeEditorShell forecastId="forecast-1" initialTree={editorTree()} />);

    const input = screen.getByLabelText('Label for child-a');
    await user.clear(input);
    await user.type(input, 'Updated child');

    expect(screen.getByDisplayValue('Updated child')).toBeInTheDocument();
  });

  it('adds a child to a composite node', async () => {
    const user = userEvent.setup();
    render(<TreeEditorShell forecastId="forecast-1" initialTree={editorTree()} />);

    await user.selectOptions(screen.getByLabelText('Child type for root'), 'or');
    await user.click(screen.getByRole('button', { name: 'Add child' }));

    expect(screen.getByDisplayValue('New or')).toBeInTheDocument();
  });

  it('deletes a non-root node', async () => {
    const user = userEvent.setup();
    render(<TreeEditorShell forecastId="forecast-1" initialTree={editorTree()} />);

    await user.click(screen.getAllByRole('button', { name: 'Delete' })[1]);

    expect(screen.queryByLabelText('Label for child-a')).not.toBeInTheDocument();
  });

  it('reorders sibling nodes', async () => {
    const user = userEvent.setup();
    render(<TreeEditorShell forecastId="forecast-1" initialTree={editorTree()} />);

    await user.click(screen.getAllByRole('button', { name: 'Move down' })[1]);

    const childInputs = screen
      .getAllByDisplayValue(/Child [AB]/)
      .map((element) => element.getAttribute('value'));
    expect(childInputs).toEqual(['Child B', 'Child A']);
  });

  it('blocks invalid child output type changes with a clear message', async () => {
    const user = userEvent.setup();
    render(<TreeEditorShell forecastId="forecast-1" initialTree={editorTree()} />);

    await user.selectOptions(screen.getByLabelText('Type for child-a'), 'normal');

    expect(
      screen.getByText('Normal produces numeric output, but this position requires boolean.'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Type for child-a')).toHaveValue('bernoulli');
  });

  it('updates a bernoulli leaf preview from elicitation input', async () => {
    render(<TreeEditorShell forecastId="forecast-1" initialTree={editorTree()} />);

    const probabilityInput = screen.getByLabelText('Probability for child-a');
    fireEvent.change(probabilityInput, { target: { value: '1' } });

    expect(screen.getByDisplayValue('1')).toBeInTheDocument();
    expect(screen.getAllByText('100.0%')).toHaveLength(2);
  });

  it('rejects invalid k_of_n values in the composite editor', async () => {
    const user = userEvent.setup();
    render(<TreeEditorShell forecastId="forecast-1" initialTree={kOfNEditorTree()} />);

    const kInput = screen.getByLabelText('K for root');
    await user.clear(kInput);
    await user.type(kInput, '3');

    expect(screen.getByText('K must be between 1 and 2')).toBeInTheDocument();
  });

  it('recomputes the live headline after a valid edit', async () => {
    vi.useFakeTimers();

    try {
      render(<TreeEditorShell forecastId="forecast-1" initialTree={editorTree()} />);

      await act(async () => {
        vi.advanceTimersByTime(300);
      });

      const headlinePanel = screen.getByText('Live headline').closest('div');
      expect(headlinePanel).not.toBeNull();
      const panel = headlinePanel!;
      const initialHeadline = within(panel).getByText(/^\d+\.\d%$/).textContent;

      const probabilityInput = screen.getByLabelText('Probability for child-a');
      fireEvent.change(probabilityInput, { target: { value: '1' } });

      expect(within(panel).getByText('Recomputing headline…')).toBeInTheDocument();

      await act(async () => {
        vi.advanceTimersByTime(300);
      });

      const updatedHeadline = within(panel).getByText(/^\d+\.\d%$/).textContent;
      expect(updatedHeadline).not.toBe(initialHeadline);
      expect(within(panel).getByText(/95% CI:/)).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('renders quantile inputs for numeric leaves and keeps invalid drafts visible', async () => {
    render(<TreeEditorShell forecastId="forecast-1" initialTree={thresholdEditorTree()} />);

    const p50Input = screen.getByLabelText('P50 for leaf-normal');
    fireEvent.change(p50Input, { target: { value: '' } });

    expect(screen.getByDisplayValue('')).toBeInTheDocument();
    expect(screen.getByText('P50 is required')).toBeInTheDocument();
  });
});
