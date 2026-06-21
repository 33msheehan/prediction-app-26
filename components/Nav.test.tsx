import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Nav } from './Nav';

describe('Nav', () => {
  it('renders links to the dashboard, new forecast, and calibration', () => {
    render(<Nav />);

    expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: 'New forecast' })).toHaveAttribute(
      'href',
      '/forecasts/new',
    );
    expect(screen.getByRole('link', { name: 'Calibration' })).toHaveAttribute(
      'href',
      '/calibration',
    );
  });
});
