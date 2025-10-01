/**
 * Logger service for the frontend application
 * Provides browser-safe logging with production readiness
 *
 * Usage:
 *   import { logger } from '../lib/logger';
 *   logger.info('User logged in', { userId: 123 });
 *   logger.error('Operation failed', { error: err });
 */

interface LogContext {
  [key: string]: unknown;
}

const isDevelopment = import.meta.env.DEV;

/**
 * Safely serialize an error object for logging
 */
function serializeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: isDevelopment ? error.stack : undefined
    };
  }
  return { error: String(error) };
}

/**
 * Sanitize context to remove sensitive data and ensure serializable
 */
function sanitizeContext(context: LogContext): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(context)) {
    // Skip potentially sensitive fields
    if (key.toLowerCase().includes('password') ||
        key.toLowerCase().includes('token') ||
        key.toLowerCase().includes('secret')) {
      sanitized[key] = '[REDACTED]';
      continue;
    }

    // Handle errors specially
    if (key === 'error' || key === 'err') {
      sanitized[key] = serializeError(value);
      continue;
    }

    // Copy other values (will be stringified by console)
    sanitized[key] = value;
  }

  return sanitized;
}

class Logger {
  private log(
    level: 'info' | 'warn' | 'error' | 'debug',
    message: string,
    context?: LogContext
  ) {
    const timestamp = new Date().toISOString();
    const sanitizedContext = context ? sanitizeContext(context) : undefined;

    if (isDevelopment) {
      // Development: Pretty console logging
      const style = level === 'error' ? 'color: red' : level === 'warn' ? 'color: orange' : 'color: blue';

      /* eslint-disable no-console */
      if (level === 'error') {
        console.error(`[${timestamp}] ${message}`, sanitizedContext);
      } else if (level === 'warn') {
        console.warn(`[${timestamp}] ${message}`, sanitizedContext);
      } else {
        console.log(`%c[${timestamp}] [${level}] ${message}`, style, sanitizedContext);
      }
      /* eslint-enable no-console */
    } else {
      // Production: Structured logging (ready for Sentry/monitoring)
      const logEntry = {
        timestamp,
        level,
        message,
        ...sanitizedContext
      };

      /* eslint-disable no-console */
      if (level === 'error') {
        console.error(JSON.stringify(logEntry));
        // TODO: Send to Sentry or other monitoring service
      } else if (level === 'warn') {
        console.warn(JSON.stringify(logEntry));
      } else {
        // In production, only log errors and warnings to reduce noise
        // Debug and info logs can be enabled via feature flag if needed
      }
      /* eslint-enable no-console */
    }
  }

  info(message: string, context?: LogContext) {
    this.log('info', message, context);
  }

  warn(message: string, context?: LogContext) {
    this.log('warn', message, context);
  }

  error(message: string, context?: LogContext) {
    this.log('error', message, context);
  }

  debug(message: string, context?: LogContext) {
    if (isDevelopment) {
      this.log('debug', message, context);
    }
  }
}

export const logger = new Logger();
