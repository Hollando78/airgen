import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "../lib/client";
import { Spinner } from "../components/Spinner";
import { ErrorState } from "../components/ErrorState";
import { useTenantProject } from "../hooks/useTenantProject";
import { useAuth } from "../contexts/AuthContext";

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
  const { user } = useAuth();
  const queryClient = useQueryClient();
  
  // Admin management state
  const [showCreateTenant, setShowCreateTenant] = useState(false);
  const [showCreateProject, setShowCreateProject] = useState(false);
  const [selectedTenantForProject, setSelectedTenantForProject] = useState<string | null>(null);
  const [newTenantData, setNewTenantData] = useState({ slug: "", name: "" });
  const [newProjectData, setNewProjectData] = useState({ slug: "", key: "" });
  
  const isAdmin = user?.roles.includes('admin');

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

  // Admin mutations
  const createTenantMutation = useMutation({
    mutationFn: api.createTenant,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tenants"] });
      setShowCreateTenant(false);
      setNewTenantData({ slug: "", name: "" });
    }
  });

  const deleteTenantMutation = useMutation({
    mutationFn: api.deleteTenant,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tenants"] });
    }
  });

  const createProjectMutation = useMutation({
    mutationFn: ({ tenant, data }: { tenant: string; data: { slug: string; key?: string } }) => 
      api.createProject(tenant, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["projects", variables.tenant] });
      setShowCreateProject(false);
      setSelectedTenantForProject(null);
      setNewProjectData({ slug: "", key: "" });
    }
  });

  const deleteProjectMutation = useMutation({
    mutationFn: ({ tenant, project }: { tenant: string; project: string }) => 
      api.deleteProject(tenant, project),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["projects", variables.tenant] });
    }
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
          {isAdmin && (
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button 
                type="button" 
                className="primary-button"
                onClick={() => setShowCreateTenant(true)}
              >
                + Create Tenant
              </button>
            </div>
          )}
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
                {isAdmin && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {(tenantsQuery.data?.tenants ?? []).length === 0 ? (
                <tr>
                  <td colSpan={isAdmin ? 5 : 4} className="empty-row">
                    No tenants found yet.
                  </td>
                </tr>
              ) : (
                tenantsQuery.data!.tenants.map(tenant => (
                  <tr key={tenant.slug} className={tenant.slug === state.tenant ? "row-active" : undefined}>
                    <td>{tenant.slug}</td>
                    <td>{tenant.name ?? "—"}</td>
                    <td>
                      {tenant.projectCount}
                      {isAdmin && (
                        <button
                          type="button"
                          className="ghost-button"
                          style={{ marginLeft: '0.5rem', fontSize: '0.8rem' }}
                          onClick={() => {
                            setSelectedTenantForProject(tenant.slug);
                            setShowCreateProject(true);
                          }}
                        >
                          + Add Project
                        </button>
                      )}
                    </td>
                    <td>{formatDate(tenant.createdAt)}</td>
                    {isAdmin && (
                      <td>
                        <button
                          type="button"
                          className="danger-button"
                          style={{ fontSize: '0.8rem' }}
                          onClick={() => {
                            if (confirm(`Delete tenant "${tenant.slug}" and all its projects? This cannot be undone.`)) {
                              deleteTenantMutation.mutate(tenant.slug);
                            }
                          }}
                          disabled={deleteTenantMutation.isPending}
                        >
                          Delete
                        </button>
                      </td>
                    )}
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

      {/* Admin Management Modals */}
      {isAdmin && showCreateTenant && (
        <div className="modal-overlay" onClick={() => setShowCreateTenant(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Create New Tenant</h2>
              <button 
                type="button" 
                className="modal-close"
                onClick={() => setShowCreateTenant(false)}
              >
                ×
              </button>
            </div>
            <div className="modal-body">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                  <label htmlFor="tenant-slug">Tenant Slug (required)</label>
                  <input
                    id="tenant-slug"
                    type="text"
                    value={newTenantData.slug}
                    onChange={(e) => setNewTenantData({ ...newTenantData, slug: e.target.value })}
                    placeholder="e.g., acme-corp"
                  />
                </div>
                <div>
                  <label htmlFor="tenant-name">Display Name (optional)</label>
                  <input
                    id="tenant-name"
                    type="text"
                    value={newTenantData.name}
                    onChange={(e) => setNewTenantData({ ...newTenantData, name: e.target.value })}
                    placeholder="e.g., ACME Corporation"
                  />
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button 
                type="button" 
                className="ghost-button"
                onClick={() => setShowCreateTenant(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={() => createTenantMutation.mutate(newTenantData)}
                disabled={!newTenantData.slug || createTenantMutation.isPending}
              >
                {createTenantMutation.isPending ? 'Creating...' : 'Create Tenant'}
              </button>
            </div>
          </div>
        </div>
      )}

      {isAdmin && showCreateProject && selectedTenantForProject && (
        <div className="modal-overlay" onClick={() => setShowCreateProject(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Create New Project</h2>
              <button 
                type="button" 
                className="modal-close"
                onClick={() => setShowCreateProject(false)}
              >
                ×
              </button>
            </div>
            <div className="modal-body">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                  <label>Tenant: <strong>{selectedTenantForProject}</strong></label>
                </div>
                <div>
                  <label htmlFor="project-slug">Project Slug (required)</label>
                  <input
                    id="project-slug"
                    type="text"
                    value={newProjectData.slug}
                    onChange={(e) => setNewProjectData({ ...newProjectData, slug: e.target.value })}
                    placeholder="e.g., mobile-app"
                  />
                </div>
                <div>
                  <label htmlFor="project-key">Project Key (optional)</label>
                  <input
                    id="project-key"
                    type="text"
                    value={newProjectData.key}
                    onChange={(e) => setNewProjectData({ ...newProjectData, key: e.target.value })}
                    placeholder="e.g., MOBILE"
                  />
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button 
                type="button" 
                className="ghost-button"
                onClick={() => setShowCreateProject(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={() => createProjectMutation.mutate({ 
                  tenant: selectedTenantForProject, 
                  data: newProjectData 
                })}
                disabled={!newProjectData.slug || createProjectMutation.isPending}
              >
                {createProjectMutation.isPending ? 'Creating...' : 'Create Project'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
