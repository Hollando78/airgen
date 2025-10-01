import type { FormEvent} from "react";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "../lib/client";
import { Spinner } from "../components/Spinner";
import { ErrorState } from "../components/ErrorState";
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
  const isDevMode = import.meta.env.MODE !== "production";
  const api = useApiClient();
  const queryClient = useQueryClient();

  const [createForm, setCreateForm] = useState<UserFormState>(EMPTY_FORM);
  const [createError, setCreateError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<UserFormState>(EMPTY_FORM);
  const [editError, setEditError] = useState<string | null>(null);

  const usersQuery = useQuery({
    queryKey: ["dev-users"],
    queryFn: () => api.listDevUsers(),
    enabled: isDevMode
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

  if (!isDevMode) {
    return (
      <div className="panel">
        <h1>Admin Users</h1>
        <p>This page is only available while running in development mode.</p>
      </div>
    );
  }

  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <h1>Admin Users</h1>
          <p>Manage development-only user definitions for local testing.</p>
        </div>
      </div>

      <section className="form-card">
        <h2>Create User</h2>
        <form className="form-grid" onSubmit={handleCreate}>
          <label>
            <span>Email</span>
            <input
              type="email"
              value={createForm.email}
              onChange={event => setCreateForm(current => ({ ...current, email: event.target.value }))}
              required
            />
          </label>
          <label>
            <span>Name</span>
            <input
              type="text"
              value={createForm.name}
              onChange={event => setCreateForm(current => ({ ...current, name: event.target.value }))}
              placeholder="Optional"
            />
          </label>
          <label>
            <span>Password</span>
            <input
              type="password"
              value={createForm.password}
              onChange={event => setCreateForm(current => ({ ...current, password: event.target.value }))}
              placeholder="Optional"
            />
          </label>
          <label>
            <span>Roles</span>
            <input
              type="text"
              value={createForm.roles}
              onChange={event => setCreateForm(current => ({ ...current, roles: event.target.value }))}
              placeholder="Comma separated"
            />
          </label>
          <label>
            <span>Tenant Slugs</span>
            <input
              type="text"
              value={createForm.tenantSlugs}
              onChange={event => setCreateForm(current => ({ ...current, tenantSlugs: event.target.value }))}
              placeholder="Comma separated"
            />
          </label>
          <div className="form-actions">
            <button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? "Saving..." : "Create"}
            </button>
          </div>
          {createError && <p className="form-error">{createError}</p>}
        </form>
      </section>

      <section className="table-card">
        <div className="table-header">
          <h2>Existing Users</h2>
          <button type="button" onClick={() => usersQuery.refetch()} disabled={usersQuery.isFetching}>
            Refresh
          </button>
        </div>

        {usersQuery.isLoading ? (
          <Spinner />
        ) : usersQuery.isError ? (
          <ErrorState message={(usersQuery.error as Error).message} />
        ) : users.length === 0 ? (
          <p className="hint">No users defined yet.</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Email</th>
                <th>Name</th>
                <th>Password</th>
                <th>Roles</th>
                <th>Tenants</th>
                <th>Updated</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map(user => (
                <tr key={user.id}>
                  <td>{editingId === user.id ? (
                    <input
                      type="email"
                      value={editForm.email}
                      onChange={event => setEditForm(current => ({ ...current, email: event.target.value }))}
                    />
                  ) : (
                    user.email
                  )}</td>
                  <td>{editingId === user.id ? (
                    <input
                      type="text"
                      value={editForm.name}
                      onChange={event => setEditForm(current => ({ ...current, name: event.target.value }))}
                      placeholder="Optional"
                    />
                  ) : (
                    user.name ?? "—"
                  )}</td>
                  <td>{editingId === user.id ? (
                    <input
                      type="password"
                      value={editForm.password}
                      onChange={event => setEditForm(current => ({ ...current, password: event.target.value }))}
                      placeholder="Leave blank to keep current"
                    />
                  ) : (
                    "••••••••"
                  )}</td>
                  <td>{editingId === user.id ? (
                    <input
                      type="text"
                      value={editForm.roles}
                      onChange={event => setEditForm(current => ({ ...current, roles: event.target.value }))}
                    />
                  ) : (
                    user.roles.join(", ")
                  )}</td>
                  <td>{editingId === user.id ? (
                    <input
                      type="text"
                      value={editForm.tenantSlugs}
                      onChange={event => setEditForm(current => ({ ...current, tenantSlugs: event.target.value }))}
                    />
                  ) : (
                    user.tenantSlugs.length ? user.tenantSlugs.join(", ") : "—"
                  )}</td>
                  <td>{formatDate(user.updatedAt)}</td>
                  <td>
                    {editingId === user.id ? (
                      <form onSubmit={handleUpdate} className="table-inline-actions">
                        <button type="submit" disabled={updateMutation.isPending}>
                          {updateMutation.isPending ? "Saving" : "Save"}
                        </button>
                        <button type="button" onClick={cancelEdit} className="ghost-button">
                          Cancel
                        </button>
                      </form>
                    ) : (
                      <div className="table-inline-actions">
                        <button type="button" onClick={() => beginEdit(user)}>
                          Edit
                        </button>
                        <button
                          type="button"
                          className="ghost-button"
                          onClick={() => handleDelete(user.id)}
                          disabled={deleteMutation.isPending}
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {editingId && editError && <p className="form-error">{editError}</p>}
      </section>
    </div>
  );
}
