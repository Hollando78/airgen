import type { FastifyBaseLogger } from "fastify";

/**
 * Logger wrapper for the backend application
 * Provides type-safe logging with structured data support
 *
 * Usage:
 *   import { logger } from '../lib/logger.js';
 *   logger.info({ userId: 123 }, 'User logged in');
 *   logger.error({ err: error }, 'Operation failed');
 */

interface LogContext {
  [key: string]: unknown;
}

class Logger {
  private fastifyLogger: FastifyBaseLogger | null = null;

  setFastifyLogger(logger: FastifyBaseLogger) {
    this.fastifyLogger = logger;
  }

  private log(level: 'info' | 'warn' | 'error' | 'debug', context: LogContext | string, message?: string) {
    if (this.fastifyLogger) {
      if (typeof context === 'string') {
        this.fastifyLogger[level](context);
      } else {
        this.fastifyLogger[level](context, message || '');
      }
    } else {
      // Fallback if Fastify logger not initialized
      const msg = typeof context === 'string' ? context : message;
      const ctx = typeof context === 'object' ? context : undefined;

      if (level === 'error') {
        console.error(msg, ctx);
      } else if (level === 'warn') {
        console.warn(msg, ctx);
      } else {
        console.log(`[${level}]`, msg, ctx);
      }
    }
  }

  info(message: string): void;
  info(context: LogContext, message: string): void;
  info(contextOrMessage: LogContext | string, message?: string) {
    this.log('info', contextOrMessage, message);
  }

  warn(message: string): void;
  warn(context: LogContext, message: string): void;
  warn(contextOrMessage: LogContext | string, message?: string) {
    this.log('warn', contextOrMessage, message);
  }

  error(message: string): void;
  error(context: LogContext, message: string): void;
  error(contextOrMessage: LogContext | string, message?: string) {
    this.log('error', contextOrMessage, message);
  }

  debug(message: string): void;
  debug(context: LogContext, message: string): void;
  debug(contextOrMessage: LogContext | string, message?: string) {
    this.log('debug', contextOrMessage, message);
  }
}

export const logger = new Logger();
