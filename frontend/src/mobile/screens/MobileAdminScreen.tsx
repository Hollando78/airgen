import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, ShieldAlert } from "lucide-react";
import { useApiClient } from "../../lib/client";
import { useAuth } from "../../contexts/AuthContext";

export function MobileAdminScreen(): JSX.Element {
  const api = useApiClient();
  const { user } = useAuth();

  if (!user?.roles?.includes("admin")) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-amber-800 shadow-sm">
        <p className="text-sm font-semibold">Admin access required</p>
        <p className="mt-1 text-sm">
          Mobile user lookup is limited to administrators. Switch to the desktop app for full admin
          tools or contact an administrator if you need access.
        </p>
      </div>
    );
  }

  const usersQuery = useQuery({
    queryKey: ["mobile-admin-users"],
    queryFn: api.listDevUsers,
    staleTime: 60_000
  });

  const users = useMemo(() => usersQuery.data?.users ?? [], [usersQuery.data]);

  if (usersQuery.isLoading) {
    return (
      <div className="flex h-40 flex-col items-center justify-center gap-2 text-neutral-500">
        <Loader2 className="h-6 w-6 animate-spin" />
        <p className="text-sm">Loading users…</p>
      </div>
    );
  }

  if (usersQuery.isError) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-red-700 shadow-sm">
        <p className="text-sm font-semibold">Failed to load user list.</p>
        <p className="mt-1 text-sm">
          {(usersQuery.error as Error)?.message ?? "Please retry from a desktop session."}
        </p>
      </div>
    );
  }

  if (users.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-neutral-300 bg-white p-6 text-center shadow-sm">
        <h3 className="text-base font-semibold text-neutral-900">No users found</h3>
        <p className="mt-2 text-sm text-neutral-600">
          User management tasks can still be performed from the desktop admin console.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-800 shadow-sm">
        <div className="flex items-start gap-2">
          <ShieldAlert className="h-5 w-5 flex-none" />
          <div>
            <h2 className="text-base font-semibold">Mobile Admin Preview</h2>
            <p className="mt-1 text-sm">
              Perform lightweight user lookups on the go. For password resets and role updates,
              continue using the desktop admin experience.
            </p>
          </div>
        </div>
      </section>

      <ul className="space-y-3">
        {users.map(user => (
          <li key={user.id}>
            <article className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
              <h3 className="text-base font-semibold text-neutral-900">{user.name ?? user.email}</h3>
              <p className="text-sm text-neutral-600">{user.email}</p>
              <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-xs text-neutral-500">
                <div>
                  <dt className="font-medium text-neutral-600">Roles</dt>
                  <dd>{user.roles?.join(", ") || "—"}</dd>
                </div>
                <div>
                  <dt className="font-medium text-neutral-600">Tenants</dt>
                  <dd>{(user.tenantSlugs ?? []).join(", ") || "—"}</dd>
                </div>
                <div>
                  <dt className="font-medium text-neutral-600">MFA</dt>
                  <dd>{user.mfaEnabled ? "Enabled" : "Disabled"}</dd>
                </div>
              </dl>
            </article>
          </li>
        ))}
      </ul>
    </div>
  );
}
