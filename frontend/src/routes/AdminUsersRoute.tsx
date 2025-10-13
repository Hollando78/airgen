import type { FormEvent} from "react";
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
import { RefreshCw, Users } from "lucide-react";
import type { DevUser } from "../types";

type UserFormState = {
  email: string;
  name: string;
  password: string;
  roles: string;
  tenantSlugs: string;
};

const EMPTY_FORM: UserFormState = {
  email: "",
  name: "",
  password: "",
  roles: "user",
  tenantSlugs: ""
};

function splitList(value: string): string[] {
  return value
    .split(",")
    .map(item => item.trim())
    .filter(Boolean);
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

  const [createForm, setCreateForm] = useState<UserFormState>(EMPTY_FORM);
  const [createError, setCreateError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<UserFormState>(EMPTY_FORM);
  const [editError, setEditError] = useState<string | null>(null);

  const usersQuery = useQuery({
    queryKey: ["dev-users"],
    queryFn: () => api.listDevUsers()
  });

  const createMutation = useMutation({
    mutationFn: (payload: { email: string; name?: string; password?: string; roles?: string[]; tenantSlugs?: string[] }) =>
      api.createDevUser(payload),
    onSuccess: () => {
      setCreateForm(EMPTY_FORM);
      setCreateError(null);
      void queryClient.invalidateQueries({ queryKey: ["dev-users"] });
    },
    onError: (error: unknown) => {
      setCreateError(error instanceof Error ? error.message : "Failed to create user");
    }
  });

  const updateMutation = useMutation({
    mutationFn: (payload: { id: string; data: { email?: string; name?: string | null; password?: string; roles?: string[]; tenantSlugs?: string[] } }) =>
      api.updateDevUser(payload.id, payload.data),
    onSuccess: () => {
      setEditingId(null);
      setEditError(null);
      void queryClient.invalidateQueries({ queryKey: ["dev-users"] });
    },
    onError: (error: unknown) => {
      setEditError(error instanceof Error ? error.message : "Failed to update user");
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteDevUser(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["dev-users"] });
    }
  });

  const users = useMemo<DevUser[]>(() => usersQuery.data?.users ?? [], [usersQuery.data]);

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setCreateError(null);
    const email = createForm.email.trim();
    if (!email) {
      setCreateError("Email is required");
      return;
    }
    await createMutation.mutateAsync({
      email,
      name: createForm.name.trim() || undefined,
      password: createForm.password.trim() || undefined,
      roles: splitList(createForm.roles),
      tenantSlugs: splitList(createForm.tenantSlugs)
    });
  };

  const beginEdit = (user: DevUser) => {
    setEditingId(user.id);
    setEditForm({
      email: user.email,
      name: user.name ?? "",
      password: "",
      roles: user.roles.join(", "),
      tenantSlugs: user.tenantSlugs.join(", ")
    });
    setEditError(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditError(null);
  };

  const handleUpdate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingId) {return;}
    setEditError(null);
    const email = editForm.email.trim();
    if (!email) {
      setEditError("Email is required");
      return;
    }
    const updateData: any = {
      email,
      name: editForm.name.trim() || null,
      roles: splitList(editForm.roles),
      tenantSlugs: splitList(editForm.tenantSlugs)
    };
    if (editForm.password.trim()) {
      updateData.password = editForm.password.trim();
    }
    await updateMutation.mutateAsync({
      id: editingId,
      data: updateData
    });
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Delete this user?")) {return;}
    await deleteMutation.mutateAsync(id);
  };

  return (
    <PageLayout
      title="Admin Users"
      description="Manage admin user accounts and their workspace access."
    >
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Create User</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={handleCreate}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  label="Email"
                  htmlFor="create-email"
                  required
                  error={createError || undefined}
                >
                  <Input
                    id="create-email"
                    type="email"
                    value={createForm.email}
                    onChange={event => setCreateForm(current => ({ ...current, email: event.target.value }))}
                    required
                  />
                </FormField>
                <FormField
                  label="Name"
                  htmlFor="create-name"
                  hint="Optional"
                >
                  <Input
                    id="create-name"
                    type="text"
                    value={createForm.name}
                    onChange={event => setCreateForm(current => ({ ...current, name: event.target.value }))}
                    placeholder="Optional"
                  />
                </FormField>
                <FormField
                  label="Password"
                  htmlFor="create-password"
                  hint="Optional"
                >
                  <Input
                    id="create-password"
                    type="password"
                    value={createForm.password}
                    onChange={event => setCreateForm(current => ({ ...current, password: event.target.value }))}
                    placeholder="Optional"
                  />
                </FormField>
                <FormField
                  label="Roles"
                  htmlFor="create-roles"
                  hint="Comma separated"
                >
                  <Input
                    id="create-roles"
                    type="text"
                    value={createForm.roles}
                    onChange={event => setCreateForm(current => ({ ...current, roles: event.target.value }))}
                    placeholder="Comma separated"
                  />
                </FormField>
                <FormField
                  label="Tenant Slugs"
                  htmlFor="create-tenant-slugs"
                  hint="Comma separated"
                  className="md:col-span-2"
                >
                  <Input
                    id="create-tenant-slugs"
                    type="text"
                    value={createForm.tenantSlugs}
                    onChange={event => setCreateForm(current => ({ ...current, tenantSlugs: event.target.value }))}
                    placeholder="Comma separated"
                  />
                </FormField>
              </div>
              <div className="flex justify-end">
                <Button type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending ? "Creating..." : "Create User"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Existing Users</CardTitle>
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
                title="No users defined yet"
                description="Create your first user using the form above."
              />
            ) : (
              <>
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
                        <TableHead className="w-[180px]">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {users.map(user => (
                        <TableRow key={user.id}>
                          <TableCell>{editingId === user.id ? (
                            <Input
                              type="email"
                              value={editForm.email}
                              onChange={event => setEditForm(current => ({ ...current, email: event.target.value }))}
                              className="h-8"
                            />
                          ) : (
                            user.email
                          )}</TableCell>
                          <TableCell>{editingId === user.id ? (
                            <Input
                              type="text"
                              value={editForm.name}
                              onChange={event => setEditForm(current => ({ ...current, name: event.target.value }))}
                              placeholder="Optional"
                              className="h-8"
                            />
                          ) : (
                            user.name ?? "—"
                          )}</TableCell>
                          <TableCell>{editingId === user.id ? (
                            <Input
                              type="password"
                              value={editForm.password}
                              onChange={event => setEditForm(current => ({ ...current, password: event.target.value }))}
                              placeholder="Leave blank to keep current"
                              className="h-8"
                            />
                          ) : (
                            "••••••••"
                          )}</TableCell>
                          <TableCell>{editingId === user.id ? (
                            <Input
                              type="text"
                              value={editForm.roles}
                              onChange={event => setEditForm(current => ({ ...current, roles: event.target.value }))}
                              className="h-8"
                            />
                          ) : (
                            user.roles.join(", ")
                          )}</TableCell>
                          <TableCell>{editingId === user.id ? (
                            <Input
                              type="text"
                              value={editForm.tenantSlugs}
                              onChange={event => setEditForm(current => ({ ...current, tenantSlugs: event.target.value }))}
                              className="h-8"
                            />
                          ) : (
                            user.tenantSlugs.length ? user.tenantSlugs.join(", ") : "—"
                          )}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{formatDate(user.updatedAt)}</TableCell>
                          <TableCell>
                            {editingId === user.id ? (
                              <form onSubmit={handleUpdate} className="flex gap-2">
                                <Button type="submit" size="sm" disabled={updateMutation.isPending}>
                                  {updateMutation.isPending ? "Saving..." : "Save"}
                                </Button>
                                <Button type="button" variant="secondary" size="sm" onClick={cancelEdit}>
                                  Cancel
                                </Button>
                              </form>
                            ) : (
                              <div className="flex gap-2">
                                <Button type="button" variant="secondary" size="sm" onClick={() => beginEdit(user)}>
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
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
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
      </div>
    </PageLayout>
  );
}
