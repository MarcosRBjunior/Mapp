import { pino, type DestinationStream, type Logger } from 'pino';
import type { LogLevel } from '../config/env.js';

const REDACT_PATHS = [
  'apiKey',
  '*.apiKey',
  'API_NINJAS_KEY',
  '*.API_NINJAS_KEY',
  'headers["x-api-key"]',
  '*.headers["x-api-key"]',
  'headers["X-Api-Key"]',
  '*.headers["X-Api-Key"]',
];

export function createLogger(level: LogLevel, destination?: DestinationStream): Logger {
  const options = { level, redact: REDACT_PATHS };
  return destination ? pino(options, destination) : pino(options);
}
