import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ChoiceToggle } from './choice-toggle';

const OPTIONS = ['a', 'b', 'c'] as const;
const LABELS = { a: 'A', b: 'B', c: 'C' };

function setup(value: (typeof OPTIONS)[number] = 'a') {
  const onChange = vi.fn();
  render(
    <ChoiceToggle
      label="Letra"
      value={value}
      options={OPTIONS}
      labels={LABELS}
      onChange={onChange}
    />,
  );
  return onChange;
}

describe('ChoiceToggle', () => {
  it('selects the next option when ArrowRight moves the focus', async () => {
    const onChange = setup();
    const first = screen.getByRole('radio', { name: 'A' });
    first.focus();
    fireEvent.keyDown(first, { key: 'ArrowRight' });
    await waitFor(() => expect(screen.getByRole('radio', { name: 'B' })).toHaveFocus());
    expect(onChange).toHaveBeenCalledWith('b');
  });

  it('wraps to the last option when ArrowLeft is pressed on the first', async () => {
    const onChange = setup();
    const first = screen.getByRole('radio', { name: 'A' });
    first.focus();
    fireEvent.keyDown(first, { key: 'ArrowLeft' });
    await waitFor(() => expect(screen.getByRole('radio', { name: 'C' })).toHaveFocus());
    expect(onChange).toHaveBeenCalledWith('c');
  });

  it('selects the first option on Home', async () => {
    const onChange = setup('b');
    const current = screen.getByRole('radio', { name: 'B' });
    current.focus();
    fireEvent.keyDown(current, { key: 'Home' });
    await waitFor(() => expect(screen.getByRole('radio', { name: 'A' })).toHaveFocus());
    expect(onChange).toHaveBeenCalledWith('a');
  });

  it('selects the last option on End', async () => {
    const onChange = setup();
    const first = screen.getByRole('radio', { name: 'A' });
    first.focus();
    fireEvent.keyDown(first, { key: 'End' });
    await waitFor(() => expect(screen.getByRole('radio', { name: 'C' })).toHaveFocus());
    expect(onChange).toHaveBeenCalledWith('c');
  });

  it('drops a stale arrow flag once the focus leaves the group', () => {
    const onChange = vi.fn();
    render(
      <>
        <ChoiceToggle
          label="Letra"
          value="a"
          options={OPTIONS}
          labels={LABELS}
          onChange={onChange}
        />
        <button type="button">fora</button>
      </>,
    );
    const first = screen.getByRole('radio', { name: 'A' });
    first.focus();
    // Home on the selected first item moves no focus, so nothing consumes the flag.
    fireEvent.keyDown(first, { key: 'Home' });
    screen.getByRole('button', { name: 'fora' }).focus();

    screen.getByRole('radio', { name: 'B' }).focus();

    expect(onChange).not.toHaveBeenCalled();
  });

  it('selects on click', () => {
    const onChange = setup();
    fireEvent.click(screen.getByRole('radio', { name: 'C' }));
    expect(onChange).toHaveBeenCalledWith('c');
  });

  it('ignores a click on the active option', () => {
    const onChange = setup();
    fireEvent.click(screen.getByRole('radio', { name: 'A' }));
    expect(onChange).not.toHaveBeenCalled();
  });
});
