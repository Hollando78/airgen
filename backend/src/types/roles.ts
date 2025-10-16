/**
 * User Role System
 *
 * Hierarchical role-based access control (RBAC) system.
 * Roles are enum-based for type safety and to prevent string typos.
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
 * Check if a role has at least the privilege level of another role
 */
export function hasMinimumRole(userRole: UserRole, minimumRequired: UserRole): boolean {
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[minimumRequired];
}

/**
 * Get the higher of two roles
 */
export function getHigherRole(role1: UserRole, role2: UserRole): UserRole {
  return ROLE_HIERARCHY[role1] >= ROLE_HIERARCHY[role2] ? role1 : role2;
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
 * Legacy role migration helper
 * Maps old string roles to new enum values
 */
export function migrateLegacyRole(legacyRole: string): UserRole {
  const normalized = legacyRole.toLowerCase().trim();

  switch (normalized) {
    case 'super-admin':
    case 'superadmin':
    case 'super_admin':
      return UserRole.SUPER_ADMIN;

    case 'tenant-admin':
    case 'tenantadmin':
    case 'tenant_admin':
      return UserRole.TENANT_ADMIN;

    case 'admin':
    case 'administrator':
      return UserRole.ADMIN;

    case 'approver':
      return UserRole.APPROVER;

    case 'author':
    case 'editor':
    case 'writer':
      return UserRole.AUTHOR;

    case 'viewer':
    case 'reader':
      return UserRole.VIEWER;

    case 'user':
    default:
      // Default to author (allows creating content)
      return UserRole.AUTHOR;
  }
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
