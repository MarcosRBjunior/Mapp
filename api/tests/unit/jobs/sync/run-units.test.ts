import type { Logger } from 'pino';
import { describe, expect, it, vi } from 'vitest';
import { bestEffort } from '../../../../src/jobs/sync/best-effort.js';
import { decideStatus } from '../../../../src/jobs/sync/run-units.js';

describe('decideStatus', () => {
  it('is failed only when nothing was written', () => {
    expect(decideStatus({ planned: 2, completed: 2, wroteRows: false, hasNotes: false })).toBe(
      'failed',
    );
    expect(decideStatus({ planned: 2, completed: 0, wroteRows: false, hasNotes: true })).toBe(
      'failed',
    );
  });

  it('is partial when it wrote but left units or notes', () => {
    expect(decideStatus({ planned: 3, completed: 2, wroteRows: true, hasNotes: false })).toBe(
      'partial',
    );
    expect(decideStatus({ planned: 2, completed: 2, wroteRows: true, hasNotes: true })).toBe(
      'partial',
    );
  });

  it('is success when every planned unit is done without notes', () => {
    expect(decideStatus({ planned: 2, completed: 2, wroteRows: true, hasNotes: false })).toBe(
      'success',
    );
  });
});

describe('bestEffort', () => {
  it('logs a failing cleanup step instead of throwing', async () => {
    const warn = vi.fn();
    const logger = { warn } as unknown as Logger;

    await expect(
      bestEffort(logger, 'finish run', () => Promise.reject(new Error('db down'))),
    ).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'finish run' }),
      'cleanup step failed',
    );
  });

  it('runs the step', async () => {
    const step = vi.fn(() => Promise.resolve());
    await bestEffort({ warn: vi.fn() } as unknown as Logger, 'x', step);
    expect(step).toHaveBeenCalledOnce();
  });
});
