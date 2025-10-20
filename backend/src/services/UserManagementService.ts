/**
 * User Management Service
 *
 * Handles business logic for user CRUD operations and permission management.
 * Enforces authorization rules and orchestrates database operations.
 */

import type { UserRepository } from "../repositories/UserRepository.js";
import type { PermissionRepository } from "../repositories/PermissionRepository.js";
import { UserAuthorizationService } from "./UserAuthorizationService.js";
import type { AuthUser } from "../lib/authorization.js";
import type { UserPermissions } from "../types/permissions.js";
import { UserRole } from "../types/roles.js";
import { hashPassword } from "../lib/password.js";
import {
  sendAdminCreatedAccountEmail,
  sendTenantAccessChangedEmail,
} from "../lib/email.js";

// ============================================================================
// Types
// ============================================================================

export interface EnhancedUser {
  id: string;
  email: string;
  name?: string;
  emailVerified: boolean;
  mfaEnabled: boolean;
  permissions: UserPermissions;
  createdAt: string;
  updatedAt: string;
}

export type SanitizedUser = Omit<EnhancedUser, "mfaSecret" | "mfaBackupCodes">;

export interface CreateUserInput {
  email: string;
  name?: string;
  password?: string;
  permissions?: {
    globalRole?: UserRole;
    tenantPermissions?: Record<string, {
      role: UserRole;
      isOwner?: boolean;
    }>;
    projectPermissions?: Record<string, Record<string, {
      role: UserRole;
    }>>;
  };
}

export interface UpdateUserInput {
  email?: string;
  name?: string | null;
  password?: string;
  emailVerified?: boolean;
}

export interface UpdatePermissionsInput {
  permissions: {
    globalRole?: UserRole;
    tenantPermissions?: Record<string, {
      role: UserRole;
      isOwner?: boolean;
    }>;
    projectPermissions?: Record<string, Record<string, {
      role: UserRole;
    }>>;
  };
}

export interface GrantPermissionInput {
  role: UserRole;
  tenantSlug?: string;
  projectKey?: string;
  isOwner?: boolean;
}

export interface RevokePermissionInput {
  tenantSlug?: string;
  projectKey?: string;
}

// ============================================================================
// Service
// ============================================================================

export class UserManagementService {
  private authService: UserAuthorizationService;

  constructor(
    private userRepo: UserRepository,
    private permRepo: PermissionRepository
  ) {
    this.authService = new UserAuthorizationService(permRepo);
  }

  // ==========================================================================
  // User CRUD Operations
  // ==========================================================================

  /**
   * List all users (filtered by requesting user's permissions)
   */
  async listUsers(requestingUser: AuthUser): Promise<SanitizedUser[]> {
    // Check if user has admin privileges
    const isSuper = this.authService.isSuperAdmin(requestingUser);
    const administeredTenants = this.authService.getAdministeredTenants(requestingUser);

    if (!isSuper && administeredTenants.size === 0) {
      throw new Error("Insufficient permissions to view users");
    }

    const users = await this.userRepo.list();
    const enhancedUsers: EnhancedUser[] = [];

    for (const user of users) {
      const enhanced = await this.toEnhancedUser(user);
      if (!enhanced) continue;

      // Super-admins see all users
      if (isSuper) {
        enhancedUsers.push(enhanced);
        continue;
      }

      // Tenant-admins only see users who have access to their tenants
      let hasCommonTenant = false;

      if (enhanced.permissions.tenantPermissions) {
        for (const tenantSlug of Object.keys(enhanced.permissions.tenantPermissions)) {
          if (administeredTenants.has(tenantSlug)) {
            hasCommonTenant = true;
            break;
          }
        }
      }

      if (!hasCommonTenant && enhanced.permissions.projectPermissions) {
        for (const tenantSlug of Object.keys(enhanced.permissions.projectPermissions)) {
          if (administeredTenants.has(tenantSlug)) {
            hasCommonTenant = true;
            break;
          }
        }
      }

      if (hasCommonTenant) {
        enhancedUsers.push(enhanced);
      }
    }

    // Sort by email
    enhancedUsers.sort((a, b) => a.email.localeCompare(b.email));

    return enhancedUsers.map(this.sanitizeUser);
  }

  /**
   * Get a specific user by ID
   */
  async getUserById(userId: string, requestingUser: AuthUser): Promise<SanitizedUser | null> {
    // Check if current user can manage this user
    const canManage = await this.authService.canManageUser(requestingUser, userId);
    if (!canManage) {
      throw new Error("Insufficient permissions to view this user");
    }

    const user = await this.userRepo.findById(userId);
    const enhanced = await this.toEnhancedUser(user);

    if (!enhanced) {
      return null;
    }

    return this.sanitizeUser(enhanced);
  }

