/**
 * Role-Based Access Control (RBAC) Service
 *
 * Provides permission checking logic for the hierarchical role system.
 * Supports global, tenant-level, and project-level permissions.
 */

import type { DevUserRecord } from "../services/dev-users.js";
import { UserRole, ROLE_HIERARCHY, hasMinimumRole as checkMinimumRole } from "../types/roles.js";
import type { UserPermissions, PermissionCheckResult } from "../types/permissions.js";
import { slugify } from "../services/workspace.js";

/**
 * Get effective permissions for a user, migrating legacy fields if needed
 */
export function getEffectivePermissions(user: DevUserRecord): UserPermissions {
  // If user already has new permissions structure, use it
  if (user.permissions) {
    return user.permissions;
  }

  // Migrate from legacy fields
  const permissions: UserPermissions = {};

  // Check for super-admin in legacy roles
  if (user.roles?.some(r => r.toLowerCase() === 'super-admin')) {
    permissions.globalRole = UserRole.SUPER_ADMIN;
    return permissions;
  }

  // Convert tenantSlugs to tenant permissions
  if (user.tenantSlugs && user.tenantSlugs.length > 0) {
    permissions.tenantPermissions = {};

    for (const tenantSlug of user.tenantSlugs) {
      const isOwner = user.ownedTenantSlugs?.includes(tenantSlug);

      // Determine role from legacy data
      let role: UserRole;
      if (isOwner) {
        role = UserRole.TENANT_ADMIN;
      } else if (user.roles?.includes('admin')) {
        role = UserRole.ADMIN; // Could be tenant-admin or project-admin
      } else {
        role = UserRole.AUTHOR; // Default for basic access
      }

      permissions.tenantPermissions[tenantSlug] = {
        role,
        isOwner
      };
    }
  }

  return permissions;
}

/**
 * Get the effective role for a user in a specific context
 *
 * @param user - User record
 * @param tenantSlug - Optional tenant slug
 * @param projectKey - Optional project key
 * @returns The highest applicable role for this context
 */
export function getEffectiveRole(
  user: DevUserRecord,
  tenantSlug?: string,
  projectKey?: string
): UserRole | null {
  const permissions = getEffectivePermissions(user);

  // Global role takes precedence
  if (permissions.globalRole) {
    return permissions.globalRole;
  }

  if (!tenantSlug) {
    // No context provided, return null
    return null;
  }

  const normalizedTenant = slugify(tenantSlug);

  // Check project-level permission
  if (projectKey) {
    const normalizedProject = slugify(projectKey);
    const projectRole = permissions.projectPermissions?.[normalizedTenant]?.[normalizedProject]?.role;
    const tenantRole = permissions.tenantPermissions?.[normalizedTenant]?.role;

    // Return the higher of project or tenant role
    if (projectRole && tenantRole) {
      return ROLE_HIERARCHY[projectRole] >= ROLE_HIERARCHY[tenantRole] ? projectRole : tenantRole;
    }

    if (projectRole) return projectRole;
    if (tenantRole) return tenantRole;

    return null;
  }

  // Check tenant-level permission
  const tenantRole = permissions.tenantPermissions?.[normalizedTenant]?.role;
  return tenantRole ?? null;
}

/**
 * Check if user is a super-admin
 */
export function isSuperAdmin(user: DevUserRecord): boolean {
  const permissions = getEffectivePermissions(user);
  return permissions.globalRole === UserRole.SUPER_ADMIN;
}

/**
 * Check if user is a tenant admin for a specific tenant
 */
export function isTenantAdmin(user: DevUserRecord, tenantSlug: string): boolean {
  // Super-admin has tenant-admin rights everywhere
  if (isSuperAdmin(user)) {
    return true;
  }

  const role = getEffectiveRole(user, tenantSlug);
  if (!role) return false;

  return ROLE_HIERARCHY[role] >= ROLE_HIERARCHY[UserRole.TENANT_ADMIN];
}

/**
 * Check if user is a project admin for a specific project
 */
export function isProjectAdmin(user: DevUserRecord, tenantSlug: string, projectKey: string): boolean {
  // Super-admin and tenant-admin have project-admin rights
  if (isSuperAdmin(user) || isTenantAdmin(user, tenantSlug)) {
    return true;
  }

  const role = getEffectiveRole(user, tenantSlug, projectKey);
  if (!role) return false;

  return ROLE_HIERARCHY[role] >= ROLE_HIERARCHY[UserRole.ADMIN];
}

/**
 * Check if user has at least a minimum role in a context
 */
export function hasMinimumRole(
  user: DevUserRecord,
  minimumRole: UserRole,
  tenantSlug?: string,
  projectKey?: string
): boolean {
  const effectiveRole = getEffectiveRole(user, tenantSlug, projectKey);
  if (!effectiveRole) return false;

  return checkMinimumRole(effectiveRole, minimumRole);
}

/**
 * Check if user can write in a specific context
 */
export function canWrite(user: DevUserRecord, tenantSlug: string, projectKey?: string): boolean {
  return hasMinimumRole(user, UserRole.AUTHOR, tenantSlug, projectKey);
}

