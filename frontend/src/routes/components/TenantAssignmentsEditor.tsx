import { Plus, Trash2 } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import type { TenantAssignment } from "../utils/userPermissions";
import { ROLE_LABELS, TENANT_ROLE_OPTIONS, createAssignmentRow } from "../utils/userPermissions";
import { UserRole } from "../../lib/rbac";

type TenantOption = {
  value: string;
  label: string;
};

type TenantAssignmentsEditorProps = {
  assignments: TenantAssignment[];
  onChange: (assignments: TenantAssignment[]) => void;
  tenantOptions: TenantOption[];
  disabled?: boolean;
  emptyStateHint?: string;
};

export function TenantAssignmentsEditor({
  assignments,
  onChange,
  tenantOptions,
  disabled = false,
  emptyStateHint
}: TenantAssignmentsEditorProps): JSX.Element {
  const usedTenants = assignments
    .map(assignment => assignment.tenant)
    .filter((tenant): tenant is string => Boolean(tenant));

  const canAdd = !disabled && tenantOptions.some(option => !usedTenants.includes(option.value));

  const handleAddAssignment = () => {
    if (!canAdd) return;
    const nextTenant = tenantOptions.find(option => !usedTenants.includes(option.value));
    const newAssignment = nextTenant
      ? { ...createAssignmentRow(), tenant: nextTenant.value }
      : createAssignmentRow();
    onChange([...assignments, newAssignment]);
  };

  const handleRemoveAssignment = (id: string) => {
    if (disabled) return;
    onChange(assignments.filter(assignment => assignment.id !== id));
  };

  const handleTenantChange = (id: string, tenant: string) => {
    onChange(assignments.map(assignment => assignment.id === id ? { ...assignment, tenant } : assignment));
  };

  const handleRoleChange = (id: string, role: UserRole) => {
    onChange(assignments.map(assignment => assignment.id === id ? { ...assignment, role } : assignment));
  };

  const handleOwnerToggle = (id: string, isOwner: boolean) => {
    onChange(assignments.map(assignment => assignment.id === id ? { ...assignment, isOwner } : assignment));
  };

  const renderAssignmentRow = (assignment: TenantAssignment) => {
    const otherAssignments = assignments.filter(item => item.id !== assignment.id && item.tenant);
    const otherTenants = new Set(otherAssignments.map(item => item.tenant));

    const baseOptions = assignment.tenant && !tenantOptions.some(option => option.value === assignment.tenant)
      ? [...tenantOptions, { value: assignment.tenant, label: assignment.tenant }]
      : tenantOptions;

    const options = baseOptions.filter(option => option.value === assignment.tenant || !otherTenants.has(option.value));

    return (
      <div key={assignment.id} className="grid grid-cols-1 md:grid-cols-4 gap-2 items-center">
        <Select
          value={assignment.tenant}
          onValueChange={value => handleTenantChange(assignment.id, value)}
          disabled={disabled || options.length === 0}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select tenant" />
          </SelectTrigger>
          <SelectContent>
            {options.length === 0 ? (
              <SelectItem value="__no_tenants__" disabled>
                No tenants available
              </SelectItem>
            ) : (
              options.map(option => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>
        <Select
          value={assignment.role}
          onValueChange={value => handleRoleChange(assignment.id, value as UserRole)}
          disabled={disabled}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select role" />
          </SelectTrigger>
          <SelectContent>
            {TENANT_ROLE_OPTIONS.map(option => (
              <SelectItem key={option} value={option}>
                {ROLE_LABELS[option]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <label className="flex items-center gap-2 text-xs md:text-sm">
          <input
            type="checkbox"
            checked={assignment.isOwner}
            onChange={event => handleOwnerToggle(assignment.id, event.target.checked)}
            disabled={disabled}
          />
          Owner
        </label>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => handleRemoveAssignment(assignment.id)}
          disabled={disabled}
          aria-label="Remove tenant assignment"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    );
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium">Tenant Roles</h4>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleAddAssignment}
          disabled={!canAdd}
        >
          <Plus className="h-4 w-4 mr-1" /> Add Tenant Role
        </Button>
      </div>

      {tenantOptions.length === 0 && (
        <p className="text-sm text-muted-foreground">
          {emptyStateHint ?? "No tenants available. Create a tenant first or assign a global role."}
        </p>
      )}

      {assignments.length === 0 ? (
        <p className="text-sm text-muted-foreground">No tenant roles assigned.</p>
      ) : (
        <div className="space-y-2">
          {assignments.map(renderAssignmentRow)}
          <p className="text-xs text-muted-foreground">
            Each tenant can only appear once. Owners have elevated control over the tenant.
          </p>
        </div>
      )}
    </div>
  );
}
