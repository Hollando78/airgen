/**
 * Permission Repository
 *
 * Database abstraction layer for RBAC permission management.
 * Handles permission grants, revocations, and queries.
 */

import type { Pool } from "pg";
import { getPool } from "../lib/postgres.js";
import { logger } from "../lib/logger.js";
import type { UserPermissions, TenantPermission, ProjectPermission } from "../types/permissions.js";
import { UserRole } from "../types/roles.js";
import type { User } from "./UserRepository.js";

// ============================================================================
// Types
// ============================================================================

export interface GrantPermissionInput {
  userId: string;
  scopeType: "global" | "tenant" | "project";
  scopeId?: string; // tenantSlug or projectKey
  role: UserRole;
  isOwner?: boolean;
  grantedBy?: string; // User ID of who granted this permission
}

export interface PermissionRecord {
  id: number;
  userId: string;
  scopeType: "global" | "tenant" | "project";
  scopeId?: string;
  role: UserRole;
  isOwner: boolean;
  grantedAt: Date;
  grantedBy?: string;
}

// ============================================================================
// Permission Repository
// ============================================================================

export class PermissionRepository {
  private pool: Pool;

  constructor(pool?: Pool) {
    this.pool = pool ?? getPool();
  }

  /**
   * Get all permissions for a user in structured format
   */
  async getUserPermissions(userId: string): Promise<UserPermissions> {
    logger.info({ userId }, '[PermissionRepository.getUserPermissions] Getting permissions for user');

    const result = await this.pool.query(
      `SELECT * FROM user_permissions WHERE user_id = $1 ORDER BY granted_at`,
      [userId]
    );

    logger.info({ rowCount: result.rows.length }, '[PermissionRepository.getUserPermissions] Found permission rows');
    logger.debug({ rows: result.rows }, '[PermissionRepository.getUserPermissions] Raw rows');

    const permissions: UserPermissions = {};

    for (const row of result.rows) {
      const record = this.mapRowToPermissionRecord(row);
      logger.debug({ record }, '[PermissionRepository.getUserPermissions] Processing record');

      if (record.scopeType === "global") {
        permissions.globalRole = UserRole.SUPER_ADMIN;
      } else if (record.scopeType === "tenant" && record.scopeId) {
        if (!permissions.tenantPermissions) {
          permissions.tenantPermissions = {};
        }

        permissions.tenantPermissions[record.scopeId] = {
          role: record.role,
          isOwner: record.isOwner,
          grantedAt: record.grantedAt.toISOString()
        };
      } else if (record.scopeType === "project" && record.scopeId) {
        // scopeId for projects is "tenantSlug:projectKey"
        const [tenantSlug, projectKey] = record.scopeId.split(":");

        if (!permissions.projectPermissions) {
          permissions.projectPermissions = {};
        }

        if (!permissions.projectPermissions[tenantSlug]) {
          permissions.projectPermissions[tenantSlug] = {};
        }

        permissions.projectPermissions[tenantSlug][projectKey] = {
          role: record.role,
          grantedAt: record.grantedAt.toISOString()
        };
      }
    }

    logger.debug({ permissions }, '[PermissionRepository.getUserPermissions] Final permissions object');
    return permissions;
  }

  /**
   * Grant a permission to a user
   */
  async grantPermission(input: GrantPermissionInput): Promise<PermissionRecord> {
    logger.info({ input }, '[PermissionRepository.grantPermission] Input');

    // Validate scope constraints
    if (input.scopeType === "global" && input.scopeId) {
      throw new Error("Global permissions cannot have a scopeId");
    }

    if (input.scopeType === "global" && input.role !== UserRole.SUPER_ADMIN) {
      throw new Error("Global scope only supports super-admin role");
    }

    if ((input.scopeType === "tenant" || input.scopeType === "project") && !input.scopeId) {
      throw new Error(`${input.scopeType} scope requires a scopeId`);
    }

    // Upsert the permission (update if exists, insert if not)
    const queryParams = [
      input.userId,
      input.scopeType,
      input.scopeId || null,
      input.role,
      input.isOwner ?? false,
      input.grantedBy || null
    ];
    logger.debug({ queryParams }, '[PermissionRepository.grantPermission] Query params');

    const result = await this.pool.query(
      `INSERT INTO user_permissions (user_id, scope_type, scope_id, role, is_owner, granted_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (user_id, scope_type, scope_id)
       DO UPDATE SET
         role = EXCLUDED.role,
         is_owner = EXCLUDED.is_owner,
         granted_by = EXCLUDED.granted_by,
         granted_at = NOW()
       RETURNING *`,
      queryParams
    );

    logger.debug({ row: result.rows[0] }, '[PermissionRepository.grantPermission] Result row');
    return this.mapRowToPermissionRecord(result.rows[0]);
  }

  /**
   * Revoke a permission from a user
   */
  async revokePermission(
    userId: string,
    scopeType: "global" | "tenant" | "project",
    scopeId?: string
  ): Promise<boolean> {
    const result = await this.pool.query(
      `DELETE FROM user_permissions
       WHERE user_id = $1 AND scope_type = $2 AND (scope_id = $3 OR ($3 IS NULL AND scope_id IS NULL))
       RETURNING id`,
      [userId, scopeType, scopeId || null]
    );

    return result.rows.length > 0;
  }

  /**
   * Remove all permissions for a user
   */
  async removeAllPermissionsForUser(userId: string): Promise<void> {
    await this.pool.query(
      `DELETE FROM user_permissions WHERE user_id = $1`,
      [userId]
    );
  }

