import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { VersionHistory } from './VersionHistory';

describe('VersionHistory', () => {
  it('renders versions newest-first with headline, source, and rationale', () => {
    render(
      <VersionHistory
        versions={[
          {
            id: 'v1',
            versionNo: 1,
            headlineP: 0.5,
            headlineSE: 0.01,
            trials: 10_000,
            source: 'initial',
            rationale: null,
            createdAt: new Date('2026-06-01T00:00:00.000Z'),
          },
          {
            id: 'v2',
            versionNo: 2,
            headlineP: 0.62,
            headlineSE: 0.01,
            trials: 10_000,
            source: 'checkin',
            rationale: 'Saw new polling data',
            createdAt: new Date('2026-06-10T00:00:00.000Z'),
          },
        ]}
      />,
    );

    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('v2');
    expect(items[0]).toHaveTextContent('62%');
    expect(items[0]).toHaveTextContent('Saw new polling data');
    expect(items[1]).toHaveTextContent('v1');
  });

  it('renders an empty state with no versions', () => {
    render(<VersionHistory versions={[]} />);
    expect(screen.getByText('No saved versions yet.')).toBeInTheDocument();
  });
});
