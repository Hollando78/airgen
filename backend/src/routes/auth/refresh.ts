import type { FastifyInstance } from "fastify";
import { config } from "../../config.js";
import {
  verifyRefreshToken,
  createRefreshToken
} from "../../lib/refresh-tokens.js";
import { getUserWithPermissions } from "../../services/auth-postgres.js";
import { buildJwtPayloadFromPostgres } from "../../services/auth-postgres.js";
import { createAuthRateLimitConfig } from "./shared.js";

export function registerRefreshRoute(app: FastifyInstance) {
  const rateLimit = createAuthRateLimitConfig();

  app.post("/auth/refresh", {
    config: {
      rateLimit
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
    const refreshToken = req.cookies[config.cookies.refreshTokenName];

    if (!refreshToken) {
      return reply.code(401).send({ error: "No refresh token provided" });
    }

    const userId = await verifyRefreshToken(refreshToken);

    if (!userId) {
      reply.clearCookie(config.cookies.refreshTokenName);
      return reply.code(401).send({ error: "Invalid or expired refresh token" });
    }

    const userWithPermissions = await getUserWithPermissions(userId);

    if (!userWithPermissions) {
      reply.clearCookie(config.cookies.refreshTokenName);
      return reply.code(401).send({ error: "User not found" });
    }

    const jwtPayload = await buildJwtPayloadFromPostgres(userId);
    const token = await reply.jwtSign(jwtPayload, { expiresIn: config.jwt.accessTokenExpiry });
    const newRefreshToken = createRefreshToken(userId);

    reply.setCookie(config.cookies.refreshTokenName, newRefreshToken, {
      httpOnly: true,
      secure: config.environment === "production",
      sameSite: "lax",
      path: "/",
      maxAge: config.jwt.refreshTokenMaxAge
    });

    return { token };
  });
}
