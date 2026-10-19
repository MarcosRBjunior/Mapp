import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from './app';

describe('App', () => {
  it('renders the Mapp heading and subtitle', () => {
    render(<App />);

    expect(screen.getByRole('heading', { level: 1, name: 'Mapp' })).toBeInTheDocument();
    expect(screen.getByText('Dashboard histórico de COVID-19')).toBeInTheDocument();
  });
});
