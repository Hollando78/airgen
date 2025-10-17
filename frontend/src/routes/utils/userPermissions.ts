import { UserRole, type UserPermissions } from "../../lib/rbac";

export type TenantAssignment = {
  id: string;
  tenant: string;
  role: UserRole;
  isOwner: boolean;
};

export const ROLE_LABELS: Record<UserRole, string> = {
  [UserRole.SUPER_ADMIN]: "Super Admin",
  [UserRole.TENANT_ADMIN]: "Tenant Admin",
  [UserRole.ADMIN]: "Admin",
  [UserRole.APPROVER]: "Approver",
  [UserRole.AUTHOR]: "Author",
  [UserRole.VIEWER]: "Viewer"
};

export const GLOBAL_ROLE_OPTIONS: Array<{ value: UserRole | "__none__"; label: string }> = [
  { value: "__none__", label: "None" },
  { value: UserRole.SUPER_ADMIN, label: ROLE_LABELS[UserRole.SUPER_ADMIN] }
];

export const TENANT_ROLE_OPTIONS: UserRole[] = [
  UserRole.TENANT_ADMIN,
  UserRole.ADMIN,
  UserRole.APPROVER,
  UserRole.AUTHOR,
  UserRole.VIEWER
];

export function createAssignmentRow(): TenantAssignment {
  return {
    id: `assignment-${Math.random().toString(36).slice(2)}`,
    tenant: "",
    role: UserRole.VIEWER,
    isOwner: false
  };
}

export function permissionsToAssignments(permissions?: UserPermissions): TenantAssignment[] {
  if (!permissions?.tenantPermissions) {
    return [];
  }

  return Object.entries(permissions.tenantPermissions).map(([tenant, value], index) => ({
    id: `assignment-${tenant}-${index}`,
    tenant,
    role: value.role,
    isOwner: Boolean(value.isOwner)
  }));
}

export function buildPermissionsFromForm(
  globalRole: UserRole | "__none__",
  assignments: TenantAssignment[]
): UserPermissions {
  console.log('[buildPermissionsFromForm] Input:', { globalRole, assignments });

  if (globalRole === UserRole.SUPER_ADMIN) {
    return { globalRole: UserRole.SUPER_ADMIN };
  }

  const normalized = assignments
    .map(assignment => ({
      tenant: assignment.tenant.trim(),
      role: assignment.role,
      isOwner: assignment.isOwner
    }))
    .filter(assignment => assignment.tenant.length > 0);

  console.log('[buildPermissionsFromForm] Normalized assignments:', normalized);

  if (normalized.length === 0) {
    return {};
  }

  const tenantPermissions: NonNullable<UserPermissions["tenantPermissions"]> = {};
  for (const assignment of normalized) {
    tenantPermissions[assignment.tenant] = {
      role: assignment.role,
      isOwner: assignment.isOwner
    };
  }

  const result = { tenantPermissions };
  console.log('[buildPermissionsFromForm] Result:', result);
  return result;
}

export function summarizeTenantRoles(
  permissions?: UserPermissions
): Array<{ tenant: string; role: UserRole; isOwner: boolean }> {
  if (!permissions?.tenantPermissions) {
    return [];
  }

  return Object.entries(permissions.tenantPermissions).map(([tenant, value]) => ({
    tenant,
    role: value.role,
    isOwner: Boolean(value.isOwner)
  }));
}
