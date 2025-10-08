import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "../lib/client";
import { Spinner } from "../components/Spinner";
import { ErrorState } from "../components/ErrorState";
import { useTenantProject } from "../hooks/useTenantProject";
import { useAuth } from "../contexts/AuthContext";

function formatDate(value: string | null | undefined): string {
  if (!value) {return "—";}
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
  const requirementsQuery = useQuery({
    queryKey: ["requirements", state.tenant, state.project, "all"],
    queryFn: async () => {
      const response = await fetch(`/api/requirements/${state.tenant}/${state.project}?limit=100`);
      if (!response.ok) throw new Error('Failed to fetch requirements');
      return response.json();
    },
    enabled: Boolean(state.tenant && state.project)
  });
  const documentsQuery = useQuery({
    queryKey: ["documents", state.tenant, state.project],
    queryFn: () => api.listDocuments(state.tenant ?? "", state.project ?? ""),
    enabled: Boolean(state.tenant && state.project)
  });
  const traceLinksQuery = useQuery({
    queryKey: ["traceLinks", state.tenant, state.project],
    queryFn: () => api.listTraceLinks(state.tenant ?? "", state.project ?? ""),
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
    if (!state.project || !projectsQuery.data) {return null;}
    return projectsQuery.data.projects.find(project => project.slug === state.project) ?? null;
  }, [state.project, projectsQuery.data]);

  // Calculate comprehensive metrics
  const metrics = useMemo(() => {
    const requirements = requirementsQuery.data?.data ?? [];
    const totalRequirements = requirementsQuery.data?.meta?.totalItems ?? requirements.length;
    const traceLinks = traceLinksQuery.data?.traceLinks ?? [];
    const documents = documentsQuery.data?.documents ?? [];

    // Helper function to categorize requirements by type based on ref pattern
    const getObjectType = (ref: string): 'requirement' | 'info' | 'surrogate' => {
      if (ref.includes('KEY')) return 'info';
      if (ref.includes('SYSTEMREQUIREMENTSDOCUMENT')) return 'surrogate';
      return 'requirement';
    };

    // Object type distribution
    const objectTypeCounts = {
      requirement: requirements.filter(r => getObjectType(r.ref) === 'requirement').length,
      info: requirements.filter(r => getObjectType(r.ref) === 'info').length,
      surrogate: requirements.filter(r => getObjectType(r.ref) === 'surrogate').length
    };

    // Filter to only actual requirements (exclude info and surrogate) for detailed metrics
    const actualRequirements = requirements.filter(r => getObjectType(r.ref) === 'requirement');

    // Pattern distribution (only for actual requirements)
    const patternCounts = {
      ubiquitous: actualRequirements.filter(r => r.pattern === "ubiquitous").length,
      event: actualRequirements.filter(r => r.pattern === "event").length,
      state: actualRequirements.filter(r => r.pattern === "state").length,
      unwanted: actualRequirements.filter(r => r.pattern === "unwanted").length,
      optional: actualRequirements.filter(r => r.pattern === "optional").length,
      unspecified: actualRequirements.filter(r => !r.pattern).length
    };

    // Verification distribution (only for actual requirements)
    const verificationCounts = {
      Test: actualRequirements.filter(r => r.verification === "Test").length,
      Analysis: actualRequirements.filter(r => r.verification === "Analysis").length,
      Inspection: actualRequirements.filter(r => r.verification === "Inspection").length,
      Demonstration: actualRequirements.filter(r => r.verification === "Demonstration").length,
      unspecified: actualRequirements.filter(r => !r.verification).length
    };

    // Compliance distribution (only for actual requirements)
    const complianceCounts = {
      "N/A": actualRequirements.filter(r => r.complianceStatus === "N/A").length,
      Compliant: actualRequirements.filter(r => r.complianceStatus === "Compliant").length,
      "Compliance Risk": actualRequirements.filter(r => r.complianceStatus === "Compliance Risk").length,
      "Non-Compliant": actualRequirements.filter(r => r.complianceStatus === "Non-Compliant").length,
      unspecified: actualRequirements.filter(r => !r.complianceStatus).length
    };

    // QA Score statistics (only for actual requirements)
    const requirementsWithQA = actualRequirements.filter(r => r.qaScore !== undefined && r.qaScore !== null);
    const avgQaScore = requirementsWithQA.length > 0
      ? Math.round(requirementsWithQA.reduce((sum, r) => sum + (r.qaScore ?? 0), 0) / requirementsWithQA.length)
      : 0;
    const qaDistribution = {
      excellent: actualRequirements.filter(r => (r.qaScore ?? 0) >= 80).length,
      good: actualRequirements.filter(r => (r.qaScore ?? 0) >= 60 && (r.qaScore ?? 0) < 80).length,
      needsWork: actualRequirements.filter(r => (r.qaScore ?? 0) > 0 && (r.qaScore ?? 0) < 60).length,
      unscored: actualRequirements.filter(r => !r.qaScore).length
    };

    // Traceability (only for actual requirements)
    const uniqueRequirementIds = new Set(traceLinks.map(link => link.sourceId));
    const tracedRequirements = actualRequirements.filter(r => uniqueRequirementIds.has(r.id)).length;
    const untracedRequirements = objectTypeCounts.requirement - tracedRequirements;

    // Archive status (only for actual requirements)
    const archivedCount = actualRequirements.filter(r => r.archived).length;
    const activeCount = objectTypeCounts.requirement - archivedCount;

    return {
      totalRequirements,
      totalDocuments: documents.length,
      totalTraceLinks: traceLinks.length,
      objectTypeCounts,
      patternCounts,
      verificationCounts,
      complianceCounts,
      avgQaScore,
      qaDistribution,
      tracedRequirements,
      untracedRequirements,
      archivedCount,
      activeCount
    };
  }, [requirementsQuery.data, traceLinksQuery.data, documentsQuery.data]);

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
            <h2>Active Project Metrics</h2>
            <p>Comprehensive metrics and health indicators for the current project.</p>
          </div>
        </div>
        {!state.tenant || !state.project ? (
          <p>Select a tenant and project to view project metrics.</p>
        ) : projectsQuery.isLoading || requirementsQuery.isLoading || documentsQuery.isLoading || traceLinksQuery.isLoading ? (
          <Spinner />
        ) : projectsQuery.isError ? (
          <ErrorState message={(projectsQuery.error as Error).message} />
        ) : activeProject ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            {/* Project Overview */}
            <div>
              <h3 style={{ marginBottom: '1rem', fontSize: '1.1rem', fontWeight: '600' }}>Project Overview</h3>
              <div className="grid grid-cols-4">
                <div className="stat-card">
                  <span className="stat-label">Tenant</span>
                  <span className="stat-value">{state.tenant}</span>
                </div>
                <div className="stat-card">
                  <span className="stat-label">Project</span>
                  <span className="stat-value">{activeProject.slug}</span>
                </div>
                <div className="stat-card">
                  <span className="stat-label">Total Objects</span>
                  <span className="stat-value">{metrics.totalRequirements}</span>
                </div>
                <div className="stat-card">
                  <span className="stat-label">Documents</span>
                  <span className="stat-value">{metrics.totalDocuments}</span>
                </div>
              </div>
            </div>

            {/* Object Type Distribution */}
            <div>
              <h3 style={{ marginBottom: '1rem', fontSize: '1.1rem', fontWeight: '600' }}>Object Type Distribution</h3>
              <div className="grid grid-cols-3">
                <div className="stat-card">
                  <span className="stat-label">Requirements</span>
                  <span className="stat-value" style={{ color: '#10b981' }}>{metrics.objectTypeCounts.requirement}</span>
                </div>
                <div className="stat-card">
                  <span className="stat-label">Info Objects</span>
                  <span className="stat-value" style={{ color: '#3b82f6' }}>{metrics.objectTypeCounts.info}</span>
                </div>
                <div className="stat-card">
                  <span className="stat-label">Surrogates</span>
                  <span className="stat-value" style={{ color: '#8b5cf6' }}>{metrics.objectTypeCounts.surrogate}</span>
                </div>
              </div>
            </div>

            {/* Requirements Status */}
            <div>
              <h3 style={{ marginBottom: '1rem', fontSize: '1.1rem', fontWeight: '600' }}>Requirements Status</h3>
              <div className="grid grid-cols-4">
                <div className="stat-card">
                  <span className="stat-label">Active</span>
                  <span className="stat-value" style={{ color: '#059669' }}>{metrics.activeCount}</span>
                </div>
                <div className="stat-card">
                  <span className="stat-label">Archived</span>
                  <span className="stat-value" style={{ color: '#9ca3af' }}>{metrics.archivedCount}</span>
                </div>
                <div className="stat-card">
                  <span className="stat-label">With Pattern</span>
                  <span className="stat-value">{metrics.objectTypeCounts.requirement - metrics.patternCounts.unspecified}</span>
                </div>
                <div className="stat-card">
                  <span className="stat-label">Avg QA Score</span>
                  <span className="stat-value" style={{ color: metrics.avgQaScore >= 70 ? '#059669' : metrics.avgQaScore >= 50 ? '#f59e0b' : '#ef4444' }}>{metrics.avgQaScore}</span>
                </div>
              </div>
            </div>

            {/* Quality Distribution */}
            <div>
              <h3 style={{ marginBottom: '1rem', fontSize: '1.1rem', fontWeight: '600' }}>Quality Distribution</h3>
              <div className="grid grid-cols-4">
                <div className="stat-card">
                  <span className="stat-label">Excellent (≥80)</span>
                  <span className="stat-value" style={{ color: '#059669' }}>{metrics.qaDistribution.excellent}</span>
                  <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
                    {metrics.totalRequirements > 0 ? Math.round((metrics.qaDistribution.excellent / metrics.totalRequirements) * 100) : 0}%
                  </div>
                </div>
                <div className="stat-card">
                  <span className="stat-label">Good (60-79)</span>
                  <span className="stat-value" style={{ color: '#3b82f6' }}>{metrics.qaDistribution.good}</span>
                  <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
                    {metrics.totalRequirements > 0 ? Math.round((metrics.qaDistribution.good / metrics.totalRequirements) * 100) : 0}%
                  </div>
                </div>
                <div className="stat-card">
                  <span className="stat-label">Needs Work (&lt;60)</span>
                  <span className="stat-value" style={{ color: '#f59e0b' }}>{metrics.qaDistribution.needsWork}</span>
                  <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
                    {metrics.totalRequirements > 0 ? Math.round((metrics.qaDistribution.needsWork / metrics.totalRequirements) * 100) : 0}%
                  </div>
                </div>
                <div className="stat-card">
                  <span className="stat-label">Unscored</span>
                  <span className="stat-value" style={{ color: '#9ca3af' }}>{metrics.qaDistribution.unscored}</span>
                  <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
                    {metrics.totalRequirements > 0 ? Math.round((metrics.qaDistribution.unscored / metrics.totalRequirements) * 100) : 0}%
                  </div>
                </div>
              </div>
            </div>

            {/* Pattern Distribution */}
            <div>
              <h3 style={{ marginBottom: '1rem', fontSize: '1.1rem', fontWeight: '600' }}>Pattern Distribution</h3>
              <div className="grid grid-cols-3">
                <div className="stat-card">
                  <span className="stat-label">Ubiquitous</span>
                  <span className="stat-value">{metrics.patternCounts.ubiquitous}</span>
                </div>
                <div className="stat-card">
                  <span className="stat-label">Event</span>
                  <span className="stat-value">{metrics.patternCounts.event}</span>
                </div>
                <div className="stat-card">
                  <span className="stat-label">State</span>
                  <span className="stat-value">{metrics.patternCounts.state}</span>
                </div>
                <div className="stat-card">
                  <span className="stat-label">Unwanted</span>
                  <span className="stat-value">{metrics.patternCounts.unwanted}</span>
                </div>
                <div className="stat-card">
                  <span className="stat-label">Optional</span>
                  <span className="stat-value">{metrics.patternCounts.optional}</span>
                </div>
                <div className="stat-card">
                  <span className="stat-label">Unspecified</span>
                  <span className="stat-value" style={{ color: '#9ca3af' }}>{metrics.patternCounts.unspecified}</span>
                </div>
              </div>
            </div>

            {/* Verification Distribution */}
            <div>
              <h3 style={{ marginBottom: '1rem', fontSize: '1.1rem', fontWeight: '600' }}>Verification Methods</h3>
              <div className="grid grid-cols-3">
                <div className="stat-card">
                  <span className="stat-label">Test</span>
                  <span className="stat-value">{metrics.verificationCounts.Test}</span>
                </div>
                <div className="stat-card">
                  <span className="stat-label">Analysis</span>
                  <span className="stat-value">{metrics.verificationCounts.Analysis}</span>
                </div>
                <div className="stat-card">
                  <span className="stat-label">Inspection</span>
                  <span className="stat-value">{metrics.verificationCounts.Inspection}</span>
                </div>
                <div className="stat-card">
                  <span className="stat-label">Demonstration</span>
                  <span className="stat-value">{metrics.verificationCounts.Demonstration}</span>
                </div>
                <div className="stat-card">
                  <span className="stat-label">Unspecified</span>
                  <span className="stat-value" style={{ color: '#9ca3af' }}>{metrics.verificationCounts.unspecified}</span>
                </div>
              </div>
            </div>

            {/* Compliance Status */}
            <div>
              <h3 style={{ marginBottom: '1rem', fontSize: '1.1rem', fontWeight: '600' }}>Compliance Status</h3>
              <div className="grid grid-cols-3">
                <div className="stat-card">
                  <span className="stat-label">Compliant</span>
                  <span className="stat-value" style={{ color: '#059669' }}>{metrics.complianceCounts.Compliant}</span>
                </div>
                <div className="stat-card">
                  <span className="stat-label">Compliance Risk</span>
                  <span className="stat-value" style={{ color: '#f59e0b' }}>{metrics.complianceCounts["Compliance Risk"]}</span>
                </div>
                <div className="stat-card">
                  <span className="stat-label">Non-Compliant</span>
                  <span className="stat-value" style={{ color: '#ef4444' }}>{metrics.complianceCounts["Non-Compliant"]}</span>
                </div>
                <div className="stat-card">
                  <span className="stat-label">N/A</span>
                  <span className="stat-value" style={{ color: '#6b7280' }}>{metrics.complianceCounts["N/A"]}</span>
                </div>
                <div className="stat-card">
                  <span className="stat-label">Unspecified</span>
                  <span className="stat-value" style={{ color: '#9ca3af' }}>{metrics.complianceCounts.unspecified}</span>
                </div>
              </div>
            </div>

            {/* Traceability */}
            <div>
              <h3 style={{ marginBottom: '1rem', fontSize: '1.1rem', fontWeight: '600' }}>Traceability</h3>
              <div className="grid grid-cols-3">
                <div className="stat-card">
                  <span className="stat-label">Total Trace Links</span>
                  <span className="stat-value">{metrics.totalTraceLinks}</span>
                </div>
                <div className="stat-card">
                  <span className="stat-label">Traced Requirements</span>
                  <span className="stat-value" style={{ color: '#059669' }}>{metrics.tracedRequirements}</span>
                  <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
                    {metrics.totalRequirements > 0 ? Math.round((metrics.tracedRequirements / metrics.totalRequirements) * 100) : 0}%
                  </div>
                </div>
                <div className="stat-card">
                  <span className="stat-label">Untraced</span>
                  <span className="stat-value" style={{ color: '#ef4444' }}>{metrics.untracedRequirements}</span>
                  <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
                    {metrics.totalRequirements > 0 ? Math.round((metrics.untracedRequirements / metrics.totalRequirements) * 100) : 0}%
                  </div>
                </div>
              </div>
            </div>

            {/* Baselines */}
            {baselinesQuery.data && (
              <div>
                <h3 style={{ marginBottom: '1rem', fontSize: '1.1rem', fontWeight: '600' }}>Baselines</h3>
                <div className="grid grid-cols-3">
                  <div className="stat-card">
                    <span className="stat-label">Total Baselines</span>
                    <span className="stat-value">{baselinesQuery.data.items.length}</span>
                  </div>
                  {baselinesQuery.data.items[0] && (
                    <>
                      <div className="stat-card">
                        <span className="stat-label">Latest Baseline</span>
                        <span className="stat-value" style={{ fontSize: '0.9rem' }}>{baselinesQuery.data.items[0].ref}</span>
                        <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
                          {formatDate(baselinesQuery.data.items[0].createdAt)}
                        </div>
                      </div>
                      <div className="stat-card">
                        <span className="stat-label">Requirements Captured</span>
                        <span className="stat-value">{baselinesQuery.data.items[0].requirementRefs.length}</span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        ) : (
          <p>No project information available.</p>
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
