import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { countriesFixture } from '../../test/fixtures';
import { CountrySearch } from './country-search';

const countries = countriesFixture('cases').countries;

function setup(props: Partial<Parameters<typeof CountrySearch>[0]> = {}) {
  const onSelect = vi.fn<(code: string) => void>();
  render(<CountrySearch countries={countries} isError={false} onSelect={onSelect} {...props} />);
  return { onSelect, input: screen.getByRole('combobox', { name: 'Buscar país' }) };
}

describe('CountrySearch', () => {
  it('finds a country by partial name and selects it with Enter', () => {
    const { onSelect, input } = setup();

    fireEvent.change(input, { target: { value: 'bra' } });
    expect(screen.getByRole('option', { name: 'Brasil' })).toBeInTheDocument();
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onSelect).toHaveBeenCalledWith('BRA');
    expect(input).toHaveValue('');
  });

  it('ignores accents and selects by click', () => {
    const { onSelect, input } = setup();

    fireEvent.change(input, { target: { value: 'india' } });
    fireEvent.click(screen.getByRole('option', { name: 'Índia' }));

    expect(onSelect).toHaveBeenCalledWith('IND');
  });

  it('moves the active option with the arrow keys', () => {
    const { onSelect, input } = setup();

    fireEvent.change(input, { target: { value: 'a' } });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(screen.getByRole('option', { name: 'Dinamarca' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onSelect).toHaveBeenCalledWith('DNK');
  });

  it('closes with Escape', () => {
    const { input } = setup();

    fireEvent.change(input, { target: { value: 'bra' } });
    fireEvent.keyDown(input, { key: 'Escape' });

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(input).toHaveAttribute('aria-expanded', 'false');
  });

  it('ignores Enter while the list is closed', () => {
    const { onSelect, input } = setup();

    fireEvent.change(input, { target: { value: 'bra' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onSelect).not.toHaveBeenCalled();
  });

  it('says when nothing matches', () => {
    const { input } = setup();

    fireEvent.change(input, { target: { value: 'xyz' } });

    expect(screen.getByText('Nenhum país encontrado')).toBeInTheDocument();
  });

  it('is disabled while the countries load or after an error', () => {
    const { input } = setup({ countries: undefined });
    expect(input).toBeDisabled();
    expect(input).toHaveAttribute('placeholder', 'Carregando países…');
  });

  it('says the search is unavailable after an error', () => {
    const { input } = setup({ countries: undefined, isError: true });
    expect(input).toBeDisabled();
    expect(input).toHaveAttribute('placeholder', 'Busca indisponível');
  });
});
