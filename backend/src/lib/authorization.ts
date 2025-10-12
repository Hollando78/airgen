/**
 * Authorization utilities for tenant/project access control
 * Ensures users can only access resources they have permissions for
 */

import type { FastifyRequest, FastifyReply } from "fastify";
import { slugify } from "../services/workspace.js";

/**
 * User information from JWT token
 */
export interface AuthUser {
  sub: string;          // User ID
  email: string;
  name?: string;
  roles: string[];
  tenantSlugs: string[]; // List of tenants user has access to
}

/**
 * Check if user has access to a specific tenant
 */
export function hasTenantAccess(user: AuthUser | undefined, tenantSlug: string): boolean {
  if (!user) {
    return false;
  }

  // Admin role has access to all tenants
  if (user.roles.includes("admin")) {
    return true;
  }

  // Check if user's tenant list includes this tenant
  const normalizedTenant = slugify(tenantSlug);
  return user.tenantSlugs.some(slug => slugify(slug) === normalizedTenant);
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
