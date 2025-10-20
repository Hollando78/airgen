/**
 * User Authorization Service
 *
 * Handles authorization logic for user management operations.
 * Determines what actions users can perform based on their roles and permissions.
 */

import { UserRole } from "../types/roles.js";
import type { AuthUser } from "../lib/authorization.js";
import type { PermissionRepository } from "../repositories/PermissionRepository.js";

export class UserAuthorizationService {
  constructor(private permRepo: PermissionRepository) {}

  /**
   * Check if a user is a super-admin
   */
  isSuperAdmin(user: AuthUser | undefined): boolean {
    if (!user) return false;
    return user.permissions?.globalRole === UserRole.SUPER_ADMIN ||
           user.roles?.includes(UserRole.SUPER_ADMIN);
  }

  /**
   * Get all tenant slugs that the user administers (tenant-admin or owner)
   */
  getAdministeredTenants(user: AuthUser | undefined): Set<string> {
    const tenants = new Set<string>();

    if (!user || !user.permissions) return tenants;

    // Check tenant permissions
    if (user.permissions.tenantPermissions) {
      for (const [tenantSlug, permission] of Object.entries(user.permissions.tenantPermissions)) {
        if (permission.role === UserRole.TENANT_ADMIN || permission.isOwner) {
          tenants.add(tenantSlug);
        }
      }
    }

    return tenants;
  }

  /**
   * Check if current user can manage target user
   * Super-admins can manage anyone
   * Tenant-admins can only manage users in their tenants
   */
  async canManageUser(
    currentUser: AuthUser,
    targetUserId: string
  ): Promise<boolean> {
    // Super-admins can manage anyone
    if (this.isSuperAdmin(currentUser)) {
      return true;
    }

    // Get tenants the current user administers
    const administeredTenants = this.getAdministeredTenants(currentUser);
    if (administeredTenants.size === 0) {
      return false;
    }

    // Get target user's tenant access
    const targetPermissions = await this.permRepo.getUserPermissions(targetUserId);

    // Check if target user has access to any of the administered tenants
    if (targetPermissions.tenantPermissions) {
      for (const tenantSlug of Object.keys(targetPermissions.tenantPermissions)) {
        if (administeredTenants.has(tenantSlug)) {
          return true;
        }
      }
    }

    if (targetPermissions.projectPermissions) {
      for (const tenantSlug of Object.keys(targetPermissions.projectPermissions)) {
        if (administeredTenants.has(tenantSlug)) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Check if user has admin privileges (either super-admin or tenant-admin)
   */
  hasAdminPrivileges(user: AuthUser | undefined): boolean {
    if (!user) return false;
    return this.isSuperAdmin(user) || this.getAdministeredTenants(user).size > 0;
  }

  /**
   * Check if user can grant a specific permission
   */
  canGrantPermission(
    currentUser: AuthUser,
    targetRole: UserRole,
    tenantSlug?: string
  ): boolean {
    const isSuper = this.isSuperAdmin(currentUser);

    // Only super-admins can grant super-admin role
    if (targetRole === UserRole.SUPER_ADMIN) {
      return isSuper;
    }

    // Super-admins can grant any permission
    if (isSuper) {
      return true;
    }

    // For tenant-specific permissions, check if user administers that tenant
    if (tenantSlug) {
      const administeredTenants = this.getAdministeredTenants(currentUser);
      return administeredTenants.has(tenantSlug);
    }

    return false;
  }

  /**
   * Check if user can revoke a specific permission
   */
  canRevokePermission(
    currentUser: AuthUser,
    tenantSlug?: string
  ): boolean {
    const isSuper = this.isSuperAdmin(currentUser);

    // Super-admins can revoke any permission
    if (isSuper) {
      return true;
    }

    // For tenant-specific permissions, check if user administers that tenant
    if (tenantSlug) {
      const administeredTenants = this.getAdministeredTenants(currentUser);
      return administeredTenants.has(tenantSlug);
    }

    // Non-super-admins can't revoke global permissions
    return false;
  }

  /**
   * Validate that tenant-admin can only grant access to their own tenants
   */
  validateTenantAccess(
    currentUser: AuthUser,
    tenantSlugs: string[]
  ): { valid: boolean; invalidTenant?: string } {
    if (this.isSuperAdmin(currentUser)) {
      return { valid: true };
    }

    const administeredTenants = this.getAdministeredTenants(currentUser);

    for (const tenantSlug of tenantSlugs) {
      if (!administeredTenants.has(tenantSlug)) {
        return { valid: false, invalidTenant: tenantSlug };
      }
    }

    return { valid: true };
  }
}
