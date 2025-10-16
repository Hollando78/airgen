/**
 * useUserRole Hook
 *
 * Provides convenient access to user role and permission checking.
 * Automatically handles legacy permission migration.
 */

import { useMemo } from "react";
import { useAuth } from "../contexts/AuthContext";
import {
  UserRole,
  type UserPermissions,
  getEffectiveRole,
  hasMinimumRole,
  hasTenantAccess,
  hasProjectAccess,
  getUserTenants,
  isSuperAdmin,
  isTenantAdmin,
  isAdmin,
  canWrite,
  migrateLegacyPermissions
} from "../lib/rbac";

export interface UseUserRoleResult {
  /** User's permissions object (with automatic legacy migration) */
  permissions: UserPermissions | undefined;

  /** Get the effective role for a specific context */
  getRole: (tenantSlug?: string, projectKey?: string) => UserRole | null;

  /** Check if user has at least a minimum role in a context */
  hasRole: (minimumRole: UserRole, tenantSlug?: string, projectKey?: string) => boolean;

  /** Check if user is Super-Admin */
  isSuperAdmin: () => boolean;

  /** Check if user is Tenant-Admin for a specific tenant */
  isTenantAdmin: (tenantSlug: string) => boolean;

  /** Check if user is Admin (project-level or higher) in a context */
  isAdmin: (tenantSlug?: string, projectKey?: string) => boolean;

  /** Check if user can write in a context */
  canWrite: (tenantSlug?: string, projectKey?: string) => boolean;

  /** Check if user has access to a tenant */
  hasTenantAccess: (tenantSlug: string) => boolean;

  /** Check if user has access to a specific project */
  hasProjectAccess: (tenantSlug: string, projectKey: string) => boolean;

  /** Get all tenants user has access to (empty array = all tenants for super-admin) */
  getUserTenants: () => string[];
}

/**
 * Hook to access user role and permission information
 *
 * Usage:
 * ```tsx
 * const { isSuperAdmin, hasTenantAccess, getRole } = useUserRole();
 *
 * if (isSuperAdmin()) {
 *   // Show super-admin UI
 * }
 *
 * if (hasTenantAccess('acme')) {
 *   // Show tenant content
 * }
 *
 * const role = getRole('acme', 'project-1');
 * ```
 */
export function useUserRole(): UseUserRoleResult {
  const { user } = useAuth();

  // Get effective permissions with automatic legacy migration
  const permissions = useMemo((): UserPermissions | undefined => {
    if (!user) {
      return undefined;
    }

    // If user already has new permissions structure, use it
    if (user.permissions) {
      return user.permissions;
    }

    // Migrate from legacy fields
    return migrateLegacyPermissions(
      user.roles,
      user.tenantSlugs,
      user.ownedTenantSlugs
    );
  }, [user]);

  const getRole = useMemo(() => {
    return (tenantSlug?: string, projectKey?: string): UserRole | null => {
      return getEffectiveRole(permissions, tenantSlug, projectKey);
    };
  }, [permissions]);

  const hasRole = useMemo(() => {
    return (minimumRole: UserRole, tenantSlug?: string, projectKey?: string): boolean => {
      const effectiveRole = getEffectiveRole(permissions, tenantSlug, projectKey);
      if (!effectiveRole) return false;
      return hasMinimumRole(effectiveRole, minimumRole);
    };
  }, [permissions]);

  const checkIsSuperAdmin = useMemo(() => {
    return (): boolean => {
      return permissions?.globalRole === UserRole.SUPER_ADMIN;
    };
  }, [permissions]);

  const checkIsTenantAdmin = useMemo(() => {
    return (tenantSlug: string): boolean => {
      // Super-admin has tenant-admin rights everywhere
      if (permissions?.globalRole === UserRole.SUPER_ADMIN) {
        return true;
      }

      const role = getEffectiveRole(permissions, tenantSlug);
      if (!role) return false;

      return isTenantAdmin(role);
    };
  }, [permissions]);

  const checkIsAdmin = useMemo(() => {
    return (tenantSlug?: string, projectKey?: string): boolean => {
      const role = getEffectiveRole(permissions, tenantSlug, projectKey);
      if (!role) return false;
      return isAdmin(role);
    };
  }, [permissions]);

  const checkCanWrite = useMemo(() => {
    return (tenantSlug?: string, projectKey?: string): boolean => {
      const role = getEffectiveRole(permissions, tenantSlug, projectKey);
      if (!role) return false;
      return canWrite(role);
    };
  }, [permissions]);

  const checkHasTenantAccess = useMemo(() => {
    return (tenantSlug: string): boolean => {
      return hasTenantAccess(permissions, tenantSlug);
    };
  }, [permissions]);

  const checkHasProjectAccess = useMemo(() => {
    return (tenantSlug: string, projectKey: string): boolean => {
      return hasProjectAccess(permissions, tenantSlug, projectKey);
    };
  }, [permissions]);

  const getTenants = useMemo(() => {
    return (): string[] => {
      return getUserTenants(permissions);
    };
  }, [permissions]);

  return {
    permissions,
    getRole,
    hasRole,
    isSuperAdmin: checkIsSuperAdmin,
    isTenantAdmin: checkIsTenantAdmin,
    isAdmin: checkIsAdmin,
    canWrite: checkCanWrite,
    hasTenantAccess: checkHasTenantAccess,
    hasProjectAccess: checkHasProjectAccess,
    getUserTenants: getTenants
  };
}
