/**
 * User Permissions System
 *
 * Defines granular permissions at tenant and project levels.
 * Supports hierarchical role-based access control.
 */

import { UserRole } from './roles.js';

/**
 * Tenant-level permission entry
 */
export interface TenantPermission {
  /** Role for this tenant (Tenant-Admin grants access to all projects) */
  role: UserRole;

  /** Whether user owns/created this tenant */
  isOwner?: boolean;

  /** When this permission was granted */
  grantedAt?: string;

  /** Who granted this permission (user ID) */
  grantedBy?: string;
}

/**
 * Project-level permission entry
 */
export interface ProjectPermission {
  /** Role for this project */
  role: UserRole;

  /** When this permission was granted */
  grantedAt?: string;

  /** Who granted this permission (user ID) */
  grantedBy?: string;
}

/**
 * Complete user permissions structure
 */
export interface UserPermissions {
  /**
   * Global role - only Super-Admin uses this
   * If set, user has this role across ALL tenants and projects
   */
  globalRole?: UserRole.SUPER_ADMIN;

  /**
   * Tenant-level permissions
   * Key: tenant slug
   * Value: Tenant permission details
   */
  tenantPermissions?: {
    [tenantSlug: string]: TenantPermission;
  };

  /**
   * Project-level permissions
   * Organized by tenant, then project
   * Key: tenant slug -> project key -> permission
   */
  projectPermissions?: {
    [tenantSlug: string]: {
      [projectKey: string]: ProjectPermission;
    };
  };
}

/**
 * Permission check result
 */
export interface PermissionCheckResult {
  /** Whether access is granted */
  granted: boolean;

  /** The effective role for this context */
  effectiveRole?: UserRole;

  /** Reason for denial (if not granted) */
  reason?: string;

  /** Source of permission (global, tenant, project) */
  source?: 'global' | 'tenant' | 'project';
}

/**
 * Permission grant request
 */
export interface GrantPermissionRequest {
  /** User ID to grant permission to */
  userId: string;

  /** Tenant slug (required for tenant/project permissions) */
  tenantSlug?: string;

  /** Project key (required for project permissions) */
  projectKey?: string;

  /** Role to grant */
  role: UserRole;

  /** Who is granting this permission */
  grantedBy: string;
}

/**
 * Permission revoke request
 */
export interface RevokePermissionRequest {
  /** User ID to revoke permission from */
  userId: string;

  /** Tenant slug */
  tenantSlug?: string;

  /** Project key (if revoking project-level permission) */
  projectKey?: string;
}

/**
 * Legacy permission fields (for backward compatibility)
 */
export interface LegacyPermissions {
  /** Old-style roles array */
  roles?: string[];

  /** Old-style tenant access list */
  tenantSlugs?: string[];

  /** Old-style owned tenants list */
  ownedTenantSlugs?: string[];
}

/**
 * Convert legacy permissions to new structure
 */
export function migrateLegacyPermissions(
  legacy: LegacyPermissions,
  defaultRole: UserRole = UserRole.AUTHOR
): UserPermissions {
  const permissions: UserPermissions = {};

  // Check for super-admin in roles
  if (legacy.roles?.some(r => r.toLowerCase() === 'super-admin')) {
    permissions.globalRole = UserRole.SUPER_ADMIN;
    return permissions; // Super-admin doesn't need other permissions
  }

  // Convert tenantSlugs to tenant permissions
  if (legacy.tenantSlugs && legacy.tenantSlugs.length > 0) {
    permissions.tenantPermissions = {};

    for (const tenantSlug of legacy.tenantSlugs) {
      const isOwner = legacy.ownedTenantSlugs?.includes(tenantSlug);

      // Determine role based on legacy data
      let role: UserRole;
      if (isOwner) {
        // Owners get tenant-admin by default
        role = UserRole.TENANT_ADMIN;
      } else if (legacy.roles?.includes('admin')) {
        // Admin role in legacy system
        role = UserRole.TENANT_ADMIN; // Promote to tenant-admin for now
      } else {
        role = defaultRole;
      }

      permissions.tenantPermissions[tenantSlug] = {
        role,
        isOwner,
        grantedAt: new Date().toISOString()
      };
    }
  }

  return permissions;
}
