import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { THEME_KEY } from '../shared/theme/theme';
import { ThemeToggle } from './theme-toggle';

describe('ThemeToggle', () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => document.documentElement.classList.remove('dark'));

  it('switches between the light and dark themes', () => {
    render(<ThemeToggle />);

    fireEvent.click(screen.getByRole('button', { name: 'Ativar tema escuro' }));
    expect(document.documentElement).toHaveClass('dark');
    expect(window.localStorage.getItem(THEME_KEY)).toBe('dark');

    fireEvent.click(screen.getByRole('button', { name: 'Ativar tema claro' }));
    expect(document.documentElement).not.toHaveClass('dark');
    expect(window.localStorage.getItem(THEME_KEY)).toBe('light');
  });
});
