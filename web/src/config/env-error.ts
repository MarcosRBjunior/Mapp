import type { InvalidEnvError } from './env';

// Without React: a build missing VITE_* shows a message instead of a blank page.
export function showEnvError(root: HTMLElement, error: InvalidEnvError): void {
  const message = document.createElement('p');
  message.setAttribute('role', 'alert');
  message.style.padding = '1rem';
  message.textContent = `Configuração incompleta: faltam ${error.names.join(', ')}.`;
  root.replaceChildren(message);
}
