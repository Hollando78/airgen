import { randomBytes, createHash } from "node:crypto";
import { getPool } from "./postgres.js";

/**
 * Token service for email verification and password reset.
 *
 * Tokens are:
 * - Cryptographically random (32 bytes = 256 bits)
 * - Hashed before storage (SHA256)
 * - Stored in PostgreSQL (persists across restarts)
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
export async function createToken(
  userId: string,
  email: string,
  purpose: TokenPurpose,
  expiryMinutes?: number
): Promise<string> {
  const token = generateToken();
  const hashedToken = hashToken(token);

  const defaultExpiry = purpose === "email_verification" ? 60 : 30;
  const expiry = expiryMinutes ?? defaultExpiry;

  const expiresAt = new Date(Date.now() + expiry * 60 * 1000);

  const pool = getPool();
  await pool.query(
    `INSERT INTO verification_tokens (hashed_token, purpose, user_id, email, expires_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [hashedToken, purpose, userId, email, expiresAt]
  );

  return token;
}

/**
 * Verify and consume a token.
 *
 * @param token - Plain token from email link
 * @param purpose - Expected token purpose
 * @returns Token record if valid, null if invalid/expired/consumed
 */
export async function verifyAndConsumeToken(
  token: string,
  purpose: TokenPurpose
): Promise<TokenRecord | null> {
  const hashedToken = hashToken(token);
  const pool = getPool();

  const result = await pool.query(
    `SELECT id, hashed_token, purpose, user_id, email, expires_at, created_at, consumed_at
     FROM verification_tokens
     WHERE hashed_token = $1`,
    [hashedToken]
  );

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];

  // Check if already consumed
  if (row.consumed_at) {
    return null;
  }

  // Check if expired
  if (new Date(row.expires_at) < new Date()) {
    // Clean up expired token
    await pool.query("DELETE FROM verification_tokens WHERE id = $1", [row.id]);
    return null;
  }

  // Check purpose matches
  if (row.purpose !== purpose) {
    return null;
  }

  // Mark as consumed
  await pool.query(
    "UPDATE verification_tokens SET consumed_at = NOW() WHERE id = $1",
    [row.id]
  );

  return {
    id: row.id,
    hashedToken: row.hashed_token,
    purpose: row.purpose as TokenPurpose,
    userId: row.user_id,
    email: row.email,
    expiresAt: new Date(row.expires_at),
    createdAt: new Date(row.created_at),
    consumedAt: new Date()
  };
}

/**
 * Revoke all tokens for a user (e.g., on password change).
 *
 * @param userId - User ID
 * @param purpose - Optional: only revoke tokens of specific purpose
 */
export async function revokeUserTokens(userId: string, purpose?: TokenPurpose): Promise<void> {
  const pool = getPool();
  if (purpose) {
    await pool.query(
      "DELETE FROM verification_tokens WHERE user_id = $1 AND purpose = $2",
      [userId, purpose]
    );
  } else {
    await pool.query(
      "DELETE FROM verification_tokens WHERE user_id = $1",
      [userId]
    );
  }
}

/**
 * Clean up expired tokens (manual cleanup).
 */
export async function cleanupExpiredTokens(): Promise<void> {
  const pool = getPool();
  await pool.query("DELETE FROM verification_tokens WHERE expires_at < NOW()");
}

/**
 * Get token count (for monitoring/debugging).
 */
export async function getTokenCount(): Promise<number> {
  const pool = getPool();
  const result = await pool.query("SELECT COUNT(*) as count FROM verification_tokens");
  return parseInt(result.rows[0].count, 10);
}
