export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'COUNTRY_NOT_FOUND'
  | 'NOT_FOUND'
  | 'RATE_LIMITED'
  | 'DATA_NOT_READY'
  | 'INTERNAL_ERROR';

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly httpStatus: number;
  readonly details: unknown;

  constructor(
    code: ErrorCode,
    httpStatus: number,
    message: string,
    details: unknown = null,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'AppError';
    this.code = code;
    this.httpStatus = httpStatus;
    this.details = details;
  }
}
