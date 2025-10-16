/**
 * Super-Admin Routes
 *
 * System-wide administration routes accessible only to Super-Admin users.
 * These routes provide access to all tenants, users, and system configuration.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { config } from "../config.js";
import {
  listDevUsers,
  getDevUser,
  updateDevUser,
  createDevUser,
  deleteDevUser,
  type DevUserRecord
} from "../services/dev-users.js";
import { requireSuperAdminMiddleware, type AuthUser } from "../lib/authorization.js";
import { UserRole } from "../types/roles.js";
import type { UserPermissions, TenantPermission, ProjectPermission } from "../types/permissions.js";
import { listTenants } from "../services/graph/requirements/index.js";
import {
  sendAdminCreatedAccountEmail,
  sendTenantAccessChangedEmail,
  sendRoleChangedEmail
} from "../lib/email.js";
import * as rbac from "../lib/rbac.js";

/**
 * Sanitized user type (excludes sensitive fields)
 */
type SanitizedDevUser = Omit<DevUserRecord, "password" | "passwordHash" | "passwordSalt" | "mfaSecret" | "mfaBackupCodes">;

/**
 * Enhanced sanitized user with computed role information
 */
interface EnhancedUserInfo extends SanitizedDevUser {
  effectiveRoles: {
    globalRole?: UserRole;
    tenantRoles: Array<{ tenantSlug: string; role: UserRole; isOwner?: boolean }>;
    projectRoles: Array<{ tenantSlug: string; projectKey: string; role: UserRole }>;
  };
}

/**
 * Sanitize user record for API response
 */
function sanitizeUser(user: DevUserRecord): SanitizedDevUser {
  const { password, passwordHash, passwordSalt, mfaSecret, mfaBackupCodes, ...sanitized } = user;
  return sanitized;
}

/**
 * Enhance user record with computed role information
 */
function enhanceUserInfo(user: DevUserRecord): EnhancedUserInfo {
  const sanitized = sanitizeUser(user);
  const permissions = rbac.getEffectivePermissions(user);

  const tenantRoles: Array<{ tenantSlug: string; role: UserRole; isOwner?: boolean }> = [];
  const projectRoles: Array<{ tenantSlug: string; projectKey: string; role: UserRole }> = [];

  // Extract tenant roles
  if (permissions.tenantPermissions) {
    for (const [tenantSlug, permission] of Object.entries(permissions.tenantPermissions)) {
      tenantRoles.push({
        tenantSlug,
        role: permission.role,
        isOwner: permission.isOwner
      });
    }
  }

  // Extract project roles
  if (permissions.projectPermissions) {
    for (const [tenantSlug, projects] of Object.entries(permissions.projectPermissions)) {
      for (const [projectKey, permission] of Object.entries(projects)) {
        projectRoles.push({
          tenantSlug,
          projectKey,
          role: permission.role
        });
      }
    }
  }

  return {
    ...sanitized,
    effectiveRoles: {
      globalRole: permissions.globalRole,
      tenantRoles,
      projectRoles
    }
  };
}

/**
 * Zod schemas for validation
 */
const updatePermissionsSchema = z.object({
  permissions: z.object({
    globalRole: z.nativeEnum(UserRole).optional(),
    tenantPermissions: z.record(z.string(), z.object({
      role: z.nativeEnum(UserRole),
      isOwner: z.boolean().optional(),
      grantedAt: z.string().optional(),
      grantedBy: z.string().optional()
    })).optional(),
    projectPermissions: z.record(z.string(), z.record(z.string(), z.object({
      role: z.nativeEnum(UserRole),
      grantedAt: z.string().optional(),
      grantedBy: z.string().optional()
    }))).optional()
  })
});

const grantPermissionSchema = z.object({
  userId: z.string().uuid(),
  role: z.nativeEnum(UserRole),
  tenantSlug: z.string().optional(),
  projectKey: z.string().optional()
});

const createUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).optional(),
  password: z.string().min(8).optional(),
  permissions: z.object({
    globalRole: z.nativeEnum(UserRole).optional(),
    tenantPermissions: z.record(z.string(), z.object({
      role: z.nativeEnum(UserRole),
      isOwner: z.boolean().optional()
    })).optional(),
    projectPermissions: z.record(z.string(), z.record(z.string(), z.object({
      role: z.nativeEnum(UserRole)
    }))).optional()
  }).optional()
});

/**
 * Register Super-Admin routes
 */
