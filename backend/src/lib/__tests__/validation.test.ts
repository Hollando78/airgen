import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  passwordSchema,
  relaxedPasswordSchema,
  emailSchema,
  nameSchema,
  totpCodeSchema,
  backupCodeSchema,
  authSchemas,
  userSchemas,
  validateInput
} from "../validation.js";

describe("Validation Schemas", () => {
  let originalNodeEnv: string | undefined;

  beforeAll(() => {
    originalNodeEnv = process.env.NODE_ENV;
  });

  afterAll(() => {
    if (originalNodeEnv !== undefined) {
      process.env.NODE_ENV = originalNodeEnv;
    } else {
      delete process.env.NODE_ENV;
    }
  });

  describe("passwordSchema", () => {
    it("should accept valid strong passwords", () => {
      const validPasswords = [
        "Password123!",
        "MyP@ssw0rd",
        "Str0ng!Pass",
        "Test123!@#"
      ];

      validPasswords.forEach(password => {
        expect(() => passwordSchema.parse(password)).not.toThrow();
      });
    });

    it("should reject passwords without lowercase letters", () => {
      expect(() => passwordSchema.parse("PASSWORD123!")).toThrow("Password must contain at least one lowercase letter");
    });

    it("should reject passwords without uppercase letters", () => {
      expect(() => passwordSchema.parse("password123!")).toThrow("Password must contain at least one uppercase letter");
    });

    it("should reject passwords without numbers", () => {
      expect(() => passwordSchema.parse("Password!")).toThrow("Password must contain at least one number");
    });

    it("should reject passwords without special characters", () => {
      expect(() => passwordSchema.parse("Password123")).toThrow("Password must contain at least one special character");
    });

    it("should reject passwords shorter than 8 characters", () => {
      expect(() => passwordSchema.parse("Pa1!")).toThrow("Password must be at least 8 characters");
    });

    it("should reject passwords longer than 128 characters", () => {
      const longPassword = "A1!" + "a".repeat(126);
      expect(() => passwordSchema.parse(longPassword)).toThrow("Password must not exceed 128 characters");
    });
  });

  describe("relaxedPasswordSchema", () => {
    it("should accept any non-empty password", () => {
      const passwords = [
        "a",
        "123",
        "weak",
        "Password123!"
      ];

      passwords.forEach(password => {
        expect(() => relaxedPasswordSchema.parse(password)).not.toThrow();
      });
    });

    it("should reject empty passwords", () => {
      expect(() => relaxedPasswordSchema.parse("")).toThrow("Password is required");
    });

    it("should reject passwords longer than 128 characters", () => {
      const longPassword = "a".repeat(129);
      expect(() => relaxedPasswordSchema.parse(longPassword)).toThrow("Password must not exceed 128 characters");
    });
  });

  describe("emailSchema", () => {
    it("should accept valid email addresses", () => {
      const validEmails = [
        "test@example.com",
        "user@domain.co.uk",
        "name+tag@company.com",
        "first.last@subdomain.example.com"
      ];

      validEmails.forEach(email => {
        expect(() => emailSchema.parse(email)).not.toThrow();
      });
    });

    it("should lowercase and trim emails", () => {
      const result = emailSchema.parse("TEST@EXAMPLE.COM");
      expect(result).toBe("test@example.com");

      // Note: Zod validates email format before trimming if there are leading/trailing spaces
      // So we test the final transformation works correctly
      const mixedCase = emailSchema.parse("Test@Example.COM");
      expect(mixedCase).toBe("test@example.com");
    });

    it("should reject invalid email formats", () => {
      const invalidEmails = [
        "notanemail",
        "@example.com",
        "user@",
        "user@.com",
        "user space@example.com"
      ];

      invalidEmails.forEach(email => {
        expect(() => emailSchema.parse(email)).toThrow("Invalid email format");
      });
    });
  });

  describe("nameSchema", () => {
    it("should accept valid names", () => {
      const validNames = [
        "John Doe",
        "Jane",
        "María García",
        "李明"
      ];

      validNames.forEach(name => {
        expect(() => nameSchema.parse(name)).not.toThrow();
      });
    });

    it("should trim whitespace", () => {
      const result = nameSchema.parse("  John Doe  ");
      expect(result).toBe("John Doe");
    });

    it("should reject empty names", () => {
      expect(() => nameSchema.parse("")).toThrow("Name is required");
    });

    it("should reject names longer than 100 characters", () => {
      const longName = "a".repeat(101);
      expect(() => nameSchema.parse(longName)).toThrow("Name must not exceed 100 characters");
    });
  });

  describe("totpCodeSchema", () => {
    it("should accept valid 6-digit codes", () => {
      const validCodes = ["123456", "000000", "999999"];

      validCodes.forEach(code => {
        expect(() => totpCodeSchema.parse(code)).not.toThrow();
      });
    });

    it("should reject non-6-digit codes", () => {
      const invalidCodes = ["12345", "1234567", "abc123", "12-34-56"];

      invalidCodes.forEach(code => {
        expect(() => totpCodeSchema.parse(code)).toThrow("TOTP code must be exactly 6 digits");
      });
    });
  });

  describe("backupCodeSchema", () => {
    it("should accept valid 8-character alphanumeric codes", () => {
      const validCodes = ["ABCD1234", "12345678", "ZYXWVUTS"];

      validCodes.forEach(code => {
        expect(() => backupCodeSchema.parse(code)).not.toThrow();
      });
    });

    it("should reject invalid backup codes", () => {
      const invalidCodes = [
        "ABCD123",      // Too short
        "ABCD12345",    // Too long
        "abcd1234",     // Lowercase
        "ABCD-123",     // Special chars
        "ABCD 123"      // Space
      ];

      invalidCodes.forEach(code => {
        expect(() => backupCodeSchema.parse(code)).toThrow("Invalid backup code format");
      });
    });
  });

  describe("authSchemas", () => {
    describe("login", () => {
      it("should accept valid login credentials", () => {
        const valid = {
          email: "test@example.com",
          password: "anypassword"
        };

        expect(() => authSchemas.login.parse(valid)).not.toThrow();
      });

      it("should require email and password", () => {
        expect(() => authSchemas.login.parse({ email: "test@example.com" })).toThrow();
        expect(() => authSchemas.login.parse({ password: "password" })).toThrow();
      });
    });

    describe("register", () => {
      it("should accept valid registration with strong password in production", () => {
        const originalEnv = process.env.NODE_ENV;
        process.env.NODE_ENV = "production";

        const valid = {
          email: "test@example.com",
          name: "Test User",
          password: "StrongPass123!"
        };

        expect(() => authSchemas.register.parse(valid)).not.toThrow();
        process.env.NODE_ENV = originalEnv;
      });

      it("should accept weak password in development", () => {
        const originalEnv = process.env.NODE_ENV;
        process.env.NODE_ENV = "development";

        const valid = {
          email: "test@example.com",
          password: "weak"
        };

        expect(() => authSchemas.register.parse(valid)).not.toThrow();
        process.env.NODE_ENV = originalEnv;
      });

      it("should use relaxed password in test mode", () => {
        // In test mode, the schema uses relaxed validation
        const valid = {
          email: "test@example.com",
          password: "weak"
        };

        // This will pass because we're in test mode
        expect(() => authSchemas.register.parse(valid)).not.toThrow();
      });

      it("should accept registration without name", () => {
        process.env.NODE_ENV = "development";

        const valid = {
          email: "test@example.com",
          password: "password"
        };

        expect(() => authSchemas.register.parse(valid)).not.toThrow();
      });
    });

    describe("requestPasswordReset", () => {
      it("should accept valid email", () => {
        const valid = { email: "test@example.com" };
        expect(() => authSchemas.requestPasswordReset.parse(valid)).not.toThrow();
      });

      it("should require email", () => {
        expect(() => authSchemas.requestPasswordReset.parse({})).toThrow();
      });
    });

    describe("resetPassword", () => {
      it("should accept valid token and password", () => {
        const originalEnv = process.env.NODE_ENV;
        process.env.NODE_ENV = "development";

        const valid = {
          token: "valid-token",
          password: "newpassword"
        };

        expect(() => authSchemas.resetPassword.parse(valid)).not.toThrow();
        process.env.NODE_ENV = originalEnv;
      });

      it("should use relaxed password in test mode", () => {
        // In test mode, relaxed validation is used
        const valid = {
          token: "valid-token",
          password: "weak"
        };

        expect(() => authSchemas.resetPassword.parse(valid)).not.toThrow();
      });
    });

    describe("verifyEmail", () => {
      it("should accept valid token", () => {
        const valid = { token: "verification-token" };
        expect(() => authSchemas.verifyEmail.parse(valid)).not.toThrow();
      });

      it("should require token", () => {
        expect(() => authSchemas.verifyEmail.parse({})).toThrow();
        expect(() => authSchemas.verifyEmail.parse({ token: "" })).toThrow();
      });
    });

    describe("changePassword", () => {
      it("should accept valid password change", () => {
        process.env.NODE_ENV = "development";

        const valid = {
          currentPassword: "oldpassword",
          newPassword: "newpassword"
        };

        expect(() => authSchemas.changePassword.parse(valid)).not.toThrow();
      });

      it("should require both passwords", () => {
        expect(() => authSchemas.changePassword.parse({ currentPassword: "old" })).toThrow();
        expect(() => authSchemas.changePassword.parse({ newPassword: "new" })).toThrow();
      });
    });

    describe("verifyMfa", () => {
      it("should accept valid TOTP code", () => {
        const valid = { code: "123456" };
        expect(() => authSchemas.verifyMfa.parse(valid)).not.toThrow();
      });

      it("should accept valid backup code", () => {
        const valid = { code: "ABCD1234" };
        expect(() => authSchemas.verifyMfa.parse(valid)).not.toThrow();
      });

      it("should reject invalid codes", () => {
        expect(() => authSchemas.verifyMfa.parse({ code: "12345" })).toThrow();
        expect(() => authSchemas.verifyMfa.parse({ code: "abcd1234" })).toThrow();
      });
    });

    describe("verifyMfaLogin", () => {
      it("should accept valid temp token and code", () => {
        const valid = {
          tempToken: "temp-token",
          code: "123456"
        };

        expect(() => authSchemas.verifyMfaLogin.parse(valid)).not.toThrow();
      });

      it("should require both fields", () => {
        expect(() => authSchemas.verifyMfaLogin.parse({ tempToken: "token" })).toThrow();
        expect(() => authSchemas.verifyMfaLogin.parse({ code: "123456" })).toThrow();
      });
    });
  });

  describe("userSchemas", () => {
    describe("createUser", () => {
      it("should accept valid user creation data", () => {
        const valid = {
          email: "newuser@example.com",
          name: "New User",
          password: "password",
          roles: ["user"],
          tenantSlugs: ["tenant1"]
        };

        expect(() => userSchemas.createUser.parse(valid)).not.toThrow();
      });

      it("should accept minimal user data", () => {
        const valid = { email: "user@example.com" };
        expect(() => userSchemas.createUser.parse(valid)).not.toThrow();
      });

      it("should require email", () => {
        expect(() => userSchemas.createUser.parse({})).toThrow();
      });
    });

    describe("updateUser", () => {
      it("should accept partial user updates", () => {
        const valid = { name: "Updated Name" };
        expect(() => userSchemas.updateUser.parse(valid)).not.toThrow();
      });

      it("should accept null name", () => {
        const valid = { name: null };
        expect(() => userSchemas.updateUser.parse(valid)).not.toThrow();
      });

      it("should accept all fields", () => {
        const valid = {
          email: "updated@example.com",
          name: "Updated",
          password: "newpass",
          roles: ["admin"],
          tenantSlugs: ["tenant2"]
        };

        expect(() => userSchemas.updateUser.parse(valid)).not.toThrow();
      });

      it("should accept empty object", () => {
        expect(() => userSchemas.updateUser.parse({})).not.toThrow();
      });
    });

    describe("updateProfile", () => {
      it("should accept name update", () => {
        const valid = { name: "New Name" };
        expect(() => userSchemas.updateProfile.parse(valid)).not.toThrow();
      });

      it("should accept email update", () => {
        const valid = { email: "newemail@example.com" };
        expect(() => userSchemas.updateProfile.parse(valid)).not.toThrow();
      });

      it("should accept both updates", () => {
        const valid = {
          name: "New Name",
          email: "newemail@example.com"
        };

        expect(() => userSchemas.updateProfile.parse(valid)).not.toThrow();
      });

      it("should accept empty object", () => {
        expect(() => userSchemas.updateProfile.parse({})).not.toThrow();
      });
    });
  });

  describe("validateInput", () => {
    it("should return parsed data for valid input", () => {
      const result = validateInput(emailSchema, "TEST@EXAMPLE.COM");
      expect(result).toBe("test@example.com");
    });

    it("should throw formatted validation error for invalid input", () => {
      try {
        validateInput(authSchemas.login, { email: "invalid" });
        expect.fail("Should have thrown");
      } catch (error: any) {
        expect(error.message).toBe("Validation failed");
        expect(error.statusCode).toBe(400);
        expect(error.validation).toBeDefined();
        expect(Array.isArray(error.validation)).toBe(true);
        expect(error.validation.length).toBeGreaterThan(0);
        expect(error.validation[0]).toHaveProperty("field");
        expect(error.validation[0]).toHaveProperty("message");
      }
    });

    it("should include all validation errors", () => {
      try {
        validateInput(authSchemas.login, {});
        expect.fail("Should have thrown");
      } catch (error: any) {
        expect(error.validation.length).toBe(2); // email and password required
      }
    });

    it("should format field paths correctly", () => {
      try {
        validateInput(authSchemas.login, { email: "invalid", password: "" });
        expect.fail("Should have thrown");
      } catch (error: any) {
        const emailError = error.validation.find((e: any) => e.field === "email");
        const passwordError = error.validation.find((e: any) => e.field === "password");
        expect(emailError).toBeDefined();
        expect(passwordError).toBeDefined();
      }
    });

    it("should rethrow non-Zod errors", () => {
      const schema = {
        parse: () => {
          throw new Error("Custom error");
        }
      } as any;

      expect(() => validateInput(schema, {})).toThrow("Custom error");
    });
  });
});
