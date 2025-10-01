/**
 * Redis-based caching service with graceful degradation
 *
 * This service provides:
 * - Generic caching with TTL support
 * - Cache key builders for consistent naming
 * - Cache invalidation helpers
 * - Graceful degradation when Redis is unavailable
 *
 * NOTE: Requires 'redis' package to be installed:
 *   npm install redis
 *
 * If Redis is not available, caching will be gracefully disabled.
 */

// Redis types - conditional import
type RedisClientType = any;
let createClient: any = null;

// Try to import redis, but don't fail if it's not installed
try {
  const redisModule = await import('redis');
  createClient = redisModule.createClient;
} catch {
  // Redis not installed - caching will be disabled
}

import { logger } from './logger.js';
import { recordCacheHit, recordCacheMiss, setActiveConnections } from './metrics.js';

// Redis client instance (null if Redis is unavailable)
let redisClient: RedisClientType | null = null;
let isRedisAvailable = false;

/**
 * Initialize Redis connection
 * Gracefully handles connection failures
 */
async function initializeRedis(): Promise<void> {
  if (redisClient) {return;}

  // If redis module is not installed, skip initialization
  if (!createClient) {
    logger.info('Redis module not installed, caching disabled. Install with: npm install redis');
    isRedisAvailable = false;
    return;
  }

  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

  try {
    redisClient = createClient({
      url: redisUrl,
      socket: {
        reconnectStrategy: (retries) => {
          // Stop reconnecting after 3 attempts
          if (retries > 3) {
            logger.warn('Redis reconnection failed after 3 attempts, disabling cache');
            isRedisAvailable = false;
            return new Error('Max reconnection attempts reached');
          }
          // Exponential backoff
          return Math.min(retries * 100, 3000);
        }
      }
    });

    redisClient.on('error', (err) => {
      logger.warn({ err }, 'Redis client error, cache operations will be skipped');
      isRedisAvailable = false;
    });

    redisClient.on('connect', () => {
      logger.info('Redis client connected');
      isRedisAvailable = true;
      setActiveConnections('redis', 1);
    });

    redisClient.on('ready', () => {
      logger.info('Redis client ready');
      isRedisAvailable = true;
      setActiveConnections('redis', 1);
    });

    redisClient.on('end', () => {
      logger.info('Redis client disconnected');
      setActiveConnections('redis', 0);
    });

    await redisClient.connect();
    isRedisAvailable = true;
    setActiveConnections('redis', 1);
    logger.info('Redis cache initialized successfully');
  } catch (err) {
    logger.warn({ err }, 'Failed to initialize Redis, cache will be disabled');
    isRedisAvailable = false;
    redisClient = null;
  }
}

// Initialize on module load
initializeRedis().catch(err => {
  logger.warn({ err }, 'Redis initialization failed during module load');
});

/**
 * Generic cached function wrapper
 *
 * @param key - Cache key
 * @param fetchFn - Function to fetch data if cache miss
 * @param ttlSeconds - Time to live in seconds
 * @returns Cached or freshly fetched data
 */
export async function getCached<T>(
  key: string,
  fetchFn: () => Promise<T>,
  ttlSeconds: number
): Promise<T> {
  // If Redis is not available, skip caching
  if (!isRedisAvailable || !redisClient) {
    return fetchFn();
  }

  try {
    // Try to get from cache
    const cached = await redisClient.get(key);
    if (cached) {
      logger.debug({ key }, 'Cache hit');
      recordCacheHit(key);
      return JSON.parse(cached) as T;
    }

    logger.debug({ key }, 'Cache miss');
    recordCacheMiss(key);
  } catch (err) {
    logger.warn({ err, key }, 'Cache read failed, fetching fresh data');
    recordCacheMiss(key);
  }

  // Cache miss or error - fetch fresh data
  const data = await fetchFn();

  // Try to cache the result
  if (isRedisAvailable && redisClient) {
    try {
      await redisClient.setEx(key, ttlSeconds, JSON.stringify(data));
      logger.debug({ key, ttlSeconds }, 'Data cached');
    } catch (err) {
      logger.warn({ err, key }, 'Cache write failed');
    }
  }

  return data;
}

/**
 * Cache key builders for consistent naming
 */
export const CacheKeys = {
  documents: (tenant: string, project: string, limit?: number, offset?: number) =>
    `documents:${tenant}:${project}:${limit || 100}:${offset || 0}`,

  documentCount: (tenant: string, project: string) =>
    `documents:count:${tenant}:${project}`,

  requirements: (tenant: string, project: string, limit?: number, offset?: number) =>
    `requirements:${tenant}:${project}:${limit || 100}:${offset || 0}`,

  requirementCount: (tenant: string, project: string) =>
    `requirements:count:${tenant}:${project}`,

  architectureBlocks: (tenant: string, project: string, diagramId: string, limit?: number, offset?: number) =>
    `arch:blocks:${tenant}:${project}:${diagramId}:${limit || 100}:${offset || 0}`,

  architectureDiagram: (tenant: string, project: string, diagramId: string) =>
    `arch:diagram:${tenant}:${project}:${diagramId}`,

  traceLinks: (tenant: string, project: string, requirementId?: string) =>
    requirementId
      ? `trace:links:${tenant}:${project}:${requirementId}`
      : `trace:links:${tenant}:${project}`,

  folders: (tenant: string, project: string, limit?: number, offset?: number) =>
    `folders:${tenant}:${project}:${limit || 100}:${offset || 0}`,
};