  /**
   * Remove tenant and related project permissions for a user
   */
  async removeTenantPermissionsForUser(userId: string, tenantSlug: string): Promise<void> {
    await this.pool.query(
      `DELETE FROM user_permissions
       WHERE user_id = $1
         AND (
           (scope_type = 'tenant' AND scope_id = $2)
           OR (scope_type = 'project' AND scope_id LIKE $2 || ':%')
         )`,
      [userId, tenantSlug]
    );
  }

  /**
   * Remove all permissions associated with a tenant across all users
   */
  async removeTenantFromAllUsers(tenantSlug: string): Promise<void> {
    await this.pool.query(
      `DELETE FROM user_permissions
       WHERE (scope_type = 'tenant' AND scope_id = $1)
          OR (scope_type = 'project' AND scope_id LIKE $1 || ':%')`,
      [tenantSlug]
    );
  }

  /**
   * List all users who have access to a tenant
   */
  async listUsersInTenant(tenantSlug: string): Promise<Array<User & { tenantPermission: TenantPermission }>> {
    const result = await this.pool.query(
      `SELECT u.*, p.role, p.is_owner, p.granted_at
       FROM users u
       INNER JOIN user_permissions p ON u.id = p.user_id
       WHERE p.scope_type = 'tenant' AND p.scope_id = $1 AND u.deleted_at IS NULL
       ORDER BY u.email`,
      [tenantSlug]
    );

    return result.rows.map(row => ({
      id: row.id,
      email: row.email,
      name: row.name,
      passwordHash: row.password_hash,
      emailVerified: row.email_verified,
      mfaEnabled: row.mfa_enabled,
      mfaSecret: row.mfa_secret,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      deletedAt: row.deleted_at ? new Date(row.deleted_at) : undefined,
      tenantPermission: {
        role: row.role,
        isOwner: row.is_owner,
        grantedAt: row.granted_at.toISOString()
      }
    }));
  }

  /**
   * List all users who have access to a specific project
   */
  async listUsersInProject(
    tenantSlug: string,
    projectKey: string
  ): Promise<Array<User & { projectPermission: ProjectPermission }>> {
    const scopeId = `${tenantSlug}:${projectKey}`;

    const result = await this.pool.query(
      `SELECT u.*, p.role, p.granted_at
       FROM users u
       INNER JOIN user_permissions p ON u.id = p.user_id
       WHERE p.scope_type = 'project' AND p.scope_id = $1 AND u.deleted_at IS NULL
       ORDER BY u.email`,
      [scopeId]
    );

    return result.rows.map(row => ({
      id: row.id,
      email: row.email,
      name: row.name,
      passwordHash: row.password_hash,
      emailVerified: row.email_verified,
      mfaEnabled: row.mfa_enabled,
      mfaSecret: row.mfa_secret,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      deletedAt: row.deleted_at ? new Date(row.deleted_at) : undefined,
      projectPermission: {
        role: row.role,
        grantedAt: row.granted_at.toISOString()
      }
    }));
  }

  /**
   * Check if user has super-admin (global) permission
   */
  async isSuperAdmin(userId: string): Promise<boolean> {
    const result = await this.pool.query(
      `SELECT 1 FROM user_permissions
       WHERE user_id = $1 AND scope_type = 'global' AND role = $2
       LIMIT 1`,
      [userId, UserRole.SUPER_ADMIN]
    );

    return result.rows.length > 0;
  }

  /**
   * Get all tenants where user has Tenant-Admin or higher permissions
   */
  async getUserTenantSlugs(userId: string): Promise<string[]> {
    // Include tenants from both global super-admin and tenant-specific permissions
    const isSuperAdmin = await this.isSuperAdmin(userId);

    if (isSuperAdmin) {
      // Super-admins have access to all tenants
      // In a real system, you'd query all tenants from a tenants table
      // For now, return tenants from the permissions table
      const result = await this.pool.query(
        `SELECT DISTINCT scope_id FROM user_permissions
         WHERE scope_type = 'tenant' AND scope_id IS NOT NULL
         ORDER BY scope_id`
      );

      return result.rows.map(row => row.scope_id);
    }

    const result = await this.pool.query(
      `SELECT scope_id FROM user_permissions
       WHERE user_id = $1 AND scope_type = 'tenant' AND scope_id IS NOT NULL
       ORDER BY scope_id`,
      [userId]
    );

    return result.rows.map(row => row.scope_id);
  }

  /**
   * Remove all permissions for a tenant (used when deleting a tenant)
   */
  async removeTenantPermissions(tenantSlug: string): Promise<number> {
    const result = await this.pool.query(
      `DELETE FROM user_permissions
       WHERE scope_type = 'tenant' AND scope_id = $1
       RETURNING id`,
      [tenantSlug]
    );

    return result.rows.length;
  }

  /**
   * Remove all permissions for a project (used when deleting a project)
   */
  async removeProjectPermissions(tenantSlug: string, projectKey: string): Promise<number> {
    const scopeId = `${tenantSlug}:${projectKey}`;

    const result = await this.pool.query(
      `DELETE FROM user_permissions
       WHERE scope_type = 'project' AND scope_id = $1
       RETURNING id`,
      [scopeId]
    );

    return result.rows.length;
  }

  /**
   * Map database row to PermissionRecord
   */
  private mapRowToPermissionRecord(row: any): PermissionRecord {
    return {
      id: row.id,
      userId: row.user_id,
      scopeType: row.scope_type,
      scopeId: row.scope_id,
      role: row.role,
      isOwner: row.is_owner,
      grantedAt: new Date(row.granted_at),
      grantedBy: row.granted_by
    };
  }
}

// Export a singleton instance
export const permissionRepository = new PermissionRepository();
