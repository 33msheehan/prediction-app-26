import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ForecastList } from './ForecastList';

describe('ForecastList', () => {
  it('renders user forecasts and highlights due items', () => {
    render(
      <ForecastList
        forecasts={[
          {
            id: 'forecast-1',
            title: 'Will it ship?',
            description: 'Delivery confidence',
            status: 'open',
            headlineP: 0.63,
            dueForReview: true,
          },
        ]}
      />,
    );

    expect(screen.getByRole('link', { name: /Will it ship\?/ })).toHaveAttribute(
      'href',
      '/forecasts/forecast-1',
    );
    expect(screen.getByText('Due for review')).toBeInTheDocument();
    expect(screen.getByText('63%')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Check in now/ })).toHaveAttribute(
      'href',
      '/forecasts/forecast-1/check-in',
    );
  });

  it('does not show a check-in link when the forecast is not due', () => {
    render(
      <ForecastList
        forecasts={[
          {
            id: 'forecast-2',
            title: 'Will it rain?',
            description: null,
            status: 'open',
            headlineP: 0.4,
            dueForReview: false,
          },
        ]}
      />,
    );

    expect(screen.queryByRole('link', { name: /Check in now/ })).not.toBeInTheDocument();
  });

  it('renders an empty state when the user has no forecasts', () => {
    render(<ForecastList forecasts={[]} />);

    expect(screen.getByText('No forecasts yet.')).toBeInTheDocument();
  });
});
