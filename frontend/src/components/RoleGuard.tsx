/**
 * RoleGuard Component
 *
 * Conditionally renders children based on user roles and permissions.
 * Provides flexible permission checking with multiple conditions.
 *
 * Usage examples:
 *
 * ```tsx
 * // Require minimum role
 * <RoleGuard requireRole={UserRole.ADMIN}>
 *   <AdminPanel />
 * </RoleGuard>
 *
 * // Require Super-Admin
 * <RoleGuard requireSuperAdmin>
 *   <SuperAdminUI />
 * </RoleGuard>
 *
 * // Require tenant access
 * <RoleGuard requireTenantAccess="acme">
 *   <TenantContent />
 * </RoleGuard>
 *
 * // Require project access
 * <RoleGuard requireProjectAccess={{ tenant: "acme", project: "proj-1" }}>
 *   <ProjectContent />
 * </RoleGuard>
 *
 * // Require write permission
 * <RoleGuard requireWrite={{ tenant: "acme", project: "proj-1" }}>
 *   <EditButton />
 * </RoleGuard>
 *
 * // Custom permission check
 * <RoleGuard customCheck={(perms) => perms.isTenantAdmin("acme")}>
 *   <TenantAdminTools />
 * </RoleGuard>
 *
 * // Multiple conditions (ALL must pass)
 * <RoleGuard
 *   requireTenantAccess="acme"
 *   requireRole={UserRole.AUTHOR}
 * >
 *   <CreateButton />
 * </RoleGuard>
 *
 * // Show fallback if permission denied
 * <RoleGuard
 *   requireRole={UserRole.ADMIN}
 *   fallback={<div>Access denied</div>}
 * >
 *   <AdminPanel />
 * </RoleGuard>
 * ```
 */

import React, { type ReactNode } from "react";
import { UserRole } from "../lib/rbac";
import { useUserRole, type UseUserRoleResult } from "../hooks/useUserRole";

export interface RoleGuardProps {
  /** Children to render if permission check passes */
  children: ReactNode;

  /** Fallback to render if permission check fails (default: null) */
  fallback?: ReactNode;

  /** Require at least this role level */
  requireRole?: UserRole;

  /** Context for role check */
  roleContext?: {
    tenant?: string;
    project?: string;
  };

  /** Require Super-Admin role */
  requireSuperAdmin?: boolean;

  /** Require Tenant-Admin for this tenant */
  requireTenantAdmin?: string;

  /** Require admin access (project or tenant admin) */
  requireAdmin?: {
    tenant?: string;
    project?: string;
  };

  /** Require write permission in this context */
  requireWrite?: {
    tenant?: string;
    project?: string;
  };

  /** Require access to this tenant */
  requireTenantAccess?: string;

  /** Require access to this project */
  requireProjectAccess?: {
    tenant: string;
    project: string;
  };

  /** Custom permission check function */
  customCheck?: (permissions: UseUserRoleResult) => boolean;

  /**
   * Require ALL conditions to pass (default: true)
   * If false, ANY condition passing will grant access
   */
  requireAll?: boolean;
}

/**
 * Component that conditionally renders children based on user permissions
 */
export function RoleGuard({
  children,
  fallback = null,
  requireRole,
  roleContext,
  requireSuperAdmin,
  requireTenantAdmin,
  requireAdmin,
  requireWrite,
  requireTenantAccess,
  requireProjectAccess,
  customCheck,
  requireAll = true
}: RoleGuardProps): JSX.Element | null {
  const permissions = useUserRole();

  // Collect all permission checks
  const checks: boolean[] = [];

  // Check: Super-Admin required
  if (requireSuperAdmin !== undefined) {
    checks.push(permissions.isSuperAdmin());
  }

  // Check: Tenant-Admin required
  if (requireTenantAdmin) {
    checks.push(permissions.isTenantAdmin(requireTenantAdmin));
  }

  // Check: Minimum role required
  if (requireRole) {
    checks.push(
      permissions.hasRole(
        requireRole,
        roleContext?.tenant,
        roleContext?.project
      )
    );
  }

  // Check: Admin access required
  if (requireAdmin) {
    checks.push(
      permissions.isAdmin(requireAdmin.tenant, requireAdmin.project)
    );
  }

  // Check: Write permission required
  if (requireWrite) {
    checks.push(
      permissions.canWrite(requireWrite.tenant, requireWrite.project)
    );
  }

  // Check: Tenant access required
  if (requireTenantAccess) {
    checks.push(permissions.hasTenantAccess(requireTenantAccess));
  }

  // Check: Project access required
  if (requireProjectAccess) {
    checks.push(
      permissions.hasProjectAccess(
        requireProjectAccess.tenant,
        requireProjectAccess.project
      )
    );
  }

  // Check: Custom check
  if (customCheck) {
    checks.push(customCheck(permissions));
  }

  // If no checks specified, deny by default (fail-safe)
  if (checks.length === 0) {
    return fallback as JSX.Element | null;
  }

  // Evaluate checks based on requireAll setting
  const hasAccess = requireAll
    ? checks.every(check => check) // ALL must pass
    : checks.some(check => check);  // ANY must pass

  return hasAccess ? <>{children}</> : (fallback as JSX.Element | null);
}

/**
 * Hook version of RoleGuard for use in component logic
 *
 * Usage:
 * ```tsx
 * const canEdit = useRoleGuardCheck({
 *   requireWrite: { tenant: "acme", project: "proj-1" }
 * });
 *
 * if (canEdit) {
 *   // Show edit UI
 * }
 * ```
 */
export function useRoleGuardCheck(props: Omit<RoleGuardProps, "children" | "fallback">): boolean {
  const permissions = useUserRole();

  const checks: boolean[] = [];

  if (props.requireSuperAdmin !== undefined) {
    checks.push(permissions.isSuperAdmin());
  }

  if (props.requireTenantAdmin) {
    checks.push(permissions.isTenantAdmin(props.requireTenantAdmin));
  }

  if (props.requireRole) {
    checks.push(
      permissions.hasRole(
        props.requireRole,
        props.roleContext?.tenant,
        props.roleContext?.project
      )
    );
  }

  if (props.requireAdmin) {
    checks.push(
      permissions.isAdmin(props.requireAdmin.tenant, props.requireAdmin.project)
    );
  }

  if (props.requireWrite) {
    checks.push(
      permissions.canWrite(props.requireWrite.tenant, props.requireWrite.project)
    );
  }

  if (props.requireTenantAccess) {
    checks.push(permissions.hasTenantAccess(props.requireTenantAccess));
  }

  if (props.requireProjectAccess) {
    checks.push(
      permissions.hasProjectAccess(
        props.requireProjectAccess.tenant,
        props.requireProjectAccess.project
      )
    );
  }

  if (props.customCheck) {
    checks.push(props.customCheck(permissions));
  }

  if (checks.length === 0) {
    return false;
  }

  const requireAll = props.requireAll ?? true;
  return requireAll
    ? checks.every(check => check)
    : checks.some(check => check);
}
