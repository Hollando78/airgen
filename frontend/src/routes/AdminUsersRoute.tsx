/**
 * Admin Users Management
 *
 * Manage internal developer accounts and assign tenant-level permissions.
 * Accessible to users with Admin privileges.
 */

import type { FormEvent } from "react";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "../lib/client";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "../components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { RefreshCw, Users, UserPlus } from "lucide-react";
import { UserRole, type UserPermissions } from "../lib/rbac";
import type { DevUser, TenantRecord } from "../types";
import {
  createAssignmentRow,
  permissionsToAssignments,
  buildPermissionsFromForm,
  summarizeTenantRoles,
  ROLE_LABELS,
  GLOBAL_ROLE_OPTIONS,
  type TenantAssignment
} from "./utils/userPermissions";
import { TenantAssignmentsEditor } from "./components/TenantAssignmentsEditor";

type UserFormState = {
  email: string;
  name: string;
  password: string;
  globalRole: UserRole | "__none__";
  assignments: TenantAssignment[];
};

type ModalMode = "create" | "edit";

type TenantOption = {
  value: string;
  label: string;
};

const EMAIL_REQUIRED_ERROR = "Email is required";
const PASSWORD_REQUIRED_ERROR = "Password must be at least 8 characters";

function makeEmptyForm(): UserFormState {
  return {
    email: "",
    name: "",
    password: "",
    globalRole: "__none__",
    assignments: [createAssignmentRow()]
  };
}

function summarizeRolesForBadges(roles: Array<{ role: UserRole }>): UserRole[] {
  return Array.from(new Set(roles.map(entry => entry.role)));
}

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

