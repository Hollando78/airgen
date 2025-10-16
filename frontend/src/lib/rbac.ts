/**
 * Frontend RBAC (Role-Based Access Control) System
 *
 * Provides type-safe role checking and permission management on the frontend.
 * Must match the backend RBAC system in backend/src/lib/rbac.ts
 */

/**
 * User roles in hierarchical order (highest to lowest privilege)
 */
export enum UserRole {
  /** Global administrator - access to ALL tenants and projects */
  SUPER_ADMIN = 'super-admin',

  /** Tenant administrator - access to ALL projects within a tenant */
  TENANT_ADMIN = 'tenant-admin',

  /** Project administrator - full access to a specific project */
  ADMIN = 'admin',

  /** Can approve/authorize documents (future functionality) */
  APPROVER = 'approver',

  /** Author - can create and edit requirements, documents */
  AUTHOR = 'author',

  /** Viewer - read-only access */
  VIEWER = 'viewer'
}

/**
 * Role hierarchy levels for privilege comparison
 * Higher number = higher privilege
 */
export const ROLE_HIERARCHY: Record<UserRole, number> = {
  [UserRole.SUPER_ADMIN]: 60,
  [UserRole.TENANT_ADMIN]: 50,
  [UserRole.ADMIN]: 40,
  [UserRole.APPROVER]: 30,
  [UserRole.AUTHOR]: 20,
  [UserRole.VIEWER]: 10
};

/**
 * Tenant-level permission entry
 */
