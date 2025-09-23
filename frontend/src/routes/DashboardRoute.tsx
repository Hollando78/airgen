import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "../lib/client";
import { Spinner } from "../components/Spinner";
import { ErrorState } from "../components/ErrorState";
import { useTenantProject } from "../hooks/useTenantProject";

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short"
    }).format(new Date(value));
  } catch (error) {
    return value;
  }
}

export function DashboardRoute(): JSX.Element {
  const api = useApiClient();
  const { state } = useTenantProject();

  const healthQuery = useQuery({ queryKey: ["health"], queryFn: api.health });
  const tenantsQuery = useQuery({ queryKey: ["tenants"], queryFn: api.listTenants });
  const projectsQuery = useQuery({
    queryKey: ["projects", state.tenant],
    queryFn: () => api.listProjects(state.tenant ?? ""),
    enabled: Boolean(state.tenant)
  });
  const baselinesQuery = useQuery({
    queryKey: ["baselines", state.tenant, state.project],
    queryFn: () => api.listBaselines(state.tenant ?? "", state.project ?? ""),
    enabled: Boolean(state.tenant && state.project)
  });

  const activeProject = useMemo(() => {
    if (!state.project || !projectsQuery.data) return null;
    return projectsQuery.data.projects.find(project => project.slug === state.project) ?? null;
  }, [state.project, projectsQuery.data]);

  return (
    <div className="panel-stack">
      <section className="panel">
        <div className="panel-header">
          <div>
            <h1>System Health</h1>
            <p>Current backend status and metadata.</p>
          </div>
        </div>
        {healthQuery.isLoading ? (
          <Spinner />
        ) : healthQuery.isError ? (
          <ErrorState message={(healthQuery.error as Error).message} />
        ) : healthQuery.data ? (
          <div className="grid grid-cols-3">
            <div className="stat-card">
              <span className="stat-label">Environment</span>
              <span className="stat-value">{healthQuery.data.env}</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">Workspace</span>
              <span className="stat-value">{healthQuery.data.workspace}</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">Server Time</span>
              <span className="stat-value">{formatDate(healthQuery.data.time)}</span>
            </div>
          </div>
        ) : null}
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Tenants</h2>
            <p>Overview of tenant and project counts.</p>
          </div>
        </div>
        {tenantsQuery.isLoading ? (
          <Spinner />
        ) : tenantsQuery.isError ? (
          <ErrorState message={(tenantsQuery.error as Error).message} />
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Slug</th>
                <th>Name</th>
                <th>Projects</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {(tenantsQuery.data?.tenants ?? []).length === 0 ? (
                <tr>
                  <td colSpan={4} className="empty-row">
                    No tenants found yet.
                  </td>
                </tr>
              ) : (
                tenantsQuery.data!.tenants.map(tenant => (
                  <tr key={tenant.slug} className={tenant.slug === state.tenant ? "row-active" : undefined}>
                    <td>{tenant.slug}</td>
                    <td>{tenant.name ?? "—"}</td>
                    <td>{tenant.projectCount}</td>
                    <td>{formatDate(tenant.createdAt)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Active Project</h2>
            <p>Requirement and baseline snapshot for current selection.</p>
          </div>
        </div>
        {!state.tenant || !state.project ? (
          <p>Select a tenant and project to view project metrics.</p>
        ) : projectsQuery.isLoading ? (
          <Spinner />
        ) : projectsQuery.isError ? (
          <ErrorState message={(projectsQuery.error as Error).message} />
        ) : activeProject ? (
          <div className="grid grid-cols-3">
            <div className="stat-card">
              <span className="stat-label">Tenant</span>
              <span className="stat-value">{state.tenant}</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">Project</span>
              <span className="stat-value">{activeProject.slug}</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">Requirements</span>
              <span className="stat-value">{activeProject.requirementCount}</span>
            </div>
          </div>
        ) : (
          <p>No project information available.</p>
        )}
        {state.tenant && state.project && (
          <div className="baseline-summary">
            {baselinesQuery.isLoading ? (
              <Spinner />
            ) : baselinesQuery.isError ? (
              <ErrorState message={(baselinesQuery.error as Error).message} />
            ) : baselinesQuery.data ? (
              <>
                <div className="stat-card">
                  <span className="stat-label">Baselines</span>
                  <span className="stat-value">{baselinesQuery.data.items.length}</span>
                </div>
                {baselinesQuery.data.items[0] && (
                  <div className="baseline-detail">
                    <h3>Latest Baseline</h3>
                    <p>
                      <strong>{baselinesQuery.data.items[0].ref}</strong> · {formatDate(baselinesQuery.data.items[0].createdAt)}
                    </p>
                    <p>Requirements captured: {baselinesQuery.data.items[0].requirementRefs.length}</p>
                  </div>
                )}
              </>
            ) : null}
          </div>
        )}
      </section>
    </div>
  );
}
