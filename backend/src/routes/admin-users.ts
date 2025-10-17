/**
 * Admin Users Route (Enterprise Edition)
 *
 * PostgreSQL-based user management with full RBAC support.
 * Uses UserRepository and PermissionRepository for database operations.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { config } from "../config.js";
import { UserRepository } from "../repositories/UserRepository.js";
import { PermissionRepository } from "../repositories/PermissionRepository.js";
import { UserRole } from "../types/roles.js";
import type { UserPermissions } from "../types/permissions.js";
import {
  sendAdminCreatedAccountEmail,
  sendTenantAccessChangedEmail,
  sendRoleChangedEmail
} from "../lib/email.js";
import { hashPassword } from "../lib/password.js";
import type { AuthUser } from "../lib/authorization.js";

// ============================================================================
// Types
// ============================================================================

/**
 * Enhanced user information with permissions
 */
interface EnhancedUser {
  id: string;
  email: string;
  name?: string;
  emailVerified: boolean;
  mfaEnabled: boolean;
  permissions: UserPermissions;
  createdAt: string;
  updatedAt: string;
}

/**
 * Sanitized user for API response (excludes sensitive fields)
 */
type SanitizedUser = Omit<EnhancedUser, "mfaSecret" | "mfaBackupCodes">;

// ============================================================================
// Validation Schemas
// ============================================================================

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

const updateUserSchema = z.object({
  email: z.string().email().optional(),
  name: z.string().optional().nullable(),
  password: z.string().min(8).optional(),
  emailVerified: z.boolean().optional()
});

const updatePermissionsSchema = z.object({
  permissions: z.object({
    globalRole: z.nativeEnum(UserRole).optional(),
    tenantPermissions: z.record(z.string(), z.object({
      role: z.nativeEnum(UserRole),
      isOwner: z.boolean().optional()
    })).optional(),
    projectPermissions: z.record(z.string(), z.record(z.string(), z.object({
      role: z.nativeEnum(UserRole)
    }))).optional()
  })
});

const grantPermissionSchema = z.object({
  role: z.nativeEnum(UserRole),
  tenantSlug: z.string().optional(),
  projectKey: z.string().optional(),
  isOwner: z.boolean().optional()
});

const revokePermissionSchema = z.object({
  tenantSlug: z.string().optional(),
  projectKey: z.string().optional()
});

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Check if current user is a super-admin
 */
function isSuperAdmin(user: AuthUser | undefined): boolean {
  if (!user) return false;
  return user.permissions?.globalRole === UserRole.SUPER_ADMIN || user.roles?.includes(UserRole.SUPER_ADMIN);
}

/**
 * Get all tenant slugs that the user administers (tenant-admin or owner)
 */
function getAdministeredTenants(user: AuthUser | undefined): Set<string> {
  const tenants = new Set<string>();

  if (!user || !user.permissions) return tenants;

  // Check tenant permissions
  if (user.permissions.tenantPermissions) {
    for (const [tenantSlug, permission] of Object.entries(user.permissions.tenantPermissions)) {
      if (permission.role === UserRole.TENANT_ADMIN || permission.isOwner) {
        tenants.add(tenantSlug);
      }
    }
  }

  return tenants;
}

/**
 * Check if current user can manage target user
 * Super-admins can manage anyone
 * Tenant-admins can only manage users in their tenants
 */
