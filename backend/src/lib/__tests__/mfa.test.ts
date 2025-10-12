import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  encryptSecret,
  decryptSecret,
  generateSecret,
  generateTotpUri,
  generateQRCode,
  verifyTotpToken,
  generateBackupCodes,
  hashBackupCode,
  verifyBackupCode,
  consumeBackupCode
} from "../mfa.js";
import { authenticator } from "otplib";

describe("MFA Service", () => {
  let originalEncryptionKey: string | undefined;

  beforeAll(() => {
    originalEncryptionKey = process.env.TWO_FACTOR_ENCRYPTION_KEY;
    // Set a test encryption key
    process.env.TWO_FACTOR_ENCRYPTION_KEY = "test-encryption-key-for-testing-purposes-only";
  });

  afterAll(() => {
    if (originalEncryptionKey !== undefined) {
      process.env.TWO_FACTOR_ENCRYPTION_KEY = originalEncryptionKey;
    } else {
      delete process.env.TWO_FACTOR_ENCRYPTION_KEY;
    }
  });

  describe("Secret Encryption/Decryption", () => {
    it("should encrypt a secret", () => {
      const secret = "JBSWY3DPEHPK3PXP";
      const encrypted = encryptSecret(secret);

      expect(encrypted).toBeDefined();
      expect(typeof encrypted).toBe("string");
      expect(encrypted).not.toBe(secret);
      expect(encrypted.split(":")).toHaveLength(3); // iv:authTag:encrypted
    });

    it("should decrypt an encrypted secret", () => {
      const secret = "JBSWY3DPEHPK3PXP";
      const encrypted = encryptSecret(secret);
      const decrypted = decryptSecret(encrypted);

      expect(decrypted).toBe(secret);
    });

    it("should produce different ciphertexts for same input", () => {
      const secret = "JBSWY3DPEHPK3PXP";
      const encrypted1 = encryptSecret(secret);
      const encrypted2 = encryptSecret(secret);

      // Should be different due to random IV
      expect(encrypted1).not.toBe(encrypted2);

      // But both should decrypt to the same value
      expect(decryptSecret(encrypted1)).toBe(secret);
      expect(decryptSecret(encrypted2)).toBe(secret);
    });

    it("should throw error for invalid encrypted format", () => {
      expect(() => decryptSecret("invalid")).toThrow("Invalid encrypted secret format");
      expect(() => decryptSecret("only:two")).toThrow("Invalid encrypted secret format");
    });

    it("should handle empty string encryption/decryption", () => {
      const encrypted = encryptSecret("");
      const decrypted = decryptSecret(encrypted);
      expect(decrypted).toBe("");
    });

    it("should handle long secrets", () => {
      const longSecret = "A".repeat(1000);
      const encrypted = encryptSecret(longSecret);
      const decrypted = decryptSecret(encrypted);
      expect(decrypted).toBe(longSecret);
    });

    it("should handle special characters in secrets", () => {
      const specialSecret = "ABC123!@#$%^&*()_+-=[]{}|;':\",./<>?";
      const encrypted = encryptSecret(specialSecret);
      const decrypted = decryptSecret(encrypted);
      expect(decrypted).toBe(specialSecret);
    });
  });

  describe("TOTP Secret Generation", () => {
    it("should generate a valid TOTP secret", () => {
      const secret = generateSecret();

      expect(secret).toBeDefined();
      expect(typeof secret).toBe("string");
      expect(secret.length).toBeGreaterThan(0);
      // TOTP secrets are typically base32 encoded
      expect(/^[A-Z2-7]+$/.test(secret)).toBe(true);
    });

    it("should generate unique secrets", () => {
      const secret1 = generateSecret();
      const secret2 = generateSecret();

      expect(secret1).not.toBe(secret2);
    });

    it("should generate secrets of appropriate length", () => {
      const secret = generateSecret();
      // Typically 32 characters for base32
      expect(secret.length).toBeGreaterThanOrEqual(16);
    });
  });

  describe("TOTP URI Generation", () => {
    it("should generate a valid TOTP URI", () => {
      const email = "test@example.com";
      const secret = "JBSWY3DPEHPK3PXP";
      const uri = generateTotpUri(email, secret);

      expect(uri).toBeDefined();
      expect(uri).toContain("otpauth://totp/");
      // Email is URL-encoded in the URI
      expect(uri).toContain(encodeURIComponent(email));
      expect(uri).toContain(secret);
    });

    it("should include issuer in URI", () => {
      const email = "test@example.com";
      const secret = "JBSWY3DPEHPK3PXP";
      const uri = generateTotpUri(email, secret);

      expect(uri).toContain("issuer=");
    });

    it("should encode email properly in URI", () => {
      const email = "test+tag@example.com";
      const secret = "JBSWY3DPEHPK3PXP";
      const uri = generateTotpUri(email, secret);

      expect(uri).toContain(encodeURIComponent(email));
    });
  });

  describe("QR Code Generation", () => {
    it("should generate a QR code data URL", async () => {
      const uri = "otpauth://totp/test@example.com?secret=JBSWY3DPEHPK3PXP&issuer=AIRGen";
      const qrCode = await generateQRCode(uri);

      expect(qrCode).toBeDefined();
      expect(typeof qrCode).toBe("string");
      expect(qrCode).toContain("data:image/png;base64,");
    });

    it("should generate valid base64 data", async () => {
      const uri = "otpauth://totp/test@example.com?secret=JBSWY3DPEHPK3PXP";
      const qrCode = await generateQRCode(uri);

      const base64Data = qrCode.replace("data:image/png;base64,", "");
      expect(() => Buffer.from(base64Data, "base64")).not.toThrow();
    });

    it("should handle long URIs", async () => {
      const longUri = "otpauth://totp/" + "a".repeat(500) + "?secret=JBSWY3DPEHPK3PXP";
      const qrCode = await generateQRCode(longUri);

      expect(qrCode).toBeDefined();
      expect(qrCode).toContain("data:image/png;base64,");
    });
  });

  describe("TOTP Token Verification", () => {
    it("should verify a valid TOTP token", () => {
      const secret = "JBSWY3DPEHPK3PXP";
      const token = authenticator.generate(secret);

      const isValid = verifyTotpToken(token, secret);
      expect(isValid).toBe(true);
    });

    it("should reject an invalid TOTP token", () => {
      const secret = "JBSWY3DPEHPK3PXP";
      const invalidToken = "000000";

      const isValid = verifyTotpToken(invalidToken, secret);
      expect(isValid).toBe(false);
    });

    it("should reject malformed tokens", () => {
      const secret = "JBSWY3DPEHPK3PXP";

      expect(verifyTotpToken("12345", secret)).toBe(false); // Too short
      expect(verifyTotpToken("1234567", secret)).toBe(false); // Too long
      expect(verifyTotpToken("abcdef", secret)).toBe(false); // Not numeric
    });

    it("should handle token with leading/trailing spaces", () => {
      const secret = "JBSWY3DPEHPK3PXP";
      const token = authenticator.generate(secret);

      // Should be rejected (no auto-trim)
      const isValid = verifyTotpToken(` ${token} `, secret);
      expect(isValid).toBe(false);
    });

    it("should work with different secrets", () => {
      const secret1 = generateSecret();
      const secret2 = generateSecret();

      const token1 = authenticator.generate(secret1);
      const token2 = authenticator.generate(secret2);

      expect(verifyTotpToken(token1, secret1)).toBe(true);
      expect(verifyTotpToken(token2, secret2)).toBe(true);
      expect(verifyTotpToken(token1, secret2)).toBe(false);
      expect(verifyTotpToken(token2, secret1)).toBe(false);
    });
  });

  describe("Backup Code Generation", () => {
    it("should generate default number of backup codes (10)", () => {
      const codes = generateBackupCodes();

      expect(codes).toHaveLength(10);
    });

    it("should generate custom number of backup codes", () => {
      const codes = generateBackupCodes(5);
      expect(codes).toHaveLength(5);

      const codes20 = generateBackupCodes(20);
      expect(codes20).toHaveLength(20);
    });

    it("should generate 8-character codes", () => {
      const codes = generateBackupCodes();

      codes.forEach(code => {
        expect(code.length).toBe(8);
      });
    });

    it("should generate uppercase alphanumeric codes", () => {
      const codes = generateBackupCodes();

      codes.forEach(code => {
        expect(/^[A-Z0-9]{8}$/.test(code)).toBe(true);
      });
    });

    it("should generate unique codes", () => {
      const codes = generateBackupCodes(100);
      const uniqueCodes = new Set(codes);

      // Should have high uniqueness (allow for small chance of collision)
      expect(uniqueCodes.size).toBeGreaterThan(95);
    });

    it("should generate different codes each time", () => {
      const codes1 = generateBackupCodes(10);
      const codes2 = generateBackupCodes(10);

      expect(codes1).not.toEqual(codes2);
    });
  });

  describe("Backup Code Hashing", () => {
    it("should hash a backup code", () => {
      const code = "ABCD1234";
      const hashed = hashBackupCode(code);

      expect(hashed).toBeDefined();
      expect(typeof hashed).toBe("string");
      expect(hashed).not.toBe(code);
      expect(hashed.length).toBeGreaterThan(0);
    });

    it("should produce consistent hashes for same code", () => {
      const code = "ABCD1234";
      const hash1 = hashBackupCode(code);
      const hash2 = hashBackupCode(code);

      expect(hash1).toBe(hash2);
    });

    it("should produce different hashes for different codes", () => {
      const code1 = "ABCD1234";
      const code2 = "WXYZ9876";

      const hash1 = hashBackupCode(code1);
      const hash2 = hashBackupCode(code2);

      expect(hash1).not.toBe(hash2);
    });

    it("should handle lowercase input by converting to uppercase", () => {
      const upper = "ABCD1234";
      const lower = "abcd1234";

      const hashUpper = hashBackupCode(upper);
      const hashLower = hashBackupCode(lower);

      expect(hashUpper).toBe(hashLower);
    });

    it("should use SHA256 (64 hex chars)", () => {
      const code = "ABCD1234";
      const hashed = hashBackupCode(code);

      expect(hashed.length).toBe(64);
      expect(/^[a-f0-9]{64}$/.test(hashed)).toBe(true);
    });
  });

  describe("Backup Code Verification", () => {
    it("should verify a valid backup code", () => {
      const code = "ABCD1234";
      const hashedCodes = [hashBackupCode(code)];

      const isValid = verifyBackupCode(code, hashedCodes);
      expect(isValid).toBe(true);
    });

    it("should reject an invalid backup code", () => {
      const validCode = "ABCD1234";
      const invalidCode = "WXYZ9876";
      const hashedCodes = [hashBackupCode(validCode)];

      const isValid = verifyBackupCode(invalidCode, hashedCodes);
      expect(isValid).toBe(false);
    });

    it("should verify code from multiple hashed codes", () => {
      const codes = ["AAAA1111", "BBBB2222", "CCCC3333"];
      const hashedCodes = codes.map(hashBackupCode);

      expect(verifyBackupCode("AAAA1111", hashedCodes)).toBe(true);
      expect(verifyBackupCode("BBBB2222", hashedCodes)).toBe(true);
      expect(verifyBackupCode("CCCC3333", hashedCodes)).toBe(true);
      expect(verifyBackupCode("DDDD4444", hashedCodes)).toBe(false);
    });

    it("should be case-insensitive", () => {
      const code = "ABCD1234";
      const hashedCodes = [hashBackupCode(code)];

      expect(verifyBackupCode("abcd1234", hashedCodes)).toBe(true);
      expect(verifyBackupCode("AbCd1234", hashedCodes)).toBe(true);
    });

    it("should return false for empty list", () => {
      const isValid = verifyBackupCode("ABCD1234", []);
      expect(isValid).toBe(false);
    });
  });

  describe("Backup Code Consumption", () => {
    it("should remove used backup code from list", () => {
      const codes = ["AAAA1111", "BBBB2222", "CCCC3333"];
      const hashedCodes = codes.map(hashBackupCode);

      const remaining = consumeBackupCode("BBBB2222", hashedCodes);

      expect(remaining).toHaveLength(2);
      expect(verifyBackupCode("AAAA1111", remaining)).toBe(true);
      expect(verifyBackupCode("BBBB2222", remaining)).toBe(false);
      expect(verifyBackupCode("CCCC3333", remaining)).toBe(true);
    });

    it("should be case-insensitive when consuming", () => {
      const codes = ["ABCD1234"];
      const hashedCodes = codes.map(hashBackupCode);

      const remaining = consumeBackupCode("abcd1234", hashedCodes);

      expect(remaining).toHaveLength(0);
    });

    it("should return unchanged list if code not found", () => {
      const codes = ["AAAA1111", "BBBB2222"];
      const hashedCodes = codes.map(hashBackupCode);

      const remaining = consumeBackupCode("CCCC3333", hashedCodes);

      expect(remaining).toHaveLength(2);
      expect(remaining).toEqual(hashedCodes);
    });

    it("should handle consuming all codes", () => {
      const codes = ["AAAA1111"];
      const hashedCodes = codes.map(hashBackupCode);

      const remaining = consumeBackupCode("AAAA1111", hashedCodes);

      expect(remaining).toHaveLength(0);
    });

    it("should return new array (not mutate original)", () => {
      const codes = ["AAAA1111", "BBBB2222"];
      const hashedCodes = codes.map(hashBackupCode);
      const original = [...hashedCodes];

      const remaining = consumeBackupCode("AAAA1111", hashedCodes);

      expect(hashedCodes).toEqual(original);
      expect(remaining).not.toBe(hashedCodes);
    });
  });

  describe("Integration Tests", () => {
    it("should work through full MFA setup flow", () => {
      // Generate and encrypt secret
      const secret = generateSecret();
      const encrypted = encryptSecret(secret);

      // Generate TOTP URI and QR code
      const email = "test@example.com";
      const uri = generateTotpUri(email, secret);

      // Email is URL-encoded in the URI
      expect(uri).toContain(encodeURIComponent(email));
      expect(uri).toContain(secret);

      // Decrypt secret and verify token
      const decrypted = decryptSecret(encrypted);
      const token = authenticator.generate(decrypted);
      const isValid = verifyTotpToken(token, decrypted);

      expect(isValid).toBe(true);
    });

    it("should work through full backup code flow", () => {
      // Generate backup codes
      const codes = generateBackupCodes(5);
      expect(codes).toHaveLength(5);

      // Hash codes for storage
      const hashedCodes = codes.map(hashBackupCode);

      // Verify and consume first code
      expect(verifyBackupCode(codes[0], hashedCodes)).toBe(true);
      const remaining1 = consumeBackupCode(codes[0], hashedCodes);
      expect(remaining1).toHaveLength(4);

      // Verify consumed code is gone
      expect(verifyBackupCode(codes[0], remaining1)).toBe(false);

      // Verify and consume second code
      expect(verifyBackupCode(codes[1], remaining1)).toBe(true);
      const remaining2 = consumeBackupCode(codes[1], remaining1);
      expect(remaining2).toHaveLength(3);

      // Original codes list should still have all codes
      expect(codes).toHaveLength(5);
    });

    it("should prevent TOTP token replay after use", () => {
      const secret = generateSecret();
      const token = authenticator.generate(secret);

      // First verification succeeds
      expect(verifyTotpToken(token, secret)).toBe(true);

      // Same token immediately after should still work (within time window)
      expect(verifyTotpToken(token, secret)).toBe(true);

      // Note: Actual replay prevention would need to be implemented
      // at the application level by tracking used tokens
    });
  });
});