  /**
   * Create a new user with permissions
   */
  async createUser(data: CreateUserInput, requestingUser: AuthUser): Promise<SanitizedUser> {
    // Check if user has admin privileges
    const isSuper = this.authService.isSuperAdmin(requestingUser);
    const administeredTenants = this.authService.getAdministeredTenants(requestingUser);

    if (!isSuper && administeredTenants.size === 0) {
      throw new Error("Insufficient permissions to create users");
    }

    // Prevent non-super-admins from creating super-admins
    if (data.permissions?.globalRole === UserRole.SUPER_ADMIN && !isSuper) {
      throw new Error("Only super-admins can create super-admin users");
    }

    // Verify tenant-admins can only grant access to their own tenants
    if (!isSuper && data.permissions?.tenantPermissions) {
      const tenantSlugs = Object.keys(data.permissions.tenantPermissions);
      const validation = this.authService.validateTenantAccess(requestingUser, tenantSlugs);
      if (!validation.valid) {
        throw new Error(`You do not have permission to grant access to tenant '${validation.invalidTenant}'`);
      }
    }

    // Create user in database (require password for now)
    if (!data.password) {
      throw new Error("Password is required");
    }

    const passwordHash = await hashPassword(data.password);

    const user = await this.userRepo.create({
      email: data.email,
      name: data.name,
      passwordHash,
      emailVerified: false
    });

    // Grant permissions if provided
    if (data.permissions) {
      await this.applyPermissions(user.id, data.permissions);
    }

    const enhanced = await this.toEnhancedUser(user);
    if (!enhanced) {
      throw new Error("Failed to load created user");
    }

    // Send welcome email
    const tenantSlugs = data.permissions?.tenantPermissions ? Object.keys(data.permissions.tenantPermissions) : [];
    sendAdminCreatedAccountEmail(
      user.email,
      user.name ?? undefined,
      tenantSlugs,
      data.permissions?.globalRole ? [data.permissions.globalRole] : []
    ).catch(() => {
      // Log error but don't fail the operation
    });

    return this.sanitizeUser(enhanced);
  }

  /**
   * Update user basic information
   */
  async updateUser(
    userId: string,
    updates: UpdateUserInput,
    requestingUser: AuthUser
  ): Promise<SanitizedUser> {
    // Check if current user can manage this user
    const canManage = await this.authService.canManageUser(requestingUser, userId);
    if (!canManage) {
      throw new Error("Insufficient permissions to update this user");
    }

    const existing = await this.userRepo.findById(userId);
    if (!existing) {
      throw new Error("User not found");
    }

    const updateData: Parameters<typeof this.userRepo.update>[1] = {};

    if (updates.email !== undefined) updateData.email = updates.email;
    if (updates.name !== undefined) updateData.name = updates.name;
    if (updates.emailVerified !== undefined) updateData.emailVerified = updates.emailVerified;

    if (updates.password) {
      updateData.passwordHash = await hashPassword(updates.password);
    }

    const updated = await this.userRepo.update(userId, updateData);
    if (!updated) {
      throw new Error("User not found");
    }

    const enhanced = await this.toEnhancedUser(updated);
    if (!enhanced) {
      throw new Error("Failed to load updated user");
    }

    return this.sanitizeUser(enhanced);
  }

  /**
   * Delete a user
   */
  async deleteUser(userId: string, requestingUser: AuthUser): Promise<boolean> {
    // Check if current user can manage this user
    const canManage = await this.authService.canManageUser(requestingUser, userId);
    if (!canManage) {
      throw new Error("Insufficient permissions to delete this user");
    }

    const deleted = await this.userRepo.delete(userId);
    return deleted;
  }

  // ==========================================================================
  // Permission Management
  // ==========================================================================

