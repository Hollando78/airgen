import type { FastifyInstance } from "fastify";
import type { AuthUser } from "../lib/authorization.js";
import { getErrorMessage } from "../lib/type-guards.js";
import {
  getTenantListForUser,
  isTenantOwner,
  createTenantWithOwner,
  deleteTenantWithCleanup,
  listTenantInvitations,
  inviteUserToTenant
} from "../services/TenantManagementService.js";
import {
  tenantParamSchema,
  createTenantSchema,
  createInvitationSchema
} from "../validation/core-routes.schemas.js";
import {
  listTenantsResponseSchema,
  createTenantRequestSchema,
  createTenantResponseSchema,
  deleteTenantResponseSchema,
  listInvitationsResponseSchema,
  createInvitationRequestSchema,
  createInvitationResponseSchema,
  errorResponseSchema
} from "../schemas/core-api.schemas.js";

/**
 * Tenant management routes
 *
 * Extracted from routes/core.ts for better organization
 */
export default async function registerTenantRoutes(app: FastifyInstance): Promise<void> {
  // List all tenants
  app.get("/tenants", {
    preHandler: [app.authenticate],
    schema: {
      tags: ["tenants"],
      summary: "List all tenants",
      description: "Retrieves all tenants with project counts",
      security: [{ bearerAuth: [] }],
      response: {
        200: listTenantsResponseSchema
      }
    }
  }, async (req) => {
    const user = req.currentUser as AuthUser | undefined;
    const tenants = await getTenantListForUser(user);
    return { tenants };
  });

  // Create a new tenant
  app.post("/tenants", {
    preHandler: [app.authenticate],
    schema: {
      tags: ["tenants"],
      summary: "Create a new tenant",
      description: "Creates a new tenant (admin only)",
      security: [{ bearerAuth: [] }],
      body: createTenantRequestSchema,
      response: {
        200: createTenantResponseSchema,
        401: errorResponseSchema,
        400: errorResponseSchema,
        403: errorResponseSchema,
        500: errorResponseSchema
      }
    }
  }, async (req, reply) => {
    const user = req.currentUser as AuthUser | undefined;
    if (!user) {
      return reply.status(401).send({ error: "Authentication required" });
    }

    const body = createTenantSchema.parse(req.body);

    try {
      const tenant = await createTenantWithOwner(body, user.sub);
      return { tenant };
    } catch (error) {
      return reply.status(400).send({ error: getErrorMessage(error) });
    }
  });

  // List tenant invitations
  app.get("/tenants/:tenant/invitations", {
    preHandler: [app.authenticate],
    schema: {
      tags: ["tenants"],
      summary: "List tenant invitations",
      description: "Lists invitations issued for a tenant (owner only)",
      security: [{ bearerAuth: [] }],
      params: {
        type: "object",
        required: ["tenant"],
        properties: {
          tenant: { type: "string", description: "Tenant slug" }
        }
      },
      response: {
        200: listInvitationsResponseSchema,
        401: errorResponseSchema,
        403: errorResponseSchema
      }
    }
  }, async (req, reply) => {
    const user = req.currentUser as AuthUser | undefined;
    if (!user) {
      return reply.status(401).send({ error: "Authentication required" });
    }

    const params = tenantParamSchema.parse(req.params);

    if (!isTenantOwner(user, params.tenant)) {
      return reply.status(403).send({ error: "Only the tenant owner can view invitations" });
    }

    const invitations = await listTenantInvitations(params.tenant);
    return { invitations };
  });

  // Create tenant invitation
  app.post("/tenants/:tenant/invitations", {
    preHandler: [app.authenticate],
    schema: {
      tags: ["tenants"],
      summary: "Invite user to tenant",
      description: "Send an invitation to join a tenant (owner only)",
      security: [{ bearerAuth: [] }],
      params: {
        type: "object",
        required: ["tenant"],
        properties: {
          tenant: { type: "string", description: "Tenant slug" }
        }
      },
      body: createInvitationRequestSchema,
      response: {
        200: createInvitationResponseSchema,
        401: errorResponseSchema,
        400: errorResponseSchema,
        403: errorResponseSchema,
        409: errorResponseSchema,
        500: errorResponseSchema
      }
    }
  }, async (req, reply) => {
    const user = req.currentUser as AuthUser | undefined;
    if (!user) {
      return reply.status(401).send({ error: "Authentication required" });
    }

    const params = tenantParamSchema.parse(req.params);

    if (!isTenantOwner(user, params.tenant)) {
      return reply.status(403).send({ error: "Only the tenant owner can send invitations" });
    }

    const body = createInvitationSchema.parse(req.body);

    try {
      const invitation = await inviteUserToTenant(params.tenant, body.email, {
        userId: user.sub,
        email: user.email,
        name: user.name
      });
      return { invitation };
    } catch (error) {
      const message = getErrorMessage(error);
      const statusCode = message.includes("already has access") ? 409 : 400;
      return reply.status(statusCode).send({ error: message });
    }
  });

  // Delete a tenant
  app.delete("/tenants/:tenant", {
    preHandler: [app.authenticate],
    schema: {
      tags: ["tenants"],
      summary: "Delete a tenant",
      description: "Deletes a tenant and all associated data (owner only)",
      security: [{ bearerAuth: [] }],
      params: {
        type: "object",
        required: ["tenant"],
        properties: {
          tenant: { type: "string", description: "Tenant slug" }
        }
      },
      response: {
        200: deleteTenantResponseSchema,
        401: errorResponseSchema,
        403: errorResponseSchema,
        404: errorResponseSchema,
        500: errorResponseSchema
      }
    }
  }, async (req, reply) => {
    const user = req.currentUser as AuthUser | undefined;
    if (!user) {
      return reply.status(401).send({ error: "Authentication required" });
    }

    const params = tenantParamSchema.parse(req.params);

    if (!isTenantOwner(user, params.tenant)) {
      return reply.status(403).send({ error: "Only the tenant owner can delete this tenant" });
    }

    const success = await deleteTenantWithCleanup(params.tenant);
    if (!success) {
      return reply.status(404).send({ error: "Tenant not found" });
    }

    return { success: true };
  });
}
