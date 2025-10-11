import type { FastifyInstance } from "fastify";
import { config } from "../config.js";
import { authSchemas, validateInput } from "../lib/validation.js";
import {
  ensureLegacyPasswordUpgrade,
  listDevUsers,
  verifyDevUserPassword,
  getDevUser,
  getDevUserByEmail,
  markEmailVerified,
  updateDevUser
} from "../services/dev-users.js";
import {
  createRefreshToken,
  verifyRefreshToken,
  revokeRefreshToken,
  revokeAllUserTokens
} from "../lib/refresh-tokens.js";
import { createToken, verifyAndConsumeToken, revokeUserTokens } from "../lib/tokens.js";
import { sendVerificationEmail, sendPasswordResetEmail, sendPasswordChangedEmail } from "../lib/email.js";
import { hashPassword } from "../lib/password.js";

export default async function registerAuthRoutes(app: FastifyInstance): Promise<void> {
  // Auth-specific rate limiter (stricter than global)
  const authRateLimitConfig = {
    max: config.rateLimit.auth.max,
    timeWindow: config.rateLimit.auth.timeWindow,
    errorResponseBuilder: () => ({
      error: "Too many authentication attempts. Please try again later.",
      statusCode: 429,
      retryAfter: Math.ceil(config.rateLimit.auth.timeWindow / 1000)
    })
  };

  app.post("/auth/login", {
    config: {
      rateLimit: authRateLimitConfig
    },
    schema: {
      tags: ["authentication"],
      summary: "Authenticate user",
      description: "Authenticates user with email and password, returns JWT token",
      body: {
        type: "object",
        required: ["email", "password"],
        properties: {
          email: { type: "string", format: "email", description: "User email address" },
          password: { type: "string", minLength: 1, description: "User password" }
        }
      },
      response: {
        200: {
          type: "object",
          properties: {
            token: { type: "string", description: "JWT authentication token" },
            user: {
              type: "object",
              properties: {
                id: { type: "string" },
                email: { type: "string" },
                name: { type: "string" },
                roles: { type: "array", items: { type: "string" } },
                tenantSlugs: { type: "array", items: { type: "string" } }
              }
            }
          }
        },
        401: {
          type: "object",
          properties: {
            error: { type: "string" }
          }
        },
        500: {
          type: "object",
          properties: {
            error: { type: "string" }
          }
        }
      }
    }
  }, async (req, reply) => {
    // Validate input with enhanced Zod schema
    const { email, password } = validateInput(authSchemas.login, req.body);

    try {
      // Find user by email
      const users = await listDevUsers();
      const user = users.find(u => u.email.toLowerCase() === email.toLowerCase());

      if (
        !user ||
        (!user.password && (!user.passwordHash || !user.passwordSalt))
      ) {
        return reply.status(401).send({ error: "Invalid credentials" });
      }

      // Verify password (supports Argon2id, legacy scrypt, and legacy SHA256)
      const authenticated = await verifyDevUserPassword(user, password);
      if (!authenticated) {
        return reply.status(401).send({ error: "Invalid credentials" });
      }

      // Upgrade legacy hashes to Argon2id on successful auth
      await ensureLegacyPasswordUpgrade(user, password);

      // Generate short-lived JWT access token (15 minutes)
      const token = await reply.jwtSign(
        {
          sub: user.id,
          email: user.email,
          name: user.name,
          roles: user.roles,
          tenantSlugs: user.tenantSlugs
        },
        { expiresIn: '15m' }
      );

      // Generate long-lived refresh token (7 days)
      const refreshToken = createRefreshToken(user.id);

      // Set refresh token as httpOnly cookie (secure in production)
      reply.setCookie(config.cookies.refreshTokenName, refreshToken, {
        httpOnly: true,
        secure: config.environment === "production", // HTTPS only in production
        sameSite: "lax",
        path: "/",
        maxAge: 7 * 24 * 60 * 60 // 7 days in seconds
      });

      // Return token and user info (without password)
      const { password: _legacy, passwordHash: _hash, passwordSalt: _salt, ...userWithoutPassword } = user;
      return {
        token,
        user: userWithoutPassword
      };
    } catch (error) {
      // Handle validation errors
      if ((error as any).statusCode === 400 && (error as any).validation) {
        return reply.status(400).send({
          error: "Validation failed",
          details: (error as any).validation
        });
      }
      app.log.error(error, "Login error");
      return reply.status(500).send({ error: "Internal server error" });
    }
  });
  
  app.get("/auth/me", {
    preHandler: [app.authenticate],
    schema: {
      tags: ["authentication"],
      summary: "Get current user",
      description: "Retrieves authenticated user information",
      security: [{ bearerAuth: [] }],
      response: {
        200: {
          type: "object",
          properties: {
            user: {
              type: "object",
              properties: {
                id: { type: "string" },
                email: { type: "string" },
                name: { type: "string" },
                roles: { type: "array", items: { type: "string" } },
                tenantSlugs: { type: "array", items: { type: "string" } }
              }
            }
          }
        }
      }
    }
  }, async (req) => {
    if (!req.currentUser) {
      throw new Error("User not authenticated");
    }

    // Return current user info
    return {
      user: {
        id: req.currentUser.sub,
        email: req.currentUser.email,
        name: req.currentUser.name,
        roles: req.currentUser.roles,
        tenantSlugs: req.currentUser.tenantSlugs
      }
    };
  });

  app.post("/auth/refresh", {
    config: {
      rateLimit: authRateLimitConfig
    },
    schema: {
      tags: ["authentication"],
      summary: "Refresh access token",
      description: "Exchange refresh token for new access token (uses httpOnly cookie)",
      response: {
        200: {
          type: "object",
          properties: {
            token: { type: "string", description: "New JWT access token" }
          }
        },
        401: {
          type: "object",
          properties: {
            error: { type: "string" }
          }
        }
      }
    }
  }, async (req, reply) => {
    // Get refresh token from httpOnly cookie
    const refreshToken = req.cookies[config.cookies.refreshTokenName];

    if (!refreshToken) {
      return reply.status(401).send({ error: "No refresh token provided" });
    }

    // Verify refresh token (this also marks it as used)
    const userId = verifyRefreshToken(refreshToken);

    if (!userId) {
      // Token invalid, expired, or already used
      reply.clearCookie(config.cookies.refreshTokenName);
      return reply.status(401).send({ error: "Invalid or expired refresh token" });
    }

    // Get user from database
    const user = await getDevUser(userId);
    if (!user) {
      reply.clearCookie(config.cookies.refreshTokenName);
      return reply.status(401).send({ error: "User not found" });
    }

    // Generate new access token
    const token = await reply.jwtSign(
      {
        sub: user.id,
        email: user.email,
        name: user.name,
        roles: user.roles,
        tenantSlugs: user.tenantSlugs
      },
      { expiresIn: '15m' }
    );

    // Generate new refresh token (rotation)
    const newRefreshToken = createRefreshToken(user.id);

    // Set new refresh token as httpOnly cookie
    reply.setCookie(config.cookies.refreshTokenName, newRefreshToken, {
      httpOnly: true,
      secure: config.environment === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 7 * 24 * 60 * 60 // 7 days in seconds
    });

    return { token };
  });

  app.post("/auth/logout", {
    preHandler: [app.authenticate],
    schema: {
      tags: ["authentication"],
      summary: "Logout user",
      description: "Revoke refresh token and clear session",
      security: [{ bearerAuth: [] }],
      response: {
        200: {
          type: "object",
          properties: {
            message: { type: "string" }
          }
        }
      }
    }
  }, async (req, reply) => {
    // Revoke refresh token if present
    const refreshToken = req.cookies[config.cookies.refreshTokenName];
    if (refreshToken) {
      revokeRefreshToken(refreshToken);
    }

    // Clear refresh token cookie
    reply.clearCookie(config.cookies.refreshTokenName);

    return { message: "Logged out successfully" };
  });

  app.post("/auth/logout-all", {
    preHandler: [app.authenticate],
    schema: {
      tags: ["authentication"],
      summary: "Logout from all devices",
      description: "Revoke all refresh tokens for the current user",
      security: [{ bearerAuth: [] }],
      response: {
        200: {
          type: "object",
          properties: {
            message: { type: "string" }
          }
        }
      }
    }
  }, async (req, reply) => {
    if (!req.currentUser) {
      return reply.status(401).send({ error: "User not authenticated" });
    }

    // Revoke all refresh tokens for this user
    revokeAllUserTokens(req.currentUser.sub);

    // Clear refresh token cookie
    reply.clearCookie(config.cookies.refreshTokenName);

    return { message: "Logged out from all devices" };
  });

  // Email verification - request
  app.post("/auth/request-verification", {
    preHandler: [app.authenticate],
    config: {
      rateLimit: authRateLimitConfig
    },
    schema: {
      tags: ["authentication"],
      summary: "Request email verification",
      description: "Send verification email to current user",
      security: [{ bearerAuth: [] }]
    }
  }, async (req, reply) => {
    if (!req.currentUser) {
      return reply.status(401).send({ error: "User not authenticated" });
    }

    const user = await getDevUser(req.currentUser.sub);
    if (!user) {
      return reply.status(404).send({ error: "User not found" });
    }

    if (user.emailVerified) {
      return reply.status(400).send({ error: "Email already verified" });
    }

    // Create verification token
    const token = createToken(user.id, user.email, "email_verification");

    // Send verification email
    await sendVerificationEmail(user.email, user.name, token);

    return { message: "Verification email sent" };
  });

  // Email verification - verify
  app.post("/auth/verify-email", {
    config: {
      rateLimit: authRateLimitConfig
    },
    schema: {
      tags: ["authentication"],
      summary: "Verify email address",
      description: "Verify email with token from verification email"
    }
  }, async (req, reply) => {
    const { token } = validateInput(authSchemas.verifyEmail, req.body);

    // Verify and consume token
    const tokenRecord = verifyAndConsumeToken(token, "email_verification");

    if (!tokenRecord) {
      return reply.status(400).send({ error: "Invalid or expired verification token" });
    }

    // Mark email as verified
    const user = await markEmailVerified(tokenRecord.userId);

    if (!user) {
      return reply.status(404).send({ error: "User not found" });
    }

    return { message: "Email verified successfully" };
  });

  // Password reset - request
  app.post("/auth/request-password-reset", {
    config: {
      rateLimit: authRateLimitConfig
    },
    schema: {
      tags: ["authentication"],
      summary: "Request password reset",
      description: "Send password reset email"
    }
  }, async (req, reply) => {
    const { email } = validateInput(authSchemas.requestPasswordReset, req.body);

    // Find user by email (don't reveal if user exists)
    const user = await getDevUserByEmail(email);

    if (user) {
      // Create reset token
      const token = createToken(user.id, user.email, "password_reset", 30); // 30 min expiry

      // Send reset email
      await sendPasswordResetEmail(user.email, user.name, token);
    }

    // Always return success (don't reveal if user exists)
    return { message: "If an account exists with this email, a password reset link has been sent" };
  });

  // Password reset - confirm
  app.post("/auth/reset-password", {
    config: {
      rateLimit: authRateLimitConfig
    },
    schema: {
      tags: ["authentication"],
      summary: "Reset password",
      description: "Reset password with token from reset email"
    }
  }, async (req, reply) => {
    const { token, password } = validateInput(authSchemas.resetPassword, req.body);

    // Verify and consume token
    const tokenRecord = verifyAndConsumeToken(token, "password_reset");

    if (!tokenRecord) {
      return reply.status(400).send({ error: "Invalid or expired reset token" });
    }

    // Get user
    const user = await getDevUser(tokenRecord.userId);

    if (!user) {
      return reply.status(404).send({ error: "User not found" });
    }

    // Update password
    const hashedPassword = await hashPassword(password);
    await updateDevUser(user.id, { password: hashedPassword });

    // Revoke all refresh tokens (logout all devices)
    revokeAllUserTokens(user.id);

    // Revoke any remaining reset tokens
    revokeUserTokens(user.id, "password_reset");

    // Send confirmation email
    await sendPasswordChangedEmail(user.email, user.name);

    return { message: "Password reset successfully. Please log in with your new password." };
  });
}