  /**
   * Update user's complete permission structure
   */
  async updateUserPermissions(
    userId: string,
    input: UpdatePermissionsInput,
    requestingUser: AuthUser
  ): Promise<SanitizedUser> {
    // Check if current user can manage this user
    const canManage = await this.authService.canManageUser(requestingUser, userId);
    if (!canManage) {
      throw new Error("Insufficient permissions to update this user's permissions");
    }

    const isSuper = this.authService.isSuperAdmin(requestingUser);

    // Get old permissions for change detection
    const user = await this.userRepo.findById(userId);
    if (!user) {
      throw new Error("User not found");
    }

    const oldPermissions = await this.permRepo.getUserPermissions(user.id);

    // Prevent non-super-admins from granting super-admin role
    if (input.permissions.globalRole === UserRole.SUPER_ADMIN && !isSuper) {
      throw new Error("Only super-admins can grant super-admin privileges");
    }

    // Prevent non-super-admins from revoking super-admin role
    if (oldPermissions.globalRole === UserRole.SUPER_ADMIN &&
        input.permissions.globalRole !== UserRole.SUPER_ADMIN &&
        !isSuper) {
      throw new Error("Only super-admins can revoke super-admin privileges");
    }

    // Verify tenant-admins can only modify permissions for their own tenants
    if (!isSuper && input.permissions.tenantPermissions) {
      const tenantSlugs = Object.keys(input.permissions.tenantPermissions);
      const validation = this.authService.validateTenantAccess(requestingUser, tenantSlugs);
      if (!validation.valid) {
        throw new Error(`You do not have permission to grant access to tenant '${validation.invalidTenant}'`);
      }
    }

    const oldTenants = oldPermissions.tenantPermissions ? Object.keys(oldPermissions.tenantPermissions) : [];

    // Clear all existing permissions
    await this.revokeAllPermissions(user.id, oldPermissions);

    // Grant new permissions
    await this.applyPermissions(user.id, input.permissions);

    // Get updated user
    const enhanced = await this.toEnhancedUser(user);
    if (!enhanced) {
      throw new Error("Failed to load updated user");
    }

    // Send email notification about changed permissions
    const newTenants = input.permissions.tenantPermissions ? Object.keys(input.permissions.tenantPermissions) : [];
    const addedTenants = newTenants.filter(t => !oldTenants.includes(t));
    const removedTenants = oldTenants.filter(t => !newTenants.includes(t));

    if (addedTenants.length > 0 || removedTenants.length > 0) {
      sendTenantAccessChangedEmail(
        user.email,
        user.name ?? undefined,
        addedTenants,
        removedTenants
      ).catch(() => {
        // Log error but don't fail the operation
      });
    }

    return this.sanitizeUser(enhanced);
  }

  /**
   * Grant a specific permission to a user
   */
  async grantPermission(
    userId: string,
    input: GrantPermissionInput,
    requestingUser: AuthUser
  ): Promise<SanitizedUser> {
    // Check if current user can manage this user
    const canManage = await this.authService.canManageUser(requestingUser, userId);
    if (!canManage) {
      throw new Error("Insufficient permissions to modify this user's permissions");
    }

    const user = await this.userRepo.findById(userId);
    if (!user) {
      throw new Error("User not found");
    }

    const isSuper = this.authService.isSuperAdmin(requestingUser);

    // Determine permission scope
    if (!input.tenantSlug && !input.projectKey) {
      // Global role
      if (input.role !== UserRole.SUPER_ADMIN) {
        throw new Error("Only Super-Admin role can be granted globally");
      }
      // Only super-admins can grant super-admin role
      if (!isSuper) {
        throw new Error("Only super-admins can grant super-admin privileges");
      }
      await this.permRepo.grantPermission({
        userId: user.id,
        scopeType: "global",
        role: UserRole.SUPER_ADMIN
      });
    } else if (input.tenantSlug && !input.projectKey) {
      // Tenant-level permission
      if (!this.authService.canGrantPermission(requestingUser, input.role, input.tenantSlug)) {
        throw new Error(`You do not have permission to grant access to tenant '${input.tenantSlug}'`);
      }
      await this.permRepo.grantPermission({
        userId: user.id,
        scopeType: "tenant",
        scopeId: input.tenantSlug,
        role: input.role,
        isOwner: input.isOwner ?? false
      });
    } else if (input.tenantSlug && input.projectKey) {
      // Project-level permission
      if (!this.authService.canGrantPermission(requestingUser, input.role, input.tenantSlug)) {
        throw new Error(`You do not have permission to grant access to tenant '${input.tenantSlug}'`);
      }
      await this.permRepo.grantPermission({
        userId: user.id,
        scopeType: "project",
        scopeId: `${input.tenantSlug}:${input.projectKey}`,
        role: input.role
      });
    } else {
      throw new Error("Invalid permission grant: projectKey requires tenantSlug");
    }

    const enhanced = await this.toEnhancedUser(user);
    if (!enhanced) {
      throw new Error("Failed to load updated user");
    }

    return this.sanitizeUser(enhanced);
  }

