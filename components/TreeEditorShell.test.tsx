import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { Tree } from '@/lib/engine/tree';
import { TreeEditorShell } from './TreeEditorShell';

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

describe('TreeEditorShell', () => {
  it('renames a node inline', async () => {
    const user = userEvent.setup();
    render(<TreeEditorShell initialTree={editorTree()} />);

    const input = screen.getByLabelText('Label for child-a');
    await user.clear(input);
    await user.type(input, 'Updated child');

    expect(screen.getByDisplayValue('Updated child')).toBeInTheDocument();
  });

  it('adds a child to a composite node', async () => {
    const user = userEvent.setup();
    render(<TreeEditorShell initialTree={editorTree()} />);

    await user.selectOptions(screen.getByLabelText('Child type for root'), 'or');
    await user.click(screen.getByRole('button', { name: 'Add child' }));

    expect(screen.getByDisplayValue('New or')).toBeInTheDocument();
  });

  it('deletes a non-root node', async () => {
    const user = userEvent.setup();
    render(<TreeEditorShell initialTree={editorTree()} />);

    await user.click(screen.getAllByRole('button', { name: 'Delete' })[1]);

    expect(screen.queryByLabelText('Label for child-a')).not.toBeInTheDocument();
  });

  it('reorders sibling nodes', async () => {
    const user = userEvent.setup();
    render(<TreeEditorShell initialTree={editorTree()} />);

    await user.click(screen.getAllByRole('button', { name: 'Move down' })[1]);

    const childInputs = screen
      .getAllByDisplayValue(/Child [AB]/)
      .map((element) => element.getAttribute('value'));
    expect(childInputs).toEqual(['Child B', 'Child A']);
  });

  it('blocks invalid child output type changes with a clear message', async () => {
    const user = userEvent.setup();
    render(<TreeEditorShell initialTree={editorTree()} />);

    await user.selectOptions(screen.getByLabelText('Type for child-a'), 'normal');

    expect(
      screen.getByText('Normal produces numeric output, but this position requires boolean.'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Type for child-a')).toHaveValue('bernoulli');
  });
});
