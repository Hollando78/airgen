/**
 * TenantManagementService
 *
 * Business logic layer for tenant management operations.
 * Handles tenant lifecycle, access control, and invitation management.
 *
 * Extracted from routes/core.ts for better testability and reusability.
 */

import type { AuthUser } from "../lib/authorization.js";
import { slugify, type TenantRecord } from "./workspace.js";
import { listTenants, createTenant, deleteTenant } from "./graph.js";
import {
  createTenantInvitation,
  listInvitationsForTenant,
  type TenantInvitationRecord
} from "./tenant-invitations.js";
import { sendTenantInvitationEmail } from "../lib/email.js";
import { userRepository } from "../repositories/UserRepository.js";
import { PermissionRepository } from "../repositories/PermissionRepository.js";
import { UserRole } from "../types/roles.js";

const permissionRepo = new PermissionRepository();

/**
 * Sanitize invitation response by removing sensitive token
 */
function mapInvitationResponse(invitation: TenantInvitationRecord): Omit<TenantInvitationRecord, "token"> {
  const { token: _token, ...rest } = invitation;
  return rest;
}

/**
 * Get list of tenants accessible to the user with ownership information
 */
export async function getTenantListForUser(user: AuthUser | undefined): Promise<TenantRecord[]> {
  if (!user) {
    return [];
  }

  // Track all tenant slugs the user can access
  const tenantAccess = new Set<string>();

  // Super admins can see all tenants
  if (user.permissions?.globalRole === UserRole.SUPER_ADMIN) {
    const tenants = await listTenants();
    const ownedSlugs = new Set<string>();

    // Collect owned tenants from various sources
    for (const slug of user.ownedTenantSlugs ?? []) {
      ownedSlugs.add(slugify(slug));
    }
    for (const [tenantSlug, permission] of Object.entries(user.permissions.tenantPermissions ?? {})) {
      if (permission.isOwner) {
        ownedSlugs.add(slugify(tenantSlug));
      }
    }

    // Mark ownership status for all tenants
    return tenants.map(tenant => ({
      ...tenant,
      isOwner: ownedSlugs.has(tenant.slug) || user.permissions?.globalRole === UserRole.SUPER_ADMIN
    }));
  }

  // Regular users: collect accessible tenants from permissions
  if (user.permissions) {
    for (const tenantSlug of Object.keys(user.permissions.tenantPermissions ?? {})) {
      tenantAccess.add(slugify(tenantSlug));
    }

    for (const tenantSlug of Object.keys(user.permissions.projectPermissions ?? {})) {
      tenantAccess.add(slugify(tenantSlug));
    }
  }

  // Also include legacy tenantSlugs and ownedTenantSlugs
  for (const slug of user.tenantSlugs ?? []) {
    tenantAccess.add(slugify(slug));
  }
  for (const slug of user.ownedTenantSlugs ?? []) {
    tenantAccess.add(slugify(slug));
  }

  // Fetch filtered tenant list
  const tenantFilter = tenantAccess.size > 0 ? Array.from(tenantAccess) : null;
  const tenants = tenantFilter ? await listTenants(tenantFilter) : [];

  // Mark ownership status
  const ownedSlugs = new Set<string>();
  for (const slug of user.ownedTenantSlugs ?? []) {
    ownedSlugs.add(slugify(slug));
  }
  for (const [tenantSlug, permission] of Object.entries(user.permissions?.tenantPermissions ?? {})) {
    if (permission.isOwner) {
      ownedSlugs.add(slugify(tenantSlug));
    }
  }

  return tenants.map(tenant => ({
    ...tenant,
    isOwner: ownedSlugs.has(tenant.slug)
  }));
}

/**
 * Check if user is a tenant owner
 */
export function isTenantOwner(user: AuthUser, tenantSlug: string): boolean {
  const normalizedSlug = slugify(tenantSlug);

  // Super admins are considered owners of all tenants
  if (user.permissions?.globalRole === UserRole.SUPER_ADMIN) {
    return true;
  }

  // Check ownedTenantSlugs array
  if (user.ownedTenantSlugs?.some(slug => slugify(slug) === normalizedSlug)) {
    return true;
  }

  // Check permissions structure
  const tenantPermission = user.permissions?.tenantPermissions?.[normalizedSlug];
  if (tenantPermission?.isOwner) {
    return true;
  }

  return false;
}

