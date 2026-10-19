import { pino, type Logger } from 'pino';
import type { LogLevel } from '../config/env.js';

export function createLogger(level: LogLevel): Logger {
  return pino({ level });
}
