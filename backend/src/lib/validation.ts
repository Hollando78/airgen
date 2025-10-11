import { z } from "zod";

/**
 * Validation schemas for authentication and user management.
 *
 * These schemas enforce security best practices:
 * - Strong password requirements
 * - Email format validation
 * - Input sanitization
 */

// Password validation rules
export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(128, "Password must not exceed 128 characters")
  .refine(
    (password) => /[a-z]/.test(password),
    "Password must contain at least one lowercase letter"
  )
  .refine(
    (password) => /[A-Z]/.test(password),
    "Password must contain at least one uppercase letter"
  )
  .refine(
    (password) => /[0-9]/.test(password),
    "Password must contain at least one number"
  )
  .refine(
    (password) => /[^a-zA-Z0-9]/.test(password),
    "Password must contain at least one special character"
  );

// Relaxed password schema (for development/testing)
export const relaxedPasswordSchema = z
  .string()
  .min(1, "Password is required")
  .max(128, "Password must not exceed 128 characters");

// Email validation
export const emailSchema = z
  .string()
  .email("Invalid email format")
  .toLowerCase()
  .trim();

// Name validation
export const nameSchema = z
  .string()
  .min(1, "Name is required")
  .max(100, "Name must not exceed 100 characters")
  .trim();

// TOTP code validation (6 digits)
export const totpCodeSchema = z
  .string()
  .regex(/^\d{6}$/, "TOTP code must be exactly 6 digits");

// Backup code validation (8 characters alphanumeric)
export const backupCodeSchema = z
  .string()
  .regex(/^[A-Z0-9]{8}$/, "Invalid backup code format");

/**
 * Auth-related validation schemas
 */
export const authSchemas = {
  // Login
  login: z.object({
    email: emailSchema,
    password: z.string().min(1, "Password is required")
  }),

  // Registration (use strong password in production)
  register: z.object({
    email: emailSchema,
    name: nameSchema.optional(),
    password: process.env.NODE_ENV === "production"
      ? passwordSchema
      : relaxedPasswordSchema
  }),

  // Password reset request
  requestPasswordReset: z.object({
    email: emailSchema
  }),

  // Password reset confirm
  resetPassword: z.object({
    token: z.string().min(1, "Reset token is required"),
    password: process.env.NODE_ENV === "production"
      ? passwordSchema
      : relaxedPasswordSchema
  }),

  // Email verification
  verifyEmail: z.object({
    token: z.string().min(1, "Verification token is required")
  }),

  // Change password (authenticated)
  changePassword: z.object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: process.env.NODE_ENV === "production"
      ? passwordSchema
      : relaxedPasswordSchema
  }),

  // MFA verification
  verifyMfa: z.object({
    code: z.union([totpCodeSchema, backupCodeSchema])
  })
};

/**
 * User management validation schemas
 */
export const userSchemas = {
  // Create user (admin)
  createUser: z.object({
    email: emailSchema,
    name: nameSchema.optional(),
    password: relaxedPasswordSchema.optional(),
    roles: z.array(z.string()).optional(),
    tenantSlugs: z.array(z.string()).optional()
  }),

  // Update user (admin)
  updateUser: z.object({
    email: emailSchema.optional(),
    name: nameSchema.nullable().optional(),
    password: relaxedPasswordSchema.optional(),
    roles: z.array(z.string()).optional(),
    tenantSlugs: z.array(z.string()).optional()
  }),

  // Update profile (self)
  updateProfile: z.object({
    name: nameSchema.optional(),
    email: emailSchema.optional()
  })
};

/**
 * Helper to create Fastify schema from Zod schema
 */
export function zodToJsonSchema(zodSchema: z.ZodType): Record<string, unknown> {
  // This is a simplified version. For production, use @fastify/type-provider-zod
  return {
    type: "object",
    properties: {},
    required: []
  };
}

/**
 * Validate and parse input with Zod schema
 * Returns parsed data or throws validation error
 */
export function validateInput<T>(schema: z.ZodType<T>, data: unknown): T {
  try {
    return schema.parse(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const formattedErrors = error.errors.map(err => ({
        field: err.path.join("."),
        message: err.message
      }));
      const validationError = new Error("Validation failed");
      (validationError as any).statusCode = 400;
      (validationError as any).validation = formattedErrors;
      throw validationError;
    }
    throw error;
  }
}
