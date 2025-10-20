/**
 * Admin Users Route (Enterprise Edition)
 *
 * PostgreSQL-based user management with full RBAC support.
 * Uses UserRepository and PermissionRepository for database operations.
 *
 * REFACTORED: Business logic extracted to UserManagementService
 */

import type { FastifyInstance } from "fastify";
import { config } from "../config.js";
import { UserRepository } from "../repositories/UserRepository.js";
import { PermissionRepository } from "../repositories/PermissionRepository.js";
import { UserManagementService } from "../services/UserManagementService.js";
import type { AuthUser } from "../lib/authorization.js";
import { requireAdminPrivileges } from "../middleware/admin-auth.middleware.js";

// Validation schemas
import {
  createUserSchema,
  updateUserSchema,
  updatePermissionsSchema,
  grantPermissionSchema,
  revokePermissionSchema,
  userIdParamSchema
} from "../validation/admin-users.schemas.js";

// OpenAPI schemas
import * as apiSchemas from "../schemas/admin-users-api.schemas.js";

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
  const userService = new UserManagementService(userRepo, permRepo);

  /**
   * GET /admin/users
   * List all users with their permissions
   */
  app.get("/admin/users", {
    preHandler: [app.authenticate, requireAdminPrivileges],
    schema: apiSchemas.listUsersSchema
  }, async (req, reply) => {
    try {
      const users = await userService.listUsers(req.currentUser as AuthUser);
      return { users };
    } catch (error) {
      const err = error as Error;
      if (err.message.includes("Insufficient permissions")) {
        return reply.status(403).send({ error: err.message });
      }
      throw error;
    }
  });

  /**
   * GET /admin/users/:id
   * Get detailed information about a specific user
   */
  app.get<{ Params: { id: string } }>("/admin/users/:id", {
    preHandler: [app.authenticate, requireAdminPrivileges],
    schema: apiSchemas.getUserByIdSchema
  }, async (req, reply) => {
    try {
      const params = userIdParamSchema.parse(req.params);
      const user = await userService.getUserById(params.id, req.currentUser as AuthUser);

      if (!user) {
        return reply.status(404).send({ error: "User not found" });
      }

      return { user };
    } catch (error) {
      const err = error as Error;
      if (err.message.includes("Insufficient permissions")) {
        return reply.status(403).send({ error: err.message });
      }
      throw error;
    }
  });

  /**
   * POST /admin/users
   * Create a new user with permissions
   */
  app.post("/admin/users", {
    preHandler: [app.authenticate, requireAdminPrivileges],
    schema: apiSchemas.createUserSchema
  }, async (req, reply) => {
    try {
      const body = createUserSchema.parse(req.body);
      const user = await userService.createUser(body, req.currentUser as AuthUser);
      return { user };
    } catch (error) {
      const err = error as Error & NodeJS.ErrnoException;
      if (err.message.includes("Password is required")) {
        return reply.status(400).send({ error: err.message });
      }
      if (err.message.includes("Insufficient permissions")) {
        return reply.status(403).send({ error: err.message });
      }
      if (err.message.includes("Only super-admins")) {
        return reply.status(403).send({ error: err.message });
      }
      if (err.message.includes("do not have permission")) {
        return reply.status(403).send({ error: err.message });
      }
      if (err.code === "EUSER_EXISTS") {
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
    preHandler: [app.authenticate, requireAdminPrivileges],
    schema: apiSchemas.updateUserSchema
  }, async (req, reply) => {
    try {
      const params = userIdParamSchema.parse(req.params);
      const body = updateUserSchema.parse(req.body);
      const user = await userService.updateUser(params.id, body, req.currentUser as AuthUser);
      return { user };
    } catch (error) {
      const err = error as Error & NodeJS.ErrnoException;
      if (err.message.includes("Insufficient permissions")) {
        return reply.status(403).send({ error: err.message });
      }
      if (err.message.includes("User not found")) {
        return reply.status(404).send({ error: err.message });
      }
      if (err.code === "EUSER_EXISTS") {
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
    preHandler: [app.authenticate, requireAdminPrivileges],
    schema: apiSchemas.updatePermissionsSchema
  }, async (req, reply) => {
    try {
      const params = userIdParamSchema.parse(req.params);
      const body = updatePermissionsSchema.parse(req.body);
      const user = await userService.updateUserPermissions(params.id, body, req.currentUser as AuthUser);
      return { user };
    } catch (error) {
      const err = error as Error;
      if (err.message.includes("Insufficient permissions")) {
        return reply.status(403).send({ error: err.message });
      }
      if (err.message.includes("Only super-admins")) {
        return reply.status(403).send({ error: err.message });
      }
      if (err.message.includes("do not have permission")) {
        return reply.status(403).send({ error: err.message });
      }
      if (err.message.includes("User not found")) {
        return reply.status(404).send({ error: err.message });
      }
      throw error;
    }
  });

  /**
   * POST /admin/users/:id/permissions/grant
   * Grant a specific permission to a user
   */
  app.post<{ Params: { id: string } }>("/admin/users/:id/permissions/grant", {
    preHandler: [app.authenticate, requireAdminPrivileges],
    schema: apiSchemas.grantPermissionSchema
  }, async (req, reply) => {
    try {
      const params = userIdParamSchema.parse(req.params);
      const body = grantPermissionSchema.parse(req.body);
      const user = await userService.grantPermission(params.id, body, req.currentUser as AuthUser);
      return { user };
    } catch (error) {
      const err = error as Error;
      if (err.message.includes("Only Super-Admin role")) {
        return reply.status(400).send({ error: err.message });
      }
      if (err.message.includes("projectKey requires tenantSlug")) {
        return reply.status(400).send({ error: err.message });
      }
      if (err.message.includes("Insufficient permissions")) {
        return reply.status(403).send({ error: err.message });
      }
      if (err.message.includes("Only super-admins")) {
        return reply.status(403).send({ error: err.message });
      }
      if (err.message.includes("do not have permission")) {
        return reply.status(403).send({ error: err.message });
      }
      if (err.message.includes("User not found")) {
        return reply.status(404).send({ error: err.message });
      }
      throw error;
    }
  });

  /**
   * POST /admin/users/:id/permissions/revoke
   * Revoke a specific permission from a user
   */
  app.post<{ Params: { id: string } }>("/admin/users/:id/permissions/revoke", {
    preHandler: [app.authenticate, requireAdminPrivileges],
    schema: apiSchemas.revokePermissionSchema
  }, async (req, reply) => {
    try {
      const params = userIdParamSchema.parse(req.params);
      const body = revokePermissionSchema.parse(req.body);
      const user = await userService.revokePermission(params.id, body, req.currentUser as AuthUser);
      return { user };
    } catch (error) {
      const err = error as Error;
      if (err.message.includes("projectKey requires tenantSlug")) {
        return reply.status(400).send({ error: err.message });
      }
      if (err.message.includes("Insufficient permissions")) {
        return reply.status(403).send({ error: err.message });
      }
      if (err.message.includes("Only super-admins")) {
        return reply.status(403).send({ error: err.message });
      }
      if (err.message.includes("do not have permission")) {
        return reply.status(403).send({ error: err.message });
      }
      if (err.message.includes("User not found")) {
        return reply.status(404).send({ error: err.message });
      }
      throw error;
    }
  });

  /**
   * DELETE /admin/users/:id
   * Delete a user (soft delete)
   */
  app.delete<{ Params: { id: string } }>("/admin/users/:id", {
    preHandler: [app.authenticate, requireAdminPrivileges],
    schema: apiSchemas.deleteUserSchema
  }, async (req, reply) => {
    try {
      const params = userIdParamSchema.parse(req.params);
      const success = await userService.deleteUser(params.id, req.currentUser as AuthUser);

      if (!success) {
        return reply.status(404).send({ error: "User not found" });
      }

      return { success };
    } catch (error) {
      const err = error as Error;
      if (err.message.includes("Insufficient permissions")) {
        return reply.status(403).send({ error: err.message });
      }
      throw error;
    }
  });

  app.log.info("Admin user routes registered (Enterprise Edition with PostgreSQL)");
}
