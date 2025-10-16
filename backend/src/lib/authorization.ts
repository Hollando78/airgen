/**
 * Authorization utilities for tenant/project access control
 * Ensures users can only access resources they have permissions for
 */

import type { FastifyRequest, FastifyReply } from "fastify";
import { slugify } from "../services/workspace.js";
import { UserRole } from "../types/roles.js";
import type { UserPermissions } from "../types/permissions.js";
import * as rbac from "./rbac.js";
import type { DevUserRecord } from "../services/dev-users.js";

/**
 * User information from JWT token
 */
export interface AuthUser {
  sub: string;          // User ID
  email: string;
  name?: string;

  // NEW: Structured permissions
  permissions?: UserPermissions;

  // DEPRECATED: Legacy fields (kept for backward compatibility)
  /** @deprecated Use permissions instead */
  roles: string[];
  /** @deprecated Use permissions.tenantPermissions instead */
  tenantSlugs: string[]; // List of tenants user has access to
  /** @deprecated Use permissions.tenantPermissions[].isOwner instead */
  ownedTenantSlugs?: string[];
}

/**
 * Check if user has access to a specific tenant
 */
export function hasTenantAccess(user: AuthUser | undefined, tenantSlug: string): boolean {
  if (!user) {
    return false;
  }

  // Check if user's tenant list includes this tenant
  const normalizedTenant = slugify(tenantSlug);

  // Permissions-based checks (new RBAC)
  if (user.permissions) {
    if (user.permissions.globalRole === UserRole.SUPER_ADMIN) {
      return true;
    }

    if (user.permissions.tenantPermissions?.[normalizedTenant]) {
      return true;
    }

    const projectPermissions = user.permissions.projectPermissions?.[normalizedTenant];
    if (projectPermissions && Object.keys(projectPermissions).length > 0) {
      return true;
    }
  }

  // Legacy fallback
  if ((user.tenantSlugs ?? []).some(slug => slugify(slug) === normalizedTenant)) {
    return true;
  }

  // Owners implicitly have access, even if tenantSlugs is out of date
  if ((user.ownedTenantSlugs ?? []).some(slug => slugify(slug) === normalizedTenant)) {
    return true;
  }

  return false;
}

export function isTenantOwner(user: AuthUser | undefined, tenantSlug: string): boolean {
  if (!user || !Array.isArray(user.ownedTenantSlugs)) {
    // Fall through to check new permissions structure
  } else {
    const normalizedTenant = slugify(tenantSlug);
    if (user.ownedTenantSlugs.some(slug => slugify(slug) === normalizedTenant)) {
      return true;
    }
  }

  if (!user || !user.permissions?.tenantPermissions) {
    return false;
  }

  const normalizedTenant = slugify(tenantSlug);
  return Boolean(user.permissions.tenantPermissions[normalizedTenant]?.isOwner);
}

/**
 * Check if user has a specific role
 */
export function hasRole(user: AuthUser | undefined, role: string): boolean {
  if (!user) {
    return false;
  }
  return user.roles.includes(role);
}

/**
 * Verify tenant access and throw error if unauthorized
 * Use this in route handlers after parsing request parameters
 */
export function requireTenantAccess(
  user: AuthUser | undefined,
  tenant: string,
  reply: FastifyReply
): asserts user is AuthUser {
  if (!user) {
    reply.code(401).send({
      error: "Unauthorized",
      message: "Authentication required"
    });
    throw new Error("Unauthorized"); // Stop execution
  }

  const tenantSlug = slugify(tenant);

  if (!hasTenantAccess(user, tenantSlug)) {
    reply.code(403).send({
      error: "Forbidden",
      message: `You do not have access to tenant '${tenant}'`
    });
    throw new Error("Forbidden"); // Stop execution
  }
}

/**
 * Verify user has a specific role and throw error if unauthorized
 */
export function requireRole(
  user: AuthUser | undefined,
  role: string,
  reply: FastifyReply
): asserts user is AuthUser {
  if (!user) {
    reply.code(401).send({
      error: "Unauthorized",
      message: "Authentication required"
    });
    throw new Error("Unauthorized");
  }

  if (!hasRole(user, role)) {
    reply.code(403).send({
      error: "Forbidden",
      message: `This action requires the '${role}' role`
    });
    throw new Error("Forbidden");
  }
}

