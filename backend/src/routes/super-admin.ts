import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { config } from "../config.js";
import { UserRole } from "../types/roles.js";
import { requireSuperAdminMiddleware, type AuthUser } from "../lib/authorization.js";
import { PermissionRepository } from "../repositories/PermissionRepository.js";
import { userRepository } from "../repositories/UserRepository.js";
import { hashPassword } from "../lib/password.js";
import {
  sendAdminCreatedAccountEmail,
  sendRoleChangedEmail
} from "../lib/email.js";
import { listTenants } from "../services/graph/requirements/index.js";
import type { UserPermissions } from "../types/permissions.js";
import { buildUserResponse } from "./helpers/user-response.js";

const permissionSchema = z.object({
  globalRole: z.nativeEnum(UserRole).optional(),
  tenantPermissions: z.record(z.string(), z.object({
    role: z.nativeEnum(UserRole),
    isOwner: z.boolean().optional()
  })).optional(),
  projectPermissions: z.record(z.string(), z.record(z.string(), z.object({
    role: z.nativeEnum(UserRole)
  }))).optional()
}).transform((value): UserPermissions => {
  const result: UserPermissions = {};

  if (value.globalRole === UserRole.SUPER_ADMIN) {
    result.globalRole = UserRole.SUPER_ADMIN;
  }

  if (value.tenantPermissions) {
    result.tenantPermissions = value.tenantPermissions;
  }

  if (value.projectPermissions) {
    result.projectPermissions = value.projectPermissions;
  }

  return result;
}).optional();

const createUserSchema = z.object({
  email: z.string().email(),
  name: z.string().optional(),
  password: z.string().min(8),
  permissions: permissionSchema.optional()
});

const updatePermissionsSchema = z.object({
  permissions: permissionSchema.transform(value => value ?? undefined)
});

const grantPermissionSchema = z.object({
  userId: z.string().uuid(),
  tenantSlug: z.string().optional(),
  projectKey: z.string().optional(),
  role: z.nativeEnum(UserRole),
  isOwner: z.boolean().optional()
});

const revokePermissionSchema = z.object({
  userId: z.string().uuid(),
  tenantSlug: z.string().optional(),
  projectKey: z.string().optional()
});

const permRepo = new PermissionRepository();

async function applyPermissions(
  userId: string,
  permissions: UserPermissions | undefined,
  grantedBy?: string
): Promise<void> {
  await permRepo.removeAllPermissionsForUser(userId);

  if (!permissions) {
    return;
  }

  if (permissions.globalRole === UserRole.SUPER_ADMIN) {
    await permRepo.grantPermission({
      userId,
      scopeType: "global",
      role: UserRole.SUPER_ADMIN,
      grantedBy
    });
  }

  if (permissions.tenantPermissions) {
    for (const [tenantSlug, permission] of Object.entries(permissions.tenantPermissions)) {
      await permRepo.grantPermission({
        userId,
        scopeType: "tenant",
        scopeId: tenantSlug,
        role: permission.role,
        isOwner: permission.isOwner ?? false,
        grantedBy
      });
    }
  }

  if (permissions.projectPermissions) {
    for (const [tenantSlug, projects] of Object.entries(permissions.projectPermissions)) {
      for (const [projectKey, permission] of Object.entries(projects)) {
        await permRepo.grantPermission({
          userId,
          scopeType: "project",
          scopeId: `${tenantSlug}:${projectKey}`,
          role: permission.role,
          grantedBy
        });
      }
    }
  }
}

async function ensureUserExists(userId: string) {
  const user = await userRepository.findById(userId);
  if (!user) {
    const error = new Error("User not found");
    (error as NodeJS.ErrnoException).code = "ENOUSER";
    throw error;
  }
  return user;
}

