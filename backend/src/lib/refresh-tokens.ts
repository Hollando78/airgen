import { randomBytes } from "node:crypto";

/**
 * Refresh token service for JWT token rotation.
 *
 * Uses Redis for persistent storage in production (survives restarts).
 * Falls back to in-memory storage in development or when Redis is unavailable.
 *
 * Refresh tokens are:
 * - Long-lived (7-30 days)
 * - Stored server-side for revocation
 * - Sent as httpOnly cookies to prevent XSS
 * - Rotated on each use (one-time use)
 */

// Redis types - conditional import
type RedisClientType = import("redis").RedisClientType;
type CreateClientFn = typeof import("redis").createClient;
let createClient: CreateClientFn | null = null;

// Try to import redis, but don't fail if it's not installed
try {
  const redisModule = await import("redis");
  createClient = redisModule.createClient;
} catch {
  // Redis not installed - will use in-memory fallback
}

import { logger } from './logger.js';

type RefreshTokenRecord = {
  token: string;
  userId: string;
  expiresAt: number;
  createdAt: number;
  usedAt?: number;
};

// Redis client instance (null if Redis is unavailable)
let redisClient: RedisClientType | null = null;
let isRedisAvailable = false;

// In-memory fallback store (for dev/testing)
const refreshTokenStore = new Map<string, RefreshTokenRecord>();

// Cleanup interval (run every hour to remove expired tokens)
let cleanupInterval: NodeJS.Timeout | null = null;

/**
 * Initialize Redis connection for refresh tokens
 */
async function initializeRedis(): Promise<void> {
  if (redisClient) {
    return;
  }

  // Skip Redis in development unless explicitly enabled
  const environment = process.env.API_ENV || process.env.NODE_ENV || "development";
  if (environment === "development" && !process.env.REDIS_ENABLED) {
    logger.info("Refresh tokens using in-memory storage (development mode)");
    isRedisAvailable = false;
    return;
  }

  // If redis module is not installed, skip initialization
  if (!createClient) {
    logger.warn('Redis module not installed, refresh tokens using in-memory storage. Install with: npm install redis');
    isRedisAvailable = false;
    return;
  }

  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

  try {
    redisClient = createClient({
      url: redisUrl,
      socket: {
        reconnectStrategy: (retries: number) => {
          if (retries > 3) {
            logger.warn('Redis reconnection failed after 3 attempts, using in-memory refresh token storage');
            isRedisAvailable = false;
            return new Error('Max reconnection attempts reached');
          }
          return Math.min(retries * 100, 3000);
        }
      }
    });

    redisClient.on('error', (err: unknown) => {
      logger.warn({ err }, 'Redis error, refresh tokens may use in-memory fallback');
      isRedisAvailable = false;
    });

    redisClient.on('connect', () => {
      logger.info('Redis connected for refresh token storage');
      isRedisAvailable = true;
    });

    redisClient.on('ready', () => {
      logger.info('Redis ready for refresh token storage');
      isRedisAvailable = true;
    });

    await redisClient.connect();
    isRedisAvailable = true;
    logger.info('Refresh token storage initialized with Redis');
  } catch (err) {
    logger.warn({ err }, 'Failed to initialize Redis, using in-memory refresh token storage');
    isRedisAvailable = false;
    redisClient = null;
  }
}

// Initialize on module load
initializeRedis().catch((err: unknown) => {
  logger.warn({ err }, 'Redis initialization failed, using in-memory refresh token storage');
});

/**
 * Generate a cryptographically secure refresh token.
 */
function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * Redis key for refresh token
 */
function getRedisKey(token: string): string {
  return `refresh_token:${token}`;
}

/**
 * Redis key pattern for user's tokens
 */
function getUserTokensPattern(userId: string): string {
  return `refresh_token:*:user:${userId}`;
}

/**
 * Create a new refresh token for a user.
 *
 * @param userId - User ID
 * @param expiresInMs - Token lifetime in milliseconds (default: 7 days)
 * @returns Refresh token string
 */
export function createRefreshToken(userId: string, expiresInMs = 7 * 24 * 60 * 60 * 1000): string {
  const token = generateToken();
  const now = Date.now();
  const record: RefreshTokenRecord = {
    token,
    userId,
    expiresAt: now + expiresInMs,
    createdAt: now
  };

  // Store in Redis if available, otherwise use in-memory
  if (isRedisAvailable && redisClient) {
    const key = getRedisKey(token);
    const ttlSeconds = Math.ceil(expiresInMs / 1000);

    redisClient.setEx(key, ttlSeconds, JSON.stringify(record))
      .catch((err: unknown) => {
        logger.error({ err, userId }, 'Failed to store refresh token in Redis, falling back to memory');
        refreshTokenStore.set(token, record);
      });

    // Also store user mapping for revocation
    const userKey = `refresh_token:user:${userId}:${token}`;
    redisClient.setEx(userKey, ttlSeconds, '1')
      .catch((err: unknown) => {
        logger.error({ err }, 'Failed to store user token mapping');
      });
  } else {
    refreshTokenStore.set(token, record);
  }

  return token;
}

/**
 * Verify a refresh token and return the user ID.
 * Marks the token as used (one-time use for rotation).
 *
 * @param token - Refresh token string
 * @returns User ID if valid, null if invalid/expired/used
 */