/**
 * Cache invalidation helpers
 */
export const CacheInvalidation = {
  /**
   * Invalidate all document-related caches for a project
   */
  invalidateDocuments: async (tenant: string, project: string): Promise<void> => {
    if (!isRedisAvailable || !redisClient) {return;}

    try {
      const pattern = `documents:${tenant}:${project}:*`;
      await invalidateByPattern(pattern);
      logger.debug({ tenant, project }, 'Invalidated document caches');
    } catch (err) {
      logger.warn({ err, tenant, project }, 'Failed to invalidate document caches');
    }
  },

  /**
   * Invalidate all requirement-related caches for a project
   */
  invalidateRequirements: async (tenant: string, project: string): Promise<void> => {
    if (!isRedisAvailable || !redisClient) {return;}

    try {
      const pattern = `requirements:${tenant}:${project}:*`;
      await invalidateByPattern(pattern);
      logger.debug({ tenant, project }, 'Invalidated requirement caches');
    } catch (err) {
      logger.warn({ err, tenant, project }, 'Failed to invalidate requirement caches');
    }
  },

  /**
   * Invalidate all architecture-related caches for a diagram
   */
  invalidateArchitecture: async (tenant: string, project: string, diagramId?: string): Promise<void> => {
    if (!isRedisAvailable || !redisClient) {return;}

    try {
      const pattern = diagramId
        ? `arch:*:${tenant}:${project}:${diagramId}:*`
        : `arch:*:${tenant}:${project}:*`;
      await invalidateByPattern(pattern);
      logger.debug({ tenant, project, diagramId }, 'Invalidated architecture caches');
    } catch (err) {
      logger.warn({ err, tenant, project, diagramId }, 'Failed to invalidate architecture caches');
    }
  },

  /**
   * Invalidate all trace link caches for a project
   */
  invalidateTraceLinks: async (tenant: string, project: string): Promise<void> => {
    if (!isRedisAvailable || !redisClient) {return;}

    try {
      const pattern = `trace:links:${tenant}:${project}:*`;
      await invalidateByPattern(pattern);
      logger.debug({ tenant, project }, 'Invalidated trace link caches');
    } catch (err) {
      logger.warn({ err, tenant, project }, 'Failed to invalidate trace link caches');
    }
  },

  /**
   * Invalidate specific cache key
   */
  invalidateKey: async (key: string): Promise<void> => {
    if (!isRedisAvailable || !redisClient) {return;}

    try {
      await redisClient.del(key);
      logger.debug({ key }, 'Invalidated cache key');
    } catch (err) {
      logger.warn({ err, key }, 'Failed to invalidate cache key');
    }
  },
};

/**
 * Helper to invalidate all keys matching a pattern
 */
async function invalidateByPattern(pattern: string): Promise<void> {
  if (!isRedisAvailable || !redisClient) {return;}

  try {
    // Use SCAN to avoid blocking Redis
    const keys: string[] = [];
    for await (const key of redisClient.scanIterator({ MATCH: pattern, COUNT: 100 })) {
      keys.push(key);
    }

    if (keys.length > 0) {
      await redisClient.del(...keys);
      logger.debug({ pattern, count: keys.length }, 'Invalidated cache keys by pattern');
    }
  } catch (err) {
    logger.warn({ err, pattern }, 'Failed to invalidate by pattern');
  }
}

/**
 * Get cache statistics
 */
export async function getCacheStats(): Promise<{
  available: boolean;
  info?: Record<string, string>;
}> {
  if (!isRedisAvailable || !redisClient) {
    return { available: false };
  }

  try {
    const info = await redisClient.info('stats');
    const stats: Record<string, string> = {};

    // Parse Redis INFO output
    info.split('\r\n').forEach(line => {
      if (line && !line.startsWith('#')) {
        const [key, value] = line.split(':');
        if (key && value) {
          stats[key] = value;
        }
      }
    });

    return {
      available: true,
      info: stats,
    };
  } catch (err) {
    logger.warn({ err }, 'Failed to get cache stats');
    return { available: false };
  }
}

/**
 * Close Redis connection (for graceful shutdown)
 */
export async function closeCache(): Promise<void> {
  if (redisClient) {
    try {
      await redisClient.quit();
      setActiveConnections('redis', 0);
      logger.info('Redis connection closed');
    } catch (err) {
      logger.warn({ err }, 'Error closing Redis connection');
    }
    redisClient = null;
    isRedisAvailable = false;
  }
}
