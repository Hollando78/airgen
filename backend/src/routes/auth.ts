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
  updateDevUser,
  createDevUser
} from "../services/dev-users.js";
import {
  createRefreshToken,
  verifyRefreshToken,
  revokeRefreshToken,
  revokeAllUserTokens
} from "../lib/refresh-tokens.js";
import { createToken, verifyAndConsumeToken, revokeUserTokens } from "../lib/tokens.js";
import { sendVerificationEmail, sendPasswordResetEmail, sendPasswordChangedEmail, sendFailedSignupNotification, sendSuccessfulSignupNotification, sendLoginNotification } from "../lib/email.js";
import { hashPassword } from "../lib/password.js";
import {
  verifyTotpToken,
  decryptSecret,
  verifyBackupCode,
  consumeBackupCode
} from "../lib/mfa.js";
import { createTenant } from "../services/graph.js";

/**
 * Generate a unique tenant slug from email address
 * Format: username from email (sanitized) + random suffix if needed
 */
function generateTenantSlug(email: string): string {
  // Extract username part before @
  const username = email.split('@')[0] || 'user';

  // Sanitize: keep only alphanumeric and hyphens, convert to lowercase
  const sanitized = username
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/^-+|-+$/g, '') // Remove leading/trailing hyphens
    .replace(/-+/g, '-') // Collapse multiple hyphens
    .substring(0, 20); // Limit length

  // Add timestamp suffix to ensure uniqueness
  const timestamp = Date.now().toString(36);
  return `${sanitized}-${timestamp}`;
}

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
          oneOf: [
            {
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
              },
              required: ["token", "user"]
            },
            {
              type: "object",
              properties: {
                status: { type: "string", enum: ["MFA_REQUIRED"], description: "MFA challenge status" },
                tempToken: { type: "string", description: "Temporary token for MFA verification" },
                message: { type: "string", description: "Instructions for user" }
              },
              required: ["status", "tempToken", "message"]
            }
          ]
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
        (!user.password && !user.passwordHash)
      ) {
        return reply.code(401).send({ error: "Invalid credentials" });
      }

      // Verify password (supports Argon2id, legacy scrypt, and legacy SHA256)
      const authenticated = await verifyDevUserPassword(user, password);
      if (!authenticated) {
        // Log failed login attempt
        app.log.warn({
          event: "auth.login.failed",
          email,
          reason: "invalid_password",
          ip: req.ip
        }, "Failed login attempt");
        return reply.code(401).send({ error: "Invalid credentials" });
      }

      // Upgrade legacy hashes to Argon2id on successful auth
      await ensureLegacyPasswordUpgrade(user, password);

      // Check if MFA is enabled for this user
      if (user.mfaEnabled) {
        // Generate temporary session token for MFA verification (5 minutes)
        const tempToken = await reply.jwtSign(
          {
            sub: user.id,
            email: user.email,
            mfaPending: true
          },
          { expiresIn: '5m' }
        );

        // Log MFA challenge issued
        app.log.info({
          event: "auth.mfa.challenge_issued",
          userId: user.id,
          email: user.email,
          ip: req.ip
        }, "MFA challenge issued for user");

        return {
          status: "MFA_REQUIRED",
          tempToken,
          message: "Please provide your 2FA code"
        };
      }

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

      // Log successful login
      app.log.info({
        event: "auth.login.success",
        userId: user.id,
        email: user.email,
        mfaEnabled: false,
        ip: req.ip
      }, "User logged in successfully");

      // Send login notification to admin (fire and forget)
      sendLoginNotification(user.email, user.name, req.ip, false)
        .catch(emailError => {
          app.log.error({ err: emailError }, "Failed to send login notification");
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
        return (reply as any).code(400).send({
          error: "Validation failed",
          details: (error as any).validation
        });
      }
      app.log.error(error, "Login error");
      return (reply as any).code(500).send({ error: "Internal server error" });
    }
  });

  // User registration
  app.post("/auth/register", {
    config: {
      rateLimit: authRateLimitConfig
    },
    schema: {
      tags: ["authentication"],
      summary: "Register new user",
      description: "Creates a new user account with email and password",
      body: {
        type: "object",
        required: ["email", "password", "name"],
        properties: {
          email: { type: "string", format: "email", description: "User email address" },
          password: { type: "string", minLength: 8, description: "User password (min 8 characters)" },
          name: { type: "string", minLength: 1, description: "User's full name" }
        }
      },
      response: {
        201: {
          type: "object",
          properties: {
            message: { type: "string" },
            user: {
              type: "object",
              properties: {
                id: { type: "string" },
                email: { type: "string" },
                name: { type: "string" }
              }
            }
          }
        },
        400: {
          type: "object",
          properties: {
            error: { type: "string" }
          }
        },
        409: {
          type: "object",
          properties: {
            error: { type: "string" }
          }
        }
      }
    }
  }, async (req, reply) => {
    let attemptedEmail: string | undefined;

    try {
      const { email, password, name } = validateInput(authSchemas.register, req.body);
      attemptedEmail = email;

      // Generate unique tenant slug for the new user
      const tenantSlug = generateTenantSlug(email);

      // Create new user with admin role and tenant association
      const user = await createDevUser({
        email,
        password,
        name,
        roles: ['admin', 'author', 'user'],
        tenantSlugs: [tenantSlug]
      });

      // Create personal tenant for the user in Neo4j
      try {
        await createTenant({
          slug: tenantSlug,
          name: name ? `${name}'s Workspace` : `${email.split('@')[0]}'s Workspace`
        });

        app.log.info({
          event: "auth.register.tenant_created",
          userId: user.id,
          email: user.email,
          tenantSlug,
          ip: req.ip
        }, "Personal tenant created for new user");
      } catch (tenantError) {
        // Log tenant creation error but don't fail registration
        app.log.error({
          error: tenantError,
          userId: user.id,
          email: user.email,
          tenantSlug
        }, "Failed to create tenant for new user");
      }

      // Log registration
      app.log.info({
        event: "auth.register.success",
        userId: user.id,
        email: user.email,
        tenantSlug,
        ip: req.ip
      }, "User registered successfully");

      // Send signup notification to admin (fire and forget)
      sendSuccessfulSignupNotification(user.email, user.name, tenantSlug, req.ip)
        .catch(emailError => {
          app.log.error({ err: emailError }, "Failed to send signup notification");
        });

      // Return success (user needs to login separately)
      return reply.code(201).send({
        message: "Account created successfully. Please sign in.",
        user: {
          id: user.id,
          email: user.email,
          name: user.name
        }
      });
    } catch (error) {
      // Handle duplicate email error
      if ((error as NodeJS.ErrnoException).code === 'EUSER_EXISTS') {
        app.log.warn({
          event: "auth.register.duplicate_email",
          email: attemptedEmail,
          ip: req.ip
        }, "Registration attempt with existing email");
        return reply.code(409).send({ error: "An account with this email already exists" });
      }

      // Handle validation errors with enhanced logging and notification
      if ((error as any).statusCode === 400 && (error as any).validation) {
        const validationErrors = (error as any).validation as Array<{ field: string; message: string }>;
        const emailFromBody = attemptedEmail || (req.body as any)?.email || "unknown";

        // Log detailed validation errors
        app.log.warn({
          event: "auth.register.validation_failed",
          email: emailFromBody,
          ip: req.ip,
          errors: validationErrors
        }, "Registration validation failed");

        // Send notification email to admin (fire and forget - don't block response)
        sendFailedSignupNotification(emailFromBody, validationErrors, req.ip)
          .catch(emailError => {
            app.log.error({ err: emailError }, "Failed to send signup failure notification");
          });

        return (reply as any).code(400).send({
          error: "Validation failed",
          details: validationErrors
        });
      }

      app.log.error(error, "Registration error");
      return (reply as any).code(500).send({ error: "Internal server error" });
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
      return reply.code(401).send({ error: "No refresh token provided" });
    }

    // Verify refresh token (this also marks it as used)
    const userId = await verifyRefreshToken(refreshToken);

    if (!userId) {
      // Token invalid, expired, or already used
      reply.clearCookie(config.cookies.refreshTokenName);
      return reply.code(401).send({ error: "Invalid or expired refresh token" });
    }

    // Get user from database
    const user = await getDevUser(userId);
    if (!user) {
      reply.clearCookie(config.cookies.refreshTokenName);
      return reply.code(401).send({ error: "User not found" });
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
      await revokeRefreshToken(refreshToken);
    }

    // Log logout event
    if (req.currentUser) {
      app.log.info({
        event: "auth.logout",
        userId: req.currentUser.sub,
        email: req.currentUser.email,
        ip: req.ip
      }, "User logged out");
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
      return (reply as any).code(401).send({ error: "User not authenticated" });
    }

    // Revoke all refresh tokens for this user
    await revokeAllUserTokens(req.currentUser.sub);

    // Clear refresh token cookie
    reply.clearCookie(config.cookies.refreshTokenName);

    return { message: "Logged out from all devices" };
  });

  /**
   * Verify MFA code after login
   */
  app.post("/auth/mfa-verify", {
    config: {
      rateLimit: authRateLimitConfig
    },
    schema: {
      tags: ["authentication"],
      summary: "Verify MFA code",
      description: "Complete login by verifying TOTP or backup code",
      body: {
        type: "object",
        required: ["tempToken", "code"],
        properties: {
          tempToken: { type: "string", description: "Temporary session token from login" },
          code: { type: "string", description: "TOTP code or backup code" }
        }
      },
      response: {
        200: {
          type: "object",
          properties: {
            token: { type: "string" },
            user: { type: "object" }
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
    const { tempToken, code } = validateInput(authSchemas.verifyMfaLogin, req.body);

    // Verify temporary token
    let decoded;
    try {
      decoded = app.jwt.verify(tempToken) as any;
    } catch (error) {
      return reply.code(401).send({ error: "Invalid or expired session token" });
    }

    // Check if this is an MFA pending token
    if (!decoded.mfaPending) {
      return reply.code(401).send({ error: "Invalid session token" });
    }

    // Get user
    const user = await getDevUser(decoded.sub);
    if (!user) {
      return (reply as any).code(404).send({ error: "User not found" });
    }

    if (!user.mfaEnabled || !user.mfaSecret) {
      return (reply as any).code(400).send({ error: "2FA not enabled for this user" });
    }

    let isValid = false;
    let usedBackupCode = false;

    // Try TOTP first
    const secret = decryptSecret(user.mfaSecret);
    isValid = verifyTotpToken(code, secret);

    // If TOTP fails, try backup codes
    if (!isValid && user.mfaBackupCodes && user.mfaBackupCodes.length > 0) {
      isValid = verifyBackupCode(code, user.mfaBackupCodes);
      usedBackupCode = isValid;
    }

    if (!isValid) {
      // Log failed MFA verification
      app.log.warn({
        event: "auth.mfa.verification_failed",
        userId: user.id,
        email: user.email,
        ip: req.ip
      }, "Failed MFA verification attempt");
      return (reply as any).code(400).send({ error: "Invalid 2FA code" });
    }

    // If backup code was used, consume it
    if (usedBackupCode && user.mfaBackupCodes) {
      const remainingCodes = consumeBackupCode(code, user.mfaBackupCodes);
      await updateDevUser(user.id, {
        mfaBackupCodes: remainingCodes
      });
    }

    // Generate full access token
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

    // Generate refresh token
    const refreshToken = createRefreshToken(user.id);

    // Set refresh token as httpOnly cookie
    reply.setCookie(config.cookies.refreshTokenName, refreshToken, {
      httpOnly: true,
      secure: config.environment === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 7 * 24 * 60 * 60 // 7 days in seconds
    });

    // Log successful MFA verification
    app.log.info({
      event: "auth.mfa.verification_success",
      userId: user.id,
      email: user.email,
      usedBackupCode,
      ip: req.ip
    }, "MFA verification successful");

    // Send login notification to admin (fire and forget)
    sendLoginNotification(user.email, user.name, req.ip, true)
      .catch(emailError => {
        app.log.error({ err: emailError }, "Failed to send login notification");
      });

    // Return token and user info
    const { password: _legacy, passwordHash: _hash, passwordSalt: _salt, mfaSecret: _secret, mfaBackupCodes: _codes, ...userWithoutSensitive } = user;
    return {
      token,
      user: userWithoutSensitive
    };
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
      return reply.code(401).send({ error: "User not authenticated" });
    }

    const user = await getDevUser(req.currentUser.sub);
    if (!user) {
      return reply.code(404).send({ error: "User not found" });
    }

    if (user.emailVerified) {
      return reply.code(400).send({ error: "Email already verified" });
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
      return reply.code(400).send({ error: "Invalid or expired verification token" });
    }

    // Mark email as verified
    const user = await markEmailVerified(tokenRecord.userId);

    if (!user) {
      return reply.code(404).send({ error: "User not found" });
    }

    // Log email verification success
    app.log.info({
      event: "auth.email.verified",
      userId: user.id,
      email: user.email,
      ip: req.ip
    }, "Email verified successfully");

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
      return reply.code(400).send({ error: "Invalid or expired reset token" });
    }

    // Get user
    const user = await getDevUser(tokenRecord.userId);

    if (!user) {
      return reply.code(404).send({ error: "User not found" });
    }

    // Update password
    const hashedPassword = await hashPassword(password);
    await updateDevUser(user.id, { password: hashedPassword });

    // Revoke all refresh tokens (logout all devices)
    await revokeAllUserTokens(user.id);

    // Revoke any remaining reset tokens
    revokeUserTokens(user.id, "password_reset");

    // Log password reset
    app.log.info({
      event: "auth.password.reset",
      userId: user.id,
      email: user.email,
      ip: req.ip
    }, "Password reset successfully");

    // Send confirmation email
    await sendPasswordChangedEmail(user.email, user.name);

    return { message: "Password reset successfully. Please log in with your new password." };
  });
}
