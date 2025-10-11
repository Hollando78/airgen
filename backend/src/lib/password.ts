import * as argon2 from "argon2";
import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Argon2id password hashing utility with secure parameters.
 *
 * Using Argon2id (hybrid mode) which provides defense against:
 * - GPU/ASIC attacks (via memory-hardness from Argon2i)
 * - Side-channel attacks (via data-dependent memory access from Argon2d)
 *
 * Parameters chosen based on OWASP recommendations:
 * - Memory: 64 MiB (65536 KiB)
 * - Iterations: 3 (time cost)
 * - Parallelism: 1 (to maximize memory-hardness on single thread)
 */

const ARGON2_OPTIONS: argon2.Options & { type: argon2.argon2id } = {
  type: argon2.argon2id,
  memoryCost: 65536, // 64 MiB
  timeCost: 3,       // 3 iterations
  parallelism: 1     // 1 thread
};

/**
 * Hash a password using Argon2id.
 *
 * @param password - Plain text password to hash
 * @returns Argon2id hash string (includes salt and parameters)
 */
export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, ARGON2_OPTIONS);
}

/**
 * Verify a password against an Argon2id hash.
 * Uses constant-time comparison to prevent timing attacks.
 *
 * @param hash - Argon2id hash string from storage
 * @param password - Plain text password to verify
 * @returns true if password matches, false otherwise
 */
export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch (error) {
    // Invalid hash format or verification error
    return false;
  }
}

/**
 * Check if a hash needs to be upgraded to stronger parameters.
 * Returns true if the hash was created with weaker parameters than current settings.
 *
 * @param hash - Argon2id hash string to check
 * @returns true if hash should be upgraded
 */
export async function needsRehash(hash: string): Promise<boolean> {
  try {
    return argon2.needsRehash(hash, ARGON2_OPTIONS);
  } catch (error) {
    // If we can't parse the hash, assume it needs rehashing
    return true;
  }
}

/**
 * Verify a legacy SHA256 hash (for migration purposes).
 * Uses constant-time comparison to prevent timing attacks.
 *
 * @param legacyHash - SHA256 hash (hex string)
 * @param password - Plain text password to verify
 * @returns true if password matches, false otherwise
 */
export function verifyLegacySHA256(legacyHash: string, password: string): boolean {
  try {
    const candidateHash = createHash("sha256").update(password).digest("hex");

    if (legacyHash.length !== candidateHash.length) {
      return false;
    }

    const legacyBuffer = Buffer.from(legacyHash, "hex");
    const candidateBuffer = Buffer.from(candidateHash, "hex");

    if (legacyBuffer.length !== candidateBuffer.length) {
      return false;
    }

    return timingSafeEqual(legacyBuffer, candidateBuffer);
  } catch (error) {
    return false;
  }
}

/**
 * Verify a legacy scrypt hash (for migration purposes).
 * Uses constant-time comparison to prevent timing attacks.
 *
 * @param legacyHash - Scrypt hash (hex string)
 * @param salt - Scrypt salt (hex string)
 * @param password - Plain text password to verify
 * @returns true if password matches, false otherwise
 */
export function verifyLegacyScrypt(legacyHash: string, salt: string, password: string): boolean {
  try {
    // Import scryptSync for legacy verification only
    const { scryptSync } = require("node:crypto");
    const candidateHash = scryptSync(password, salt, 64).toString("hex");

    if (legacyHash.length !== candidateHash.length) {
      return false;
    }

    const legacyBuffer = Buffer.from(legacyHash, "hex");
    const candidateBuffer = Buffer.from(candidateHash, "hex");

    if (legacyBuffer.length !== candidateBuffer.length) {
      return false;
    }

    return timingSafeEqual(legacyBuffer, candidateBuffer);
  } catch (error) {
    return false;
  }
}