/**
 * Check if user can read in a specific context
 */
export function canRead(user: DevUserRecord, tenantSlug: string, projectKey?: string): boolean {
  return hasMinimumRole(user, UserRole.VIEWER, tenantSlug, projectKey);
}

/**
 * Check if user has access to a tenant
 */
export function hasTenantAccess(user: DevUserRecord, tenantSlug: string): PermissionCheckResult {
  const permissions = getEffectivePermissions(user);

  // Super-admin has access to everything
  if (permissions.globalRole === UserRole.SUPER_ADMIN) {
    return {
      granted: true,
      effectiveRole: UserRole.SUPER_ADMIN,
      source: 'global'
    };
  }

  const normalizedTenant = slugify(tenantSlug);

  // Check tenant permission
  const tenantPermission = permissions.tenantPermissions?.[normalizedTenant];
  if (tenantPermission) {
    return {
      granted: true,
      effectiveRole: tenantPermission.role,
      source: 'tenant'
    };
  }

  // Check if user has any project permissions in this tenant
  const projectPermissions = permissions.projectPermissions?.[normalizedTenant];
  if (projectPermissions && Object.keys(projectPermissions).length > 0) {
    // Get highest project role in this tenant
    const highestRole = Object.values(projectPermissions).reduce<UserRole | null>(
      (highest, perm) => {
        if (!highest) return perm.role;
        return ROLE_HIERARCHY[perm.role] > ROLE_HIERARCHY[highest] ? perm.role : highest;
      },
      null
    );

    if (highestRole) {
      return {
        granted: true,
        effectiveRole: highestRole,
        source: 'project'
      };
    }
  }

  return {
    granted: false,
    reason: `No access to tenant '${tenantSlug}'`
  };
}

/**
 * Check if user has access to a specific project
 */
export function hasProjectAccess(
  user: DevUserRecord,
  tenantSlug: string,
  projectKey: string
): PermissionCheckResult {
  const permissions = getEffectivePermissions(user);

  // Super-admin has access to everything
  if (permissions.globalRole === UserRole.SUPER_ADMIN) {
    return {
      granted: true,
      effectiveRole: UserRole.SUPER_ADMIN,
      source: 'global'
    };
  }

  const normalizedTenant = slugify(tenantSlug);
  const normalizedProject = slugify(projectKey);

  // Check tenant-level permission (tenant-admin has access to all projects)
  const tenantPermission = permissions.tenantPermissions?.[normalizedTenant];
  if (tenantPermission && ROLE_HIERARCHY[tenantPermission.role] >= ROLE_HIERARCHY[UserRole.TENANT_ADMIN]) {
    return {
      granted: true,
      effectiveRole: tenantPermission.role,
      source: 'tenant'
    };
  }

  // Check project-level permission
  const projectPermission = permissions.projectPermissions?.[normalizedTenant]?.[normalizedProject];
  if (projectPermission) {
    return {
      granted: true,
      effectiveRole: projectPermission.role,
      source: 'project'
    };
  }

  // Check tenant permission with lower role
  if (tenantPermission) {
    return {
      granted: true,
      effectiveRole: tenantPermission.role,
      source: 'tenant'
    };
  }

  return {
    granted: false,
    reason: `No access to project '${projectKey}' in tenant '${tenantSlug}'`
  };
}

/**
 * Get all tenants a user has access to
 */
export function getUserTenants(user: DevUserRecord): string[] {
  const permissions = getEffectivePermissions(user);

  // Super-admin has access to all tenants (return empty array to indicate "all")
  if (permissions.globalRole === UserRole.SUPER_ADMIN) {
    return []; // Empty array means "all tenants"
  }

  const tenants = new Set<string>();

  // Add tenants from tenant permissions
  if (permissions.tenantPermissions) {
    for (const tenant of Object.keys(permissions.tenantPermissions)) {
      tenants.add(tenant);
    }
  }

  // Add tenants from project permissions
  if (permissions.projectPermissions) {
    for (const tenant of Object.keys(permissions.projectPermissions)) {
      tenants.add(tenant);
    }
  }

  return Array.from(tenants);
}

/**
 * Get all projects a user has access to within a tenant
 */
export function getUserProjects(user: DevUserRecord, tenantSlug: string): string[] {
  const permissions = getEffectivePermissions(user);
  const normalizedTenant = slugify(tenantSlug);

  // Super-admin has access to all projects
  if (permissions.globalRole === UserRole.SUPER_ADMIN) {
    return []; // Empty array means "all projects"
  }

  // Tenant-admin has access to all projects in the tenant
  const tenantPermission = permissions.tenantPermissions?.[normalizedTenant];
  if (tenantPermission && ROLE_HIERARCHY[tenantPermission.role] >= ROLE_HIERARCHY[UserRole.TENANT_ADMIN]) {
    return []; // Empty array means "all projects"
  }

  // Return specific projects
  const projectPermissions = permissions.projectPermissions?.[normalizedTenant];
  if (projectPermissions) {
    return Object.keys(projectPermissions);
  }

  return [];
}