async function canManageUser(
  currentUser: AuthUser,
  targetUserId: string,
  permRepo: PermissionRepository
): Promise<boolean> {
  // Super-admins can manage anyone
  if (isSuperAdmin(currentUser)) {
    return true;
  }

  // Get tenants the current user administers
  const administeredTenants = getAdministeredTenants(currentUser);
  if (administeredTenants.size === 0) {
    return false;
  }

  // Get target user's tenant access
  const targetPermissions = await permRepo.getUserPermissions(targetUserId);

  // Check if target user has access to any of the administered tenants
  if (targetPermissions.tenantPermissions) {
    for (const tenantSlug of Object.keys(targetPermissions.tenantPermissions)) {
      if (administeredTenants.has(tenantSlug)) {
        return true;
      }
    }
  }

  if (targetPermissions.projectPermissions) {
    for (const tenantSlug of Object.keys(targetPermissions.projectPermissions)) {
      if (administeredTenants.has(tenantSlug)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Convert database User + Permissions to EnhancedUser format
 */
async function toEnhancedUser(
  user: Awaited<ReturnType<typeof UserRepository.prototype.findById>>,
  permRepo: PermissionRepository
): Promise<EnhancedUser | null> {
  if (!user) return null;

  const permissions = await permRepo.getUserPermissions(user.id);

  return {
    id: user.id,
    email: user.email,
    name: user.name ?? undefined,
    emailVerified: user.emailVerified,
    mfaEnabled: user.mfaEnabled,
    permissions,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString()
  };
}

/**
 * Sanitize user for API response (remove sensitive fields)
 */
function sanitizeUser(user: EnhancedUser): SanitizedUser {
  return user;
}

// ============================================================================
// Route Handlers
// ============================================================================

export default async function registerAdminUserRoutes(app: FastifyInstance): Promise<void> {
  if (!config.features.adminRoutesEnabled) {
    app.log.debug("Admin user routes disabled via configuration");
    return;
  }

  const userRepo = new UserRepository();
  const permRepo = new PermissionRepository();

  /**
   * GET /admin/users
   * List all users with their permissions
   * Super-admins see all users, tenant-admins see only users in their tenants
   */
  app.get("/admin/users", {
    preHandler: [app.authenticate],
    schema: {
      tags: ["admin"],
      summary: "List all users",
      description: "Lists all users with detailed permission information (filtered by tenant access)",
      security: [{ bearerAuth: [] }],
      response: {
        200: {
          type: "object",
          properties: {
            users: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: { type: "string" },
                  email: { type: "string" },
                  name: { type: "string", nullable: true },
                  emailVerified: { type: "boolean" },
                  mfaEnabled: { type: "boolean" },
                  permissions: {
                    type: "object",
                    additionalProperties: true
                  },
                  createdAt: { type: "string" },
                  updatedAt: { type: "string" }
                }
              }
            }
          }
        },
        401: {
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
        }
      }
    }
  }, async (req, reply) => {
    const currentUser = req.currentUser as AuthUser | undefined;

    if (!currentUser) {
      return reply.status(401).send({ error: "Authentication required" });
    }

    // Check if user has admin privileges
    const isSuper = isSuperAdmin(currentUser);
    const administeredTenants = getAdministeredTenants(currentUser);

    if (!isSuper && administeredTenants.size === 0) {
      return reply.status(403).send({ error: "Insufficient permissions to view users" });
    }

    const users = await userRepo.list();
    const enhancedUsers: EnhancedUser[] = [];

    for (const user of users) {
      const enhanced = await toEnhancedUser(user, permRepo);
      if (!enhanced) continue;

      // Super-admins see all users
      if (isSuper) {
        enhancedUsers.push(enhanced);
        continue;
      }

      // Tenant-admins only see users who have access to their tenants
      let hasCommonTenant = false;

      if (enhanced.permissions.tenantPermissions) {
        for (const tenantSlug of Object.keys(enhanced.permissions.tenantPermissions)) {
          if (administeredTenants.has(tenantSlug)) {
            hasCommonTenant = true;
            break;
          }
        }
      }

      if (!hasCommonTenant && enhanced.permissions.projectPermissions) {
        for (const tenantSlug of Object.keys(enhanced.permissions.projectPermissions)) {
          if (administeredTenants.has(tenantSlug)) {
            hasCommonTenant = true;
            break;
          }
        }
      }

      if (hasCommonTenant) {
        enhancedUsers.push(enhanced);
      }
    }

    // Sort by email
    enhancedUsers.sort((a, b) => a.email.localeCompare(b.email));

    return { users: enhancedUsers.map(sanitizeUser) };
  });

  /**
   * GET /admin/users/:id
   * Get detailed information about a specific user
   */
  app.get<{ Params: { id: string } }>("/admin/users/:id", {
    preHandler: [app.authenticate],
    schema: {
      tags: ["admin"],
      summary: "Get user details",
      description: "Get detailed information about a specific user",
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
            user: {
              type: "object",
              additionalProperties: true
            }
          }
        },
        401: {
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
        404: {
          type: "object",
          properties: {
            error: { type: "string" }
          }
        }
      }
    }
  }, async (req, reply) => {
    const currentUser = req.currentUser as AuthUser | undefined;

    if (!currentUser) {
      return reply.status(401).send({ error: "Authentication required" });
    }

    const paramsSchema = z.object({ id: z.string().uuid() });
    const params = paramsSchema.parse(req.params);

    // Check if current user can manage this user
    const canManage = await canManageUser(currentUser, params.id, permRepo);
    if (!canManage) {
      return reply.status(403).send({ error: "Insufficient permissions to view this user" });
    }

    const user = await userRepo.findById(params.id);
    const enhanced = await toEnhancedUser(user, permRepo);

    if (!enhanced) {
      return reply.status(404).send({ error: "User not found" });
    }

    return { user: sanitizeUser(enhanced) };
  });

  /**
   * POST /admin/users
   * Create a new user with permissions
   */
  app.post("/admin/users", {
    preHandler: [app.authenticate],
    schema: {
      tags: ["admin"],
      summary: "Create a new user",
      description: "Creates a new user with specified permissions",
      security: [{ bearerAuth: [] }],
      body: {
        type: "object",
        required: ["email"],
        properties: {
          email: { type: "string", format: "email" },
          name: { type: "string", minLength: 1 },
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
            user: {
              type: "object",
              additionalProperties: true
            }
          }
        },
        400: {
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
        403: {
          type: "object",
          properties: {
            error: { type: "string" }
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
    const currentUser = req.currentUser as AuthUser | undefined;

    if (!currentUser) {
      return reply.status(401).send({ error: "Authentication required" });
    }

    // Check if user has admin privileges
    const isSuper = isSuperAdmin(currentUser);
    const administeredTenants = getAdministeredTenants(currentUser);

    if (!isSuper && administeredTenants.size === 0) {
      return reply.status(403).send({ error: "Insufficient permissions to create users" });
    }

    const body = createUserSchema.parse(req.body);

    // Prevent non-super-admins from creating super-admins
    if (body.permissions?.globalRole === UserRole.SUPER_ADMIN && !isSuper) {
      return reply.status(403).send({ error: "Only super-admins can create super-admin users" });
    }

    // Verify tenant-admins can only grant access to their own tenants
    if (!isSuper && body.permissions?.tenantPermissions) {
      for (const tenantSlug of Object.keys(body.permissions.tenantPermissions)) {
        if (!administeredTenants.has(tenantSlug)) {
          return reply.status(403).send({
            error: `You do not have permission to grant access to tenant '${tenantSlug}'`
          });
        }
      }
    }

    try {
      // Create user in database (require password for now)
      if (!body.password) {
        return reply.status(400).send({ error: "Password is required" });
      }

      const passwordHash = await hashPassword(body.password);

      const user = await userRepo.create({
        email: body.email,
        name: body.name,
        passwordHash,
        emailVerified: false
      });

      // Grant permissions if provided
      if (body.permissions) {
        // Grant global role
        if (body.permissions.globalRole === UserRole.SUPER_ADMIN) {
          await permRepo.grantPermission({
            userId: user.id,
            scopeType: "global",
            role: UserRole.SUPER_ADMIN
          });
        }

        // Grant tenant permissions
        if (body.permissions.tenantPermissions) {
          for (const [tenantSlug, permission] of Object.entries(body.permissions.tenantPermissions)) {
            await permRepo.grantPermission({
              userId: user.id,
              scopeType: "tenant",
              scopeId: tenantSlug,
              role: permission.role,
              isOwner: permission.isOwner ?? false
            });
          }
        }

        // Grant project permissions
        if (body.permissions.projectPermissions) {
          for (const [tenantSlug, projects] of Object.entries(body.permissions.projectPermissions)) {
            for (const [projectKey, permission] of Object.entries(projects)) {
              await permRepo.grantPermission({
                userId: user.id,
                scopeType: "project",
                scopeId: `${tenantSlug}:${projectKey}`,
                role: permission.role
              });
            }
          }
        }
      }

      const enhanced = await toEnhancedUser(user, permRepo);
      if (!enhanced) {
        throw new Error("Failed to load created user");
      }

      // Send welcome email
      const tenantSlugs = body.permissions?.tenantPermissions ? Object.keys(body.permissions.tenantPermissions) : [];
      sendAdminCreatedAccountEmail(
        user.email,
        user.name ?? undefined,
        tenantSlugs,
        body.permissions?.globalRole ? [body.permissions.globalRole] : []
      ).catch(emailError => {
        req.log.error({ err: emailError }, "Failed to send admin-created user email");
      });

      return { user: sanitizeUser(enhanced) };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EUSER_EXISTS") {
        return reply.status(409).send({ error: "User with this email already exists" });
      }
      throw error;
    }
  });

  /**
   * PATCH /admin/users/:id
   * Update user basic information (email, name, password)
   */
  app.patch<{ Params: { id: string } }>("/admin/users/:id", {
    preHandler: [app.authenticate],
    schema: {
      tags: ["admin"],
      summary: "Update user information",
      description: "Updates user's basic information (email, name, password)",
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
        properties: {
          email: { type: "string", format: "email" },
          name: { type: "string", nullable: true },
          password: { type: "string", minLength: 8 },
          emailVerified: { type: "boolean" }
        }
      },
      response: {
        200: {
          type: "object",
          properties: {
            user: {
              type: "object",
              additionalProperties: true
            }
          }
        },
        401: {
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
        404: {
          type: "object",
          properties: {
            error: { type: "string" }
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
    const currentUser = req.currentUser as AuthUser | undefined;

    if (!currentUser) {
      return reply.status(401).send({ error: "Authentication required" });
    }

    const paramsSchema = z.object({ id: z.string().uuid() });
    const params = paramsSchema.parse(req.params);

    // Check if current user can manage this user
    const canManage = await canManageUser(currentUser, params.id, permRepo);
    if (!canManage) {
      return reply.status(403).send({ error: "Insufficient permissions to update this user" });
    }

    const body = updateUserSchema.parse(req.body);

    try {
      const existing = await userRepo.findById(params.id);
      if (!existing) {
        return reply.status(404).send({ error: "User not found" });
      }

      const updates: Parameters<typeof userRepo.update>[1] = {};

      if (body.email !== undefined) updates.email = body.email;
      if (body.name !== undefined) updates.name = body.name;
      if (body.emailVerified !== undefined) updates.emailVerified = body.emailVerified;

      if (body.password) {
        updates.passwordHash = await hashPassword(body.password);
      }

      const updated = await userRepo.update(params.id, updates);
      if (!updated) {
        return reply.status(404).send({ error: "User not found" });
      }

      const enhanced = await toEnhancedUser(updated, permRepo);
      if (!enhanced) {
        throw new Error("Failed to load updated user");
      }

      return { user: sanitizeUser(enhanced) };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EUSER_EXISTS") {
        return reply.status(409).send({ error: "User with this email already exists" });
      }
      throw error;
    }
  });

  /**
   * PATCH /admin/users/:id/permissions
   * Update user's permissions (replaces entire permission structure)
   */
  app.patch<{ Params: { id: string } }>("/admin/users/:id/permissions", {
    preHandler: [app.authenticate],
    schema: {
      tags: ["admin"],
      summary: "Update user permissions",
      description: "Updates a user's complete permission structure",
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
            user: {
              type: "object",
              additionalProperties: true
            }
          }
        },
        401: {
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
        404: {
          type: "object",
          properties: {
            error: { type: "string" }
          }
        }
      }
    }
  }, async (req, reply) => {
    const currentUser = req.currentUser as AuthUser | undefined;

    if (!currentUser) {
      return reply.status(401).send({ error: "Authentication required" });
    }

    const paramsSchema = z.object({ id: z.string().uuid() });
    const params = paramsSchema.parse(req.params);

    // Check if current user can manage this user
    const canManage = await canManageUser(currentUser, params.id, permRepo);
    if (!canManage) {
      return reply.status(403).send({ error: "Insufficient permissions to update this user's permissions" });
    }

    const body = updatePermissionsSchema.parse(req.body);

    // Check if user is trying to grant/modify super-admin role
    const isSuper = isSuperAdmin(currentUser);
    const administeredTenants = getAdministeredTenants(currentUser);

    // Get old permissions for change detection
    const user = await userRepo.findById(params.id);
    if (!user) {
      return reply.status(404).send({ error: "User not found" });
    }

    const oldPermissions = await permRepo.getUserPermissions(user.id);

    // Prevent non-super-admins from granting super-admin role
    if (body.permissions.globalRole === UserRole.SUPER_ADMIN && !isSuper) {
      return reply.status(403).send({ error: "Only super-admins can grant super-admin privileges" });
    }

    // Prevent non-super-admins from revoking super-admin role
    if (oldPermissions.globalRole === UserRole.SUPER_ADMIN && body.permissions.globalRole !== UserRole.SUPER_ADMIN && !isSuper) {
      return reply.status(403).send({ error: "Only super-admins can revoke super-admin privileges" });
    }

    // Verify tenant-admins can only modify permissions for their own tenants
    if (!isSuper && body.permissions.tenantPermissions) {
      for (const tenantSlug of Object.keys(body.permissions.tenantPermissions)) {
        if (!administeredTenants.has(tenantSlug)) {
          return reply.status(403).send({
            error: `You do not have permission to grant access to tenant '${tenantSlug}'`
          });
        }
      }
    }

    const oldTenants = oldPermissions.tenantPermissions ? Object.keys(oldPermissions.tenantPermissions) : [];

    // Clear all existing permissions (we're doing a full replace)
    // First remove global role
    if (oldPermissions.globalRole) {
      await permRepo.revokePermission(user.id, "global");
    }

    // Remove all tenant permissions
    for (const tenantSlug of oldTenants) {
      await permRepo.revokePermission(user.id, "tenant", tenantSlug);
    }

    // Remove all project permissions
    if (oldPermissions.projectPermissions) {
      for (const [tenantSlug, projects] of Object.entries(oldPermissions.projectPermissions)) {
        for (const projectKey of Object.keys(projects)) {
          await permRepo.revokePermission(user.id, "project", `${tenantSlug}:${projectKey}`);
        }
      }
    }

    // Grant new permissions
    if (body.permissions.globalRole === UserRole.SUPER_ADMIN) {
      await permRepo.grantPermission({
        userId: user.id,
        scopeType: "global",
        role: UserRole.SUPER_ADMIN
      });
    }

    if (body.permissions.tenantPermissions) {
      console.log('[admin-users] Processing tenant permissions:', body.permissions.tenantPermissions);
      for (const [tenantSlug, permission] of Object.entries(body.permissions.tenantPermissions)) {
        console.log('[admin-users] Granting permission for tenant:', tenantSlug, 'role:', permission.role, 'isOwner:', permission.isOwner);
        await permRepo.grantPermission({
          userId: user.id,
          scopeType: "tenant",
          scopeId: tenantSlug,
          role: permission.role,
          isOwner: permission.isOwner ?? false
        });
        console.log('[admin-users] Permission granted for tenant:', tenantSlug);
      }
      console.log('[admin-users] Finished processing all tenant permissions');
    }

    if (body.permissions.projectPermissions) {
      for (const [tenantSlug, projects] of Object.entries(body.permissions.projectPermissions)) {
        for (const [projectKey, permission] of Object.entries(projects)) {
          await permRepo.grantPermission({
            userId: user.id,
            scopeType: "project",
            scopeId: `${tenantSlug}:${projectKey}`,
            role: permission.role
          });
        }
      }
    }

    // Get updated user
    const enhanced = await toEnhancedUser(user, permRepo);
    if (!enhanced) {
      throw new Error("Failed to load updated user");
    }

    // Send email notification about changed permissions
    const newTenants = body.permissions.tenantPermissions ? Object.keys(body.permissions.tenantPermissions) : [];
    const addedTenants = newTenants.filter(t => !oldTenants.includes(t));
    const removedTenants = oldTenants.filter(t => !newTenants.includes(t));

    if (addedTenants.length > 0 || removedTenants.length > 0) {
      sendTenantAccessChangedEmail(
        user.email,
        user.name ?? undefined,
        addedTenants,
        removedTenants
      ).catch(emailError => {
        req.log.error({ err: emailError }, "Failed to send permission change email");
      });
    }

    return { user: sanitizeUser(enhanced) };
  });

  /**
   * POST /admin/users/:id/permissions/grant
   * Grant a specific permission to a user
   */
  app.post<{ Params: { id: string } }>("/admin/users/:id/permissions/grant", {
    preHandler: [app.authenticate],
    schema: {
      tags: ["admin"],
      summary: "Grant permission",
      description: "Grants a specific permission to a user",
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
        required: ["role"],
        properties: {
          role: { type: "string", enum: Object.values(UserRole) },
          tenantSlug: { type: "string" },
          projectKey: { type: "string" },
          isOwner: { type: "boolean" }
        }
      },
      response: {
        200: {
          type: "object",
          properties: {
            user: {
              type: "object",
              additionalProperties: true
            }
          }
        },
        400: {
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
    const currentUser = req.currentUser as AuthUser | undefined;

    if (!currentUser) {
      return reply.status(401).send({ error: "Authentication required" });
    }

    const paramsSchema = z.object({ id: z.string().uuid() });
    const params = paramsSchema.parse(req.params);

    // Check if current user can manage this user
    const canManage = await canManageUser(currentUser, params.id, permRepo);
    if (!canManage) {
      return reply.status(403).send({ error: "Insufficient permissions to modify this user's permissions" });
    }

    const body = grantPermissionSchema.parse(req.body);

    const user = await userRepo.findById(params.id);
    if (!user) {
      return reply.status(404).send({ error: "User not found" });
    }

    const isSuper = isSuperAdmin(currentUser);
    const administeredTenants = getAdministeredTenants(currentUser);

    // Determine permission scope
    if (!body.tenantSlug && !body.projectKey) {
      // Global role
      if (body.role !== UserRole.SUPER_ADMIN) {
        return reply.status(400).send({
          error: "Only Super-Admin role can be granted globally"
        });
      }
      // Only super-admins can grant super-admin role
      if (!isSuper) {
        return reply.status(403).send({ error: "Only super-admins can grant super-admin privileges" });
      }
      await permRepo.grantPermission({
        userId: user.id,
        scopeType: "global",
        role: UserRole.SUPER_ADMIN
      });
    } else if (body.tenantSlug && !body.projectKey) {
      // Tenant-level permission - verify tenant-admin has access to this tenant
      if (!isSuper && !administeredTenants.has(body.tenantSlug)) {
        return reply.status(403).send({
          error: `You do not have permission to grant access to tenant '${body.tenantSlug}'`
        });
      }
      await permRepo.grantPermission({
        userId: user.id,
        scopeType: "tenant",
        scopeId: body.tenantSlug,
        role: body.role,
        isOwner: body.isOwner ?? false
      });
    } else if (body.tenantSlug && body.projectKey) {
      // Project-level permission
      if (!isSuper && !administeredTenants.has(body.tenantSlug)) {
        return reply.status(403).send({
          error: `You do not have permission to grant access to tenant '${body.tenantSlug}'`
        });
      }
      await permRepo.grantPermission({
        userId: user.id,
        scopeType: "project",
        scopeId: `${body.tenantSlug}:${body.projectKey}`,
        role: body.role
      });
    } else {
      return reply.status(400).send({
        error: "Invalid permission grant: projectKey requires tenantSlug"
      });
    }

    const enhanced = await toEnhancedUser(user, permRepo);
    if (!enhanced) {
      throw new Error("Failed to load updated user");
    }

    return { user: sanitizeUser(enhanced) };
  });

  /**
   * POST /admin/users/:id/permissions/revoke
   * Revoke a specific permission from a user
   */
  app.post<{ Params: { id: string } }>("/admin/users/:id/permissions/revoke", {
    preHandler: [app.authenticate],
    schema: {
      tags: ["admin"],
      summary: "Revoke permission",
      description: "Revokes a specific permission from a user",
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
        properties: {
          tenantSlug: { type: "string" },
          projectKey: { type: "string" }
        }
      },
      response: {
        200: {
          type: "object",
          properties: {
            user: {
              type: "object",
              additionalProperties: true
            }
          }
        },
        400: {
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
    const currentUser = req.currentUser as AuthUser | undefined;

    if (!currentUser) {
      return reply.status(401).send({ error: "Authentication required" });
    }

    const paramsSchema = z.object({ id: z.string().uuid() });
    const params = paramsSchema.parse(req.params);

    // Check if current user can manage this user
    const canManage = await canManageUser(currentUser, params.id, permRepo);
    if (!canManage) {
      return reply.status(403).send({ error: "Insufficient permissions to modify this user's permissions" });
    }

    const body = revokePermissionSchema.parse(req.body);

    const user = await userRepo.findById(params.id);
    if (!user) {
      return reply.status(404).send({ error: "User not found" });
    }

    const isSuper = isSuperAdmin(currentUser);
    const administeredTenants = getAdministeredTenants(currentUser);

    // Determine what to revoke
    if (!body.tenantSlug && !body.projectKey) {
      // Revoke global role - only super-admins can do this
      if (!isSuper) {
        return reply.status(403).send({ error: "Only super-admins can revoke super-admin privileges" });
      }
      await permRepo.revokePermission(user.id, "global");
    } else if (body.tenantSlug && !body.projectKey) {
      // Revoke tenant-level permission
      if (!isSuper && !administeredTenants.has(body.tenantSlug)) {
        return reply.status(403).send({
          error: `You do not have permission to revoke access to tenant '${body.tenantSlug}'`
        });
      }
      await permRepo.revokePermission(user.id, "tenant", body.tenantSlug);
    } else if (body.tenantSlug && body.projectKey) {
      // Revoke project-level permission
      if (!isSuper && !administeredTenants.has(body.tenantSlug)) {
        return reply.status(403).send({
          error: `You do not have permission to revoke access to tenant '${body.tenantSlug}'`
        });
      }
      await permRepo.revokePermission(user.id, "project", `${body.tenantSlug}:${body.projectKey}`);
    } else {
      return reply.status(400).send({
        error: "Invalid permission revoke: projectKey requires tenantSlug"
      });
    }

    const enhanced = await toEnhancedUser(user, permRepo);
    if (!enhanced) {
      throw new Error("Failed to load updated user");
    }

    return { user: sanitizeUser(enhanced) };
  });

  /**
   * DELETE /admin/users/:id
   * Delete a user (soft delete)
   */
  app.delete<{ Params: { id: string } }>("/admin/users/:id", {
    preHandler: [app.authenticate],
    schema: {
      tags: ["admin"],
      summary: "Delete a user",
      description: "Deletes a user from the system (soft delete)",
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
        401: {
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
        404: {
          type: "object",
          properties: {
            error: { type: "string" }
          }
        }
      }
    }
  }, async (req, reply) => {
    const currentUser = req.currentUser as AuthUser | undefined;

    if (!currentUser) {
      return reply.status(401).send({ error: "Authentication required" });
    }

    const paramsSchema = z.object({ id: z.string().uuid() });
    const params = paramsSchema.parse(req.params);

    // Check if current user can manage this user
    const canManage = await canManageUser(currentUser, params.id, permRepo);
    if (!canManage) {
      return reply.status(403).send({ error: "Insufficient permissions to delete this user" });
    }

    const deleted = await userRepo.delete(params.id);
    if (!deleted) {
      return reply.status(404).send({ error: "User not found" });
    }

    return { success: true };
  });

  app.log.info("Admin user routes registered (Enterprise Edition with PostgreSQL)");
}
