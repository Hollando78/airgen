/**
 * Super-Admin Users Management
 *
 * Full CRUD interface for managing all users across the entire system.
 * Only accessible to Super-Admin users.
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
import { RefreshCw, Users, Shield, Trash2, Plus, UserPlus } from "lucide-react";
import { UserRole, type UserPermissions } from "../lib/rbac";
import type { DevUser, TenantRecord } from "../types";
import {
  createAssignmentRow,
  permissionsToAssignments,
  buildPermissionsFromForm,
  summarizeTenantRoles,
  ROLE_LABELS,
  GLOBAL_ROLE_OPTIONS,
  TENANT_ROLE_OPTIONS,
  type TenantAssignment
} from "./utils/userPermissions";

type UserFormState = {
  email: string;
  name: string;
  password: string;
  globalRole: UserRole | "__none__";
  assignments: TenantAssignment[];
};

type ModalMode = "create" | "edit";

const EMAIL_REQUIRED_ERROR = "Email is required";
const PASSWORD_LENGTH_ERROR = "Password must be at least 8 characters";

const TENANT_OPTION_LIST_ID = "super-admin-tenant-options";

function makeEmptyForm(): UserFormState {
  return {
    email: "",
    name: "",
    password: "",
    globalRole: "__none__",
    assignments: [createAssignmentRow()]
  };
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

function getRoleBadgeVariant(role: UserRole): "info" | "success" | "warning" | "secondary" {
  switch (role) {
    case UserRole.ADMIN:
      return "info";
    case UserRole.APPROVER:
      return "success";
    case UserRole.TENANT_ADMIN:
      return "warning";
    default:
      return "secondary";
  }
}

export function SuperAdminUsersRoute(): JSX.Element {
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
    queryKey: ["super-admin-users"],
    queryFn: () => api.listAllSuperAdminUsers()
  });

  const tenantsQuery = useQuery({
    queryKey: ["super-admin-tenants"],
    queryFn: () => api.listAllSuperAdminTenants()
  });

  const tenantOptions = useMemo<TenantRecord[]>(() => tenantsQuery.data?.tenants ?? [], [tenantsQuery.data]);

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
    const { data } = await usersQuery.refetch();
    const freshUser = data?.users.find((u: DevUser) => u.id === user.id) ?? user;

    const assignments = permissionsToAssignments(freshUser.permissions);
    const globalRole = freshUser.permissions?.globalRole ?? "__none__";

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

  const addCreateAssignment = () => {
    setCreateForm(current => ({
      ...current,
      assignments: [...current.assignments, createAssignmentRow()]
    }));
  };

  const updateCreateAssignment = (id: string, changes: Partial<TenantAssignment>) => {
    setCreateForm(current => ({
      ...current,
      assignments: current.assignments.map(assignment =>
        assignment.id === id ? { ...assignment, ...changes } : assignment
      )
    }));
  };

  const removeCreateAssignment = (id: string) => {
    setCreateForm(current => ({
      ...current,
      assignments: current.assignments.filter(assignment => assignment.id !== id)
    }));
  };

  const addEditAssignment = () => {
    setEditForm(current => ({
      ...current,
      assignments: [...current.assignments, createAssignmentRow()]
    }));
  };

  const updateEditAssignment = (id: string, changes: Partial<TenantAssignment>) => {
    setEditForm(current => ({
      ...current,
      assignments: current.assignments.map(assignment =>
        assignment.id === id ? { ...assignment, ...changes } : assignment
      )
    }));
  };

  const removeEditAssignment = (id: string) => {
    setEditForm(current => ({
      ...current,
      assignments: current.assignments.filter(assignment => assignment.id !== id)
    }));
  };

  const createMutation = useMutation({
    mutationFn: (payload: { email: string; name?: string; password: string; permissions?: UserPermissions }) =>
      api.createSuperAdminUser(payload),
    onSuccess: () => {
      closeModal();
      void queryClient.invalidateQueries({ queryKey: ["super-admin-users"] });
    },
    onError: (error: unknown) => {
      setCreateError(error instanceof Error ? error.message : "Failed to create user");
    }
  });

  const updateMutation = useMutation({
    mutationFn: (payload: { id: string; permissions: UserPermissions }) =>
      api.updateSuperAdminUserPermissions(payload.id, payload.permissions),
    onSuccess: () => {
      closeModal();
      void queryClient.invalidateQueries({ queryKey: ["super-admin-users"] });
    },
    onError: (error: unknown) => {
      setEditError(error instanceof Error ? error.message : "Failed to update user");
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteSuperAdminUser(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["super-admin-users"] });
    }
  });

  const users = useMemo<DevUser[]>(() => usersQuery.data?.users ?? [], [usersQuery.data]);

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
      setCreateError(PASSWORD_LENGTH_ERROR);
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
    if (!editingId) return;
    setEditError(null);

    const permissions = buildPermissionsFromForm(editForm.globalRole, editForm.assignments);

    await updateMutation.mutateAsync({
      id: editingId,
      permissions
    });
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Delete this user? This action cannot be undone.")) return;
    await deleteMutation.mutateAsync(id);
  };

  const renderAssignments = (
    assignments: TenantAssignment[],
    updateAssignment: (id: string, changes: Partial<TenantAssignment>) => void,
    removeAssignment: (id: string) => void
  ) => (
    <div className="space-y-2">
      {assignments.map(assignment => (
        <div
          key={assignment.id}
          className="grid grid-cols-1 md:grid-cols-[2fr_1.5fr_auto] gap-2 md:items-center"
        >
          <Input
            placeholder="tenant-slug"
            value={assignment.tenant}
            onChange={event => updateAssignment(assignment.id, { tenant: event.target.value })}
            list={tenantOptions.length ? TENANT_OPTION_LIST_ID : undefined}
          />
          <Select
            value={assignment.role}
            onValueChange={value => updateAssignment(assignment.id, { role: value as UserRole })}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Role" />
            </SelectTrigger>
            <SelectContent>
              {TENANT_ROLE_OPTIONS.map(option => (
                <SelectItem key={option} value={option}>
                  {ROLE_LABELS[option]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={assignment.isOwner}
                onChange={event => updateAssignment(assignment.id, { isOwner: event.target.checked })}
              />
              Owner
            </label>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => removeAssignment(assignment.id)}
              aria-label="Remove tenant role"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ))}
    </div>
  );

  const emailFieldError = createError === EMAIL_REQUIRED_ERROR ? createError : undefined;
  const passwordFieldError = createError === PASSWORD_LENGTH_ERROR ? createError : undefined;
  const generalCreateError =
    createError &&
    createError !== EMAIL_REQUIRED_ERROR &&
    createError !== PASSWORD_LENGTH_ERROR
      ? createError
      : null;

  return (
    <PageLayout
      title="Super Admin - User Management"
      description="Manage all users across the entire system."
    >
      <div className="space-y-6">
        <Card className="border-purple-200 bg-purple-50">
          <CardContent className="py-4">
            <div className="flex items-center gap-2 text-purple-900">
              <Shield className="h-5 w-5" />
              <p className="text-sm font-medium">
                Super-Admin Access: You can create, edit, and delete all users system-wide.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <CardTitle>All Users</CardTitle>
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
                title="No users found"
                description="Create your first user using the New User button."
              />
            ) : (
              <div className="space-y-3">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Email</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Roles</TableHead>
                        <TableHead>Tenants</TableHead>
                        <TableHead>Updated</TableHead>
                        <TableHead className="w-[150px]">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {users.map(user => {
                        const globalRole = user.permissions?.globalRole;
                        const tenantRoles = summarizeTenantRoles(user.permissions);

                        return (
                          <TableRow key={user.id}>
                            <TableCell className="font-medium">{user.email}</TableCell>
                            <TableCell>{user.name ?? "—"}</TableCell>
                            <TableCell>
                              <div className="flex flex-wrap gap-2">
                                {globalRole === UserRole.SUPER_ADMIN ? (
                                  <Badge variant="info">Super Admin</Badge>
                                ) : tenantRoles.length ? (
                                  Array.from(new Set(tenantRoles.map(entry => entry.role))).map(role => (
                                    <Badge key={`${user.id}-${role}`} variant={getRoleBadgeVariant(role)}>
                                      {ROLE_LABELS[role]}
                                    </Badge>
                                  ))
                                ) : (
                                  <span className="text-sm text-muted-foreground">No roles</span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="space-y-1 text-sm">
                                {globalRole === UserRole.SUPER_ADMIN ? (
                                  <span className="text-muted-foreground">All tenants (Super Admin)</span>
                                ) : tenantRoles.length ? (
                                  tenantRoles.map(entry => (
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
                {deleteMutation.isPending && (
                  <p className="text-xs text-muted-foreground">Deleting user...</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {tenantOptions.length > 0 && (
        <datalist id={TENANT_OPTION_LIST_ID}>
          {tenantOptions.map(option => (
            <option
              key={option.slug}
              value={option.slug}
              label={option.name ?? option.slug}
            />
          ))}
        </datalist>
      )}

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
            <DialogTitle>
              {modalMode === "create" ? "Create New User" : `Edit ${editForm.email}`}
            </DialogTitle>
            <DialogDescription>
              {modalMode === "create"
                ? "Provision a new user and assign roles across tenants."
                : "Update the selected user's role assignments."}
            </DialogDescription>
          </DialogHeader>

          {modalMode === "create" ? (
            <form className="space-y-4" onSubmit={handleCreate}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  label="Email"
                  htmlFor="modal-create-email"
                  required
                  error={emailFieldError}
                >
                  <Input
                    id="modal-create-email"
                    type="email"
                    value={createForm.email}
                    onChange={event => setCreateForm(current => ({ ...current, email: event.target.value }))}
                    required
                  />
                </FormField>
                <FormField
                  label="Name"
                  htmlFor="modal-create-name"
                  hint="Optional"
                >
                  <Input
                    id="modal-create-name"
                    type="text"
                    value={createForm.name}
                    onChange={event => setCreateForm(current => ({ ...current, name: event.target.value }))}
                    placeholder="Optional"
                  />
                </FormField>
                <FormField
                  label="Password"
                  htmlFor="modal-create-password"
                  hint="At least 8 characters"
                  required
                  error={passwordFieldError}
                >
                  <Input
                    id="modal-create-password"
                    type="password"
                    value={createForm.password}
                    onChange={event => setCreateForm(current => ({ ...current, password: event.target.value }))}
                    placeholder="Temporary password"
                  />
                </FormField>
                <FormField
                  label="Global Role"
                  htmlFor="modal-create-global-role"
                  className="md:col-span-2"
                  hint="Select Super Admin for full access across all tenants"
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
                    <SelectTrigger id="modal-create-global-role" className="w-full">
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
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-medium">Tenant Roles</h4>
                    <Button type="button" variant="outline" size="sm" onClick={addCreateAssignment}>
                      <Plus className="mr-2 h-4 w-4" />
                      Add Tenant Role
                    </Button>
                  </div>
                  {createForm.assignments.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No tenant roles assigned.</p>
                  ) : (
                    renderAssignments(createForm.assignments, updateCreateAssignment, removeCreateAssignment)
                  )}
                  {tenantsQuery.isError && (
                    <p className="text-xs text-error" role="alert">
                      Unable to load tenant options.
                    </p>
                  )}
                </div>
              )}

              {generalCreateError && (
                <p className="text-sm text-error" role="alert">
                  {generalCreateError}
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
                <FormField label="Email" htmlFor="modal-edit-email" hint="Email cannot be changed">
                  <Input id="modal-edit-email" type="email" value={editForm.email} disabled />
                </FormField>
                <FormField
                  label="Name"
                  htmlFor="modal-edit-name"
                  hint="Display name shown in the interface"
                >
                  <Input id="modal-edit-name" type="text" value={editForm.name} disabled />
                </FormField>
              </div>

              <FormField
                label="Global Role"
                htmlFor="modal-edit-global-role"
                hint="Super Admin overrides all tenant-specific permissions"
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
                  <SelectTrigger id="modal-edit-global-role" className="w-full">
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
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-medium">Tenant Roles</h4>
                    <Button type="button" variant="outline" size="sm" onClick={addEditAssignment}>
                      <Plus className="mr-2 h-4 w-4" />
                      Add Tenant Role
                    </Button>
                  </div>
                  {editForm.assignments.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No tenant roles assigned.</p>
                  ) : (
                    renderAssignments(editForm.assignments, updateEditAssignment, removeEditAssignment)
                  )}
                  {tenantsQuery.isError && (
                    <p className="text-xs text-error" role="alert">
                      Unable to load tenant options.
                    </p>
                  )}
                </div>
              )}

              {editError && (
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
