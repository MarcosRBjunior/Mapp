import { describe, expect, it } from 'vitest';
import { UsageError, parseSyncArgs } from '../../../../src/jobs/sync/cli-args.js';

describe('parseSyncArgs', () => {
  it('accepts --mode=snapshot', () => {
    expect(parseSyncArgs(['--mode=snapshot'])).toEqual({ mode: 'snapshot' });
  });

  it('accepts --mode full', () => {
    expect(parseSyncArgs(['--mode', 'full'])).toEqual({ mode: 'full' });
  });

  it('requires --mode', () => {
    expect(() => parseSyncArgs([])).toThrow(UsageError);
    expect(() => parseSyncArgs([])).toThrow(/missing --mode/);
  });

  it('rejects an unknown mode', () => {
    expect(() => parseSyncArgs(['--mode=weekly'])).toThrow(/invalid --mode: weekly/);
  });

  it('rejects unknown options and positionals', () => {
    expect(() => parseSyncArgs(['--mode=snapshot', '--force'])).toThrow(UsageError);
    expect(() => parseSyncArgs(['--mode=snapshot', 'extra'])).toThrow(UsageError);
  });

  it('shows the usage line in the error', () => {
    expect(() => parseSyncArgs([])).toThrow(/npm run sync -w api -- --mode=snapshot\|full/);
  });
});
