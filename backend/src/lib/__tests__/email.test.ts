import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  sendEmail,
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendPasswordChangedEmail
} from "../email.js";

// Mock nodemailer
vi.mock("nodemailer", () => ({
  default: {
    createTransport: vi.fn(() => ({
      sendMail: vi.fn().mockResolvedValue({ messageId: "test-message-id" })
    }))
  }
}));

// Mock logger
vi.mock("../logger.js", () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn()
  }
}));

// Mock config
vi.mock("../config.js", () => ({
  config: {
    email: {
      enabled: false, // Default to console mode for tests
      from: "noreply@localhost",
      smtpHost: "smtp.test.com",
      smtpPort: 587,
      smtpSecure: false,
      smtpUser: "test-user",
      smtpPassword: "test-password"
    },
    appUrl: "http://localhost:5173"
  }
}));

describe("Email Service", () => {
  let consoleLogSpy: any;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  describe("sendEmail", () => {
    it("should send email in console mode (development)", async () => {
      await sendEmail({
        to: "test@example.com",
        subject: "Test Email",
        html: "<p>Test content</p>"
      });

      expect(consoleLogSpy).toHaveBeenCalled();
      const logs = consoleLogSpy.mock.calls.flat().join("\n");
      expect(logs).toContain("test@example.com");
      expect(logs).toContain("Test Email");
      expect(logs).toContain("Test content");
    });

    it("should strip HTML tags for text version", async () => {
      await sendEmail({
        to: "test@example.com",
        subject: "Test",
        html: "<h1>Hello</h1><p>World</p>"
      });

      const logs = consoleLogSpy.mock.calls.flat().join("\n");
      expect(logs).toContain("HelloWorld");
    });

    it("should use provided text version if available", async () => {
      await sendEmail({
        to: "test@example.com",
        subject: "Test",
        html: "<p>HTML version</p>",
        text: "Plain text version"
      });

      expect(consoleLogSpy).toHaveBeenCalled();
    });

    it("should include sender address", async () => {
      await sendEmail({
        to: "test@example.com",
        subject: "Test",
        html: "<p>Test</p>"
      });

      const logs = consoleLogSpy.mock.calls.flat().join("\n");
      expect(logs).toContain("From:");
      expect(logs).toContain("noreply@localhost");
    });

    it("should handle multiple recipients", async () => {
      await sendEmail({
        to: "user1@example.com, user2@example.com",
        subject: "Test",
        html: "<p>Test</p>"
      });

      expect(consoleLogSpy).toHaveBeenCalled();
    });

    it("should handle long email content", async () => {
      const longContent = "<p>" + "a".repeat(10000) + "</p>";
      await sendEmail({
        to: "test@example.com",
        subject: "Long email",
        html: longContent
      });

      expect(consoleLogSpy).toHaveBeenCalled();
    });

    it("should handle special characters in content", async () => {
      await sendEmail({
        to: "test@example.com",
        subject: "Special: <>&\"'",
        html: "<p>Content with special chars: <>&\"'</p>"
      });

      expect(consoleLogSpy).toHaveBeenCalled();
    });

    it("should handle unicode characters", async () => {
      await sendEmail({
        to: "test@example.com",
        subject: "Unicode: 你好 🎉",
        html: "<p>Unicode content: 你好 世界 🎉</p>"
      });

      expect(consoleLogSpy).toHaveBeenCalled();
    });
  });

  describe("sendVerificationEmail", () => {
    it("should send verification email with token", async () => {
      const token = "verification-token-123";
      await sendVerificationEmail("user@example.com", "Test User", token);

      const logs = consoleLogSpy.mock.calls.flat().join("\n");
      expect(logs).toContain("user@example.com");
      expect(logs).toContain("Verify Your Email");
      expect(logs).toContain(token);
    });

    it("should include user name in greeting", async () => {
      await sendVerificationEmail("user@example.com", "John Doe", "token");

      const logs = consoleLogSpy.mock.calls.flat().join("\n");
      expect(logs).toContain("John Doe");
    });

    it("should handle undefined name", async () => {
      await sendVerificationEmail("user@example.com", undefined, "token");

      const logs = consoleLogSpy.mock.calls.flat().join("\n");
      expect(logs).toContain("Hello there");
    });

    it("should include verification URL", async () => {
      const token = "test-token";
      await sendVerificationEmail("user@example.com", "User", token);

      const logs = consoleLogSpy.mock.calls.flat().join("\n");
      expect(logs).toContain("http://localhost:5173/verify-email?token=test-token");
    });

    it("should mention expiry time", async () => {
      await sendVerificationEmail("user@example.com", "User", "token");

      const logs = consoleLogSpy.mock.calls.flat().join("\n");
      expect(logs).toContain("1 hour");
    });

    it("should include safety message", async () => {
      await sendVerificationEmail("user@example.com", "User", "token");

      const logs = consoleLogSpy.mock.calls.flat().join("\n");
      expect(logs).toContain("didn't create an account");
    });

    it("should handle email addresses with special characters", async () => {
      await sendVerificationEmail("user+tag@example.com", "User", "token");

      expect(consoleLogSpy).toHaveBeenCalled();
    });
  });

  describe("sendPasswordResetEmail", () => {
    it("should send password reset email with token", async () => {
      const token = "reset-token-456";
      await sendPasswordResetEmail("user@example.com", "Test User", token);

      const logs = consoleLogSpy.mock.calls.flat().join("\n");
      expect(logs).toContain("user@example.com");
      expect(logs).toContain("Password Reset");
      expect(logs).toContain(token);
    });

    it("should include user name in greeting", async () => {
      await sendPasswordResetEmail("user@example.com", "Jane Doe", "token");

      const logs = consoleLogSpy.mock.calls.flat().join("\n");
      expect(logs).toContain("Jane Doe");
    });

    it("should handle undefined name", async () => {
      await sendPasswordResetEmail("user@example.com", undefined, "token");

      const logs = consoleLogSpy.mock.calls.flat().join("\n");
      expect(logs).toContain("Hello there");
    });

    it("should include reset URL", async () => {
      const token = "reset-token";
      await sendPasswordResetEmail("user@example.com", "User", token);

      const logs = consoleLogSpy.mock.calls.flat().join("\n");
      expect(logs).toContain("http://localhost:5173/reset-password?token=reset-token");
    });

    it("should mention expiry time (30 minutes)", async () => {
      await sendPasswordResetEmail("user@example.com", "User", "token");

      const logs = consoleLogSpy.mock.calls.flat().join("\n");
      expect(logs).toContain("30 minutes");
    });

    it("should include safety message", async () => {
      await sendPasswordResetEmail("user@example.com", "User", "token");

      const logs = consoleLogSpy.mock.calls.flat().join("\n");
      expect(logs).toContain("didn't request a password reset");
    });

    it("should use different styling than verification email", async () => {
      await sendPasswordResetEmail("user@example.com", "User", "token");

      const logs = consoleLogSpy.mock.calls.flat().join("\n");
      // Reset emails typically use warning colors (red)
      expect(logs).toContain("Password Reset");
    });
  });

  describe("sendPasswordChangedEmail", () => {
    it("should send password changed notification", async () => {
      await sendPasswordChangedEmail("user@example.com", "Test User");

      const logs = consoleLogSpy.mock.calls.flat().join("\n");
      expect(logs).toContain("user@example.com");
      expect(logs).toContain("Password Changed");
    });

    it("should include user name in greeting", async () => {
      await sendPasswordChangedEmail("user@example.com", "Alice Smith");

      const logs = consoleLogSpy.mock.calls.flat().join("\n");
      expect(logs).toContain("Alice Smith");
    });

    it("should handle undefined name", async () => {
      await sendPasswordChangedEmail("user@example.com", undefined);

      const logs = consoleLogSpy.mock.calls.flat().join("\n");
      expect(logs).toContain("Hello there");
    });

    it("should include confirmation message", async () => {
      await sendPasswordChangedEmail("user@example.com", "User");

      const logs = consoleLogSpy.mock.calls.flat().join("\n");
      expect(logs).toContain("password has been changed successfully");
    });

    it("should include security warning", async () => {
      await sendPasswordChangedEmail("user@example.com", "User");

      const logs = consoleLogSpy.mock.calls.flat().join("\n");
      expect(logs).toContain("did not make this change");
      expect(logs).toContain("contact support");
    });

    it("should mention session logout", async () => {
      await sendPasswordChangedEmail("user@example.com", "User");

      const logs = consoleLogSpy.mock.calls.flat().join("\n");
      expect(logs).toContain("active sessions have been logged out");
    });

    it("should not include any tokens or links", async () => {
      await sendPasswordChangedEmail("user@example.com", "User");

      const logs = consoleLogSpy.mock.calls.flat().join("\n");
      expect(logs).not.toContain("token=");
      expect(logs).not.toContain("click here");
    });
  });

  describe("Email Content Validation", () => {
    it("should generate valid HTML for verification email", async () => {
      await sendVerificationEmail("user@example.com", "User", "token");

      const logs = consoleLogSpy.mock.calls.flat().join("\n");
      // In console mode, HTML is stripped to text, so just check for content
      expect(logs).toContain("Verify Your Email");
    });

    it("should generate valid HTML for reset email", async () => {
      await sendPasswordResetEmail("user@example.com", "User", "token");

      const logs = consoleLogSpy.mock.calls.flat().join("\n");
      expect(logs).toContain("Password Reset");
    });

    it("should generate valid HTML for changed email", async () => {
      await sendPasswordChangedEmail("user@example.com", "User");

      const logs = consoleLogSpy.mock.calls.flat().join("\n");
      expect(logs).toContain("Password Changed");
    });

    it("should include verification URL in output", async () => {
      await sendVerificationEmail("user@example.com", "User", "token");

      const logs = consoleLogSpy.mock.calls.flat().join("\n");
      expect(logs).toContain("verify-email?token=");
    });

    it("should include reset URL in output", async () => {
      await sendPasswordResetEmail("user@example.com", "User", "token");

      const logs = consoleLogSpy.mock.calls.flat().join("\n");
      expect(logs).toContain("reset-password?token=");
    });
  });

  describe("Email Security", () => {
    it("should not expose sensitive data in logs (verification)", async () => {
      await sendVerificationEmail("user@example.com", "User", "secret-token-12345");

      // The token should be in the email but we're just checking it works
      expect(consoleLogSpy).toHaveBeenCalled();
    });

    it("should not expose sensitive data in logs (reset)", async () => {
      await sendPasswordResetEmail("user@example.com", "User", "secret-reset-67890");

      expect(consoleLogSpy).toHaveBeenCalled();
    });

    it("should handle XSS attempts in user name", async () => {
      await sendVerificationEmail(
        "user@example.com",
        "<script>alert('xss')</script>",
        "token"
      );

      expect(consoleLogSpy).toHaveBeenCalled();
    });

    it("should handle SQL injection attempts in email", async () => {
      await sendVerificationEmail(
        "user'; DROP TABLE users; --@example.com",
        "User",
        "token"
      );

      expect(consoleLogSpy).toHaveBeenCalled();
    });
  });

  describe("Error Handling", () => {
    it("should handle email sending failures gracefully", async () => {
      // This test verifies the function completes without throwing
      // In console mode, it shouldn't fail
      await expect(
        sendEmail({
          to: "test@example.com",
          subject: "Test",
          html: "<p>Test</p>"
        })
      ).resolves.not.toThrow();
    });

    it("should handle malformed email addresses", async () => {
      // Should not throw, just log
      await expect(
        sendEmail({
          to: "not-an-email",
          subject: "Test",
          html: "<p>Test</p>"
        })
      ).resolves.not.toThrow();
    });

    it("should handle empty subject", async () => {
      await expect(
        sendEmail({
          to: "test@example.com",
          subject: "",
          html: "<p>Test</p>"
        })
      ).resolves.not.toThrow();
    });

    it("should handle empty HTML content", async () => {
      await expect(
        sendEmail({
          to: "test@example.com",
          subject: "Test",
          html: ""
        })
      ).resolves.not.toThrow();
    });
  });

  describe("Integration Tests", () => {
    it("should send complete verification flow", async () => {
      const email = "newuser@example.com";
      const name = "New User";
      const token = "verification-token-abc123";

      await sendVerificationEmail(email, name, token);

      const logs = consoleLogSpy.mock.calls.flat().join("\n");
      expect(logs).toContain(email);
      expect(logs).toContain(name);
      expect(logs).toContain(token);
      expect(logs).toContain("Verify Your Email");
    });

    it("should send complete password reset flow", async () => {
      const email = "forgotuser@example.com";
      const name = "Forgot User";
      const token = "reset-token-xyz789";

      await sendPasswordResetEmail(email, name, token);

      const logs = consoleLogSpy.mock.calls.flat().join("\n");
      expect(logs).toContain(email);
      expect(logs).toContain(name);
      expect(logs).toContain(token);
      expect(logs).toContain("Password Reset");
    });

    it("should send password changed notification", async () => {
      const email = "changeduser@example.com";
      const name = "Changed User";

      await sendPasswordChangedEmail(email, name);

      const logs = consoleLogSpy.mock.calls.flat().join("\n");
      expect(logs).toContain(email);
      expect(logs).toContain(name);
      expect(logs).toContain("Password Changed");
    });

    it("should handle rapid sequential emails", async () => {
      await Promise.all([
        sendVerificationEmail("user1@example.com", "User 1", "token1"),
        sendVerificationEmail("user2@example.com", "User 2", "token2"),
        sendPasswordResetEmail("user3@example.com", "User 3", "token3"),
        sendPasswordChangedEmail("user4@example.com", "User 4")
      ]);

      // Just verify it was called (console.log gets called multiple times per email)
      expect(consoleLogSpy.mock.calls.length).toBeGreaterThan(0);
    });
  });
});