/**
 * Fastify plugin hook to verify tenant access
 * Can be used as a preHandler hook
 *
 * Example:
 * app.get("/api/:tenant/projects", {
 *   preHandler: [app.authenticate, verifyTenantAccessHook]
 * }, handler);
 */
export async function verifyTenantAccessHook(
  request: FastifyRequest<{ Params: { tenant: string } }>,
  reply: FastifyReply
): Promise<void> {
  const user = request.currentUser as AuthUser | undefined;
  const tenant = request.params.tenant;

  if (!tenant) {
    reply.code(400).send({
      error: "Bad Request",
      message: "Tenant parameter is required"
    });
    return;
  }

  requireTenantAccess(user, tenant, reply);
}

/**
 * Extract tenant from various parameter locations and verify access
 * Supports different parameter structures
 */
export function verifyTenantAccessFromParams(
  user: AuthUser | undefined,
  params: Record<string, unknown>,
  reply: FastifyReply
): string {
  // Try different parameter names
  const tenant = params.tenant || params.tenantSlug || params.tenantKey;

  if (typeof tenant !== "string") {
    reply.code(400).send({
      error: "Bad Request",
      message: "Tenant parameter is required"
    });
    throw new Error("Bad Request");
  }

  requireTenantAccess(user, tenant, reply);
  return slugify(tenant);
}

/**
 * Extract tenant from request body and verify access
 */
export function verifyTenantAccessFromBody(
  user: AuthUser | undefined,
  body: Record<string, unknown>,
  reply: FastifyReply
): string {
  const tenant = body.tenant || body.tenantSlug;

  if (typeof tenant !== "string") {
    reply.code(400).send({
      error: "Bad Request",
      message: "Tenant is required in request body"
    });
    throw new Error("Bad Request");
  }

  requireTenantAccess(user, tenant, reply);
  return slugify(tenant);
}

/**
 * Log authorization failure for audit purposes
 */
export function logAuthorizationFailure(
  request: FastifyRequest,
  user: AuthUser | undefined,
  tenant: string,
  action: string
): void {
  request.log.warn({
    event: "authorization.tenant_access_denied",
    userId: user?.sub,
    email: user?.email,
    requestedTenant: tenant,
    userTenants: user?.tenantSlugs,
    action,
    ip: request.ip,
    path: request.url
  }, "Tenant access denied");
}

/**
 * Middleware factory: Create tenant authorization middleware for specific parameter name
 */
export function createTenantAuthMiddleware(paramName: string = "tenant") {
  return async (
    request: FastifyRequest<{ Params: Record<string, string> }>,
    reply: FastifyReply
  ): Promise<void> => {
    const user = request.currentUser as AuthUser | undefined;
    const tenant = request.params[paramName];

    if (!tenant) {
      reply.code(400).send({
        error: "Bad Request",
        message: `${paramName} parameter is required`
      });
      return;
    }

    if (!user) {
      reply.code(401).send({
        error: "Unauthorized",
        message: "Authentication required"
      });
      return;
    }

    if (!hasTenantAccess(user, tenant)) {
      logAuthorizationFailure(request, user, tenant, "access_check");
      reply.code(403).send({
        error: "Forbidden",
        message: `You do not have access to tenant '${tenant}'`
      });
      return;
    }
  };
}

// ============================================================================
// NEW: Role-Based Authorization Middleware
// ============================================================================

/**
 * Convert AuthUser to DevUserRecord for RBAC checks
 * This bridges the JWT payload with the RBAC system
 */
