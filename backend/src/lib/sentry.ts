/**
 * Sentry Error Tracking Integration
 *
 * This module provides error tracking and performance monitoring via Sentry:
 * - Automatic error capture with context
 * - Request context tracking
 * - User identification from JWT
 * - Performance transaction tracking
 *
 * OPTIONAL DEPENDENCY: @sentry/node
 * If @sentry/node is not installed, error tracking will be gracefully disabled.
 * Install with: npm install @sentry/node @sentry/profiling-node
 *
 * CONFIGURATION:
 * Set SENTRY_DSN environment variable to enable Sentry
 * Set SENTRY_ENVIRONMENT to specify environment (defaults to NODE_ENV)
 * Set SENTRY_TRACES_SAMPLE_RATE for performance monitoring (0.0 to 1.0)
 */

import { FastifyRequest } from 'fastify';
import { logger } from './logger.js';

// Type definitions for Sentry (conditional)
type SentryModule = any;
type SentryTransaction = any;
type SentryScope = any;

// Sentry instance
let Sentry: SentryModule | null = null;
let isSentryAvailable = false;
let isSentryInitialized = false;

/**
 * Initialize Sentry error tracking
 * Gracefully handles missing @sentry/node dependency or missing DSN
 */
export async function initSentry(): Promise<void> {
  const dsn = process.env.SENTRY_DSN;

  // Check if DSN is configured
  if (!dsn || dsn.trim() === '') {
    logger.info('SENTRY_DSN not configured, error tracking disabled');
    isSentryAvailable = false;
    return;
  }

  try {
    // Dynamically import Sentry modules
    Sentry = await import('@sentry/node');

    // Get environment configuration
    const environment = process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'development';
    const tracesSampleRate = parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE || '0.1');
    const release = process.env.SENTRY_RELEASE || process.env.npm_package_version || '0.1.0';

    // Initialize Sentry
    Sentry.init({
      dsn,
      environment,
      release: `airgen-backend@${release}`,
      tracesSampleRate: Math.max(0, Math.min(1, tracesSampleRate)), // Clamp between 0-1

      // Integrations
      integrations: [
        new Sentry.Integrations.Http({ tracing: true }),
        new Sentry.Integrations.OnUncaughtException(),
        new Sentry.Integrations.OnUnhandledRejection(),
      ],

      // Performance monitoring
      beforeSend(event) {
        // Filter out health check errors
        if (event.request?.url?.includes('/health')) {
          return null;
        }
        return event;
      },

      // Sample health check transactions at lower rate
      beforeSendTransaction(transaction) {
        if (transaction.name?.includes('/health') && Math.random() > 0.01) {
          return null;
        }
        return transaction;
      },
    });

    // Try to import profiling (optional enhancement)
    try {
      const ProfilingIntegration = await import('@sentry/profiling-node');
      Sentry.addIntegration(new ProfilingIntegration.ProfilingIntegration());
      logger.info('Sentry profiling enabled');
    } catch {
      // Profiling not available, continue without it
      logger.debug('Sentry profiling not available');
    }

    isSentryAvailable = true;
    isSentryInitialized = true;
    logger.info({
      environment,
      release: `airgen-backend@${release}`,
      tracesSampleRate,
    }, 'Sentry initialized successfully');
  } catch (err) {
    logger.info('@sentry/node not installed, error tracking disabled. Install with: npm install @sentry/node');
    isSentryAvailable = false;
    isSentryInitialized = false;
    Sentry = null;
  }
}

/**
 * Check if Sentry is available and initialized
 */
export function isSentryEnabled(): boolean {
  return isSentryAvailable && isSentryInitialized;
}

/**
 * Capture an exception with Sentry
 *
 * @param error - Error to capture
 * @param context - Additional context information
 */
export function captureException(error: Error | unknown, context?: Record<string, any>): void {
  if (!isSentryEnabled() || !Sentry) {
    return;
  }

  if (context) {
    Sentry.withScope((scope: SentryScope) => {
      // Add context as extras
      Object.entries(context).forEach(([key, value]) => {
        scope.setExtra(key, value);
      });

      Sentry.captureException(error);
    });
  } else {
    Sentry.captureException(error);
  }
}

/**
 * Capture a message with Sentry
 *
 * @param message - Message to capture
 * @param level - Severity level ('info', 'warning', 'error', 'fatal', 'debug')
 * @param context - Additional context information
 */
