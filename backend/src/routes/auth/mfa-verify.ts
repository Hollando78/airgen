import type { FastifyInstance } from "fastify";
import { config } from "../../config.js";
import { authSchemas, validateInput } from "../../lib/validation.js";
import {
  verifyTotpToken,
  decryptSecret,
  verifyBackupCode,
  hashBackupCode
} from "../../lib/mfa.js";
import {
  getUserWithPermissions,
  buildJwtPayloadFromPostgres
} from "../../services/auth-postgres.js";
import {
  sendLoginNotification,
  sendLoginAlertEmail,
  sendMfaBackupCodeUsedEmail
} from "../../lib/email.js";
import { createRefreshToken } from "../../lib/refresh-tokens.js";
import { createAuthRateLimitConfig } from "./shared.js";
import { userRepository } from "../../repositories/UserRepository.js";

export function registerMfaVerifyRoute(app: FastifyInstance) {
  const rateLimit = createAuthRateLimitConfig();

  app.post("/auth/mfa-verify", {
    config: {
      rateLimit
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
        400: {
          type: "object",
          properties: {
            error: { type: "string" }
          }
        },
        401: {
          type: "object",
          properties: {
            error: { type: "string" }
          }
        },
        404: {
          type: "object",
          properties: {
            error: { type: "string" }
          }
        }
      }
    }
  }, async (req, reply) => {
    const { tempToken, code } = validateInput(authSchemas.verifyMfaLogin, req.body);

    let decoded;
    try {
      decoded = app.jwt.verify(tempToken) as any;
    } catch (error) {
      return reply.code(401).send({ error: "Invalid or expired session token" });
    }

    if (!decoded.mfaPending) {
      return reply.code(401).send({ error: "Invalid session token" });
    }

    const postgresUser = await getUserWithPermissions(decoded.sub);

    if (!postgresUser) {
      return reply.code(404).send({ error: "User not found" });
    }

    if (!postgresUser.mfaEnabled || !postgresUser.mfaSecret) {
      return reply.code(400).send({ error: "2FA not enabled for this user" });
    }

    const secret = decryptSecret(postgresUser.mfaSecret);
    let isValid = verifyTotpToken(code, secret);
    let usedBackupCode = false;
    let remainingBackupCodes = 0;

    if (!isValid) {
      const backupCodes = await userRepository.getMfaBackupCodes(postgresUser.id);
      if (backupCodes.length > 0 && verifyBackupCode(code, backupCodes)) {
        const hashedCode = hashBackupCode(code);
        const marked = await userRepository.markBackupCodeUsed(postgresUser.id, hashedCode);
        if (marked) {
          usedBackupCode = true;
          isValid = true;
          const remaining = await userRepository.getMfaBackupCodes(postgresUser.id);
          remainingBackupCodes = remaining.length;
        }
      }
    }

    if (!isValid) {
      app.log.warn({
        event: "auth.mfa.verification_failed",
        userId: postgresUser.id,
        email: postgresUser.email,
        ip: req.ip
      }, "Failed MFA verification attempt");
      return reply.code(400).send({ error: "Invalid 2FA code" });
    }

    const jwtPayload = await buildJwtPayloadFromPostgres(postgresUser.id);
    const token = await reply.jwtSign(jwtPayload, { expiresIn: config.jwt.accessTokenExpiry });
    const refreshToken = createRefreshToken(postgresUser.id);

    reply.setCookie(config.cookies.refreshTokenName, refreshToken, {
      httpOnly: true,
      secure: config.environment === "production",
      sameSite: "lax",
      path: "/",
      maxAge: config.jwt.refreshTokenMaxAge
    });

    app.log.info({
      event: "auth.mfa.verification_success",
      userId: postgresUser.id,
      email: postgresUser.email,
      usedBackupCode,
      ip: req.ip,
      authMethod: "postgresql"
    }, "MFA verification successful");

    sendLoginNotification(postgresUser.email, postgresUser.name || postgresUser.email, req.ip, true)
      .catch(emailError => {
        app.log.error({ err: emailError }, "Failed to send login notification");
      });
    sendLoginAlertEmail(postgresUser.email, postgresUser.name || postgresUser.email, req.ip, true)
      .catch(emailError => {
        app.log.error({ err: emailError }, "Failed to send login alert");
      });

    if (usedBackupCode) {
      sendMfaBackupCodeUsedEmail(postgresUser.email, postgresUser.name || undefined, remainingBackupCodes)
        .catch(emailError => {
          app.log.error({ err: emailError }, "Failed to send backup code usage alert");
        });
    }

    return {
      token,
      user: jwtPayload
    };
  });
}
