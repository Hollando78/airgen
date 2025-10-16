/**
 * Tenant-Admin Routes
 *
 * Tenant-scoped administration routes accessible to Tenant-Admin users.
 * These routes provide access to users and projects within a specific tenant.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { config } from "../config.js";
import {
  listDevUsers,
  getDevUser,
  updateDevUser,
  type DevUserRecord
} from "../services/dev-users.js";
import {
  requireTenantAdmin,
  type AuthUser,
  createRequireTenantAdminMiddleware
} from "../lib/authorization.js";
import { UserRole } from "../types/roles.js";
import type { UserPermissions, ProjectPermission } from "../types/permissions.js";
import { listProjects } from "../services/graph/requirements/index.js";
import {
  sendTenantAccessChangedEmail,
  sendRoleChangedEmail
} from "../lib/email.js";
import * as rbac from "../lib/rbac.js";
import { slugify } from "../services/workspace.js";

/**
 * Sanitized user type (excludes sensitive fields)
 */
type SanitizedDevUser = Omit<DevUserRecord, "password" | "passwordHash" | "passwordSalt" | "mfaSecret" | "mfaBackupCodes">;

/**
 * User info within a tenant context
 */
interface TenantUserInfo extends SanitizedDevUser {
  tenantRole?: UserRole;
  isOwner?: boolean;
  projectRoles: Array<{ projectKey: string; role: UserRole }>;
}

/**
 * Sanitize user record for API response
 */
function sanitizeUser(user: DevUserRecord): SanitizedDevUser {
  const { password, passwordHash, passwordSalt, mfaSecret, mfaBackupCodes, ...sanitized } = user;
  return sanitized;
}

/**
 * Get user info within a tenant context
 */
function getTenantUserInfo(user: DevUserRecord, tenantSlug: string): TenantUserInfo {
  const sanitized = sanitizeUser(user);
  const permissions = rbac.getEffectivePermissions(user);
  const normalizedTenant = slugify(tenantSlug);

  const tenantPermission = permissions.tenantPermissions?.[normalizedTenant];
  const projectRoles: Array<{ projectKey: string; role: UserRole }> = [];

  // Extract project roles for this tenant
  if (permissions.projectPermissions?.[normalizedTenant]) {
    for (const [projectKey, permission] of Object.entries(permissions.projectPermissions[normalizedTenant])) {
      projectRoles.push({
        projectKey,
        role: permission.role
      });
    }
  }

  return {
    ...sanitized,
    tenantRole: tenantPermission?.role,
    isOwner: tenantPermission?.isOwner,
    projectRoles
  };
}

/**
 * Zod schemas for validation
 */
const grantTenantAccessSchema = z.object({
  userId: z.string().uuid(),
  role: z.nativeEnum(UserRole),
  isOwner: z.boolean().optional()
});

const grantProjectAccessSchema = z.object({
  userId: z.string().uuid(),
  projectKey: z.string(),
  role: z.nativeEnum(UserRole)
});

const revokeProjectAccessSchema = z.object({
  userId: z.string().uuid(),
  projectKey: z.string()
});

/**
 * Register Tenant-Admin routes
 */
