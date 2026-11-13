import { QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { App } from './app/app';
import { createQueryClient } from './app/query-client';
import './app/styles.css';
import { getEnv, InvalidEnvError } from './config/env';
import { showEnvError } from './config/env-error';
import { ThemeProvider } from './shared/theme/theme-provider';

const root = document.getElementById('root');
if (!root) {
  throw new Error('Root element #root not found');
}

let envError: InvalidEnvError | null = null;
try {
  getEnv();
} catch (error) {
  if (!(error instanceof InvalidEnvError)) throw error;
  envError = error;
}

if (envError) {
  showEnvError(root, envError);
} else {
  createRoot(root).render(
    <StrictMode>
      <ThemeProvider>
        <QueryClientProvider client={createQueryClient()}>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </QueryClientProvider>
      </ThemeProvider>
    </StrictMode>,
  );
}
