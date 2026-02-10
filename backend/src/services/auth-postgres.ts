/**
 * PostgreSQL-based Authentication Service
 *
 * Handles authentication using PostgreSQL users and permissions tables.
 */

import { userRepository } from "../repositories/UserRepository.js";
import { permissionRepository } from "../repositories/PermissionRepository.js";
import type { UserPermissions } from "../types/permissions.js";
import { UserRole } from "../types/roles.js";
import * as argon2 from "argon2";
import * as crypto from "crypto";
import { logger } from "../lib/logger.js";

function hasAnyPermissions(permissions: UserPermissions): boolean {
  return Boolean(
    permissions.globalRole ||
    (permissions.tenantPermissions && Object.keys(permissions.tenantPermissions).length > 0) ||
    (permissions.projectPermissions && Object.keys(permissions.projectPermissions).length > 0)
  );
}

/**
 * Build JWT payload from PostgreSQL user and permissions
 */
export async function buildJwtPayloadFromPostgres(userId: string) {
  // Get user from PostgreSQL
  const user = await userRepository.findById(userId);
  if (!user) {
    throw new Error("User not found");
  }

  const permissions = await permissionRepository.getUserPermissions(userId);

  // Build tenantSlugs array from tenant permissions
  const tenantSlugs: string[] = [];
  const ownedTenantSlugs: string[] = [];

  // Add all tenant permissions to tenantSlugs
  if (permissions.tenantPermissions) {
    for (const [tenantSlug, permission] of Object.entries(permissions.tenantPermissions)) {
      tenantSlugs.push(tenantSlug);

      // Add to owned tenants if user is owner
      if (permission.isOwner) {
        ownedTenantSlugs.push(tenantSlug);
      }
    }
  }

  // Include tenant slugs from project permissions (ensures JWT has tenant list)
  if (permissions.projectPermissions) {
    for (const tenantSlug of Object.keys(permissions.projectPermissions)) {
      if (!tenantSlugs.includes(tenantSlug)) {
        tenantSlugs.push(tenantSlug);
      }
    }
  }

  // Build roles array based on permissions
  const roles: string[] = [];

  // Check for super-admin (global) permission
  if (permissions.globalRole === UserRole.SUPER_ADMIN) {
    roles.push('super-admin');

    // Super-admin implicitly has all other roles
    roles.push('admin', 'author', 'user');

    // Super-admin has access to all tenants
    // Get all tenant slugs from the database
    const allTenantSlugs = await permissionRepository.getUserTenantSlugs(userId);
    for (const slug of allTenantSlugs) {
      if (!tenantSlugs.includes(slug)) {
        tenantSlugs.push(slug);
      }
    }
  } else {
    // Determine highest role from tenant permissions
    let hasAdmin = false;
    let hasAuthor = false;

  if (permissions.tenantPermissions) {
    for (const permission of Object.values(permissions.tenantPermissions)) {
      if (permission.role === UserRole.TENANT_ADMIN || permission.role === UserRole.ADMIN) {
        hasAdmin = true;
      } else if (permission.role === UserRole.APPROVER || permission.role === UserRole.AUTHOR) {
        hasAuthor = true;
      }
    }
    }

    // Check project permissions too
    if (permissions.projectPermissions) {
      for (const projects of Object.values(permissions.projectPermissions)) {
        for (const permission of Object.values(projects)) {
          if (permission.role === UserRole.ADMIN) {
            hasAdmin = true;
          } else if (permission.role === UserRole.APPROVER || permission.role === UserRole.AUTHOR) {
            hasAuthor = true;
          }
        }
      }
    }

    // Build roles array based on highest permission
    if (hasAdmin) {
      roles.push('admin', 'author', 'user');
  } else if (hasAuthor) {
      roles.push('author', 'user');
    } else {
      roles.push('user');
    }
  }

  // Return JWT payload
  return {
    sub: user.id,
    id: user.id,
    email: user.email,
    name: user.name || user.email,
    emailVerified: user.emailVerified,
    roles,
    tenantSlugs,
    ownedTenantSlugs,
    permissions
  };
}

/**
 * Authenticate user with email and password using PostgreSQL
 */
export async function authenticateUserPostgres(email: string, password: string) {
  const user = await userRepository.findByEmail(email);

  if (!user) {
    return null;
  }

  // Verify password using argon2
  try {
    const isValid = await argon2.verify(user.passwordHash, password);
    if (!isValid) {
      return null;
    }
  } catch (error) {
    // Try legacy hash formats if argon2 fails
    // Check if it's a scrypt hash
    if (user.passwordHash.startsWith('scrypt:')) {
      const verified = await verifyScryptPassword(password, user.passwordHash);
      if (!verified) {
        return null;
      }
    } else {
      // Unknown hash format
      return null;
    }
  }

  return user;
}

/**
 * Verify legacy scrypt password
 */
async function verifyScryptPassword(password: string, hash: string): Promise<boolean> {
  try {
    const parts = hash.split(':');
    if (parts.length !== 4 || parts[0] !== 'scrypt') {
      return false;
    }

    const [, salt, derivedKey] = parts;
    const keyBuffer = await new Promise<Buffer>((resolve, reject) => {
      crypto.scrypt(password, salt, 64, (err, key) => {
        if (err) reject(err);
        else resolve(key);
      });
    });

    return keyBuffer.toString('hex') === derivedKey;
  } catch {
    return false;
  }
}

/**
 * Get user with permissions from PostgreSQL
 */
export async function getUserWithPermissions(userId: string) {
  const user = await userRepository.findById(userId);
  if (!user) {
    return null;
  }

  const permissions = await permissionRepository.getUserPermissions(userId);

  return {
    ...user,
    permissions
  };
}