export default async function registerTenantAdminRoutes(app: FastifyInstance): Promise<void> {
  if (!config.features.adminRoutesEnabled) {
    app.log.debug("Tenant-Admin routes disabled via configuration");
    return;
  }

  // Tenant-admin middleware factory
  const requireTenantAdminAuth = createRequireTenantAdminMiddleware("tenant");

  /**
   * GET /api/tenant-admin/:tenant/users
   * List all users with access to this tenant
   */
  app.get<{ Params: { tenant: string } }>("/tenant-admin/:tenant/users", {
    preHandler: [app.authenticate, requireTenantAdminAuth],
    schema: {
      tags: ["tenant-admin"],
      summary: "List tenant users",
      description: "Lists all users with access to this tenant (Tenant-Admin only)",
      security: [{ bearerAuth: [] }],
      params: {
        type: "object",
        required: ["tenant"],
        properties: {
          tenant: { type: "string", description: "Tenant slug" }
        }
      },
      response: {
        200: {
          type: "object",
          properties: {
            users: {
              type: "array",
              items: { type: "object" }
            }
          }
        }
      }
    }
  }, async (req) => {
    const tenantSlug = slugify(req.params.tenant);
    const allUsers = await listDevUsers();

    // Filter users who have access to this tenant
    const tenantUsers = allUsers.filter(user => {
      const access = rbac.hasTenantAccess(user, tenantSlug);
      return access.granted;
    });

    return { users: tenantUsers.map(user => getTenantUserInfo(user, tenantSlug)) };
  });

  /**
   * GET /api/tenant-admin/:tenant/users/:id
   * Get detailed information about a user within the tenant context
   */
  app.get<{ Params: { tenant: string; id: string } }>("/tenant-admin/:tenant/users/:id", {
    preHandler: [app.authenticate, requireTenantAdminAuth],
    schema: {
      tags: ["tenant-admin"],
      summary: "Get tenant user details",
      description: "Get detailed information about a user within the tenant context (Tenant-Admin only)",
      security: [{ bearerAuth: [] }],
      params: {
        type: "object",
        required: ["tenant", "id"],
        properties: {
          tenant: { type: "string", description: "Tenant slug" },
          id: { type: "string", description: "User ID" }
        }
      },
      response: {
        200: {
          type: "object",
          properties: {
            user: { type: "object" }
          }
        },
        403: {
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
    const tenantSlug = slugify(req.params.tenant);
    const user = await getDevUser(req.params.id);

    if (!user) {
      return reply.status(404).send({ error: "User not found" });
    }

    // Verify user has access to this tenant
    const access = rbac.hasTenantAccess(user, tenantSlug);
    if (!access.granted) {
      return reply.status(403).send({
        error: "This user does not have access to this tenant"
      });
    }

    return { user: getTenantUserInfo(user, tenantSlug) };
  });

  /**
   * POST /api/tenant-admin/:tenant/users/:id/grant-access
   * Grant tenant-level access to a user
   */
  app.post<{ Params: { tenant: string; id: string } }>("/tenant-admin/:tenant/users/:id/grant-access", {
    preHandler: [app.authenticate, requireTenantAdminAuth],
    schema: {
      tags: ["tenant-admin"],
      summary: "Grant tenant access to user",
      description: "Grant tenant-level access to a user (Tenant-Admin only)",
      security: [{ bearerAuth: [] }],
      params: {
        type: "object",
        required: ["tenant", "id"],
        properties: {
          tenant: { type: "string", description: "Tenant slug" },
          id: { type: "string", description: "User ID" }
        }
      },
      body: {
        type: "object",
        required: ["role"],
        properties: {
          role: { type: "string", enum: Object.values(UserRole) },
          isOwner: { type: "boolean" }
        }
      },
      response: {
        200: {
          type: "object",
          properties: {
            user: { type: "object" }
          }
        },
        400: {
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
    const body = grantTenantAccessSchema.parse(req.body);
    const tenantSlug = slugify(req.params.tenant);
    const currentUser = req.currentUser as AuthUser;

    // Tenant-admins cannot grant Super-Admin or Tenant-Admin roles
    if (body.role === UserRole.SUPER_ADMIN || body.role === UserRole.TENANT_ADMIN) {
      return reply.status(400).send({
        error: "Tenant-Admins cannot grant Super-Admin or Tenant-Admin roles"
      });
    }

    const user = await getDevUser(req.params.id);
    if (!user) {
      return reply.status(404).send({ error: "User not found" });
    }

    const permissions = rbac.getEffectivePermissions(user);
    if (!permissions.tenantPermissions) {
      permissions.tenantPermissions = {};
    }

    const hadAccess = rbac.hasTenantAccess(user, tenantSlug).granted;

    // Grant or update tenant permission
    permissions.tenantPermissions[tenantSlug] = {
      role: body.role,
      isOwner: body.isOwner,
      grantedAt: new Date().toISOString(),
      grantedBy: currentUser.sub
    };

    const updated = await updateDevUser(req.params.id, { permissions });
    if (!updated) {
      return reply.status(404).send({ error: "Failed to update user" });
    }

    // Send notification email if this is new access
    if (!hadAccess) {
      sendTenantAccessChangedEmail(
        updated.email,
        updated.name ?? undefined,
        [tenantSlug],
        []
      ).catch(emailError => {
        req.log.error({ err: emailError }, "Failed to send tenant access email");
      });
    }

    return { user: getTenantUserInfo(updated, tenantSlug) };
  });

  /**
   * POST /api/tenant-admin/:tenant/users/:id/revoke-access
   * Revoke tenant-level access from a user
   */
  app.post<{ Params: { tenant: string; id: string } }>("/tenant-admin/:tenant/users/:id/revoke-access", {
    preHandler: [app.authenticate, requireTenantAdminAuth],
    schema: {
      tags: ["tenant-admin"],
      summary: "Revoke tenant access from user",
      description: "Revoke tenant-level access from a user (Tenant-Admin only)",
      security: [{ bearerAuth: [] }],
      params: {
        type: "object",
        required: ["tenant", "id"],
        properties: {
          tenant: { type: "string", description: "Tenant slug" },
          id: { type: "string", description: "User ID" }
        }
      },
      response: {
        200: {
          type: "object",
          properties: {
            success: { type: "boolean" }
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
    const tenantSlug = slugify(req.params.tenant);
    const user = await getDevUser(req.params.id);

    if (!user) {
      return reply.status(404).send({ error: "User not found" });
    }

    const permissions = rbac.getEffectivePermissions(user);

    // Remove tenant permission
    if (permissions.tenantPermissions) {
      delete permissions.tenantPermissions[tenantSlug];
    }

    // Remove all project permissions for this tenant
    if (permissions.projectPermissions?.[tenantSlug]) {
      delete permissions.projectPermissions[tenantSlug];
    }

    const updated = await updateDevUser(req.params.id, { permissions });
    if (!updated) {
      return reply.status(404).send({ error: "Failed to update user" });
    }

    // Send notification email
    sendTenantAccessChangedEmail(
      updated.email,
      updated.name ?? undefined,
      [],
      [tenantSlug]
    ).catch(emailError => {
      req.log.error({ err: emailError }, "Failed to send tenant access email");
    });

    return { success: true };
  });

  /**
   * POST /api/tenant-admin/:tenant/projects/:project/grant-access
   * Grant project-level access to a user
   */
  app.post<{ Params: { tenant: string; project: string } }>("/tenant-admin/:tenant/projects/:project/grant-access", {
    preHandler: [app.authenticate, requireTenantAdminAuth],
    schema: {
      tags: ["tenant-admin"],
      summary: "Grant project access to user",
      description: "Grant project-level access to a user (Tenant-Admin only)",
      security: [{ bearerAuth: [] }],
      params: {
        type: "object",
        required: ["tenant", "project"],
        properties: {
          tenant: { type: "string", description: "Tenant slug" },
          project: { type: "string", description: "Project key" }
        }
      },
      body: {
        type: "object",
        required: ["userId", "role"],
        properties: {
          userId: { type: "string", format: "uuid" },
          projectKey: { type: "string" },
          role: { type: "string", enum: Object.values(UserRole) }
        }
      },
      response: {
        200: {
          type: "object",
          properties: {
            user: { type: "object" }
          }
        },
        400: {
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
    const body = grantProjectAccessSchema.parse(req.body);
    const tenantSlug = slugify(req.params.tenant);
    const projectKey = slugify(req.params.project);
    const currentUser = req.currentUser as AuthUser;

    // Tenant-admins cannot grant Super-Admin or Tenant-Admin roles
    if (body.role === UserRole.SUPER_ADMIN || body.role === UserRole.TENANT_ADMIN) {
      return reply.status(400).send({
        error: "Tenant-Admins cannot grant Super-Admin or Tenant-Admin roles"
      });
    }

    const user = await getDevUser(body.userId);
    if (!user) {
      return reply.status(404).send({ error: "User not found" });
    }

    const permissions = rbac.getEffectivePermissions(user);
    if (!permissions.projectPermissions) {
      permissions.projectPermissions = {};
    }
    if (!permissions.projectPermissions[tenantSlug]) {
      permissions.projectPermissions[tenantSlug] = {};
    }

    // Grant project permission
    permissions.projectPermissions[tenantSlug][projectKey] = {
      role: body.role,
      grantedAt: new Date().toISOString(),
      grantedBy: currentUser.sub
    };

    const updated = await updateDevUser(body.userId, { permissions });
    if (!updated) {
      return reply.status(404).send({ error: "Failed to update user" });
    }

    return { user: getTenantUserInfo(updated, tenantSlug) };
  });

  /**
   * POST /api/tenant-admin/:tenant/projects/:project/revoke-access
   * Revoke project-level access from a user
   */
  app.post<{ Params: { tenant: string; project: string } }>("/tenant-admin/:tenant/projects/:project/revoke-access", {
    preHandler: [app.authenticate, requireTenantAdminAuth],
    schema: {
      tags: ["tenant-admin"],
      summary: "Revoke project access from user",
      description: "Revoke project-level access from a user (Tenant-Admin only)",
      security: [{ bearerAuth: [] }],
      params: {
        type: "object",
        required: ["tenant", "project"],
        properties: {
          tenant: { type: "string", description: "Tenant slug" },
          project: { type: "string", description: "Project key" }
        }
      },
      body: {
        type: "object",
        required: ["userId", "projectKey"],
        properties: {
          userId: { type: "string", format: "uuid" },
          projectKey: { type: "string" }
        }
      },
      response: {
        200: {
          type: "object",
          properties: {
            success: { type: "boolean" }
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
    const body = revokeProjectAccessSchema.parse(req.body);
    const tenantSlug = slugify(req.params.tenant);
    const projectKey = slugify(req.params.project);

    const user = await getDevUser(body.userId);
    if (!user) {
      return reply.status(404).send({ error: "User not found" });
    }

    const permissions = rbac.getEffectivePermissions(user);

    // Remove project permission
    if (permissions.projectPermissions?.[tenantSlug]) {
      delete permissions.projectPermissions[tenantSlug][projectKey];

      // Clean up empty tenant entry
      if (Object.keys(permissions.projectPermissions[tenantSlug]).length === 0) {
        delete permissions.projectPermissions[tenantSlug];
      }
    }

    const updated = await updateDevUser(body.userId, { permissions });
    if (!updated) {
      return reply.status(404).send({ error: "Failed to update user" });
    }

    return { success: true };
  });

  /**
   * GET /api/tenant-admin/:tenant/projects
   * List all projects in this tenant
   */
  app.get<{ Params: { tenant: string } }>("/tenant-admin/:tenant/projects", {
    preHandler: [app.authenticate, requireTenantAdminAuth],
    schema: {
      tags: ["tenant-admin"],
      summary: "List tenant projects",
      description: "Lists all projects in this tenant (Tenant-Admin only)",
      security: [{ bearerAuth: [] }],
      params: {
        type: "object",
        required: ["tenant"],
        properties: {
          tenant: { type: "string", description: "Tenant slug" }
        }
      },
      response: {
        200: {
          type: "object",
          properties: {
            projects: {
              type: "array",
              items: { type: "object" }
            }
          }
        }
      }
    }
  }, async (req) => {
    const tenantSlug = slugify(req.params.tenant);
    const projects = await listProjects(tenantSlug);
    return { projects };
  });

  app.log.info("Tenant-Admin routes registered at /api/tenant-admin/:tenant/*");
}
