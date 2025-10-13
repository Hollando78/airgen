import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTenantProject } from "../hooks/useTenantProject";
import { useApiClient } from "../lib/client";
import { useAuth } from "../contexts/AuthContext";

type TenantProjectSelectorProps = {
  compact?: boolean;
};

export function TenantProjectSelector({ compact = false }: TenantProjectSelectorProps): JSX.Element {
  const { user } = useAuth();
  const api = useApiClient();
  const { state, setTenant, setProject, reset } = useTenantProject();
  const isAuthenticated = Boolean(user);

  const tenantsQuery = useQuery({
    queryKey: ["tenants"],
    queryFn: api.listTenants,
    enabled: isAuthenticated
  });

  const projectsQuery = useQuery({
    queryKey: ["projects", state.tenant],
    queryFn: () => api.listProjects(state.tenant ?? ""),
    enabled: Boolean(state.tenant && isAuthenticated)
  });

  useEffect(() => {
    if (!state.tenant) {
      if (state.project) {
        setProject(null);
      }
      return;
    }
    if (!projectsQuery.data || !projectsQuery.data.projects.length) {return;}
    if (!state.project) {
      setProject(projectsQuery.data.projects[0]?.slug ?? null);
    }
  }, [state.tenant, state.project, projectsQuery.data, setProject]);

  if (!isAuthenticated) {
    return (
      <div className={compact ? "rounded-xl bg-white p-4 text-sm text-neutral-600 shadow-sm" : "panel"}>
        Sign in to select a tenant and project.
      </div>
    );
  }

  const containerClass = compact ? "flex flex-col gap-3" : "selector";
  const fieldClass = compact
    ? "flex flex-col gap-2 rounded-xl border border-neutral-200 bg-white px-3 py-2"
    : "selector-field";
  const buttonClass = compact
    ? "w-full rounded-lg border border-neutral-200 py-2 text-sm font-medium text-neutral-600"
    : "ghost-button";

  return (
    <div className={containerClass}>
      <div className={fieldClass}>
        <label htmlFor="tenant-select" className={compact ? "text-sm font-medium text-neutral-700" : undefined}>
          Tenant
        </label>
        <select
          id="tenant-select"
          value={state.tenant ?? ""}
          onChange={event => setTenant(event.target.value || null)}
          className={compact ? "rounded-lg border border-neutral-300 px-3 py-2 text-sm" : undefined}
        >
          <option value="">Select tenant...</option>
          {(tenantsQuery.data?.tenants ?? []).map(tenant => (
            <option key={tenant.slug} value={tenant.slug}>
              {tenant.name ? `${tenant.name} (${tenant.slug})` : tenant.slug}
            </option>
          ))}
        </select>
      </div>
      <div className={fieldClass}>
        <label htmlFor="project-select" className={compact ? "text-sm font-medium text-neutral-700" : undefined}>
          Project
        </label>
        <select
          id="project-select"
          value={state.project ?? ""}
          onChange={event => setProject(event.target.value || null)}
          disabled={!state.tenant}
          className={compact ? "rounded-lg border border-neutral-300 px-3 py-2 text-sm" : undefined}
        >
          <option value="">Select project...</option>
          {(projectsQuery.data?.projects ?? []).map(project => (
            <option key={project.slug} value={project.slug}>
              {project.key ? `${project.key} (${project.slug})` : project.slug}
            </option>
          ))}
        </select>
      </div>
      <div className={compact ? "flex" : "selector-field selector-field--compact"}>
        <button type="button" onClick={reset} className={buttonClass}>
          Clear
        </button>
      </div>
      {tenantsQuery.isError && (
        <span className="hint text-xs text-red-600">Failed to load tenants.</span>
      )}
      {projectsQuery.isError && (
        <span className="hint text-xs text-red-600">Failed to load projects.</span>
      )}
    </div>
  );
}
