import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { BLANK_PNG, CORS_HEADERS, resolveApi } from '../tests/e2e/api-routes.js';

// Must match the API and tiles URLs baked into `build:lighthouse` in package.json.
const PORT = 5181;

// Serves the E2E fixtures as the API and blank map tiles, so Lighthouse measures the
// production build without the real API or any external host. It starts `vite preview` only
// once it is listening, so the "Local" line LHCI waits for appears after the mock is up.
const server = createServer((request, response) => {
  const url = new URL(request.url ?? '/', `http://localhost:${PORT}`);
  if (request.method === 'OPTIONS') {
    response.writeHead(204, CORS_HEADERS).end();
    return;
  }
  if (url.pathname.startsWith('/tiles/')) {
    response.writeHead(200, { ...CORS_HEADERS, 'Content-Type': 'image/png' }).end(BLANK_PNG);
    return;
  }
  const { status, body } = resolveApi(url);
  response
    .writeHead(status, { ...CORS_HEADERS, 'Content-Type': 'application/json' })
    .end(JSON.stringify(body));
});

server.listen(PORT, () => {
  console.log(`Mock API on http://localhost:${PORT}`);
  const preview = spawn(
    'vite',
    ['preview', '--outDir', 'dist-lighthouse', '--port', '4173', '--strictPort'],
    {
      stdio: 'inherit',
    },
  );
  const stop = (signal: NodeJS.Signals) => () => preview.kill(signal);
  process.on('SIGINT', stop('SIGINT'));
  process.on('SIGTERM', stop('SIGTERM'));
  preview.on('exit', (code) => {
    server.close();
    process.exit(code ?? 0);
  });
});