/**
 * Create a tenant and grant the creator owner permissions
 */
export async function createTenantWithOwner(
  input: { slug: string; name?: string },
  creatorId: string
): Promise<TenantRecord & { isOwner: boolean }> {
  // Create tenant in graph database
  const tenant = await createTenant(input);

  // Load the creator user
  const creator = await userRepository.findById(creatorId);
  if (!creator) {
    throw new Error("Failed to load user");
  }

  // Grant owner permissions to creator
  await permissionRepo.grantPermission({
    userId: creator.id,
    scopeType: "tenant",
    scopeId: tenant.slug,
    role: UserRole.TENANT_ADMIN,
    isOwner: true
  });

  return { ...tenant, isOwner: true };
}

/**
 * Delete a tenant and clean up all associated permissions
 */
export async function deleteTenantWithCleanup(tenantSlug: string): Promise<boolean> {
  // Delete tenant from graph database (cascades to projects and requirements)
  const success = await deleteTenant(tenantSlug);

  if (!success) {
    return false;
  }

  // Clean up permissions for all users
  await permissionRepo.removeTenantFromAllUsers(tenantSlug);

  return true;
}

/**
 * List invitations for a tenant
 */
export async function listTenantInvitations(tenantSlug: string): Promise<Array<Omit<TenantInvitationRecord, "token">>> {
  const invitations = await listInvitationsForTenant(tenantSlug);
  return invitations.map(mapInvitationResponse);
}

/**
 * Invite a user to a tenant and send email notification
 *
 * @throws Error if user already has access or invitation fails
 */
export async function inviteUserToTenant(
  tenantSlug: string,
  email: string,
  invitedBy: { userId: string; email?: string; name?: string }
): Promise<Omit<TenantInvitationRecord, "token">> {
  const normalizedTenant = slugify(tenantSlug);

  // Check if user already has access
  const existingUser = await userRepository.findByEmail(email);
  if (existingUser) {
    const permissions = await permissionRepo.getUserPermissions(existingUser.id);
    const tenantPermission = permissions.tenantPermissions?.[normalizedTenant];
    const projectPermissions = permissions.projectPermissions?.[normalizedTenant];

    if (tenantPermission || (projectPermissions && Object.keys(projectPermissions).length > 0)) {
      throw new Error("User already has access to this tenant");
    }
  }

  // Create the invitation
  const invitation = await createTenantInvitation(
    normalizedTenant,
    email,
    invitedBy.userId,
    invitedBy.email
  );

  // Send invitation email (log errors but don't fail the request)
  try {
    await sendTenantInvitationEmail(email, normalizedTenant, invitedBy.name, invitation.token);
  } catch (emailError) {
    console.error("Failed to send tenant invitation email:", emailError);
    // Continue - invitation was created successfully
  }

  return mapInvitationResponse(invitation);
}

/**
 * Validate user has access to a tenant
 *
 * @throws Error if user doesn't have access
 */
export function validateTenantAccess(user: AuthUser, tenantSlug: string): void {
  const normalizedSlug = slugify(tenantSlug);

  // Super admins have access to all tenants
  if (user.permissions?.globalRole === UserRole.SUPER_ADMIN) {
    return;
  }

  // Check various permission sources
  const hasAccess =
    // Legacy tenantSlugs array
    user.tenantSlugs?.some(slug => slugify(slug) === normalizedSlug) ||
    // Owned tenants
    user.ownedTenantSlugs?.some(slug => slugify(slug) === normalizedSlug) ||
    // Tenant permissions
    Boolean(user.permissions?.tenantPermissions?.[normalizedSlug]) ||
    // Project permissions within tenant
    Boolean(user.permissions?.projectPermissions?.[normalizedSlug]);

  if (!hasAccess) {
    throw new Error("Access denied to this tenant");
  }
}