  /**
   * Revoke a specific permission from a user
   */
  async revokePermission(
    userId: string,
    input: RevokePermissionInput,
    requestingUser: AuthUser
  ): Promise<SanitizedUser> {
    // Check if current user can manage this user
    const canManage = await this.authService.canManageUser(requestingUser, userId);
    if (!canManage) {
      throw new Error("Insufficient permissions to modify this user's permissions");
    }

    const user = await this.userRepo.findById(userId);
    if (!user) {
      throw new Error("User not found");
    }

    // Determine what to revoke
    if (!input.tenantSlug && !input.projectKey) {
      // Revoke global role
      if (!this.authService.canRevokePermission(requestingUser)) {
        throw new Error("Only super-admins can revoke super-admin privileges");
      }
      await this.permRepo.revokePermission(user.id, "global");
    } else if (input.tenantSlug && !input.projectKey) {
      // Revoke tenant-level permission
      if (!this.authService.canRevokePermission(requestingUser, input.tenantSlug)) {
        throw new Error(`You do not have permission to revoke access to tenant '${input.tenantSlug}'`);
      }
      await this.permRepo.revokePermission(user.id, "tenant", input.tenantSlug);
    } else if (input.tenantSlug && input.projectKey) {
      // Revoke project-level permission
      if (!this.authService.canRevokePermission(requestingUser, input.tenantSlug)) {
        throw new Error(`You do not have permission to revoke access to tenant '${input.tenantSlug}'`);
      }
      await this.permRepo.revokePermission(user.id, "project", `${input.tenantSlug}:${input.projectKey}`);
    } else {
      throw new Error("Invalid permission revoke: projectKey requires tenantSlug");
    }

    const enhanced = await this.toEnhancedUser(user);
    if (!enhanced) {
      throw new Error("Failed to load updated user");
    }

    return this.sanitizeUser(enhanced);
  }

  // ==========================================================================
  // Helper Methods
  // ==========================================================================

  /**
   * Convert database User + Permissions to EnhancedUser format
   */
  private async toEnhancedUser(
    user: Awaited<ReturnType<typeof UserRepository.prototype.findById>>
  ): Promise<EnhancedUser | null> {
    if (!user) return null;

    const permissions = await this.permRepo.getUserPermissions(user.id);

    return {
      id: user.id,
      email: user.email,
      name: user.name ?? undefined,
      emailVerified: user.emailVerified,
      mfaEnabled: user.mfaEnabled,
      permissions,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString()
    };
  }

  /**
   * Sanitize user for API response (remove sensitive fields)
   */
  private sanitizeUser(user: EnhancedUser): SanitizedUser {
    return user;
  }

  /**
   * Apply permissions to a user
   */
  private async applyPermissions(
    userId: string,
    permissions: CreateUserInput['permissions'] | UpdatePermissionsInput['permissions']
  ): Promise<void> {
    if (!permissions) return;

    // Grant global role
    if (permissions.globalRole === UserRole.SUPER_ADMIN) {
      await this.permRepo.grantPermission({
        userId,
        scopeType: "global",
        role: UserRole.SUPER_ADMIN
      });
    }

    // Grant tenant permissions
    if (permissions.tenantPermissions) {
      for (const [tenantSlug, permission] of Object.entries(permissions.tenantPermissions)) {
        await this.permRepo.grantPermission({
          userId,
          scopeType: "tenant",
          scopeId: tenantSlug,
          role: permission.role,
          isOwner: permission.isOwner ?? false
        });
      }
    }

    // Grant project permissions
    if (permissions.projectPermissions) {
      for (const [tenantSlug, projects] of Object.entries(permissions.projectPermissions)) {
        for (const [projectKey, permission] of Object.entries(projects)) {
          await this.permRepo.grantPermission({
            userId,
            scopeType: "project",
            scopeId: `${tenantSlug}:${projectKey}`,
            role: permission.role
          });
        }
      }
    }
  }

  /**
   * Revoke all permissions from a user
   */
  private async revokeAllPermissions(
    userId: string,
    permissions: UserPermissions
  ): Promise<void> {
    // Remove global role
    if (permissions.globalRole) {
      await this.permRepo.revokePermission(userId, "global");
    }

    // Remove all tenant permissions
    if (permissions.tenantPermissions) {
      for (const tenantSlug of Object.keys(permissions.tenantPermissions)) {
        await this.permRepo.revokePermission(userId, "tenant", tenantSlug);
      }
    }

    // Remove all project permissions
    if (permissions.projectPermissions) {
      for (const [tenantSlug, projects] of Object.entries(permissions.projectPermissions)) {
        for (const projectKey of Object.keys(projects)) {
          await this.permRepo.revokePermission(userId, "project", `${tenantSlug}:${projectKey}`);
        }
      }
    }
  }
}
