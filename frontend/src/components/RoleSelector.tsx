import { UserRole } from "../lib/rbac";
import { Checkbox } from "./ui/checkbox";
import { Badge } from "./ui/badge";
import { X } from "lucide-react";

type RoleSelectorProps = {
  value: string[];
  onChange: (roles: string[]) => void;
  disabled?: boolean;
};

const ROLE_LABELS: Record<UserRole, string> = {
  [UserRole.SUPER_ADMIN]: "Super Admin",
  [UserRole.TENANT_ADMIN]: "Tenant Admin",
  [UserRole.ADMIN]: "Admin",
  [UserRole.APPROVER]: "Approver",
  [UserRole.AUTHOR]: "Author",
  [UserRole.VIEWER]: "Viewer"
};

const ROLE_DESCRIPTIONS: Record<UserRole, string> = {
  [UserRole.SUPER_ADMIN]: "Full system access across all tenants",
  [UserRole.TENANT_ADMIN]: "Full access within assigned tenants",
  [UserRole.ADMIN]: "Administrative access to manage users and projects",
  [UserRole.APPROVER]: "Can approve and modify requirements",
  [UserRole.AUTHOR]: "Can create and edit requirements",
  [UserRole.VIEWER]: "Read-only access"
};

const ROLE_ORDER = [
  UserRole.SUPER_ADMIN,
  UserRole.TENANT_ADMIN,
  UserRole.ADMIN,
  UserRole.APPROVER,
  UserRole.AUTHOR,
  UserRole.VIEWER
];

export function RoleSelector({ value, onChange, disabled }: RoleSelectorProps): JSX.Element {
  const selectedRoles = new Set(value);

  const handleToggle = (role: string) => {
    const newRoles = new Set(selectedRoles);
    if (newRoles.has(role)) {
      newRoles.delete(role);
    } else {
      newRoles.add(role);
    }
    onChange(Array.from(newRoles));
  };

  const handleRemove = (role: string) => {
    const newRoles = value.filter(r => r !== role);
    onChange(newRoles);
  };

  return (
    <div className="space-y-3">
      {/* Selected Roles Display */}
      {value.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {value.map(role => (
            <Badge
              key={role}
              variant={
                role === UserRole.SUPER_ADMIN || role === UserRole.TENANT_ADMIN
                  ? "warning"
                  : role === UserRole.ADMIN
                  ? "info"
                  : "secondary"
              }
              className="flex items-center gap-1 pr-1"
            >
              <span>{ROLE_LABELS[role as UserRole] || role}</span>
              {!disabled && (
                <button
                  type="button"
                  onClick={() => handleRemove(role)}
                  className="ml-1 rounded-sm opacity-70 hover:opacity-100 focus:outline-none focus:ring-1 focus:ring-ring"
                  aria-label={`Remove ${role} role`}
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </Badge>
          ))}
        </div>
      )}

      {/* Role Checkboxes */}
      <div className="space-y-2 border rounded-md p-3 bg-muted/10">
        {ROLE_ORDER.map(role => (
          <label
            key={role}
            className="flex items-start gap-3 cursor-pointer hover:bg-muted/50 rounded-md p-2 -m-2 transition-colors"
          >
            <Checkbox
              checked={selectedRoles.has(role)}
              onCheckedChange={() => handleToggle(role)}
              disabled={disabled}
              className="mt-0.5"
            />
            <div className="flex-1 space-y-0.5">
              <div className="text-sm font-medium leading-none">
                {ROLE_LABELS[role]}
              </div>
              <div className="text-xs text-muted-foreground">
                {ROLE_DESCRIPTIONS[role]}
              </div>
            </div>
          </label>
        ))}
      </div>
    </div>
  );
}