export async function verifyRefreshToken(token: string): Promise<string | null> {
  // Try Redis first if available
  if (isRedisAvailable && redisClient) {
    try {
      const key = getRedisKey(token);
      const data = await redisClient.get(key);

      if (!data) {
        return null;
      }

      const record: RefreshTokenRecord = JSON.parse(data);

      // Check if expired
      if (record.expiresAt < Date.now()) {
        await redisClient.del(key);
        return null;
      }

      // Check if already used (rotation)
      if (record.usedAt) {
        // Token reuse detected - revoke all tokens for this user (security)
        await revokeAllUserTokens(record.userId);
        return null;
      }

      // Mark as used
      record.usedAt = Date.now();
      const ttl = await redisClient.ttl(key);
      if (ttl > 0) {
        await redisClient.setEx(key, ttl, JSON.stringify(record));
      }

      return record.userId;
    } catch (err) {
      logger.error({ err }, 'Redis error during token verification, falling back to memory');
      // Fall through to in-memory check
    }
  }

  // Fallback to in-memory storage
  const record = refreshTokenStore.get(token);

  if (!record) {
    return null;
  }

  // Check if expired
  if (record.expiresAt < Date.now()) {
    refreshTokenStore.delete(token);
    return null;
  }

  // Check if already used (rotation)
  if (record.usedAt) {
    // Token reuse detected - revoke all tokens for this user (security)
    await revokeAllUserTokens(record.userId);
    return null;
  }

  // Mark as used
  record.usedAt = Date.now();

  return record.userId;
}

/**
 * Revoke a specific refresh token.
 *
 * @param token - Refresh token string
 */
export async function revokeRefreshToken(token: string): Promise<void> {
  if (isRedisAvailable && redisClient) {
    try {
      const key = getRedisKey(token);
      await redisClient.del(key);
    } catch (err) {
      logger.error({ err }, 'Failed to revoke token in Redis');
    }
  }
  refreshTokenStore.delete(token);
}

/**
 * Revoke all refresh tokens for a user (logout all devices).
 *
 * @param userId - User ID
 */
export async function revokeAllUserTokens(userId: string): Promise<void> {
  if (isRedisAvailable && redisClient) {
    try {
      // Find all tokens for this user
      const pattern = `refresh_token:user:${userId}:*`;
      const keys: string[] = [];

      for await (const key of redisClient.scanIterator({ MATCH: pattern, COUNT: 100 })) {
        keys.push(typeof key === "string" ? key : key.toString());
      }

      // Delete each token
      for (const userKey of keys) {
        // Extract token from key: refresh_token:user:{userId}:{token}
        const parts = userKey.split(':');
        const token = parts[parts.length - 1];
        if (token) {
          const tokenKey = getRedisKey(token);
          await redisClient.del(tokenKey);
          await redisClient.del(userKey);
        }
      }

      logger.info({ userId, count: keys.length }, 'Revoked all refresh tokens for user');
    } catch (err) {
      logger.error({ err, userId }, 'Failed to revoke all tokens in Redis');
    }
  }

  // Also clear from in-memory store
  for (const [token, record] of refreshTokenStore.entries()) {
    if (record.userId === userId) {
      refreshTokenStore.delete(token);
    }
  }
}

/**
 * Clean up expired tokens from the store.
 * Called automatically every hour.
 */
export async function cleanupExpiredTokens(): Promise<void> {
  const now = Date.now();

  // Clean up in-memory store
  for (const [token, record] of refreshTokenStore.entries()) {
    if (record.expiresAt < now) {
      refreshTokenStore.delete(token);
    }
  }

  // Redis handles expiration automatically via TTL, but we can still clean up user mappings
  if (isRedisAvailable && redisClient) {
    try {
      const pattern = 'refresh_token:user:*';
      let cleaned = 0;

      for await (const key of redisClient.scanIterator({ MATCH: pattern, COUNT: 100 })) {
        const ttl = await redisClient.ttl(typeof key === "string" ? key : key.toString());
        if (ttl < 0) {
          await redisClient.del(typeof key === "string" ? key : key.toString());
          cleaned++;
        }
      }

      if (cleaned > 0) {
        logger.debug({ cleaned }, 'Cleaned up expired refresh token mappings');
      }
    } catch (err) {
      logger.warn({ err }, 'Error during Redis cleanup');
    }
  }
}

/**
 * Start the automatic cleanup interval.
 * Call this on server startup.
 */
export function startTokenCleanup(): void {
  if (cleanupInterval) {
    return;
  }
  // Run cleanup every hour
  cleanupInterval = setInterval(() => {
    cleanupExpiredTokens().catch((err: unknown) => {
      logger.warn({ err }, 'Error during token cleanup');
    });
  }, 60 * 60 * 1000);
}

/**
 * Stop the automatic cleanup interval.
 * Call this on server shutdown.
 */
export function stopTokenCleanup(): void {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
}

/**
 * Get token count (for monitoring/debugging).
 */
export async function getTokenCount(): Promise<number> {
  let count = refreshTokenStore.size;

  if (isRedisAvailable && redisClient) {
    try {
      const pattern = 'refresh_token:*';
      let redisCount = 0;

      for await (const _key of redisClient.scanIterator({ MATCH: pattern, COUNT: 100 })) {
        redisCount++;
      }

      count += redisCount;
    } catch (err) {
      logger.warn({ err }, 'Error counting Redis tokens');
    }
  }

  return count;
}

/**
 * Close Redis connection (for graceful shutdown)
 */
export async function closeRefreshTokenStore(): Promise<void> {
  if (redisClient) {
    try {
      await redisClient.quit();
      logger.info('Refresh token Redis connection closed');
    } catch (err) {
      logger.warn({ err }, 'Error closing refresh token Redis connection');
    }
    redisClient = null;
    isRedisAvailable = false;
  }
}
