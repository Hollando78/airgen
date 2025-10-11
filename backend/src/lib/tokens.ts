import { randomBytes, createHash } from "node:crypto";

/**
 * Token service for email verification and password reset.
 *
 * Tokens are:
 * - Cryptographically random (32 bytes = 256 bits)
 * - Hashed before storage (SHA256)
 * - Time-limited (configurable expiry)
 * - Single-use (marked as consumed)
 */

export type TokenPurpose = "email_verification" | "password_reset";

export type TokenRecord = {
  id: string;
  hashedToken: string;
  purpose: TokenPurpose;
  userId: string;
  email: string;
  expiresAt: Date;
  createdAt: Date;
  consumedAt?: Date;
};

// In-memory token store (for dev/testing)
// In production, store in Neo4j or dedicated database
const tokenStore = new Map<string, TokenRecord>();

/**
 * Generate a cryptographically secure token (URL-safe base64)
 */
function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * Hash a token using SHA256 (for storage)
 */
function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Create a new token for email verification or password reset.
 *
 * @param userId - User ID
 * @param email - User email
 * @param purpose - Token purpose (email_verification or password_reset)
 * @param expiryMinutes - Token lifetime in minutes (default: 60 for verification, 30 for reset)
 * @returns Plain token (to send in email)
 */
export function createToken(
  userId: string,
  email: string,
  purpose: TokenPurpose,
  expiryMinutes?: number
): string {
  const token = generateToken();
  const hashedToken = hashToken(token);

  const defaultExpiry = purpose === "email_verification" ? 60 : 30;
  const expiry = expiryMinutes ?? defaultExpiry;

  const record: TokenRecord = {
    id: randomBytes(16).toString("hex"),
    hashedToken,
    purpose,
    userId,
    email,
    expiresAt: new Date(Date.now() + expiry * 60 * 1000),
    createdAt: new Date()
  };

  tokenStore.set(hashedToken, record);

  // Auto-cleanup expired tokens
  setTimeout(() => {
    if (tokenStore.has(hashedToken)) {
      const stored = tokenStore.get(hashedToken);
      if (stored && stored.expiresAt < new Date()) {
        tokenStore.delete(hashedToken);
      }
    }
  }, expiry * 60 * 1000 + 60000); // Cleanup 1 minute after expiry

  return token;
}

/**
 * Verify and consume a token.
 *
 * @param token - Plain token from email link
 * @param purpose - Expected token purpose
 * @returns Token record if valid, null if invalid/expired/consumed
 */
export function verifyAndConsumeToken(
  token: string,
  purpose: TokenPurpose
): TokenRecord | null {
  const hashedToken = hashToken(token);
  const record = tokenStore.get(hashedToken);

  if (!record) {
    return null;
  }

  // Check if already consumed
  if (record.consumedAt) {
    return null;
  }

  // Check if expired
  if (record.expiresAt < new Date()) {
    tokenStore.delete(hashedToken);
    return null;
  }

  // Check purpose matches
  if (record.purpose !== purpose) {
    return null;
  }

  // Mark as consumed
  record.consumedAt = new Date();

  return record;
}

/**
 * Revoke all tokens for a user (e.g., on password change).
 *
 * @param userId - User ID
 * @param purpose - Optional: only revoke tokens of specific purpose
 */
export function revokeUserTokens(userId: string, purpose?: TokenPurpose): void {
  for (const [hash, record] of tokenStore.entries()) {
    if (record.userId === userId && (!purpose || record.purpose === purpose)) {
      tokenStore.delete(hash);
    }
  }
}

/**
 * Clean up expired tokens (manual cleanup).
 */
export function cleanupExpiredTokens(): void {
  const now = new Date();
  for (const [hash, record] of tokenStore.entries()) {
    if (record.expiresAt < now) {
      tokenStore.delete(hash);
    }
  }
}

/**
 * Get token count (for monitoring/debugging).
 */
export function getTokenCount(): number {
  return tokenStore.size;
}
