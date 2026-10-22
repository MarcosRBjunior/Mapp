import type { Logger } from 'pino';

// Cleanup that must never hide the error that brought us here.
export async function bestEffort(
  logger: Logger,
  action: string,
  step: () => Promise<unknown>,
): Promise<void> {
  try {
    await step();
  } catch (err) {
    logger.warn({ err, action }, 'cleanup step failed');
  }
}