export function AdminUsersRoute(): JSX.Element {
  const api = useApiClient();
  const queryClient = useQueryClient();

  const [modalMode, setModalMode] = useState<ModalMode>("create");
  const [isModalOpen, setIsModalOpen] = useState(false);

  const [createForm, setCreateForm] = useState<UserFormState>(() => makeEmptyForm());
  const [createError, setCreateError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<UserFormState>(() => makeEmptyForm());
  const [editError, setEditError] = useState<string | null>(null);

  const usersQuery = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => api.listDevUsers()
  });

  const tenantsQuery = useQuery({
    queryKey: ["admin-tenants"],
    queryFn: () => api.listTenants()
  });

  const tenantOptions = useMemo<TenantOption[]>(() => {
    const tenants = tenantsQuery.data?.tenants ?? [];
    return tenants.map((tenant: TenantRecord) => ({
      value: tenant.slug,
      label: tenant.name ? `${tenant.name} (${tenant.slug})` : tenant.slug
    }));
  }, [tenantsQuery.data]);

  const users = useMemo<DevUser[]>(() => usersQuery.data?.users ?? [], [usersQuery.data]);

  const invalidateUsers = () =>
    queryClient.invalidateQueries({ queryKey: ["admin-users"] }).catch(() => undefined);

  const closeModal = () => {
    setIsModalOpen(false);
    setModalMode("create");
    setEditingId(null);
    setCreateForm(makeEmptyForm());
    setEditForm(makeEmptyForm());
    setCreateError(null);
    setEditError(null);
  };

  const openCreateModal = () => {
    setModalMode("create");
    setCreateForm(makeEmptyForm());
    setCreateError(null);
    setIsModalOpen(true);
  };

  const openEditModal = async (user: DevUser) => {
    setModalMode("edit");
    setEditingId(user.id);

    // Refetch to ensure we have the latest user data
    console.log('[openEditModal] Refetching user data for:', user.id);
    const { data } = await usersQuery.refetch();
    console.log('[openEditModal] Refetch complete, data:', data);
    const freshUser = data?.users.find((u: DevUser) => u.id === user.id) ?? user;
    console.log('[openEditModal] Fresh user found:', freshUser);
    console.log('[openEditModal] Fresh user permissions:', freshUser.permissions);

    const assignments = permissionsToAssignments(freshUser.permissions);
    const globalRole = freshUser.permissions?.globalRole ?? "__none__";

    console.log('[openEditModal] Assignments from permissions:', assignments);
    console.log('[openEditModal] Global role:', globalRole);

    setEditForm({
      email: freshUser.email,
      name: freshUser.name ?? "",
      password: "",
      globalRole,
      assignments: assignments.length ? assignments : [createAssignmentRow()]
    });
    setEditError(null);
    setIsModalOpen(true);
  };

  const createMutation = useMutation({
    mutationFn: (payload: { email: string; name?: string; password: string; permissions: UserPermissions }) =>
      api.createDevUser(payload),
    onSuccess: () => {
      closeModal();
      void invalidateUsers();
    },
    onError: (error: unknown) => {
      setCreateError(error instanceof Error ? error.message : "Failed to create user");
    }
  });

  const updateMutation = useMutation({
    mutationFn: async (payload: {
      id: string;
      data: { email?: string; name?: string | null; password?: string };
      permissions: UserPermissions;
    }) => {
      await api.updateDevUser(payload.id, payload.data);
      return api.updateDevUserPermissions(payload.id, payload.permissions);
    },
    onSuccess: () => {
      closeModal();
      void invalidateUsers();
    },
    onError: (error: unknown) => {
      setEditError(error instanceof Error ? error.message : "Failed to update user");
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteDevUser(id),
    onSuccess: () => {
      void invalidateUsers();
    }
  });

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setCreateError(null);

    const email = createForm.email.trim();
    if (!email) {
      setCreateError(EMAIL_REQUIRED_ERROR);
      return;
    }

    const password = createForm.password.trim();
    if (password.length < 8) {
      setCreateError(PASSWORD_REQUIRED_ERROR);
      return;
    }

    const permissions = buildPermissionsFromForm(createForm.globalRole, createForm.assignments);

    await createMutation.mutateAsync({
      email,
      name: createForm.name.trim() || undefined,
      password,
      permissions
    });
  };

  const handleUpdate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    console.log('[handleUpdate] Form submitted');

    if (!editingId) {
      console.log('[handleUpdate] No editingId, returning');
      return;
    }
    setEditError(null);

    const email = editForm.email.trim();
    if (!email) {
      console.log('[handleUpdate] Email validation failed');
      setEditError(EMAIL_REQUIRED_ERROR);
      return;
    }

    const updateData: { email?: string; name?: string | null; password?: string } = {
      email,
      name: editForm.name.trim() || null
    };

    if (editForm.password.trim()) {
      updateData.password = editForm.password.trim();
    }

    const permissions = buildPermissionsFromForm(editForm.globalRole, editForm.assignments);

    console.log('[handleUpdate] About to call updateMutation with:', {
      id: editingId,
      data: updateData,
      permissions
    });

    try {
      await updateMutation.mutateAsync({
        id: editingId,
        data: updateData,
        permissions
      });
      console.log('[handleUpdate] Update completed successfully');
    } catch (error) {
      console.error('[handleUpdate] Update failed:', error);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Delete this user? This action cannot be undone.")) return;
    await deleteMutation.mutateAsync(id);
  };

  const createEmailError = createError === EMAIL_REQUIRED_ERROR ? createError : undefined;
  const createPasswordError = createError === PASSWORD_REQUIRED_ERROR ? createError : undefined;
  const createGeneralError =
    createError &&
    createError !== EMAIL_REQUIRED_ERROR &&
    createError !== PASSWORD_REQUIRED_ERROR
      ? createError
      : null;

  return (
    <PageLayout
      title="Admin Users"
      description="Manage internal admin accounts and their tenant access."
    >
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <CardTitle>Admin Users</CardTitle>
              <div className="flex items-center gap-2">
                <Button type="button" size="sm" onClick={openCreateModal}>
                  <UserPlus className="mr-2 h-4 w-4" />
                  New User
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => usersQuery.refetch()}
                  disabled={usersQuery.isFetching}
                  aria-label="Refresh user list"
                >
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </div>
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
                title="No users created"
                description="Use the New User button to provision the first admin account."
              />
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Email</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Password</TableHead>
                      <TableHead>Roles</TableHead>
                      <TableHead>Tenants</TableHead>
                      <TableHead>Updated</TableHead>
                      <TableHead className="w-[160px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.map(user => {
                      const tenantAssignments = summarizeTenantRoles(user.permissions);
                      const badgeRoles = summarizeRolesForBadges(tenantAssignments);

                      return (
                        <TableRow key={user.id}>
                          <TableCell className="font-medium">{user.email}</TableCell>
                          <TableCell>{user.name ?? "—"}</TableCell>
                          <TableCell>••••••••</TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {user.permissions?.globalRole === UserRole.SUPER_ADMIN ? (
                                <Badge variant="warning">{ROLE_LABELS[UserRole.SUPER_ADMIN]}</Badge>
                              ) : badgeRoles.length ? (
                                badgeRoles.map(role => (
                                  <Badge
                                    key={`${user.id}-${role}`}
                                    variant={
                                      role === UserRole.TENANT_ADMIN
                                        ? "warning"
                                        : role === UserRole.ADMIN
                                        ? "info"
                                        : "secondary"
                                    }
                                  >
                                    {ROLE_LABELS[role]}
                                  </Badge>
                                ))
                              ) : (
                                <span className="text-sm text-muted-foreground">—</span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="space-y-1 text-sm">
                              {user.permissions?.globalRole === UserRole.SUPER_ADMIN ? (
                                <span className="text-muted-foreground">All tenants (Super Admin)</span>
                              ) : tenantAssignments.length ? (
                                tenantAssignments.map(entry => (
                                  <div key={`${user.id}-${entry.tenant}`} className="flex items-center gap-2">
                                    <span className="font-medium">{entry.tenant}</span>
                                    <span className="text-muted-foreground">{ROLE_LABELS[entry.role]}</span>
                                    {entry.isOwner && <Badge variant="outline">Owner</Badge>}
                                  </div>
                                ))
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {formatDate(user.updatedAt)}
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-2">
                              <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                onClick={() => openEditModal(user)}
                              >
                                Edit
                              </Button>
                              <Button
                                type="button"
                                variant="destructive"
                                size="sm"
                                onClick={() => handleDelete(user.id)}
                                disabled={deleteMutation.isPending}
                              >
                                Delete
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog
        open={isModalOpen}
        onOpenChange={open => {
          if (!open) {
            closeModal();
          } else {
            setIsModalOpen(true);
          }
        }}
      >
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{modalMode === "create" ? "Create Admin User" : `Edit ${editForm.email}`}</DialogTitle>
            <DialogDescription>
              {modalMode === "create"
                ? "Provision a new admin user and assign their permissions."
                : "Update the selected user's account details and permissions."}
            </DialogDescription>
          </DialogHeader>

          {modalMode === "create" ? (
            <form className="space-y-4" onSubmit={handleCreate}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  label="Email"
                  htmlFor="admin-create-email"
                  required
                  error={createEmailError}
                >
                  <Input
                    id="admin-create-email"
                    type="email"
                    value={createForm.email}
                    onChange={event => setCreateForm(current => ({ ...current, email: event.target.value }))}
                    required
                  />
                </FormField>
                <FormField
                  label="Name"
                  htmlFor="admin-create-name"
                  hint="Displayed across the workspace (optional)"
                >
                  <Input
                    id="admin-create-name"
                    type="text"
                    value={createForm.name}
                    onChange={event => setCreateForm(current => ({ ...current, name: event.target.value }))}
                    placeholder="Optional"
                  />
                </FormField>
                <FormField
                  label="Password"
                  htmlFor="admin-create-password"
                  hint="At least 8 characters"
                  required
                  error={createPasswordError}
                >
                  <Input
                    id="admin-create-password"
                    type="password"
                    value={createForm.password}
                    onChange={event => setCreateForm(current => ({ ...current, password: event.target.value }))}
                    placeholder="Temporary password"
                  />
                </FormField>
                <FormField
                  label="Global Role"
                  htmlFor="admin-create-global-role"
                  className="md:col-span-2"
                  hint="Super Admin grants access to every tenant automatically"
                >
                  <Select
                    value={createForm.globalRole}
                    onValueChange={value => {
                      setCreateForm(current => ({
                        ...current,
                        globalRole: value as UserRole | "__none__",
                        assignments:
                          value === UserRole.SUPER_ADMIN
                            ? []
                            : current.assignments.length
                            ? current.assignments
                            : [createAssignmentRow()]
                      }));
                    }}
                  >
                    <SelectTrigger id="admin-create-global-role" className="w-full">
                      <SelectValue placeholder="Select global role" />
                    </SelectTrigger>
                    <SelectContent>
                      {GLOBAL_ROLE_OPTIONS.map(option => (
                        <SelectItem key={option.value || "none"} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormField>
              </div>

              {createForm.globalRole !== UserRole.SUPER_ADMIN && (
                <TenantAssignmentsEditor
                  assignments={createForm.assignments}
                  onChange={assignments => setCreateForm(current => ({ ...current, assignments }))}
                  tenantOptions={tenantOptions}
                  emptyStateHint={
                    tenantsQuery.isLoading
                      ? "Loading tenants..."
                      : tenantsQuery.isError
                      ? "Unable to load tenant options."
                      : undefined
                  }
                />
              )}

              {createGeneralError && (
                <p className="text-sm text-error" role="alert">
                  {createGeneralError}
                </p>
              )}

              <DialogFooter>
                <Button type="button" variant="secondary" onClick={closeModal}>
                  Cancel
                </Button>
                <Button type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending ? "Creating..." : "Create User"}
                </Button>
              </DialogFooter>
            </form>
          ) : (
            <form className="space-y-4" onSubmit={handleUpdate}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  label="Email"
                  htmlFor="admin-edit-email"
                  required
                  error={editError === EMAIL_REQUIRED_ERROR ? editError : undefined}
                >
                  <Input
                    id="admin-edit-email"
                    type="email"
                    value={editForm.email}
                    onChange={event => setEditForm(current => ({ ...current, email: event.target.value }))}
                    required
                  />
                </FormField>
                <FormField
                  label="Name"
                  htmlFor="admin-edit-name"
                  hint="Display name (optional)"
                >
                  <Input
                    id="admin-edit-name"
                    type="text"
                    value={editForm.name}
                    onChange={event => setEditForm(current => ({ ...current, name: event.target.value }))}
                    placeholder="Optional"
                  />
                </FormField>
              </div>

              <FormField
                label="Reset Password"
                htmlFor="admin-edit-password"
                hint="Leave blank to keep the current password"
              >
                <Input
                  id="admin-edit-password"
                  type="password"
                  value={editForm.password}
                  onChange={event => setEditForm(current => ({ ...current, password: event.target.value }))}
                  placeholder="Optional"
                />
              </FormField>

              <FormField
                label="Global Role"
                htmlFor="admin-edit-global-role"
                hint="Super Admin overrides tenant-specific permissions"
              >
                <Select
                  value={editForm.globalRole}
                  onValueChange={value => {
                    setEditForm(current => ({
                      ...current,
                      globalRole: value as UserRole | "__none__",
                      assignments:
                        value === UserRole.SUPER_ADMIN
                          ? []
                          : current.assignments.length
                          ? current.assignments
                          : [createAssignmentRow()]
                    }));
                  }}
                >
                  <SelectTrigger id="admin-edit-global-role" className="w-full">
                    <SelectValue placeholder="Select global role" />
                  </SelectTrigger>
                  <SelectContent>
                    {GLOBAL_ROLE_OPTIONS.map(option => (
                      <SelectItem key={option.value || "none"} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>

              {editForm.globalRole !== UserRole.SUPER_ADMIN && (
                <TenantAssignmentsEditor
                  assignments={editForm.assignments}
                  onChange={assignments => setEditForm(current => ({ ...current, assignments }))}
                  tenantOptions={tenantOptions}
                  emptyStateHint={
                    tenantsQuery.isLoading
                      ? "Loading tenants..."
                      : tenantsQuery.isError
                      ? "Unable to load tenant options."
                      : undefined
                  }
                />
              )}

              {editError && editError !== EMAIL_REQUIRED_ERROR && (
                <p className="text-sm text-error" role="alert">
                  {editError}
                </p>
              )}

              <DialogFooter>
                <Button type="button" variant="secondary" onClick={closeModal}>
                  Cancel
                </Button>
                <Button type="submit" disabled={updateMutation.isPending}>
                  {updateMutation.isPending ? "Saving..." : "Save Changes"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </PageLayout>
  );
}
