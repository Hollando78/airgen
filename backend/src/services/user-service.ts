/**
 * User Service (Bridge Layer)
 *
 * Provides backward-compatible API while using the new repository layer.
 * This bridge allows gradual migration from file-based to database storage.
 */

import { UserRepository } from "../repositories/UserRepository.js";
import { PermissionRepository } from "../repositories/PermissionRepository.js";
import { verifyPassword, hashPassword } from "../lib/password.js";
import { UserRole } from "../types/roles.js";
import type { UserPermissions } from "../types/permissions.js";
import type { DevUserRecord } from "./dev-users.js";

const userRepo = new UserRepository();
const permRepo = new PermissionRepository();

/**
 * Convert database User + Permissions to DevUserRecord format
 * This maintains backward compatibility with existing code
 */
async function toDevUserRecord(user: Awaited<ReturnType<typeof userRepo.findById>>): Promise<DevUserRecord | null> {
  if (!user) return null;

  // Get user's permissions
  const permissions = await permRepo.getUserPermissions(user.id);

  // Get tenant slugs (for legacy compatibility)
  const tenantSlugs = await permRepo.getUserTenantSlugs(user.id);

  // Extract owned tenant slugs from permissions
  const ownedTenantSlugs = permissions.tenantPermissions
    ? Object.keys(permissions.tenantPermissions).filter(
        slug => permissions.tenantPermissions![slug].isOwner
      )
    : [];

  // Map new RBAC roles back to legacy roles format
  const roles: string[] = [];
  if (permissions.globalRole) {
    roles.push("admin"); // Super-Admin gets admin role
  } else if (permissions.tenantPermissions) {
    // Use the highest tenant role
    const tenantRoles = Object.values(permissions.tenantPermissions).map(p => p.role);
    if (tenantRoles.some(r => r === UserRole.TENANT_ADMIN)) {
      roles.push("admin");
    }
    if (tenantRoles.some(r => r === UserRole.ADMIN)) {
      roles.push("admin");
    }
    if (tenantRoles.some(r => r === UserRole.APPROVER)) {
      roles.push("approver");
    }
    if (tenantRoles.some(r => r === UserRole.AUTHOR)) {
      roles.push("author");
    }
  }

  // Ensure at least "user" role
  if (roles.length === 0) {
    roles.push("user");
  } else if (!roles.includes("user")) {
    roles.push("user");
  }

  // Get MFA backup codes
  const mfaBackupCodes = user.mfaEnabled
    ? await userRepo.getMfaBackupCodes(user.id)
    : undefined;

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    passwordHash: user.passwordHash,
    emailVerified: user.emailVerified,
    mfaEnabled: user.mfaEnabled,
    mfaSecret: user.mfaSecret,
    mfaBackupCodes,
    permissions,
    roles, // Legacy
    tenantSlugs, // Legacy
    ownedTenantSlugs, // Legacy
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString()
  };
}

export async function getUserById(id: string): Promise<DevUserRecord | null> {
  const user = await userRepo.findById(id);
  return toDevUserRecord(user);
}

export async function getUserByEmail(email: string): Promise<DevUserRecord | null> {
  const user = await userRepo.findByEmail(email);
  return toDevUserRecord(user);
}

export async function listAllUsers(): Promise<DevUserRecord[]> {
  const users = await userRepo.list();
  const records: DevUserRecord[] = [];

  for (const user of users) {
    const record = await toDevUserRecord(user);
    if (record) {
      records.push(record);
    }
  }

  return records;
}

export async function verifyUserPassword(
  user: DevUserRecord,
  candidatePassword: string
): Promise<boolean> {
  return verifyPassword(user.passwordHash!, candidatePassword);
}

export async function createUser(input: {
  email: string;
  name?: string;
  password: string;
  roles?: string[];
  tenantSlugs?: string[];
  ownedTenantSlugs?: string[];
}): Promise<DevUserRecord> {
  // Hash password
  const passwordHash = await hashPassword(input.password);

  // Create user
  const user = await userRepo.create({
    email: input.email,
    name: input.name,
    passwordHash,
    emailVerified: false
  });

  // Grant permissions based on legacy roles and tenants
  if (input.tenantSlugs && input.tenantSlugs.length > 0) {
    const role: UserRole = input.roles?.includes("admin") ? UserRole.TENANT_ADMIN : UserRole.VIEWER;

    for (const tenantSlug of input.tenantSlugs) {
      const isOwner = input.ownedTenantSlugs?.includes(tenantSlug) ?? false;

      await permRepo.grantPermission({
        userId: user.id,
        scopeType: "tenant",
        scopeId: tenantSlug,
        role: role,
        isOwner: isOwner
      });
    }
  }

  const result = await toDevUserRecord(user);
  return result as DevUserRecord;
}

export async function updateUser(
  id: string,
  input: {
    email?: string;
    name?: string | null;
    password?: string;
    emailVerified?: boolean;
    mfaEnabled?: boolean;
    mfaSecret?: string;
    mfaBackupCodes?: string[];
  }
): Promise<DevUserRecord | null> {
  const updates: Parameters<typeof userRepo.update>[1] = {};

  if (input.email !== undefined) updates.email = input.email;
  if (input.name !== undefined) updates.name = input.name;
  if (input.emailVerified !== undefined) updates.emailVerified = input.emailVerified;
  if (input.mfaEnabled !== undefined) updates.mfaEnabled = input.mfaEnabled;
  if (input.mfaSecret !== undefined) updates.mfaSecret = input.mfaSecret;

  if (input.password) {
    updates.passwordHash = await hashPassword(input.password);
  }

  const user = await userRepo.update(id, updates);

  if (!user) return null;

  // Update MFA backup codes if provided
  if (input.mfaBackupCodes !== undefined) {
    await userRepo.addMfaBackupCodes(id, input.mfaBackupCodes);
  }

  return toDevUserRecord(user);
}

export async function markUserEmailVerified(userId: string): Promise<DevUserRecord | null> {
  const user = await userRepo.markEmailVerified(userId);
  return toDevUserRecord(user);
}

export async function addUserTenantAccess(
  userId: string,
  tenantSlug: string,
  options: { owner?: boolean } = {}
): Promise<DevUserRecord | null> {
  await permRepo.grantPermission({
    userId,
    scopeType: "tenant",
    scopeId: tenantSlug,
    role: UserRole.ADMIN, // Default to admin role for tenant access
    isOwner: options.owner ?? false
  });

  const user = await userRepo.findById(userId);
  return toDevUserRecord(user);
}
