/**
 * Tenant-Admin Users Management
 *
 * Tenant-scoped user access management interface.
 * Allows granting/revoking access and updating roles for users within a tenant.
 * Only accessible to Tenant-Admin users.
 */

import type { FormEvent } from "react";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "../lib/client";
import { useUserRole } from "../hooks/useUserRole";
import { Spinner } from "../components/Spinner";
import { ErrorState } from "../components/ErrorState";
import { PageLayout } from "../components/layout/PageLayout";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { FormField } from "../components/ui/form-field";
import { EmptyState } from "../components/ui/empty-state";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "../components/ui/table";
import { Badge } from "../components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { RefreshCw, Users, Building2, UserPlus } from "lucide-react";
import { UserRole } from "../lib/rbac";
import { ROLE_LABELS, TENANT_ROLE_OPTIONS } from "./utils/userPermissions";
import type { DevUser } from "../types";

type GrantAccessFormState = {
  email: string;
  role: UserRole;
  isOwner: boolean;
};

const EMPTY_GRANT_FORM: GrantAccessFormState = {
  email: "",
  role: UserRole.VIEWER,
  isOwner: false
};

function formatDate(timestamp: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short"
    }).format(new Date(timestamp));
  } catch (error) {
    return timestamp;
  }
}

export function TenantAdminUsersRoute(): JSX.Element {
  const api = useApiClient();
  const queryClient = useQueryClient();
  const { getUserTenants } = useUserRole();

  // Get list of tenants user can admin
  const userTenants = getUserTenants();
  const [selectedTenant, setSelectedTenant] = useState<string>(userTenants[0] ?? "");

  const [grantForm, setGrantForm] = useState<GrantAccessFormState>(EMPTY_GRANT_FORM);
  const [grantError, setGrantError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editRole, setEditRole] = useState<UserRole>(UserRole.VIEWER);
  const [editIsOwner, setEditIsOwner] = useState<boolean>(false);
  const [editError, setEditError] = useState<string | null>(null);

  const usersQuery = useQuery({
    queryKey: ["tenant-admin-users", selectedTenant],
    queryFn: () => api.listTenantUsers(selectedTenant),
    enabled: !!selectedTenant
  });

  const grantAccessMutation = useMutation({
    mutationFn: (payload: { tenant: string; userId: string; role: UserRole; isOwner: boolean }) =>
      api.grantTenantUserAccess(payload.tenant, payload.userId, payload.role, payload.isOwner),
    onSuccess: () => {
      setGrantForm(EMPTY_GRANT_FORM);
      setGrantError(null);
      void queryClient.invalidateQueries({ queryKey: ["tenant-admin-users", selectedTenant] });
    },
    onError: (error: unknown) => {
      setGrantError(error instanceof Error ? error.message : "Failed to grant access");
    }
  });

  const updateAccessMutation = useMutation({
    mutationFn: (payload: { tenant: string; userId: string; role: UserRole; isOwner: boolean }) =>
      api.grantTenantUserAccess(payload.tenant, payload.userId, payload.role, payload.isOwner),
    onSuccess: () => {
      setEditingId(null);
      setEditError(null);
      setEditRole(UserRole.VIEWER);
      setEditIsOwner(false);
      void queryClient.invalidateQueries({ queryKey: ["tenant-admin-users", selectedTenant] });
    },
    onError: (error: unknown) => {
      setEditError(error instanceof Error ? error.message : "Failed to update access");
    }
  });

  const revokeAccessMutation = useMutation({
    mutationFn: (payload: { tenant: string; userId: string }) =>
      api.revokeTenantUserAccess(payload.tenant, payload.userId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["tenant-admin-users", selectedTenant] });
    }
  });

  const users = useMemo<DevUser[]>(() => usersQuery.data?.users ?? [], [usersQuery.data]);

  const handleGrantAccess = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setGrantError(null);
    const email = grantForm.email.trim();
    if (!email) {
      setGrantError("Email is required");
      return;
    }
    if (!selectedTenant) {
      setGrantError("Please select a tenant");
      return;
    }

    await grantAccessMutation.mutateAsync({
      tenant: selectedTenant,
      userId: email,
      role: grantForm.role,
      isOwner: grantForm.isOwner
    });
  };

  const beginEdit = (user: DevUser) => {
    setEditingId(user.id);
    const tenantPerm = user.permissions?.tenantPermissions?.[selectedTenant];
    setEditRole(tenantPerm?.role ?? UserRole.VIEWER);
    setEditIsOwner(Boolean(tenantPerm?.isOwner));
    setEditError(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditError(null);
    setEditRole(UserRole.VIEWER);
    setEditIsOwner(false);
  };

  const handleUpdateAccess = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingId) return;
    if (!selectedTenant) return;
    setEditError(null);

    await updateAccessMutation.mutateAsync({
      tenant: selectedTenant,
      userId: editingId,
      role: editRole,
      isOwner: editIsOwner
    });
  };

  const handleRevokeAccess = async (userId: string) => {
    if (!window.confirm("Revoke this user's access to the tenant? They will lose all permissions for this tenant.")) return;
    if (!selectedTenant) return;

    await revokeAccessMutation.mutateAsync({
      tenant: selectedTenant,
      userId
    });
  };

  if (userTenants.length === 0) {
    return (
      <PageLayout
        title="Tenant Admin - User Management"
        description="Manage user access within your tenants"
      >
        <Card>
          <CardContent className="py-8">
            <p className="text-center text-muted-foreground">
              You do not have Tenant-Admin access to any tenants.
            </p>
          </CardContent>
        </Card>
      </PageLayout>
    );
  }

  return (
    <PageLayout
      title="Tenant Admin - User Management"
      description="Manage user access and roles within your tenants."
    >
      <div className="space-y-6">
        {/* Info Banner */}
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="py-4">
            <div className="flex items-center gap-2 text-blue-900">
              <Building2 className="h-5 w-5" />
              <p className="text-sm font-medium">
                Tenant-Admin Access: You can grant and manage user access within your tenants.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Tenant Selector */}
        {userTenants.length > 1 && (
          <Card>
            <CardHeader>
              <CardTitle>Select Tenant</CardTitle>
            </CardHeader>
            <CardContent>
              <Select value={selectedTenant} onValueChange={setSelectedTenant}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a tenant" />
                </SelectTrigger>
                <SelectContent>
                  {userTenants.map((tenant) => (
                    <SelectItem key={tenant} value={tenant}>
                      {tenant}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>
        )}

        {/* Grant Access Form */}
        {selectedTenant && (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <UserPlus className="h-5 w-5" />
                <CardTitle>Grant User Access to {selectedTenant}</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <form className="space-y-4" onSubmit={handleGrantAccess}>
                <div className="grid grid-cols-1 gap-4">
                  <FormField
                    label="User Email"
                    htmlFor="grant-email"
                    required
                    error={grantError || undefined}
                    hint="Enter the email of an existing user in the system"
                  >
                    <Input
                      id="grant-email"
                      type="email"
                      value={grantForm.email}
                      onChange={event => setGrantForm(current => ({ ...current, email: event.target.value }))}
                      placeholder="user@example.com"
                      required
                    />
                  </FormField>
                  <FormField
                    label="Role"
                    htmlFor="grant-role"
                    hint="Select the role for this user within the tenant"
                  >
                    <select
                      id="grant-role"
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      value={grantForm.role}
                      onChange={event => setGrantForm(current => ({ ...current, role: event.target.value as UserRole }))}
                    >
                      {TENANT_ROLE_OPTIONS.map(option => (
                        <option key={option} value={option}>{ROLE_LABELS[option]}</option>
                      ))}
                    </select>
                  </FormField>
                  <FormField
                    label="Owner"
                    htmlFor="grant-owner"
                    hint="Owners can manage tenant settings"
                  >
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        id="grant-owner"
                        type="checkbox"
                        checked={grantForm.isOwner}
                        onChange={event => setGrantForm(current => ({ ...current, isOwner: event.target.checked }))}
                      />
                      Mark as Tenant Owner
                    </label>
                  </FormField>
                </div>
                <div className="flex justify-end">
                  <Button type="submit" disabled={grantAccessMutation.isPending}>
                    {grantAccessMutation.isPending ? "Granting Access..." : "Grant Access"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Users Table */}
        {selectedTenant && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Users in {selectedTenant}</CardTitle>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => usersQuery.refetch()}
                  disabled={usersQuery.isFetching}
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Refresh
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {usersQuery.isLoading ? (
                <div className="flex justify-center py-8">
                  <Spinner />
                </div>
              ) : usersQuery.isError ? (
                <ErrorState message={(usersQuery.error as Error).message} />
              ) : users.length === 0 ? (
                <EmptyState
                  icon={Users}
                  title="No users with access"
                  description="Grant access to users using the form above."
                />
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Email</TableHead>
                          <TableHead>Name</TableHead>
                          <TableHead>Tenant Role</TableHead>
                          <TableHead>Updated</TableHead>
                          <TableHead className="w-[180px]">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {users.map(user => {
                          const tenantPerm = user.permissions?.tenantPermissions?.[selectedTenant];
                          const displayRole = tenantPerm?.role ?? UserRole.VIEWER;
                          const displayOwner = Boolean(tenantPerm?.isOwner);

                          return (
                            <TableRow key={user.id}>
                              <TableCell className="font-medium">{user.email}</TableCell>
                              <TableCell>{user.name ?? "—"}</TableCell>
                              <TableCell>{editingId === user.id ? (
                                <div className="flex flex-col gap-2 min-w-[220px]">
                                  <Select value={editRole} onValueChange={value => setEditRole(value as UserRole)}>
                                    <SelectTrigger className="w-full">
                                      <SelectValue placeholder="Select role" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {TENANT_ROLE_OPTIONS.map(option => (
                                        <SelectItem key={option} value={option}>{ROLE_LABELS[option]}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                  <label className="flex items-center gap-2 text-xs">
                                    <input
                                      type="checkbox"
                                      checked={editIsOwner}
                                      onChange={event => setEditIsOwner(event.target.checked)}
                                    />
                                    Owner
                                  </label>
                                </div>
                              ) : (
                                <div className="flex items-center gap-2">
                                  <Badge
                                    variant={
                                      displayRole === UserRole.ADMIN
                                        ? "info"
                                        : displayRole === UserRole.APPROVER
                                        ? "success"
                                        : displayRole === UserRole.TENANT_ADMIN
                                        ? "warning"
                                        : "secondary"
                                    }
                                  >
                                    {ROLE_LABELS[displayRole]}
                                  </Badge>
                                  {displayOwner && <Badge variant="outline">Owner</Badge>}
                                </div>
                              )}</TableCell>
                              <TableCell className="text-sm text-muted-foreground">
                                {user.updatedAt ? formatDate(user.updatedAt) : "—"}
                              </TableCell>
                              <TableCell>
                                {editingId === user.id ? (
                                  <form onSubmit={handleUpdateAccess} className="flex gap-2">
                                    <Button type="submit" size="sm" disabled={updateAccessMutation.isPending}>
                                      {updateAccessMutation.isPending ? "Saving..." : "Save"}
                                    </Button>
                                    <Button type="button" variant="secondary" size="sm" onClick={cancelEdit}>
                                      Cancel
                                    </Button>
                                  </form>
                                ) : (
                                  <div className="flex gap-2">
                                    <Button type="button" variant="secondary" size="sm" onClick={() => beginEdit(user)}>
                                      Edit Role
                                    </Button>
                                    <Button
                                      type="button"
                                      variant="destructive"
                                      size="sm"
                                      onClick={() => handleRevokeAccess(user.id)}
                                      disabled={revokeAccessMutation.isPending}
                                    >
                                      Revoke
                                    </Button>
                                  </div>
                                )}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                  {editingId && editError && (
                    <p className="text-sm text-error mt-4" role="alert">
                      {editError}
                    </p>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </PageLayout>
  );
}
