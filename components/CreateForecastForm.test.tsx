import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CreateForecastForm } from './CreateForecastForm';

describe('CreateForecastForm', () => {
  it('renders the fields needed to create a forecast and configure cadence', () => {
    render(<CreateForecastForm action={vi.fn()} />);

    expect(screen.getByLabelText('Title')).toBeRequired();
    expect(screen.getByLabelText('Description')).toBeInTheDocument();
    expect(screen.getByLabelText('No reminder cadence')).toBeChecked();
    expect(screen.getAllByRole('radio')).toHaveLength(3);
    expect(screen.getByRole('spinbutton')).toHaveAttribute('name', 'intervalDays');
    expect(screen.getByRole('button', { name: 'Create forecast' })).toBeInTheDocument();
  });
});
