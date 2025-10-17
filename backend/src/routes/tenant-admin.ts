import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { config } from "../config.js";
import {
  createRequireTenantAdminMiddleware,
  type AuthUser
} from "../lib/authorization.js";
import { PermissionRepository } from "../repositories/PermissionRepository.js";
import { userRepository } from "../repositories/UserRepository.js";
import { UserRole } from "../types/roles.js";
import { buildUserResponse } from "./helpers/user-response.js";

const permRepo = new PermissionRepository();

const tenantRoleSchema = z.object({
  role: z.nativeEnum(UserRole),
  isOwner: z.boolean().optional()
});

const projectGrantSchema = z.object({
  userId: z.string().uuid(),
  role: z.nativeEnum(UserRole)
});

const projectRevokeSchema = z.object({
  userId: z.string().uuid()
});

export default async function registerTenantAdminRoutes(app: FastifyInstance): Promise<void> {
  if (!config.features.adminRoutesEnabled) {
    app.log.debug("Tenant-Admin routes disabled via configuration");
    return;
  }

  const requireTenantAdminAuth = createRequireTenantAdminMiddleware("tenant");

  app.get("/tenant-admin/:tenant/users", {
    preHandler: [app.authenticate, requireTenantAdminAuth],
    schema: {
      tags: ["tenant-admin"],
      summary: "List tenant users",
      description: "List users with access to the tenant",
      params: {
        type: "object",
        required: ["tenant"],
        properties: {
          tenant: { type: "string" }
        }
      }
    }
  }, async (req) => {
    const { tenant } = req.params as { tenant: string };
    const tenantUsers = await permRepo.listUsersInTenant(tenant);
    const summaries = await Promise.all(tenantUsers.map(user => buildUserResponse(user.id)));
    return { users: summaries.filter((summary): summary is NonNullable<typeof summary> => Boolean(summary)) };
  });

  app.get("/tenant-admin/:tenant/users/:id", {
    preHandler: [app.authenticate, requireTenantAdminAuth],
    schema: {
      tags: ["tenant-admin"],
      summary: "Get tenant user",
      description: "Get user details within tenant context",
      params: {
        type: "object",
        required: ["tenant", "id"],
        properties: {
          tenant: { type: "string" },
          id: { type: "string" }
        }
      }
    }
  }, async (req, reply) => {
    const { tenant, id } = req.params as { tenant: string; id: string };

    const summary = await buildUserResponse(id);
    if (!summary) {
      return reply.status(404).send({ error: "User not found" });
    }

    const permissions = summary.permissions.tenantPermissions ?? {};
    if (!permissions[tenant] && summary.permissions.globalRole !== UserRole.SUPER_ADMIN) {
      return reply.status(403).send({ error: "User does not belong to this tenant" });
    }

    return { user: summary };
  });

  app.post("/tenant-admin/:tenant/users/:id/grant-access", {
    preHandler: [app.authenticate, requireTenantAdminAuth],
    schema: {
      tags: ["tenant-admin"],
      summary: "Grant tenant access",
      description: "Grant tenant-level access to a user",
      params: {
        type: "object",
        required: ["tenant", "id"],
        properties: {
          tenant: { type: "string" },
          id: { type: "string" }
        }
      }
    }
  }, async (req, reply) => {
    const { tenant, id } = req.params as { tenant: string; id: string };
    const body = tenantRoleSchema.parse(req.body);

    const user = await userRepository.findById(id);
    if (!user) {
      return reply.status(404).send({ error: "User not found" });
    }

    await permRepo.grantPermission({
      userId: id,
      scopeType: "tenant",
      scopeId: tenant,
      role: body.role,
      isOwner: body.isOwner ?? false,
      grantedBy: (req.currentUser as AuthUser | undefined)?.sub
    });

    const summary = await buildUserResponse(id);
    return { user: summary };
  });

  app.post("/tenant-admin/:tenant/users/:id/revoke-access", {
    preHandler: [app.authenticate, requireTenantAdminAuth],
    schema: {
      tags: ["tenant-admin"],
      summary: "Revoke tenant access",
      description: "Remove tenant-level access from a user",
      params: {
        type: "object",
        required: ["tenant", "id"],
        properties: {
          tenant: { type: "string" },
          id: { type: "string" }
        }
      }
    }
  }, async (req, reply) => {
    const { tenant, id } = req.params as { tenant: string; id: string };

    const user = await userRepository.findById(id);
    if (!user) {
      return reply.status(404).send({ error: "User not found" });
    }

    await permRepo.removeTenantPermissionsForUser(id, tenant);

    const summary = await buildUserResponse(id);
    return { user: summary };
  });

  app.post("/tenant-admin/:tenant/projects/:project/grant-access", {
    preHandler: [app.authenticate, requireTenantAdminAuth],
    schema: {
      tags: ["tenant-admin"],
      summary: "Grant project access",
      description: "Grant project-level access to a user",
      params: {
        type: "object",
        required: ["tenant", "project"],
        properties: {
          tenant: { type: "string" },
          project: { type: "string" }
        }
      }
    }
  }, async (req, reply) => {
    const { tenant, project } = req.params as { tenant: string; project: string };
    const { userId, role } = projectGrantSchema.parse(req.body);

    const user = await userRepository.findById(userId);
    if (!user) {
      return reply.status(404).send({ error: "User not found" });
    }

    await permRepo.grantPermission({
      userId,
      scopeType: "project",
      scopeId: `${tenant}:${project}`,
      role,
      grantedBy: (req.currentUser as AuthUser | undefined)?.sub
    });

    const summary = await buildUserResponse(userId);
    return { user: summary };
  });

  app.post("/tenant-admin/:tenant/projects/:project/revoke-access", {
    preHandler: [app.authenticate, requireTenantAdminAuth],
    schema: {
      tags: ["tenant-admin"],
      summary: "Revoke project access",
      description: "Remove project-level access from a user",
      params: {
        type: "object",
        required: ["tenant", "project"],
        properties: {
          tenant: { type: "string" },
          project: { type: "string" }
        }
      }
    }
  }, async (req, reply) => {
    const { tenant, project } = req.params as { tenant: string; project: string };
    const { userId } = projectRevokeSchema.parse(req.body);

    const user = await userRepository.findById(userId);
    if (!user) {
      return reply.status(404).send({ error: "User not found" });
    }

    await permRepo.revokePermission(userId, "project", `${tenant}:${project}`);

    const summary = await buildUserResponse(userId);
    return { user: summary };
  });
}