export function captureMessage(
  message: string,
  level: 'info' | 'warning' | 'error' | 'fatal' | 'debug' = 'info',
  context?: Record<string, any>
): void {
  if (!isSentryEnabled() || !Sentry) {
    return;
  }

  if (context) {
    Sentry.withScope((scope: SentryScope) => {
      Object.entries(context).forEach(([key, value]) => {
        scope.setExtra(key, value);
      });

      Sentry.captureMessage(message, level);
    });
  } else {
    Sentry.captureMessage(message, level);
  }
}

/**
 * Set user context for error tracking
 * Call this after authentication to associate errors with users
 *
 * @param user - User information
 */
export function setUser(user: {
  id: string;
  email?: string;
  username?: string;
  roles?: string[];
}): void {
  if (!isSentryEnabled() || !Sentry) {
    return;
  }

  Sentry.setUser({
    id: user.id,
    email: user.email,
    username: user.username,
    roles: user.roles?.join(','),
  });
}

/**
 * Clear user context (call on logout)
 */
export function clearUser(): void {
  if (!isSentryEnabled() || !Sentry) {
    return;
  }

  Sentry.setUser(null);
}

/**
 * Add request context to Sentry scope
 * Useful for tracking which API requests are causing errors
 *
 * @param request - Fastify request object
 */
export function setRequestContext(request: FastifyRequest): void {
  if (!isSentryEnabled() || !Sentry) {
    return;
  }

  Sentry.withScope((scope: SentryScope) => {
    // Set request context
    scope.setContext('request', {
      method: request.method,
      url: request.url,
      headers: {
        'user-agent': request.headers['user-agent'],
        'content-type': request.headers['content-type'],
      },
      query: request.query,
      ip: request.ip,
    });

    // Set user if authenticated
    if (request.currentUser) {
      setUser({
        id: request.currentUser.userId,
        email: request.currentUser.email,
        username: request.currentUser.email,
        roles: request.currentUser.roles,
      });
    }
  });
}

/**
 * Start a performance transaction
 * Useful for tracking slow operations
 *
 * @param name - Transaction name
 * @param op - Operation type (e.g., 'http.server', 'db.query')
 * @returns Transaction object (or null if Sentry unavailable)
 */
export function startTransaction(name: string, op: string): SentryTransaction | null {
  if (!isSentryEnabled() || !Sentry) {
    return null;
  }

  return Sentry.startTransaction({
    name,
    op,
  });
}

/**
 * Finish a performance transaction
 *
 * @param transaction - Transaction to finish
 */
export function finishTransaction(transaction: SentryTransaction | null): void {
  if (!transaction || !isSentryEnabled()) {
    return;
  }

  transaction.finish();
}

/**
 * Add breadcrumb for debugging context
 * Breadcrumbs help understand the sequence of events leading to an error
 *
 * @param message - Breadcrumb message
 * @param category - Category (e.g., 'auth', 'db', 'api')
 * @param level - Severity level
 * @param data - Additional data
 */
export function addBreadcrumb(
  message: string,
  category: string = 'default',
  level: 'info' | 'warning' | 'error' | 'debug' = 'info',
  data?: Record<string, any>
): void {
  if (!isSentryEnabled() || !Sentry) {
    return;
  }

  Sentry.addBreadcrumb({
    message,
    category,
    level,
    data,
    timestamp: Date.now() / 1000,
  });
}

/**
 * Flush pending Sentry events
 * Useful before shutdown to ensure all errors are sent
 *
 * @param timeout - Timeout in milliseconds (default: 2000)
 * @returns Promise that resolves when flush is complete
 */
export async function flush(timeout: number = 2000): Promise<boolean> {
  if (!isSentryEnabled() || !Sentry) {
    return true;
  }

  try {
    return await Sentry.close(timeout);
  } catch (err) {
    logger.warn({ err }, 'Error flushing Sentry events');
    return false;
  }
}

/**
 * Create an error handler middleware for Fastify
 * Captures errors and adds request context
 *
 * @param error - Error object
 * @param request - Fastify request
 */
export function sentryErrorHandler(error: Error, request: FastifyRequest): void {
  if (!isSentryEnabled()) {
    return;
  }

  // Set request context
  setRequestContext(request);

  // Capture exception
  captureException(error, {
    route: request.url,
    method: request.method,
    params: request.params,
    query: request.query,
  });
}

/**
 * Get Sentry status for health checks
 */
export function getSentryStatus(): {
  enabled: boolean;
  initialized: boolean;
  dsn?: string;
} {
  return {
    enabled: isSentryAvailable,
    initialized: isSentryInitialized,
    dsn: isSentryInitialized ? 'configured' : undefined,
  };
}
