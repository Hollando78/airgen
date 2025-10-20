import { Spinner } from "../Spinner";
import { ErrorState } from "../ErrorState";
import { useTenantProject } from "../../hooks/useTenantProject";
import type { UseMutationResult, UseQueryResult } from "@tanstack/react-query";
import type { TenantRecord, TenantsResponse } from "../../types";

interface TenantsTableProps {
  tenantsQuery: UseQueryResult<TenantsResponse, Error>;
  showOwnerActions: boolean;
  onCreateProject: (tenantSlug: string) => void;
  onInvite: (tenantSlug: string) => void;
  onDelete: (tenantSlug: string) => void;
  deleteTenantMutation: UseMutationResult<unknown, Error, string, unknown>;
}

function formatDate(value: string | null | undefined): string {
  if (!value) { return "—"; }
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short"
    }).format(new Date(value));
  } catch (error) {
    return value;
  }
}

/**
 * Tenants table with owner actions
 */
export function TenantsTable({
  tenantsQuery,
  showOwnerActions,
  onCreateProject,
  onInvite,
  onDelete,
  deleteTenantMutation
}: TenantsTableProps) {
  const { state } = useTenantProject();

  if (tenantsQuery.isLoading) {
    return <Spinner />;
  }

  if (tenantsQuery.isError) {
    return <ErrorState message={tenantsQuery.error.message} />;
  }

  const tenants: TenantRecord[] = tenantsQuery.data?.tenants ?? [];

  return (
    <table className="data-table">
      <thead>
        <tr>
          <th>Slug</th>
          <th>Name</th>
          <th>Projects</th>
          <th>Created</th>
          {showOwnerActions && <th>Actions</th>}
        </tr>
      </thead>
      <tbody>
        {tenants.length === 0 ? (
          <tr>
            <td colSpan={showOwnerActions ? 5 : 4} className="empty-row">
              No tenants found yet.
            </td>
          </tr>
        ) : (
          tenants.map(tenant => (
            <tr
              key={tenant.slug}
              className={tenant.slug === state.tenant ? "row-active" : undefined}
            >
              <td>{tenant.slug}</td>
              <td>{tenant.name ?? "—"}</td>
              <td>{tenant.projectCount}</td>
              <td>{formatDate(tenant.createdAt)}</td>
              {showOwnerActions && (
                <td>
                  {tenant.isOwner ? (
                    <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                      <button
                        type="button"
                        className="ghost-button"
                        style={{ fontSize: '0.8rem' }}
                        onClick={() => onCreateProject(tenant.slug)}
                      >
                        + Project
                      </button>
                      <button
                        type="button"
                        className="ghost-button"
                        style={{ fontSize: '0.8rem' }}
                        onClick={() => onInvite(tenant.slug)}
                      >
                        Invite
                      </button>
                      <button
                        type="button"
                        className="danger-button"
                        style={{ fontSize: '0.8rem' }}
                        onClick={() => onDelete(tenant.slug)}
                        disabled={deleteTenantMutation.isPending}
                      >
                        Delete
                      </button>
                    </div>
                  ) : (
                    <span className="text-neutral-500">—</span>
                  )}
                </td>
              )}
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}