export default async function registerSuperAdminRoutes(app: FastifyInstance): Promise<void> {
  if (!config.features.adminRoutesEnabled) {
    app.log.debug("Super-Admin routes disabled via configuration");
    return;
  }

  // All super-admin routes require super-admin authentication
  const preHandler = [app.authenticate, requireSuperAdminMiddleware];

  /**
   * GET /api/super-admin/users
   * List all users across all tenants with enhanced role information
   */
  app.get("/super-admin/users", {
    preHandler,
    schema: {
      tags: ["super-admin"],
      summary: "List all users",
      description: "Lists all users across all tenants with detailed role information (Super-Admin only)",
      security: [{ bearerAuth: [] }],
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
  }, async () => {
    const users = await listDevUsers();
    return { users: users.map(enhanceUserInfo) };
  });

  /**
   * GET /api/super-admin/users/:id
   * Get detailed information about a specific user
   */
  app.get<{ Params: { id: string } }>("/super-admin/users/:id", {
    preHandler,
    schema: {
      tags: ["super-admin"],
      summary: "Get user details",
      description: "Get detailed information about a specific user (Super-Admin only)",
      security: [{ bearerAuth: [] }],
      params: {
        type: "object",
        required: ["id"],
        properties: {
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
        404: {
          type: "object",
          properties: {
            error: { type: "string" }
          }
        }
      }
    }
  }, async (req, reply) => {
    const user = await getDevUser(req.params.id);
    if (!user) {
      return reply.status(404).send({ error: "User not found" });
    }
    return { user: enhanceUserInfo(user) };
  });

  /**
   * POST /api/super-admin/users
   * Create a new user with new permission structure
   */
  app.post("/super-admin/users", {
    preHandler,
    schema: {
      tags: ["super-admin"],
      summary: "Create a new user",
      description: "Create a new user with granular permissions (Super-Admin only)",
      security: [{ bearerAuth: [] }],
      body: {
        type: "object",
        required: ["email"],
        properties: {
          email: { type: "string", format: "email" },
          name: { type: "string" },
          password: { type: "string", minLength: 8 },
          permissions: {
            type: "object",
            properties: {
              globalRole: { type: "string", enum: Object.values(UserRole) },
              tenantPermissions: { type: "object" },
              projectPermissions: { type: "object" }
            }
          }
        }
      },
      response: {
        200: {
          type: "object",
          properties: {
            user: { type: "object" }
          }
        },
        409: {
          type: "object",
          properties: {
            error: { type: "string" }
          }
        }
      }
    }
  }, async (req, reply) => {
    const body = createUserSchema.parse(req.body);
    const currentUser = req.currentUser as AuthUser;

    try {
      // Prepare new permissions with grantedBy metadata
      const permissions: UserPermissions | undefined = body.permissions ? {
        globalRole: body.permissions.globalRole === UserRole.SUPER_ADMIN ? UserRole.SUPER_ADMIN : undefined,
        tenantPermissions: body.permissions.tenantPermissions ?
          Object.fromEntries(
            Object.entries(body.permissions.tenantPermissions).map(([slug, perm]) => [
              slug,
              {
                ...perm,
                grantedAt: new Date().toISOString(),
                grantedBy: currentUser.sub
              }
            ])
          ) : undefined,
        projectPermissions: body.permissions.projectPermissions ?
          Object.fromEntries(
            Object.entries(body.permissions.projectPermissions).map(([tenant, projects]) => [
              tenant,
              Object.fromEntries(
                Object.entries(projects).map(([project, perm]) => [
                  project,
                  {
                    ...perm,
                    grantedAt: new Date().toISOString(),
                    grantedBy: currentUser.sub
                  }
                ])
              )
            ])
          ) : undefined
      } : undefined;

      const user = await createDevUser({
        email: body.email,
        name: body.name,
        password: body.password,
        // Keep legacy fields empty for backward compatibility
        roles: [],
        tenantSlugs: []
      });

      // Update with new permissions structure
      const updated = await updateDevUser(user.id, {
        ...user,
        permissions
      });

      if (!updated) {
        return reply.status(409).send({ error: "Failed to update user permissions" });
      }

      // Send notification email
      const tenantSlugs = permissions?.tenantPermissions ? Object.keys(permissions.tenantPermissions) : [];
      sendAdminCreatedAccountEmail(
        updated.email,
        updated.name ?? undefined,
        tenantSlugs,
        permissions?.globalRole ? [permissions.globalRole] : []
      ).catch(emailError => {
        req.log.error({ err: emailError }, "Failed to send user creation email");
      });

      return { user: enhanceUserInfo(updated) };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EUSER_EXISTS") {
        return reply.status(409).send({ error: "User with this email already exists" });
      }
      throw error;
    }
  });

  /**
   * PATCH /api/super-admin/users/:id/permissions
   * Update a user's permissions using the new structure
   */
  app.patch<{ Params: { id: string } }>("/super-admin/users/:id/permissions", {
    preHandler,
    schema: {
      tags: ["super-admin"],
      summary: "Update user permissions",
      description: "Update a user's permissions with granular control (Super-Admin only)",
      security: [{ bearerAuth: [] }],
      params: {
        type: "object",
        required: ["id"],
        properties: {
          id: { type: "string", description: "User ID" }
        }
      },
      body: {
        type: "object",
        required: ["permissions"],
        properties: {
          permissions: {
            type: "object",
            properties: {
              globalRole: { type: "string", enum: Object.values(UserRole) },
              tenantPermissions: { type: "object" },
              projectPermissions: { type: "object" }
            }
          }
        }
      },
      response: {
        200: {
          type: "object",
          properties: {
            user: { type: "object" }
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
    const body = updatePermissionsSchema.parse(req.body);
    const currentUser = req.currentUser as AuthUser;

    const existing = await getDevUser(req.params.id);
    if (!existing) {
      return reply.status(404).send({ error: "User not found" });
    }

    // Add metadata to permissions
    const newPermissions: UserPermissions = {
      globalRole: body.permissions.globalRole === UserRole.SUPER_ADMIN ? UserRole.SUPER_ADMIN : undefined,
      tenantPermissions: body.permissions.tenantPermissions,
      projectPermissions: body.permissions.projectPermissions
    };

    // Add grantedBy to new tenant permissions
    if (newPermissions.tenantPermissions) {
      for (const [slug, perm] of Object.entries(newPermissions.tenantPermissions)) {
        if (!perm.grantedBy) {
          perm.grantedBy = currentUser.sub;
          perm.grantedAt = perm.grantedAt ?? new Date().toISOString();
        }
      }
    }

    // Add grantedBy to new project permissions
    if (newPermissions.projectPermissions) {
      for (const projects of Object.values(newPermissions.projectPermissions)) {
        for (const perm of Object.values(projects)) {
          if (!perm.grantedBy) {
            perm.grantedBy = currentUser.sub;
            perm.grantedAt = perm.grantedAt ?? new Date().toISOString();
          }
        }
      }
    }

    const updated = await updateDevUser(req.params.id, {
      permissions: newPermissions
    });

    if (!updated) {
      return reply.status(404).send({ error: "User not found" });
    }

    // Send notification emails for permission changes
    const oldPermissions = rbac.getEffectivePermissions(existing);
    const oldTenants = oldPermissions.tenantPermissions ? Object.keys(oldPermissions.tenantPermissions) : [];
    const newTenants = newPermissions.tenantPermissions ? Object.keys(newPermissions.tenantPermissions) : [];
    const addedTenants = newTenants.filter(t => !oldTenants.includes(t));
    const removedTenants = oldTenants.filter(t => !newTenants.includes(t));

    if (addedTenants.length > 0 || removedTenants.length > 0) {
      sendTenantAccessChangedEmail(
        updated.email,
        updated.name ?? undefined,
        addedTenants,
        removedTenants
      ).catch(emailError => {
        req.log.error({ err: emailError }, "Failed to send permission change email");
      });
    }

    return { user: enhanceUserInfo(updated) };
  });

  /**
   * DELETE /api/super-admin/users/:id
   * Delete a user
   */
  app.delete<{ Params: { id: string } }>("/super-admin/users/:id", {
    preHandler,
    schema: {
      tags: ["super-admin"],
      summary: "Delete a user",
      description: "Delete a user from the system (Super-Admin only)",
      security: [{ bearerAuth: [] }],
      params: {
        type: "object",
        required: ["id"],
        properties: {
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
    const removed = await deleteDevUser(req.params.id);
    if (!removed) {
      return reply.status(404).send({ error: "User not found" });
    }
    return { success: true };
  });

  /**
   * GET /api/super-admin/tenants
   * List all tenants in the system
   */
  app.get("/super-admin/tenants", {
    preHandler,
    schema: {
      tags: ["super-admin"],
      summary: "List all tenants",
      description: "Lists all tenants in the system (Super-Admin only)",
      security: [{ bearerAuth: [] }],
      response: {
        200: {
          type: "object",
          properties: {
            tenants: {
              type: "array",
              items: { type: "object" }
            }
          }
        }
      }
    }
  }, async () => {
    const tenants = await listTenants();
    return { tenants };
  });

  /**
   * POST /api/super-admin/permissions/grant
   * Grant a permission to a user (simplified API)
   */
  app.post("/super-admin/permissions/grant", {
    preHandler,
    schema: {
      tags: ["super-admin"],
      summary: "Grant permission to user",
      description: "Grant a specific permission to a user at global, tenant, or project level (Super-Admin only)",
      security: [{ bearerAuth: [] }],
      body: {
        type: "object",
        required: ["userId", "role"],
        properties: {
          userId: { type: "string", format: "uuid" },
          role: { type: "string", enum: Object.values(UserRole) },
          tenantSlug: { type: "string" },
          projectKey: { type: "string" }
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
    const body = grantPermissionSchema.parse(req.body);
    const currentUser = req.currentUser as AuthUser;

    const user = await getDevUser(body.userId);
    if (!user) {
      return reply.status(404).send({ error: "User not found" });
    }

    const permissions = rbac.getEffectivePermissions(user);
    const now = new Date().toISOString();

    // Determine permission level
    if (!body.tenantSlug && !body.projectKey) {
      // Global role
      if (body.role !== UserRole.SUPER_ADMIN) {
        return reply.status(400).send({
          error: "Only Super-Admin role can be granted globally"
        });
      }
      permissions.globalRole = UserRole.SUPER_ADMIN;
    } else if (body.tenantSlug && !body.projectKey) {
      // Tenant-level permission
      if (!permissions.tenantPermissions) {
        permissions.tenantPermissions = {};
      }
      permissions.tenantPermissions[body.tenantSlug] = {
        role: body.role,
        grantedAt: now,
        grantedBy: currentUser.sub
      };
    } else if (body.tenantSlug && body.projectKey) {
      // Project-level permission
      if (!permissions.projectPermissions) {
        permissions.projectPermissions = {};
      }
      if (!permissions.projectPermissions[body.tenantSlug]) {
        permissions.projectPermissions[body.tenantSlug] = {};
      }
      permissions.projectPermissions[body.tenantSlug][body.projectKey] = {
        role: body.role,
        grantedAt: now,
        grantedBy: currentUser.sub
      };
    } else {
      return reply.status(400).send({
        error: "Invalid permission grant request: projectKey requires tenantSlug"
      });
    }

    const updated = await updateDevUser(body.userId, { permissions });
    if (!updated) {
      return reply.status(404).send({ error: "Failed to update user" });
    }

    return { user: enhanceUserInfo(updated) };
  });

  /**
   * POST /api/super-admin/permissions/revoke
   * Revoke a permission from a user (simplified API)
   */
  app.post("/super-admin/permissions/revoke", {
    preHandler,
    schema: {
      tags: ["super-admin"],
      summary: "Revoke permission from user",
      description: "Revoke a specific permission from a user (Super-Admin only)",
      security: [{ bearerAuth: [] }],
      body: {
        type: "object",
        required: ["userId"],
        properties: {
          userId: { type: "string", format: "uuid" },
          tenantSlug: { type: "string" },
          projectKey: { type: "string" }
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
    const bodySchema = z.object({
      userId: z.string().uuid(),
      tenantSlug: z.string().optional(),
      projectKey: z.string().optional()
    });
    const body = bodySchema.parse(req.body);

    const user = await getDevUser(body.userId);
    if (!user) {
      return reply.status(404).send({ error: "User not found" });
    }

    const permissions = rbac.getEffectivePermissions(user);

    // Determine what to revoke
    if (!body.tenantSlug && !body.projectKey) {
      // Revoke global role
      delete permissions.globalRole;
    } else if (body.tenantSlug && !body.projectKey) {
      // Revoke tenant-level permission
      if (permissions.tenantPermissions) {
        delete permissions.tenantPermissions[body.tenantSlug];
      }
    } else if (body.tenantSlug && body.projectKey) {
      // Revoke project-level permission
      if (permissions.projectPermissions?.[body.tenantSlug]) {
        delete permissions.projectPermissions[body.tenantSlug][body.projectKey];
        // Clean up empty tenant entry
        if (Object.keys(permissions.projectPermissions[body.tenantSlug]).length === 0) {
          delete permissions.projectPermissions[body.tenantSlug];
        }
      }
    } else {
      return reply.status(400).send({
        error: "Invalid permission revoke request: projectKey requires tenantSlug"
      });
    }

    const updated = await updateDevUser(body.userId, { permissions });
    if (!updated) {
      return reply.status(404).send({ error: "Failed to update user" });
    }

    return { user: enhanceUserInfo(updated) };
  });

  app.log.info("Super-Admin routes registered at /api/super-admin/*");
}
