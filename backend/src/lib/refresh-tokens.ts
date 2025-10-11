import { randomBytes } from "node:crypto";

/**
 * Refresh token service for JWT token rotation.
 *
 * In development, stores tokens in memory (no persistence).
 * In production, should use Redis or similar persistent store.
 *
 * Refresh tokens are:
 * - Long-lived (7-30 days)
 * - Stored server-side for revocation
 * - Sent as httpOnly cookies to prevent XSS
 * - Rotated on each use (one-time use)
 */

type RefreshTokenRecord = {
  token: string;
  userId: string;
  expiresAt: number;
  createdAt: number;
  usedAt?: number;
};

// In-memory store (for dev/testing)
// In production, replace with Redis: { key: token, value: { userId, expiresAt } }
const refreshTokenStore = new Map<string, RefreshTokenRecord>();

// Cleanup interval (run every hour to remove expired tokens)
let cleanupInterval: NodeJS.Timeout | null = null;

/**
 * Generate a cryptographically secure refresh token.
 */
function generateToken(): string {
  return randomBytes(32).toString("base64url");
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

  refreshTokenStore.set(token, {
    token,
    userId,
    expiresAt: now + expiresInMs,
    createdAt: now
  });

  return token;
}

/**
 * Verify a refresh token and return the user ID.
 * Marks the token as used (one-time use for rotation).
 *
 * @param token - Refresh token string
 * @returns User ID if valid, null if invalid/expired/used
 */
export function verifyRefreshToken(token: string): string | null {
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
    revokeAllUserTokens(record.userId);
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
export function revokeRefreshToken(token: string): void {
  refreshTokenStore.delete(token);
}

/**
 * Revoke all refresh tokens for a user (logout all devices).
 *
 * @param userId - User ID
 */
export function revokeAllUserTokens(userId: string): void {
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
export function cleanupExpiredTokens(): void {
  const now = Date.now();
  for (const [token, record] of refreshTokenStore.entries()) {
    if (record.expiresAt < now) {
      refreshTokenStore.delete(token);
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
  cleanupInterval = setInterval(cleanupExpiredTokens, 60 * 60 * 1000);
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
export function getTokenCount(): number {
  return refreshTokenStore.size;
}
