import express from 'express';
import request from 'supertest';
import type { Logger } from 'pino';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { AppError } from '../../../src/lib/app-error.js';
import { createLogger } from '../../../src/lib/logger.js';
import { errorHandler, toAppError } from '../../../src/middlewares/error-handler.js';
import { createHttpLogger } from '../../../src/middlewares/http-logger.js';

describe('toAppError', () => {
  it('keeps an AppError', () => {
    const error = new AppError('COUNTRY_NOT_FOUND', 404, 'country XYZ not found', { code: 'XYZ' });
    expect(toAppError(error)).toBe(error);
  });

  it('turns a ZodError into VALIDATION_ERROR with path and message', () => {
    const result = z.object({ date: z.string() }).safeParse({ date: 3 });
    if (result.success) throw new Error('expected a failure');

    const error = toAppError(result.error);
    expect(error).toMatchObject({ code: 'VALIDATION_ERROR', httpStatus: 400 });
    expect(error.details).toEqual([{ path: 'date', message: expect.any(String) as string }]);
  });

  it('turns an HTTP 4xx error from Express into VALIDATION_ERROR', () => {
    const error = Object.assign(new Error('Failed to decode param'), { status: 400 });
    expect(toAppError(error)).toMatchObject({
      code: 'VALIDATION_ERROR',
      httpStatus: 400,
      message: 'invalid request',
    });
  });

  it('hides unexpected errors behind INTERNAL_ERROR', () => {
    expect(toAppError(new Error('secret detail'))).toMatchObject({
      code: 'INTERNAL_ERROR',
      httpStatus: 500,
      message: 'internal server error',
      details: null,
    });
  });
});

describe('errorHandler', () => {
  it('answers 500 without stack or original message', async () => {
    const app = express();
    app.use(createHttpLogger(createLogger('silent')));
    app.get('/boom', () => {
      throw new Error('secret detail');
    });
    app.use(errorHandler);

    const response = await request(app).get('/boom').set('X-Request-Id', 'req-1');

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'internal server error',
        details: null,
        requestId: 'req-1',
      },
    });
    expect(response.text).not.toContain('secret detail');
    expect(response.text).not.toContain('at ');
  });
});

function capturingLogger(): { logger: Logger; lines: string[] } {
  const lines: string[] = [];
  const logger = createLogger('info', {
    write: (line: string) => {
      lines.push(line);
    },
  });
  return { logger, lines };
}

describe('errorHandler logging', () => {
  it('logs DATA_NOT_READY as a warning, not an error', async () => {
    const { logger, lines } = capturingLogger();
    const app = express();
    app.use(createHttpLogger(logger));
    app.get('/ready', () => {
      throw new AppError('DATA_NOT_READY', 503, 'no data has been loaded yet');
    });
    app.use(errorHandler);

    const response = await request(app).get('/ready');

    expect(response.status).toBe(503);
    const output = lines.join('');
    expect(output).not.toContain('"level":50');
    expect(output).toContain('"level":40');
  });

  it('logs an unexpected error at error level with the stack', async () => {
    const { logger, lines } = capturingLogger();
    const app = express();
    app.use(createHttpLogger(logger));
    app.get('/boom', () => {
      throw new Error('boom');
    });
    app.use(errorHandler);

    await request(app).get('/boom');

    const output = lines.join('');
    expect(output).toContain('"level":50');
    expect(output).toContain('"stack"');
  });
});

describe('errorHandler after headers were sent', () => {
  it('delegates to next and writes nothing', () => {
    const error = new Error('late');
    const next = vi.fn();
    const status = vi.fn();
    const json = vi.fn();
    const log = { error: vi.fn(), warn: vi.fn() };
    const req = { id: 'r1', log };
    const res = { headersSent: true, status, json };

    errorHandler(error, req as never, res as never, next);

    expect(next).toHaveBeenCalledWith(error);
    expect(status).not.toHaveBeenCalled();
    expect(json).not.toHaveBeenCalled();
  });
});
