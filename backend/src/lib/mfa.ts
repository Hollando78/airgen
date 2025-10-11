import { authenticator } from "otplib";
import QRCode from "qrcode";
import { createCipheriv, createDecipheriv, randomBytes, createHash } from "node:crypto";
import { config } from "../config.js";

/**
 * Multi-Factor Authentication utilities
 *
 * TOTP (Time-based One-Time Password):
 * - 6-digit codes
 * - 30-second time window
 * - Encrypted secret storage
 *
 * Backup Codes:
 * - 8-character alphanumeric codes
 * - Hashed before storage
 * - One-time use
 */

// Configure TOTP settings
authenticator.options = {
  window: 1, // Allow 1 step before/after (30s tolerance)
  digits: 6,
  step: 30
};

/**
 * Encrypt TOTP secret for storage
 */
export function encryptSecret(secret: string): string {
  const algorithm = "aes-256-gcm";
  const key = createHash("sha256").update(config.twoFactor.encryptionKey).digest();
  const iv = randomBytes(16);
  const cipher = createCipheriv(algorithm, key, iv);

  let encrypted = cipher.update(secret, "utf8", "hex");
  encrypted += cipher.final("hex");

  const authTag = cipher.getAuthTag();

  // Return: iv:authTag:encrypted
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`;
}

/**
 * Decrypt TOTP secret from storage
 */
export function decryptSecret(encryptedSecret: string): string {
  const algorithm = "aes-256-gcm";
  const key = createHash("sha256").update(config.twoFactor.encryptionKey).digest();

  const parts = encryptedSecret.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted secret format");
  }

  const iv = Buffer.from(parts[0], "hex");
  const authTag = Buffer.from(parts[1], "hex");
  const encrypted = parts[2];

  const decipher = createDecipheriv(algorithm, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}

/**
 * Generate a new TOTP secret
 */
export function generateSecret(): string {
  return authenticator.generateSecret();
}

/**
 * Generate TOTP URI for QR code
 */
export function generateTotpUri(email: string, secret: string): string {
  return authenticator.keyuri(
    email,
    config.twoFactor.issuer,
    secret
  );
}

/**
 * Generate QR code data URL from TOTP URI
 */
export async function generateQRCode(uri: string): Promise<string> {
  return QRCode.toDataURL(uri);
}

/**
 * Verify TOTP token
 */
export function verifyTotpToken(token: string, secret: string): boolean {
  try {
    return authenticator.verify({ token, secret });
  } catch (error) {
    return false;
  }
}

/**
 * Generate backup codes (8-character alphanumeric)
 */
export function generateBackupCodes(count = 10): string[] {
  const codes: string[] = [];
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

  for (let i = 0; i < count; i++) {
    let code = "";
    for (let j = 0; j < 8; j++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
    codes.push(code);
  }

  return codes;
}

/**
 * Hash a backup code for storage
 */
export function hashBackupCode(code: string): string {
  return createHash("sha256").update(code.toUpperCase()).digest("hex");
}

/**
 * Verify a backup code against stored hashes
 */
export function verifyBackupCode(code: string, hashedCodes: string[]): boolean {
  const hashedInput = hashBackupCode(code);
  return hashedCodes.includes(hashedInput);
}

/**
 * Remove a used backup code from the list
 */
export function consumeBackupCode(code: string, hashedCodes: string[]): string[] {
  const hashedInput = hashBackupCode(code);
  return hashedCodes.filter(hash => hash !== hashedInput);
}