function authUserToDevUserRecord(user: AuthUser): DevUserRecord {
  return {
    id: user.sub,
    email: user.email,
    name: user.name,
    permissions: user.permissions,
    roles: user.roles ?? [],
    tenantSlugs: user.tenantSlugs ?? [],
    ownedTenantSlugs: user.ownedTenantSlugs,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

/**
 * Require user to be Super-Admin
 */
export function requireSuperAdmin(
  user: AuthUser | undefined,
  reply: FastifyReply
): asserts user is AuthUser {
  if (!user) {
    reply.code(401).send({
      error: "Unauthorized",
      message: "Authentication required"
    });
    throw new Error("Unauthorized");
  }

  const devUser = authUserToDevUserRecord(user);
  if (!rbac.isSuperAdmin(devUser)) {
    reply.code(403).send({
      error: "Forbidden",
      message: "This action requires Super Administrator privileges"
    });
    throw new Error("Forbidden");
  }
}

/**
 * Require user to be Tenant-Admin for a specific tenant
 */
export function requireTenantAdmin(
  user: AuthUser | undefined,
  tenantSlug: string,
  reply: FastifyReply
): asserts user is AuthUser {
  if (!user) {
    reply.code(401).send({
      error: "Unauthorized",
      message: "Authentication required"
    });
    throw new Error("Unauthorized");
  }

  const devUser = authUserToDevUserRecord(user);
  if (!rbac.isTenantAdmin(devUser, tenantSlug)) {
    reply.code(403).send({
      error: "Forbidden",
      message: `This action requires Tenant Administrator privileges for '${tenantSlug}'`
    });
    throw new Error("Forbidden");
  }
}

/**
 * Require user to be Project-Admin for a specific project
 */
export function requireProjectAdmin(
  user: AuthUser | undefined,
  tenantSlug: string,
  projectKey: string,
  reply: FastifyReply
): asserts user is AuthUser {
  if (!user) {
    reply.code(401).send({
      error: "Unauthorized",
      message: "Authentication required"
    });
    throw new Error("Unauthorized");
  }

  const devUser = authUserToDevUserRecord(user);
  if (!rbac.isProjectAdmin(devUser, tenantSlug, projectKey)) {
    reply.code(403).send({
      error: "Forbidden",
      message: `This action requires Project Administrator privileges for '${tenantSlug}/${projectKey}'`
    });
    throw new Error("Forbidden");
  }
}

/**
 * Require user to have at least a minimum role in a context
 */
export function requireMinimumRole(
  user: AuthUser | undefined,
  minimumRole: UserRole,
  tenantSlug?: string,
  projectKey?: string,
  reply?: FastifyReply
): asserts user is AuthUser {
  if (!user) {
    reply?.code(401).send({
      error: "Unauthorized",
      message: "Authentication required"
    });
    throw new Error("Unauthorized");
  }

  const devUser = authUserToDevUserRecord(user);
  if (!rbac.hasMinimumRole(devUser, minimumRole, tenantSlug, projectKey)) {
    reply?.code(403).send({
      error: "Forbidden",
      message: `This action requires at least '${minimumRole}' role`
    });
    throw new Error("Forbidden");
  }
}

/**
 * Middleware: Require Super-Admin
 */
export async function requireSuperAdminMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const user = request.currentUser as AuthUser | undefined;
  requireSuperAdmin(user, reply);
}

/**
 * Middleware factory: Require Tenant-Admin for tenant in route params
 */
export function createRequireTenantAdminMiddleware(paramName: string = "tenant") {
  return async (
    request: FastifyRequest<{ Params: Record<string, string> }>,
    reply: FastifyReply
  ): Promise<void> => {
    const user = request.currentUser as AuthUser | undefined;
    const tenant = request.params[paramName];

    if (!tenant) {
      reply.code(400).send({
        error: "Bad Request",
        message: `${paramName} parameter is required`
      });
      return;
    }

    requireTenantAdmin(user, tenant, reply);
  };
}

/**
 * Middleware factory: Require Project-Admin for project in route params
 */
export function createRequireProjectAdminMiddleware(
  tenantParam: string = "tenant",
  projectParam: string = "project"
) {
  return async (
    request: FastifyRequest<{ Params: Record<string, string> }>,
    reply: FastifyReply
  ): Promise<void> => {
    const user = request.currentUser as AuthUser | undefined;
    const tenant = request.params[tenantParam];
    const project = request.params[projectParam];

    if (!tenant || !project) {
      reply.code(400).send({
        error: "Bad Request",
        message: "Tenant and project parameters are required"
      });
      return;
    }

    requireProjectAdmin(user, tenant, project, reply);
  };
}
