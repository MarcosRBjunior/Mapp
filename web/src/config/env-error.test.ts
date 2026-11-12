import { describe, expect, it } from 'vitest';
import { InvalidEnvError } from './env';
import { showEnvError } from './env-error';

describe('showEnvError', () => {
  it('writes the missing variable names as plain text', () => {
    const root = document.createElement('div');
    root.innerHTML = '<span>old</span>';
    showEnvError(root, new InvalidEnvError(['VITE_API_URL', '<b>VITE_TILES_URL</b>']));

    const alert = root.querySelector('[role="alert"]');
    expect(alert?.textContent).toBe(
      'Configuração incompleta: faltam VITE_API_URL, <b>VITE_TILES_URL</b>.',
    );
    expect(root.querySelector('b')).toBeNull();
    expect(root.querySelector('span')).toBeNull();
  });
});
