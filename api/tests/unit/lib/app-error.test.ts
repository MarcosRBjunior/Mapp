import { describe, expect, it } from 'vitest';
import { AppError } from '../../../src/lib/app-error.js';

describe('AppError', () => {
  it('carries code, status, message and details', () => {
    const error = new AppError('COUNTRY_NOT_FOUND', 404, 'country XYZ not found', { code: 'XYZ' });

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('AppError');
    expect(error.code).toBe('COUNTRY_NOT_FOUND');
    expect(error.httpStatus).toBe(404);
    expect(error.message).toBe('country XYZ not found');
    expect(error.details).toEqual({ code: 'XYZ' });
  });

  it('defaults details to null and keeps the cause', () => {
    const cause = new Error('connection refused');
    const error = new AppError('DATA_NOT_READY', 503, 'database is not reachable', null, { cause });

    expect(error.details).toBeNull();
    expect(error.cause).toBe(cause);
  });
});