export interface TenantPermission {
  /** Role for this tenant */
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
 * Check if a role has at least the privilege level of another role
 */
export function hasMinimumRole(userRole: UserRole, minimumRequired: UserRole): boolean {
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[minimumRequired];
}

/**
 * Check if role grants write access
 */
export function canWrite(role: UserRole): boolean {
  return ROLE_HIERARCHY[role] >= ROLE_HIERARCHY[UserRole.AUTHOR];
}

/**
 * Check if role grants admin access
 */
export function isAdmin(role: UserRole): boolean {
  return ROLE_HIERARCHY[role] >= ROLE_HIERARCHY[UserRole.ADMIN];
}

/**
 * Check if role grants tenant-level admin access
 */
export function isTenantAdmin(role: UserRole): boolean {
  return ROLE_HIERARCHY[role] >= ROLE_HIERARCHY[UserRole.TENANT_ADMIN];
}

/**
 * Check if role grants super-admin access
 */
export function isSuperAdmin(role: UserRole): boolean {
  return role === UserRole.SUPER_ADMIN;
}

/**
 * Get the effective role for a user in a specific context
 *
 * @param permissions - User's permissions object
 * @param tenantSlug - Optional tenant slug
 * @param projectKey - Optional project key
 * @returns The highest applicable role for this context
 */
export function getEffectiveRole(
  permissions: UserPermissions | undefined,
  tenantSlug?: string,
  projectKey?: string
): UserRole | null {
  if (!permissions) {
    return null;
  }

  // Global role takes precedence
  if (permissions.globalRole) {
    return permissions.globalRole;
  }

  if (!tenantSlug) {
    // Return highest role across all assigned permissions
    let highestRole: UserRole | null = null;

    if (permissions.tenantPermissions) {
      for (const permission of Object.values(permissions.tenantPermissions)) {
        highestRole = highestRole
          ? (ROLE_HIERARCHY[permission.role] >= ROLE_HIERARCHY[highestRole] ? permission.role : highestRole)
          : permission.role;
      }
    }

    if (permissions.projectPermissions) {
      for (const projects of Object.values(permissions.projectPermissions)) {
        for (const permission of Object.values(projects)) {
          highestRole = highestRole
            ? (ROLE_HIERARCHY[permission.role] >= ROLE_HIERARCHY[highestRole] ? permission.role : highestRole)
            : permission.role;
        }
      }
    }

    return highestRole;
  }

  // Check project-level permission
  if (projectKey) {
    const projectRole = permissions.projectPermissions?.[tenantSlug]?.[projectKey]?.role;
    const tenantRole = permissions.tenantPermissions?.[tenantSlug]?.role;

    // Return the higher of project or tenant role
    if (projectRole && tenantRole) {
      return ROLE_HIERARCHY[projectRole] >= ROLE_HIERARCHY[tenantRole] ? projectRole : tenantRole;
    }

    if (projectRole) return projectRole;
    if (tenantRole) return tenantRole;

    return null;
  }

  // Check tenant-level permission
  const tenantRole = permissions.tenantPermissions?.[tenantSlug]?.role;
  return tenantRole ?? null;
}

/**
 * Check if user has access to a tenant
 */
export function hasTenantAccess(permissions: UserPermissions | undefined, tenantSlug: string): boolean {
  if (!permissions) {
    return false;
  }

  // Super-admin has access to everything
  if (permissions.globalRole === UserRole.SUPER_ADMIN) {
    return true;
  }

  // Check tenant permission
  if (permissions.tenantPermissions?.[tenantSlug]) {
    return true;
  }

  // Check if user has any project permissions in this tenant
  const projectPermissions = permissions.projectPermissions?.[tenantSlug];
  if (projectPermissions && Object.keys(projectPermissions).length > 0) {
    return true;
  }

  return false;
}

/**
 * Check if user has access to a specific project
 */
export function hasProjectAccess(
  permissions: UserPermissions | undefined,
  tenantSlug: string,
  projectKey: string
): boolean {
  if (!permissions) {
    return false;
  }

  // Super-admin has access to everything
  if (permissions.globalRole === UserRole.SUPER_ADMIN) {
    return true;
  }

  // Check tenant-level permission (tenant-admin has access to all projects)
  const tenantPermission = permissions.tenantPermissions?.[tenantSlug];
  if (tenantPermission && ROLE_HIERARCHY[tenantPermission.role] >= ROLE_HIERARCHY[UserRole.TENANT_ADMIN]) {
    return true;
  }

  // Check project-level permission
  if (permissions.projectPermissions?.[tenantSlug]?.[projectKey]) {
    return true;
  }

  // Check tenant permission with lower role
  if (tenantPermission) {
    return true;
  }

  return false;
}

/**
 * Get all tenants a user has access to
 */
export function getUserTenants(permissions: UserPermissions | undefined): string[] {
  if (!permissions) {
    return [];
  }

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
 * Migrate legacy permissions to new structure
 *
 * For backward compatibility with old user objects
 */
export function migrateLegacyPermissions(
  roles?: string[],
  tenantSlugs?: string[],
  ownedTenantSlugs?: string[]
): UserPermissions {
  const permissions: UserPermissions = {};

  // Check for super-admin in legacy roles
  if (roles?.some(r => r.toLowerCase() === 'super-admin')) {
    permissions.globalRole = UserRole.SUPER_ADMIN;
    return permissions;
  }

  // Convert tenantSlugs to tenant permissions
  if (tenantSlugs && tenantSlugs.length > 0) {
    permissions.tenantPermissions = {};

    for (const tenantSlug of tenantSlugs) {
      const isOwner = ownedTenantSlugs?.includes(tenantSlug) ?? false;

      // Determine role from legacy data
      let role: UserRole;
      if (isOwner) {
        role = UserRole.TENANT_ADMIN; // Owners become tenant-admins
      } else if (roles?.includes('admin')) {
        role = UserRole.ADMIN; // Admin role → Project Admin
      } else {
        role = UserRole.AUTHOR; // Default to author
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
 * Get display name for a role
 */
export function getRoleDisplayName(role: UserRole): string {
  switch (role) {
    case UserRole.SUPER_ADMIN:
      return 'Super Administrator';
    case UserRole.TENANT_ADMIN:
      return 'Tenant Administrator';
    case UserRole.ADMIN:
      return 'Project Administrator';
    case UserRole.APPROVER:
      return 'Approver';
    case UserRole.AUTHOR:
      return 'Author';
    case UserRole.VIEWER:
      return 'Viewer';
  }
}

/**
 * Get role description
 */
export function getRoleDescription(role: UserRole): string {
  switch (role) {
    case UserRole.SUPER_ADMIN:
      return 'Full access to all tenants, projects, and system configuration';
    case UserRole.TENANT_ADMIN:
      return 'Full access to all projects within assigned tenants';
    case UserRole.ADMIN:
      return 'Full access to assigned projects';
    case UserRole.APPROVER:
      return 'Can approve and authorize documents';
    case UserRole.AUTHOR:
      return 'Can create and edit requirements and documents';
    case UserRole.VIEWER:
      return 'Read-only access to assigned projects';
  }
}
