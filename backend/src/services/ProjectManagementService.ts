/**
 * ProjectManagementService
 *
 * Business logic layer for project management operations.
 * Handles project lifecycle within tenant boundaries.
 *
 * Extracted from routes/core.ts for better testability and reusability.
 */

import type { AuthUser } from "../lib/authorization.js";
import { slugify, type ProjectRecord } from "./workspace.js";
import { listProjects, createProject, updateProject, deleteProject } from "./graph.js";
import { isTenantOwner as checkTenantOwnership } from "./TenantManagementService.js";

/**
 * Get list of projects for a tenant
 */
export async function getProjectListForTenant(tenantSlug: string): Promise<ProjectRecord[]> {
  return await listProjects(tenantSlug);
}

/**
 * Create a project within a tenant
 *
 * @throws Error if project creation fails or tenant not found
 */
export async function createProjectInTenant(
  tenantSlug: string,
  input: { slug: string; key?: string; name?: string; description?: string; code?: string }
): Promise<ProjectRecord> {
  return await createProject({
    tenantSlug,
    slug: input.slug,
    key: input.key,
    name: input.name,
    description: input.description,
    code: input.code,
  });
}

/**
 * Update a project's metadata
 */
export async function updateProjectInTenant(
  tenantSlug: string,
  projectSlug: string,
  updates: { name?: string; description?: string; code?: string; key?: string }
): Promise<ProjectRecord> {
  return await updateProject(tenantSlug, projectSlug, updates);
}

/**
 * Delete a project and all associated data
 */
export async function deleteProjectFromTenant(
  tenantSlug: string,
  projectSlug: string
): Promise<boolean> {
  return await deleteProject(tenantSlug, projectSlug);
}

/**
 * Check if user is a tenant owner (reuses tenant service logic)
 */
export function isProjectOwner(user: AuthUser, tenantSlug: string): boolean {
  return checkTenantOwnership(user, tenantSlug);
}

/**
 * Validate user has access to a tenant (for project operations)
 */
export function validateProjectAccess(user: AuthUser, tenantSlug: string): void {
  const normalizedSlug = slugify(tenantSlug);

  // Super admins have access to all projects
  if (user.permissions?.globalRole === "super-admin") {
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
