import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
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
