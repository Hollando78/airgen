/**
 * Type guards and type-safe utilities for runtime type checking
 * Use these to replace unsafe `as any` type assertions
 */

/**
 * Check if a value is an Error instance
 */
export function isError(value: unknown): value is Error {
  return value instanceof Error;
}

/**
 * Check if a value is an object with a specific property
 */
export function hasProperty<K extends string>(
  obj: unknown,
  prop: K
): obj is Record<K, unknown> {
  return typeof obj === 'object' && obj !== null && prop in obj;
}

/**
 * Check if a value is an object with a code property (typical for Node.js errors)
 */
export function hasCode(value: unknown): value is { code: unknown } {
  return hasProperty(value, 'code');
}

/**
 * Check if a value is an object with a statusCode property (typical for HTTP errors)
 */
export function hasStatusCode(value: unknown): value is { statusCode: unknown } {
  return hasProperty(value, 'statusCode');
}

/**
 * Safe error serialization that preserves type information
 */
export interface SerializedError {
  type: string;
  message: string;
  stack?: string;
  code?: string | number;
  statusCode?: number;
}

/**
 * Safely serialize an error for logging or transmission
 */
export function serializeError(error: unknown): SerializedError {
  if (isError(error)) {
    const serialized: SerializedError = {
      type: error.constructor.name,
      message: error.message,
      stack: error.stack
    };

    if (hasCode(error) && (typeof error.code === 'string' || typeof error.code === 'number')) {
      serialized.code = error.code;
    }

    if (hasStatusCode(error) && typeof error.statusCode === 'number') {
      serialized.statusCode = error.statusCode;
    }

    return serialized;
  }

  // Not an Error instance, return safe representation
  return {
    type: 'Unknown',
    message: String(error)
  };
}

/**
 * Type guard for Fastify-like logger with optional methods
 */
export interface FastifyLikeLogger {
  info?: (msg: string | object, ...args: unknown[]) => void;
  warn?: (msg: string | object, ...args: unknown[]) => void;
  error?: (msg: string | object, ...args: unknown[]) => void;
  debug?: (msg: string | object, ...args: unknown[]) => void;
}

/**
 * Check if an object has a logger-like interface
 */
export function hasLogger(obj: unknown): obj is { log: FastifyLikeLogger } {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'log' in obj &&
    typeof obj.log === 'object' &&
    obj.log !== null
  );
}

/**
 * Extract error message safely from unknown error
 */
export function getErrorMessage(error: unknown): string {
  if (isError(error)) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  if (hasProperty(error, 'message') && typeof error.message === 'string') {
    return error.message;
  }
  return 'Unknown error';
}
