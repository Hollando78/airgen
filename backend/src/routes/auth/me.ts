import type { FastifyInstance } from "fastify";

export function registerCurrentUserRoute(app: FastifyInstance) {
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
                tenantSlugs: { type: "array", items: { type: "string" } },
                ownedTenantSlugs: { type: "array", items: { type: "string" }, nullable: true },
                permissions: { type: "object", nullable: true }
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

    return {
      user: {
        id: req.currentUser.sub,
        email: req.currentUser.email,
        name: req.currentUser.name,
        roles: Array.isArray(req.currentUser.roles) ? req.currentUser.roles : [],
        tenantSlugs: Array.isArray(req.currentUser.tenantSlugs) ? req.currentUser.tenantSlugs : [],
        ownedTenantSlugs: Array.isArray(req.currentUser.ownedTenantSlugs) ? req.currentUser.ownedTenantSlugs : [],
        permissions: req.currentUser.permissions
      }
    };
  });
}