export default async function registerSuperAdminRoutes(app: FastifyInstance): Promise<void> {
  if (!config.features.adminRoutesEnabled) {
    app.log.debug("Super-Admin routes disabled via configuration");
    return;
  }

  const preHandler = [app.authenticate, requireSuperAdminMiddleware];

  app.get("/super-admin/users", {
    preHandler,
    schema: {
      tags: ["super-admin"],
      summary: "List all users",
      description: "List all users with permissions",
      response: {
        200: {
          type: "object",
          properties: {
            users: { type: "array", items: { type: "object" } }
          }
        }
      }
    }
  }, async () => {
    const users = await userRepository.list();
    const summaries = await Promise.all(users.map(user => buildUserResponse(user.id)));
    return { users: summaries.filter((summary): summary is NonNullable<typeof summary> => Boolean(summary)) };
  });

  app.get("/super-admin/users/:id", {
    preHandler,
    schema: {
      tags: ["super-admin"],
      summary: "Get user",
      description: "Get detailed information for a user",
      params: {
        type: "object",
        required: ["id"],
        properties: {
          id: { type: "string" }
        }
      }
    }
  }, async (req, reply) => {
    const summary = await buildUserResponse((req.params as { id: string }).id);
    if (!summary) {
      return reply.status(404).send({ error: "User not found" });
    }
    return { user: summary };
  });

  app.post("/super-admin/users", {
    preHandler,
    schema: {
      tags: ["super-admin"],
      summary: "Create user",
      description: "Create a new user with permissions"
    }
  }, async (req, reply) => {
    const currentUser = req.currentUser as AuthUser | undefined;
    const body = createUserSchema.parse(req.body);

    const passwordHash = await hashPassword(body.password);
    const user = await userRepository.create({
      email: body.email,
      name: body.name,
      passwordHash,
      emailVerified: false
    });

    await applyPermissions(user.id, body.permissions, currentUser?.sub);

    const summary = await buildUserResponse(user.id);
    if (!summary) {
      return reply.status(500).send({ error: "Failed to load user" });
    }

    const tenantSlugs = body.permissions?.tenantPermissions ? Object.keys(body.permissions.tenantPermissions) : [];
    const roles: string[] = [];
    if (body.permissions?.globalRole) {
      roles.push(body.permissions.globalRole);
    } else if (body.permissions?.tenantPermissions) {
      roles.push(...new Set(Object.values(body.permissions.tenantPermissions).map(p => p.role)));
    }

    sendAdminCreatedAccountEmail(
      summary.email,
      summary.name ?? undefined,
      tenantSlugs,
      roles.length ? roles : summary.roles
    ).catch(error => {
      req.log.error({ err: error }, "Failed to send admin created account email");
    });

    return reply.status(201).send({ user: summary });
  });

  app.patch("/super-admin/users/:id/permissions", {
    preHandler,
    schema: {
      tags: ["super-admin"],
      summary: "Update user permissions",
      description: "Replace user permissions with provided configuration",
      params: {
        type: "object",
        required: ["id"],
        properties: {
          id: { type: "string" }
        }
      }
    }
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const currentUser = req.currentUser as AuthUser | undefined;
    const { permissions } = updatePermissionsSchema.parse(req.body);

    await ensureUserExists(id);

    await applyPermissions(id, permissions, currentUser?.sub);

    const summary = await buildUserResponse(id);
    if (!summary) {
      return reply.status(500).send({ error: "Failed to load user" });
    }

    sendRoleChangedEmail(summary.email, summary.name ?? undefined, summary.roles, []).catch(() => {});

    return { user: summary };
  });

  app.delete("/super-admin/users/:id", {
    preHandler,
    schema: {
      tags: ["super-admin"],
      summary: "Delete user",
      description: "Soft delete a user",
      params: {
        type: "object",
        required: ["id"],
        properties: {
          id: { type: "string" }
        }
      }
    }
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const deleted = await userRepository.delete(id);
    if (!deleted) {
      return reply.status(404).send({ error: "User not found" });
    }
    return { success: true };
  });

  app.get("/super-admin/tenants", {
    preHandler,
    schema: {
      tags: ["super-admin"],
      summary: "List tenants",
      description: "List all tenants in the system",
      response: {
        200: {
          type: "object",
          properties: {
            tenants: { type: "array", items: { type: "object" } }
          }
        }
      }
    }
  }, async () => {
    const tenants = await listTenants();
    return { tenants };
  });

  app.post("/super-admin/permissions/grant", {
    preHandler,
    schema: {
      tags: ["super-admin"],
      summary: "Grant permission",
      description: "Grant a permission to a user"
    }
  }, async (req, reply) => {
    const currentUser = req.currentUser as AuthUser | undefined;
    const body = grantPermissionSchema.parse(req.body);

    await ensureUserExists(body.userId);

    if (!body.tenantSlug && !body.projectKey && body.role !== UserRole.SUPER_ADMIN) {
      return reply.status(400).send({ error: "Global permissions must use the Super Admin role" });
    }

    const scopeType = body.tenantSlug
      ? (body.projectKey ? "project" : "tenant")
      : "global";

    const scopeId = scopeType === "project"
      ? `${body.tenantSlug}:${body.projectKey}`
      : body.tenantSlug;

    await permRepo.grantPermission({
      userId: body.userId,
      scopeType,
      scopeId,
      role: body.role,
      isOwner: body.isOwner ?? false,
      grantedBy: currentUser?.sub
    });

    const summary = await buildUserResponse(body.userId);
    if (!summary) {
      return reply.status(404).send({ error: "User not found" });
    }
    return { user: summary };
  });

  app.post("/super-admin/permissions/revoke", {
    preHandler,
    schema: {
      tags: ["super-admin"],
      summary: "Revoke permission",
      description: "Revoke a permission from a user"
    }
  }, async (req, reply) => {
    const body = revokePermissionSchema.parse(req.body);

    await ensureUserExists(body.userId);

    if (!body.tenantSlug && !body.projectKey) {
      await permRepo.revokePermission(body.userId, "global");
    } else if (body.tenantSlug && !body.projectKey) {
      await permRepo.removeTenantPermissionsForUser(body.userId, body.tenantSlug);
    } else if (body.tenantSlug && body.projectKey) {
      await permRepo.revokePermission(body.userId, "project", `${body.tenantSlug}:${body.projectKey}`);
    } else {
      return reply.status(400).send({ error: "Invalid permission scope" });
    }

    const summary = await buildUserResponse(body.userId);
    if (!summary) {
      return reply.status(404).send({ error: "User not found" });
    }
    return { user: summary };
  });
}
