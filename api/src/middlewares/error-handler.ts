import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../lib/app-error.js';

function clientStatusOf(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null || !('status' in error)) return undefined;
  const { status } = error;
  return typeof status === 'number' && status >= 400 && status < 500 ? status : undefined;
}

export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  if (error instanceof ZodError) {
    const details = error.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    }));
    return new AppError('VALIDATION_ERROR', 400, 'invalid request parameters', details);
  }
  if (clientStatusOf(error) !== undefined) {
    return new AppError('VALIDATION_ERROR', 400, 'invalid request');
  }
  return new AppError('INTERNAL_ERROR', 500, 'internal server error');
}

// The single final handler: same JSON shape for every error, never a stack trace.
// `next` is needed twice: Express only treats a 4-parameter function as an error
// handler, and once headers are sent only Express can close the connection.
export const errorHandler: ErrorRequestHandler = (error: unknown, req, res, next) => {
  const appError = toAppError(error);
  if (appError.code === 'INTERNAL_ERROR') {
    req.log.error({ err: error }, 'request failed');
  } else if (appError.code === 'DATA_NOT_READY') {
    req.log.warn({ err: error }, 'data not ready');
  }
  if (res.headersSent) {
    next(error);
    return;
  }
  // An error is never cached, even when the cache middleware already set the headers.
  res.removeHeader('ETag');
  res.set('Cache-Control', 'no-store');
  res.status(appError.httpStatus).json({
    error: {
      code: appError.code,
      message: appError.message,
      details: appError.details,
      requestId: typeof req.id === 'string' ? req.id : 'unknown',
    },
  });
};
