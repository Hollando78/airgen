import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTenantProject } from "../hooks/useTenantProject";
import { useApiClient } from "../lib/client";

export function TenantProjectSelector(): JSX.Element {
  const api = useApiClient();
  const { state, setTenant, setProject, reset } = useTenantProject();

  const tenantsQuery = useQuery({
    queryKey: ["tenants"],
    queryFn: api.listTenants
  });

  const projectsQuery = useQuery({
    queryKey: ["projects", state.tenant],
    queryFn: () => api.listProjects(state.tenant ?? ""),
    enabled: Boolean(state.tenant)
  });

  useEffect(() => {
    if (!state.tenant) {
      if (state.project) {
        setProject(null);
      }
      return;
    }
    if (!projectsQuery.data || !projectsQuery.data.projects.length) return;
    if (!state.project) {
      setProject(projectsQuery.data.projects[0]?.slug ?? null);
    }
  }, [state.tenant, state.project, projectsQuery.data, setProject]);

  return (
    <div className="selector">
      <div className="selector-field">
        <label htmlFor="tenant-input">Tenant</label>
        <input
          id="tenant-input"
          list="tenant-options"
          value={state.tenant ?? ""}
          onChange={event => setTenant(event.target.value.trim() || null)}
          placeholder="tenant slug"
        />
        <datalist id="tenant-options">
          {(tenantsQuery.data?.tenants ?? []).map(tenant => (
            <option key={tenant.slug} value={tenant.slug}>
              {tenant.name ? `${tenant.name} (${tenant.slug})` : tenant.slug}
            </option>
          ))}
        </datalist>
      </div>
      <div className="selector-field">
        <label htmlFor="project-input">Project</label>
        <input
          id="project-input"
          list="project-options"
          value={state.project ?? ""}
          onChange={event => setProject(event.target.value.trim() || null)}
          placeholder="project key"
          disabled={!state.tenant}
        />
        <datalist id="project-options">
          {(projectsQuery.data?.projects ?? []).map(project => (
            <option key={project.slug} value={project.slug}>
              {project.key ? `${project.key} (${project.slug})` : project.slug}
            </option>
          ))}
        </datalist>
      </div>
      <div className="selector-field selector-field--compact">
        <button type="button" onClick={reset} className="ghost-button">
          Clear
        </button>
      </div>
      {tenantsQuery.isError && <span className="hint">Failed to load tenants.</span>}
      {projectsQuery.isError && <span className="hint">Failed to load projects.</span>}
    </div>
  );
}
