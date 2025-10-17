import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { acceptTenantInvitation, findInvitationByToken } from "../../services/tenant-invitations.js";
import { config } from "../../config.js";
import { PermissionRepository } from "../../repositories/PermissionRepository.js";
import { UserRole } from "../../types/roles.js";
import { buildJwtPayloadFromPostgres } from "../../services/auth-postgres.js";
import { userRepository } from "../../repositories/UserRepository.js";

export function registerAcceptInvitationRoute(app: FastifyInstance) {
  const permRepo = new PermissionRepository();
  app.post("/auth/invitations/accept", {
    preHandler: [app.authenticate],
    schema: {
      tags: ["authentication"],
      summary: "Accept tenant invitation",
      description: "Accept a tenant invitation using the provided token",
      security: [{ bearerAuth: [] }],
      body: {
        type: "object",
        required: ["token"],
        properties: {
          token: { type: "string", description: "Invitation token" }
        }
      },
      response: {
        200: {
          type: "object",
          properties: {
            message: { type: "string" },
            tenantSlug: { type: "string" },
            token: { type: "string" },
            user: {
              type: "object",
              properties: {
                id: { type: "string" },
                email: { type: "string" },
                name: { type: "string", nullable: true },
                roles: { type: "array", items: { type: "string" } },
                tenantSlugs: { type: "array", items: { type: "string" } },
                ownedTenantSlugs: { type: "array", items: { type: "string" } }
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
        403: {
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
        500: {
          type: "object",
          properties: {
            error: { type: "string" }
          }
        }
      }
    }
  }, async (req, reply) => {
    if (!req.currentUser) {
      return reply.status(401).send({ error: "Authentication required" });
    }

    const schema = z.object({ token: z.string().uuid() });
    const { token } = schema.parse(req.body);

    const invitation = await findInvitationByToken(token);
    if (!invitation || invitation.status !== "pending") {
      return reply.status(400).send({ error: "Invitation is invalid or no longer available" });
    }

    const currentEmail = req.currentUser.email?.toLowerCase();
    if (!currentEmail || currentEmail !== invitation.email) {
      return reply.status(403).send({ error: "This invitation is for a different user" });
    }

    const accepted = await acceptTenantInvitation(token);
    if (!accepted) {
      return reply.status(400).send({ error: "Unable to accept invitation" });
    }

    const user = await userRepository.findById(req.currentUser.sub);
    if (!user) {
      return reply.status(500).send({ error: "Failed to load user" });
    }

    await permRepo.grantPermission({
      userId: user.id,
      scopeType: "tenant",
      scopeId: accepted.tenantSlug,
      role: UserRole.ADMIN,
      isOwner: false
    });

    const jwtPayload = await buildJwtPayloadFromPostgres(user.id);
    const accessToken = await reply.jwtSign(jwtPayload, { expiresIn: config.jwt.accessTokenExpiry });

    return {
      message: "Invitation accepted",
      tenantSlug: accepted.tenantSlug,
      token: accessToken,
      user: jwtPayload
    };
  });
}
