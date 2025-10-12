import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  createToken,
  verifyAndConsumeToken,
  revokeUserTokens,
  cleanupExpiredTokens,
  getTokenCount
} from "../tokens.js";

describe("Token Service", () => {
  beforeEach(() => {
    // Clear all tokens before each test
    const userId = "test-user-id";
    revokeUserTokens(userId);
  });

  describe("createToken", () => {
    it("should create an email verification token", () => {
      const token = createToken(
        "user-123",
        "test@example.com",
        "email_verification"
      );

      expect(token).toBeDefined();
      expect(typeof token).toBe("string");
      expect(token.length).toBeGreaterThan(0);
    });

    it("should create a password reset token", () => {
      const token = createToken(
        "user-123",
        "test@example.com",
        "password_reset"
      );

      expect(token).toBeDefined();
      expect(typeof token).toBe("string");
      expect(token.length).toBeGreaterThan(0);
    });

    it("should create unique tokens each time", () => {
      const token1 = createToken("user-123", "test@example.com", "email_verification");
      const token2 = createToken("user-123", "test@example.com", "email_verification");

      expect(token1).not.toBe(token2);
    });

    it("should use default expiry for email verification (60 minutes)", () => {
      const token = createToken(
        "user-123",
        "test@example.com",
        "email_verification"
      );

      // Token should be valid immediately
      const record = verifyAndConsumeToken(token, "email_verification");
      expect(record).not.toBeNull();
      expect(record?.purpose).toBe("email_verification");
    });

    it("should use default expiry for password reset (30 minutes)", () => {
      const token = createToken(
        "user-123",
        "test@example.com",
        "password_reset"
      );

      // Token should be valid immediately
      const record = verifyAndConsumeToken(token, "password_reset");
      expect(record).not.toBeNull();
      expect(record?.purpose).toBe("password_reset");
    });

    it("should accept custom expiry", () => {
      const token = createToken(
        "user-123",
        "test@example.com",
        "email_verification",
        120 // 120 minutes
      );

      expect(token).toBeDefined();
      const record = verifyAndConsumeToken(token, "email_verification");
      expect(record).not.toBeNull();
    });

    it("should store user information", () => {
      const userId = "user-456";
      const email = "specific@example.com";
      const token = createToken(userId, email, "email_verification");

      const record = verifyAndConsumeToken(token, "email_verification");
      expect(record?.userId).toBe(userId);
      expect(record?.email).toBe(email);
    });
  });

  describe("verifyAndConsumeToken", () => {
    it("should verify a valid token", () => {
      const token = createToken(
        "user-123",
        "test@example.com",
        "email_verification"
      );

      const record = verifyAndConsumeToken(token, "email_verification");
      expect(record).not.toBeNull();
      expect(record?.userId).toBe("user-123");
      expect(record?.email).toBe("test@example.com");
      expect(record?.purpose).toBe("email_verification");
      expect(record?.consumedAt).toBeDefined();
    });

    it("should return null for invalid token", () => {
      const record = verifyAndConsumeToken("invalid-token", "email_verification");
      expect(record).toBeNull();
    });

    it("should return null for wrong purpose", () => {
      const token = createToken(
        "user-123",
        "test@example.com",
        "email_verification"
      );

      const record = verifyAndConsumeToken(token, "password_reset");
      expect(record).toBeNull();
    });

    it("should only allow token to be used once", () => {
      const token = createToken(
        "user-123",
        "test@example.com",
        "email_verification"
      );

      // First use should succeed
      const record1 = verifyAndConsumeToken(token, "email_verification");
      expect(record1).not.toBeNull();

      // Second use should fail
      const record2 = verifyAndConsumeToken(token, "email_verification");
      expect(record2).toBeNull();
    });

    it("should return null for expired token", async () => {
      // Create token with 0.001 minute (60ms) expiry
      const token = createToken(
        "user-123",
        "test@example.com",
        "email_verification",
        0.001
      );

      // Wait for token to expire
      await new Promise(resolve => setTimeout(resolve, 100));

      const record = verifyAndConsumeToken(token, "email_verification");
      expect(record).toBeNull();
    }, 1000);

    it("should return record with all required fields", () => {
      const token = createToken(
        "user-123",
        "test@example.com",
        "password_reset"
      );

      const record = verifyAndConsumeToken(token, "password_reset");
      expect(record).not.toBeNull();
      expect(record?.id).toBeDefined();
      expect(record?.hashedToken).toBeDefined();
      expect(record?.purpose).toBe("password_reset");
      expect(record?.userId).toBe("user-123");
      expect(record?.email).toBe("test@example.com");
      expect(record?.expiresAt).toBeInstanceOf(Date);
      expect(record?.createdAt).toBeInstanceOf(Date);
      expect(record?.consumedAt).toBeInstanceOf(Date);
    });
  });

  describe("revokeUserTokens", () => {
    it("should revoke all tokens for a user", () => {
      const userId = "user-789";

      const token1 = createToken(userId, "test@example.com", "email_verification");
      const token2 = createToken(userId, "test@example.com", "password_reset");

      const beforeCount = getTokenCount();
      revokeUserTokens(userId);
      const afterCount = getTokenCount();

      expect(afterCount).toBeLessThan(beforeCount);

      // Tokens should no longer be valid
      expect(verifyAndConsumeToken(token1, "email_verification")).toBeNull();
      expect(verifyAndConsumeToken(token2, "password_reset")).toBeNull();
    });

    it("should revoke only specific purpose tokens when specified", () => {
      const userId = "user-890";

      const emailToken = createToken(userId, "test@example.com", "email_verification");
      const resetToken = createToken(userId, "test@example.com", "password_reset");

      // Revoke only email verification tokens
      revokeUserTokens(userId, "email_verification");

      // Email token should be invalid
      expect(verifyAndConsumeToken(emailToken, "email_verification")).toBeNull();

      // Password reset token should still be valid
      const record = verifyAndConsumeToken(resetToken, "password_reset");
      expect(record).not.toBeNull();
    });

    it("should not affect other users' tokens", () => {
      const userId1 = "user-111";
      const userId2 = "user-222";

      const token1 = createToken(userId1, "user1@example.com", "email_verification");
      const token2 = createToken(userId2, "user2@example.com", "email_verification");

      revokeUserTokens(userId1);

      // User 1 token should be invalid
      expect(verifyAndConsumeToken(token1, "email_verification")).toBeNull();

      // User 2 token should still be valid
      const record = verifyAndConsumeToken(token2, "email_verification");
      expect(record).not.toBeNull();
    });
  });

  describe("cleanupExpiredTokens", () => {
    it("should remove expired tokens", async () => {
      // Create an expired token (0.001 minute = 60ms)
      createToken(
        "user-123",
        "test@example.com",
        "email_verification",
        0.001
      );

      // Create a valid token
      const validToken = createToken(
        "user-456",
        "test2@example.com",
        "email_verification",
        60
      );

      const beforeCount = getTokenCount();

      // Wait for first token to expire
      await new Promise(resolve => setTimeout(resolve, 100));

      cleanupExpiredTokens();

      const afterCount = getTokenCount();
      expect(afterCount).toBeLessThan(beforeCount);

      // Valid token should still work
      const record = verifyAndConsumeToken(validToken, "email_verification");
      expect(record).not.toBeNull();
    }, 1000);

    it("should not remove valid tokens", () => {
      const token = createToken(
        "user-123",
        "test@example.com",
        "email_verification",
        60
      );

      const beforeCount = getTokenCount();
      cleanupExpiredTokens();
      const afterCount = getTokenCount();

      expect(afterCount).toBe(beforeCount);

      // Token should still be valid
      const record = verifyAndConsumeToken(token, "email_verification");
      expect(record).not.toBeNull();
    });
  });

  describe("getTokenCount", () => {
    it("should return the current number of tokens", () => {
      const initialCount = getTokenCount();

      createToken("user-1", "test1@example.com", "email_verification");
      expect(getTokenCount()).toBe(initialCount + 1);

      createToken("user-2", "test2@example.com", "password_reset");
      expect(getTokenCount()).toBe(initialCount + 2);
    });

    it("should decrease when tokens are revoked", () => {
      const userId = "user-123";
      createToken(userId, "test@example.com", "email_verification");
      createToken(userId, "test@example.com", "password_reset");

      const beforeCount = getTokenCount();
      revokeUserTokens(userId);
      const afterCount = getTokenCount();

      expect(afterCount).toBeLessThan(beforeCount);
    });
  });

  describe("Token Security", () => {
    it("should not allow tokens to be reused after consumption", () => {
      const token = createToken(
        "user-123",
        "test@example.com",
        "email_verification"
      );

      // Consume the token
      verifyAndConsumeToken(token, "email_verification");

      // Try to use it again
      const secondAttempt = verifyAndConsumeToken(token, "email_verification");
      expect(secondAttempt).toBeNull();
    });

    it("should generate URL-safe tokens", () => {
      const token = createToken(
        "user-123",
        "test@example.com",
        "email_verification"
      );

      // Token should not contain characters that need URL encoding
      expect(token).not.toContain("+");
      expect(token).not.toContain("/");
      expect(token).not.toContain("=");
    });

    it("should hash tokens for storage", () => {
      const token = createToken(
        "user-123",
        "test@example.com",
        "email_verification"
      );

      const record = verifyAndConsumeToken(token, "email_verification");

      // Stored hash should not match the plain token
      expect(record?.hashedToken).not.toBe(token);
      expect(record?.hashedToken.length).toBeGreaterThan(0);
    });
  });

  describe("Edge Cases", () => {
    it("should handle multiple tokens for same user", () => {
      const userId = "user-123";

      const token1 = createToken(userId, "test@example.com", "email_verification");
      const token2 = createToken(userId, "test@example.com", "email_verification");
      const token3 = createToken(userId, "test@example.com", "password_reset");

      // All tokens should be valid
      expect(verifyAndConsumeToken(token1, "email_verification")).not.toBeNull();
      expect(verifyAndConsumeToken(token2, "email_verification")).not.toBeNull();
      expect(verifyAndConsumeToken(token3, "password_reset")).not.toBeNull();
    });

    it("should handle empty string as token", () => {
      const record = verifyAndConsumeToken("", "email_verification");
      expect(record).toBeNull();
    });

    it("should handle very long token strings", () => {
      const longToken = "a".repeat(10000);
      const record = verifyAndConsumeToken(longToken, "email_verification");
      expect(record).toBeNull();
    });

    it("should handle special characters in email", () => {
      const token = createToken(
        "user-123",
        "test+tag@example.com",
        "email_verification"
      );

      const record = verifyAndConsumeToken(token, "email_verification");
      expect(record?.email).toBe("test+tag@example.com");
    });
  });
});
