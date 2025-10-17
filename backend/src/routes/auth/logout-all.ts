import type { FastifyInstance } from "fastify";
import { config } from "../../config.js";
import { revokeAllUserTokens } from "../../lib/refresh-tokens.js";

export function registerLogoutAllRoute(app: FastifyInstance) {
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
    if (!req.currentUser) {
      return reply.code(401).send({ error: "User not authenticated" });
    }

    await revokeAllUserTokens(req.currentUser.sub);
    reply.clearCookie(config.cookies.refreshTokenName);

    return { message: "Logged out from all devices" };
  });
}
