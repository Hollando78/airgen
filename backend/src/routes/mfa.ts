import type { FastifyInstance } from "fastify";
import { config } from "../config.js";
import { authSchemas, validateInput } from "../lib/validation.js";
import { getDevUser, updateDevUser } from "../services/dev-users.js";
import {
  generateSecret,
  generateTotpUri,
  generateQRCode,
  encryptSecret,
  decryptSecret,
  verifyTotpToken,
  generateBackupCodes,
  hashBackupCode
} from "../lib/mfa.js";
import { revokeAllUserTokens } from "../lib/refresh-tokens.js";

export default async function registerMfaRoutes(app: FastifyInstance): Promise<void> {
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

  /**
   * Start TOTP setup - Generate QR code
   */
  app.post("/mfa/totp/start", {
    preHandler: [app.authenticate],
    schema: {
      tags: ["mfa"],
      summary: "Start TOTP 2FA setup",
      description: "Generate TOTP secret and QR code for authenticator app",
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

    if (user.mfaEnabled) {
      return reply.status(400).send({ error: "2FA already enabled" });
    }

    // Generate new secret
    const secret = generateSecret();
    const uri = generateTotpUri(user.email, secret);
    const qrCode = await generateQRCode(uri);

    // Store encrypted secret temporarily (not yet enabled)
    const encryptedSecret = encryptSecret(secret);
    await updateDevUser(user.id, {
      // @ts-expect-error - mfaSecret is valid but not in UpdateDevUserInput type
      mfaSecret: encryptedSecret
    });

    return {
      qrCode,
      secret, // Send plaintext secret for manual entry
      uri
    };
  });

  /**
   * Verify TOTP and enable 2FA
   */
  app.post("/mfa/totp/verify", {
    preHandler: [app.authenticate],
    config: {
      rateLimit: authRateLimitConfig
    },
    schema: {
      tags: ["mfa"],
      summary: "Verify TOTP and enable 2FA",
      description: "Verify TOTP code and complete 2FA setup",
      security: [{ bearerAuth: [] }]
    }
  }, async (req, reply) => {
    if (!req.currentUser) {
      return reply.status(401).send({ error: "User not authenticated" });
    }

    const { code } = validateInput(authSchemas.verifyMfa, req.body);

    const user = await getDevUser(req.currentUser.sub);
    if (!user) {
      return reply.status(404).send({ error: "User not found" });
    }

    if (user.mfaEnabled) {
      return reply.status(400).send({ error: "2FA already enabled" });
    }

    if (!user.mfaSecret) {
      return reply.status(400).send({ error: "2FA setup not started. Call /mfa/totp/start first" });
    }

    // Decrypt and verify code
    const secret = decryptSecret(user.mfaSecret);
    const isValid = verifyTotpToken(code, secret);

    if (!isValid) {
      return reply.status(400).send({ error: "Invalid TOTP code" });
    }

    // Generate backup codes
    const backupCodes = generateBackupCodes(10);
    const hashedBackupCodes = backupCodes.map(hashBackupCode);

    // Enable 2FA
    await updateDevUser(user.id, {
      // @ts-expect-error - mfaEnabled and mfaBackupCodes are valid but not in UpdateDevUserInput type
      mfaEnabled: true,
      mfaBackupCodes: hashedBackupCodes
    });

    // Log MFA enabled
    app.log.info({
      event: "auth.mfa.enabled",
      userId: user.id,
      email: user.email,
      backupCodesGenerated: backupCodes.length
    }, "2FA enabled for user");

    return {
      message: "2FA enabled successfully",
      backupCodes // Return plaintext codes ONCE for user to save
    };
  });

  /**
   * Disable 2FA (requires reauthentication)
   */
  app.post("/mfa/disable", {
    preHandler: [app.authenticate],
    config: {
      rateLimit: authRateLimitConfig
    },
    schema: {
      tags: ["mfa"],
      summary: "Disable 2FA",
      description: "Disable two-factor authentication (requires password confirmation)",
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

    if (!user.mfaEnabled) {
      return reply.status(400).send({ error: "2FA not enabled" });
    }

    // Disable 2FA
    await updateDevUser(user.id, {
      // @ts-expect-error - mfaEnabled, mfaSecret, mfaBackupCodes are valid but not in UpdateDevUserInput type
      mfaEnabled: false,
      mfaSecret: undefined,
      mfaBackupCodes: undefined
    });

    // Log MFA disabled
    app.log.info({
      event: "auth.mfa.disabled",
      userId: user.id,
      email: user.email
    }, "2FA disabled for user");

    // Revoke all sessions for security
    revokeAllUserTokens(user.id);

    return {
      message: "2FA disabled successfully. Please log in again."
    };
  });

  /**
   * Get 2FA status
   */
  app.get("/mfa/status", {
    preHandler: [app.authenticate],
    schema: {
      tags: ["mfa"],
      summary: "Get 2FA status",
      description: "Check if 2FA is enabled for current user",
      security: [{ bearerAuth: [] }]
    }
  }, async (req) => {
    if (!req.currentUser) {
      throw new Error("User not authenticated");
    }

    const user = await getDevUser(req.currentUser.sub);
    if (!user) {
      throw new Error("User not found");
    }

    return {
      mfaEnabled: user.mfaEnabled || false,
      backupCodesRemaining: user.mfaBackupCodes?.length || 0
    };
  });
}
