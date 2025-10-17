import type { FastifyInstance } from "fastify";
import { config } from "../../config.js";
import { authSchemas, validateInput } from "../../lib/validation.js";
import {
  authenticateUserPostgres,
  buildJwtPayloadFromPostgres
} from "../../services/auth-postgres.js";
import {
  createRefreshToken
} from "../../lib/refresh-tokens.js";
import {
  sendLoginNotification,
  sendLoginAlertEmail
} from "../../lib/email.js";
import { createAuthRateLimitConfig } from "./shared.js";

export function registerLoginRoute(app: FastifyInstance) {
  const rateLimit = createAuthRateLimitConfig();

  app.post("/auth/login", {
    config: {
      rateLimit
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
                    tenantSlugs: { type: "array", items: { type: "string" } },
                    permissions: { type: "object", nullable: true }
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
        400: {
          type: "object",
          properties: {
            error: { type: "string" },
            details: { type: "array", items: { type: "object" } }
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
    const { email, password } = validateInput(authSchemas.login, req.body);

    try {
      const postgresUser = await authenticateUserPostgres(email, password);

      if (!postgresUser) {
        app.log.warn({
          event: "auth.login.failed",
          email,
          reason: "invalid_credentials",
          ip: req.ip
        }, "Failed login attempt");
        return reply.code(401).send({ error: "Invalid credentials" });
      }

      if (postgresUser.mfaEnabled) {
        const tempToken = await reply.jwtSign(
          {
            sub: postgresUser.id,
            email: postgresUser.email,
            mfaPending: true
          },
          { expiresIn: "5m" }
        );

        app.log.info({
          event: "auth.mfa.challenge_issued",
          userId: postgresUser.id,
          email: postgresUser.email,
          ip: req.ip
        }, "MFA challenge issued for user");

        return {
          status: "MFA_REQUIRED",
          tempToken,
          message: "Please provide your 2FA code"
        };
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
        event: "auth.login.success",
        userId: postgresUser.id,
        email: postgresUser.email,
        mfaEnabled: false,
        ip: req.ip,
        authMethod: "postgresql"
      }, "User logged in successfully via PostgreSQL");

      sendLoginNotification(postgresUser.email, postgresUser.name || postgresUser.email, req.ip, false)
        .catch(emailError => {
          app.log.error({ err: emailError }, "Failed to send login notification");
        });
      sendLoginAlertEmail(postgresUser.email, postgresUser.name || postgresUser.email, req.ip, false)
        .catch(emailError => {
          app.log.error({ err: emailError }, "Failed to send login alert");
        });

      return {
        token,
        user: jwtPayload
      };
    } catch (error) {
      if ((error as any).statusCode === 400 && (error as any).validation) {
        return reply.code(400).send({
          error: "Validation failed",
          details: (error as any).validation
        });
      }
      app.log.error(error, "Login error");
      return reply.code(500).send({ error: "Internal server error" });
    }
  });
}
