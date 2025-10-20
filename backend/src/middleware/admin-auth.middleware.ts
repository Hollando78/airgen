/**
 * Authorization middleware for admin routes
 */

import type { FastifyRequest, FastifyReply } from "fastify";
import type { AuthUser } from "../lib/authorization.js";
import { UserRole } from "../types/roles.js";

/**
 * Require user to be authenticated with admin privileges
 * (either super-admin or tenant-admin)
 */
export function requireAdminPrivileges(
  req: FastifyRequest,
  reply: FastifyReply,
  done: (err?: Error) => void
): void {
  const currentUser = req.currentUser as AuthUser | undefined;

  if (!currentUser) {
    reply.status(401).send({ error: "Authentication required" });
    return;
  }

  // Check if user is super-admin
  const isSuperAdmin = currentUser.permissions?.globalRole === UserRole.SUPER_ADMIN ||
                       currentUser.roles?.includes(UserRole.SUPER_ADMIN);

  if (isSuperAdmin) {
    done();
    return;
  }

  // Check if user is a tenant-admin for at least one tenant
  let hasTenantAdminRole = false;
  if (currentUser.permissions?.tenantPermissions) {
    for (const permission of Object.values(currentUser.permissions.tenantPermissions)) {
      if (permission.role === UserRole.TENANT_ADMIN || permission.isOwner) {
        hasTenantAdminRole = true;
        break;
      }
    }
  }

  if (!hasTenantAdminRole) {
    reply.status(403).send({ error: "Insufficient permissions - admin access required" });
    return;
  }

  done();
}

/**
 * Require user to be a super-admin
 */
export function requireSuperAdmin(
  req: FastifyRequest,
  reply: FastifyReply,
  done: (err?: Error) => void
): void {
  const currentUser = req.currentUser as AuthUser | undefined;

  if (!currentUser) {
    reply.status(401).send({ error: "Authentication required" });
    return;
  }

  const isSuperAdmin = currentUser.permissions?.globalRole === UserRole.SUPER_ADMIN ||
                       currentUser.roles?.includes(UserRole.SUPER_ADMIN);

  if (!isSuperAdmin) {
    reply.status(403).send({ error: "Insufficient permissions - super admin access required" });
    return;
  }

  done();
}
