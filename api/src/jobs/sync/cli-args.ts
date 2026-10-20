import { parseArgs } from 'node:util';

export type SyncMode = 'snapshot' | 'full';

export const USAGE = 'usage: npm run sync -w api -- --mode=snapshot|full';

export class UsageError extends Error {
  constructor(detail: string) {
    super(`${detail}\n${USAGE}`);
    this.name = 'UsageError';
  }
}

function readMode(argv: readonly string[]): string | undefined {
  try {
    return parseArgs({ args: [...argv], options: { mode: { type: 'string' } }, strict: true })
      .values.mode;
  } catch (error) {
    throw new UsageError(error instanceof Error ? error.message : 'invalid arguments');
  }
}

export function parseSyncArgs(argv: readonly string[]): { mode: SyncMode } {
  const mode = readMode(argv);
  if (mode === undefined) {
    throw new UsageError('missing --mode');
  }
  if (mode !== 'snapshot' && mode !== 'full') {
    throw new UsageError(`invalid --mode: ${mode}`);
  }
  return { mode };
}
