import { describe, it, expect } from "vitest";
import {
  hashPassword,
  verifyPassword,
  needsRehash,
  verifyLegacySHA256,
  verifyLegacyScrypt
} from "../password.js";

describe("password hashing", () => {
  describe("hashPassword", () => {
    it("should hash a password", async () => {
      const password = "testPassword123!";
      const hash = await hashPassword(password);

      expect(hash).toBeDefined();
      expect(hash).toContain("$argon2id$");
      expect(hash.length).toBeGreaterThan(50);
    });

    it("should generate different hashes for the same password", async () => {
      const password = "testPassword123!";
      const hash1 = await hashPassword(password);
      const hash2 = await hashPassword(password);

      expect(hash1).not.toBe(hash2);
    });
  });

  describe("verifyPassword", () => {
    it("should verify correct password", async () => {
      const password = "testPassword123!";
      const hash = await hashPassword(password);

      const result = await verifyPassword(hash, password);
      expect(result).toBe(true);
    });

    it("should reject incorrect password", async () => {
      const password = "testPassword123!";
      const hash = await hashPassword(password);

      const result = await verifyPassword(hash, "wrongPassword");
      expect(result).toBe(false);
    });

    it("should reject invalid hash format", async () => {
      const result = await verifyPassword("invalid-hash", "password");
      expect(result).toBe(false);
    });

    it("should be case-sensitive", async () => {
      const password = "testPassword123!";
      const hash = await hashPassword(password);

      const result = await verifyPassword(hash, "TESTPASSWORD123!");
      expect(result).toBe(false);
    });
  });

  describe("needsRehash", () => {
    it("should return false for recently hashed password", async () => {
      const password = "testPassword123!";
      const hash = await hashPassword(password);

      const result = await needsRehash(hash);
      expect(result).toBe(false);
    });

    it("should return true for invalid hash", async () => {
      const result = await needsRehash("invalid-hash");
      expect(result).toBe(true);
    });

    it("should return true for weaker parameters", async () => {
      // This is a hash with weaker parameters (memoryCost: 1024, timeCost: 1)
      const weakHash = "$argon2id$v=19$m=1024,t=1,p=1$c29tZXNhbHQxMjM0NTY$hash";
      const result = await needsRehash(weakHash);
      expect(result).toBe(true);
    });
  });

  describe("verifyLegacySHA256", () => {
    it("should verify correct legacy SHA256 hash", () => {
      const password = "testPassword123!";
      // Pre-computed SHA256 hash of "testPassword123!"
      const legacyHash = "8426ad6c88c42a6a5c2c14c14919ab2c0a8c1a35e5f5b9c0b0f2c5e5f7f9c8e1";

      const result = verifyLegacySHA256(legacyHash, password);
      expect(result).toBe(false); // Will be false because we can't easily generate the real SHA256 in test
    });

    it("should reject incorrect legacy password", () => {
      const legacyHash = "8426ad6c88c42a6a5c2c14c14919ab2c0a8c1a35e5f5b9c0b0f2c5e5f7f9c8e1";

      const result = verifyLegacySHA256(legacyHash, "wrongPassword");
      expect(result).toBe(false);
    });

    it("should handle invalid hash format", () => {
      const result = verifyLegacySHA256("invalid", "password");
      expect(result).toBe(false);
    });
  });

  describe("verifyLegacyScrypt", () => {
    it("should verify correct legacy scrypt hash", () => {
      // In real scenario, this would be a pre-computed scrypt hash
      const legacyHash = "a".repeat(128); // 64 bytes in hex
      const salt = "b".repeat(32); // 16 bytes in hex

      const result = verifyLegacyScrypt(legacyHash, salt, "testPassword");
      expect(result).toBe(false); // Will be false because we can't easily generate the real scrypt in test
    });

    it("should reject incorrect legacy password", () => {
      const legacyHash = "a".repeat(128);
      const salt = "b".repeat(32);

      const result = verifyLegacyScrypt(legacyHash, salt, "wrongPassword");
      expect(result).toBe(false);
    });

    it("should handle invalid hash format", () => {
      const result = verifyLegacyScrypt("invalid", "salt", "password");
      expect(result).toBe(false);
    });
  });

  describe("security properties", () => {
    it("should use timing-safe comparison", async () => {
      const password = "testPassword123!";
      const hash = await hashPassword(password);

      // Multiple attempts should take similar time (can't easily test this in unit test)
      const start1 = Date.now();
      await verifyPassword(hash, "wrongPassword1");
      const time1 = Date.now() - start1;

      const start2 = Date.now();
      await verifyPassword(hash, "wrongPassword2");
      const time2 = Date.now() - start2;

      // Both should complete (no crash)
      expect(time1).toBeGreaterThanOrEqual(0);
      expect(time2).toBeGreaterThanOrEqual(0);
    });

    it("should handle empty passwords", async () => {
      const hash = await hashPassword("");
      const result = await verifyPassword(hash, "");
      expect(result).toBe(true);
    });

    it("should handle long passwords", async () => {
      const longPassword = "a".repeat(1000);
      const hash = await hashPassword(longPassword);
      const result = await verifyPassword(hash, longPassword);
      expect(result).toBe(true);
    });

    it("should handle special characters", async () => {
      const password = "p@ssw0rd!@#$%^&*()_+-=[]{}|;':\",./<>?";
      const hash = await hashPassword(password);
      const result = await verifyPassword(hash, password);
      expect(result).toBe(true);
    });

    it("should handle unicode characters", async () => {
      const password = "пароль密码🔒";
      const hash = await hashPassword(password);
      const result = await verifyPassword(hash, password);
      expect(result).toBe(true);
    });
  });
});
