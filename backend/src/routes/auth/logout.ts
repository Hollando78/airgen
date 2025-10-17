import type { FastifyInstance } from "fastify";
import { config } from "../../config.js";
import { revokeRefreshToken } from "../../lib/refresh-tokens.js";

export function registerLogoutRoute(app: FastifyInstance) {
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
    const refreshToken = req.cookies[config.cookies.refreshTokenName];
    if (refreshToken) {
      await revokeRefreshToken(refreshToken);
    }

    if (req.currentUser) {
      app.log.info({
        event: "auth.logout",
        userId: req.currentUser.sub,
        email: req.currentUser.email,
        ip: req.ip
      }, "User logged out");
    }

    reply.clearCookie(config.cookies.refreshTokenName);

    return { message: "Logged out successfully" };
  });
}
