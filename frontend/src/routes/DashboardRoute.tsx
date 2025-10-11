import { useMemo, useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "../lib/client";
import { Spinner } from "../components/Spinner";
import { ErrorState } from "../components/ErrorState";
import { useTenantProject } from "../hooks/useTenantProject";
import { useAuth } from "../contexts/AuthContext";
import { PageLayout } from "../components/layout/PageLayout";
import { PageHeader } from "../components/layout/PageHeader";
import { Button } from "../components/ui/button";
import { RefreshCw } from "lucide-react";
import { TenantProjectSelector } from "../components/TenantProjectSelector";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";

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
  const graphDataQuery = useQuery({
    queryKey: ["graph-data", state.tenant, state.project],
    queryFn: () => api.getGraphData(state.tenant ?? "", state.project ?? ""),
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

  const latestBaseline = baselinesQuery.data?.items?.[0];
  const latestBaselineRequirementCount =
    latestBaseline?.requirementRefs?.length ??
    latestBaseline?.requirementVersionCount ??
    0;

  // QA Scorer worker status
  const qaScorerStatusQuery = useQuery({
    queryKey: ["qa-scorer-status"],
    queryFn: api.getQAScorerStatus,
    refetchInterval: (query) => {
      // Poll every 2 seconds while worker is running
      return query.state.data?.isRunning ? 2000 : false;
    }
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

  // QA Scorer worker mutations
  const startQAScorerMutation = useMutation({
    mutationFn: ({ tenant, project }: { tenant: string; project: string }) =>
      api.startQAScorer(tenant, project),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["qa-scorer-status"] });
      queryClient.invalidateQueries({ queryKey: ["graph-data", state.tenant, state.project] });
    }
  });

  const stopQAScorerMutation = useMutation({
    mutationFn: api.stopQAScorer,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["qa-scorer-status"] });
    }
  });

  // Track when worker completes and invalidate graph data
  useEffect(() => {
    const status = qaScorerStatusQuery.data;
    if (status && !status.isRunning && status.completedAt) {
      // Worker has completed, invalidate graph data to refresh metrics
      queryClient.invalidateQueries({ queryKey: ["graph-data", state.tenant, state.project] });
    }
  }, [qaScorerStatusQuery.data, queryClient, state.tenant, state.project]);

  const activeProject = useMemo(() => {
    if (!state.project || !projectsQuery.data) {return null;}
    return projectsQuery.data.projects.find(project => project.slug === state.project) ?? null;
  }, [state.project, projectsQuery.data]);

  // Calculate comprehensive metrics
  const metrics = useMemo(() => {
    const nodes = graphDataQuery.data?.nodes ?? [];
    const relationships = graphDataQuery.data?.relationships ?? [];
    const traceLinks = traceLinksQuery.data?.traceLinks ?? [];
    const documents = documentsQuery.data?.documents ?? [];

    // Get nodes by type
    const requirementNodes = nodes.filter(n => n.type === 'Requirement');
    const infoNodes = nodes.filter(n => n.type === 'Info');
    const surrogateNodes = nodes.filter(n => n.type === 'SurrogateReference');
    const candidateNodes = nodes.filter(n => n.type === 'RequirementCandidate');
    const documentNodes = nodes.filter(n => n.type === 'Document');
    const sectionNodes = nodes.filter(n => n.type === 'DocumentSection');
    const linksetNodes = nodes.filter(n => n.type === 'DocumentLinkset');
    const traceLinkNodes = nodes.filter(n => n.type === 'TraceLink');

    // Object type distribution
    const objectTypeCounts = {
      requirement: requirementNodes.length,
      info: infoNodes.length,
      surrogate: surrogateNodes.length,
      candidate: candidateNodes.length
    };

    // Filter to only actual requirements (exclude info and surrogate) for detailed metrics
    const actualRequirements = requirementNodes;

    // Pattern distribution (only for actual requirements)
    const patternCounts = {
      ubiquitous: actualRequirements.filter(r => r.properties?.pattern === "ubiquitous").length,
      event: actualRequirements.filter(r => r.properties?.pattern === "event").length,
      state: actualRequirements.filter(r => r.properties?.pattern === "state").length,
      unwanted: actualRequirements.filter(r => r.properties?.pattern === "unwanted").length,
      optional: actualRequirements.filter(r => r.properties?.pattern === "optional").length,
      unspecified: actualRequirements.filter(r => !r.properties?.pattern).length
    };

    // Verification distribution (only for actual requirements)
    const verificationCounts = {
      Test: actualRequirements.filter(r => r.properties?.verification === "Test").length,
      Analysis: actualRequirements.filter(r => r.properties?.verification === "Analysis").length,
      Inspection: actualRequirements.filter(r => r.properties?.verification === "Inspection").length,
      Demonstration: actualRequirements.filter(r => r.properties?.verification === "Demonstration").length,
      unspecified: actualRequirements.filter(r => !r.properties?.verification).length
    };

    // Compliance distribution (only for actual requirements)
    const complianceCounts = {
      "N/A": actualRequirements.filter(r => r.properties?.complianceStatus === "N/A").length,
      Compliant: actualRequirements.filter(r => r.properties?.complianceStatus === "Compliant").length,
      "Compliance Risk": actualRequirements.filter(r => r.properties?.complianceStatus === "Compliance Risk").length,
      "Non-Compliant": actualRequirements.filter(r => r.properties?.complianceStatus === "Non-Compliant").length,
      unspecified: actualRequirements.filter(r => !r.properties?.complianceStatus).length
    };

    // QA Score statistics (only for actual requirements)
    const requirementsWithQA = actualRequirements.filter(r => r.properties?.qaScore !== undefined && r.properties?.qaScore !== null);
    const avgQaScore = requirementsWithQA.length > 0
      ? Math.round(requirementsWithQA.reduce((sum, r) => sum + (r.properties?.qaScore ?? 0), 0) / requirementsWithQA.length)
      : 0;
    const qaDistribution = {
      excellent: actualRequirements.filter(r => (r.properties?.qaScore ?? 0) >= 80).length,
      good: actualRequirements.filter(r => (r.properties?.qaScore ?? 0) >= 60 && (r.properties?.qaScore ?? 0) < 80).length,
      needsWork: actualRequirements.filter(r => (r.properties?.qaScore ?? 0) > 0 && (r.properties?.qaScore ?? 0) < 60).length,
      unscored: actualRequirements.filter(r => !r.properties?.qaScore).length
    };

    // Traceability - count requirements involved in trace links
    // A requirement is traced if it's connected via FROM_REQUIREMENT or TO_REQUIREMENT
    const fromReqRels = relationships.filter(r => r.type === 'FROM_REQUIREMENT');
    const toReqRels = relationships.filter(r => r.type === 'TO_REQUIREMENT');

    // Collect requirement IDs that are targets of FROM_REQUIREMENT or TO_REQUIREMENT
    const tracedIds = new Set([
      ...fromReqRels.map(r => r.target),  // Requirements pointed to by FROM_REQUIREMENT
      ...toReqRels.map(r => r.target)     // Requirements pointed to by TO_REQUIREMENT
    ]);

    const tracedRequirements = actualRequirements.filter(r => tracedIds.has(r.id)).length;
    const untracedRequirements = objectTypeCounts.requirement - tracedRequirements;

    // Archive status (only for actual requirements)
    const archivedCount = actualRequirements.filter(r => r.properties?.archived === true).length;
    const activeCount = objectTypeCounts.requirement - archivedCount;

    return {
      totalObjects: nodes.length,
      totalRequirements: objectTypeCounts.requirement,
      totalDocuments: documentNodes.length,
      totalSections: sectionNodes.length,
      totalTraceLinks: traceLinkNodes.length,
      totalLinksets: linksetNodes.length,
      totalRelationships: relationships.length,
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
  }, [graphDataQuery.data, traceLinksQuery.data, documentsQuery.data]);

  return (
    <PageLayout
      title="Dashboard"
      description="System overview, project metrics, and administrative controls"
      breadcrumbs={[
        { label: 'Dashboard' }
      ]}
    >
      {/* Workspace Selection */}
      <div className="mb-8">
        <Card className="border-neutral-200 bg-white shadow-sm">
          <CardHeader>
            <CardTitle className="text-xl text-neutral-900">Select Your Workspace</CardTitle>
            <CardDescription className="text-neutral-600">
              Choose a tenant and project to access requirements, documents, and architecture.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <TenantProjectSelector />
          </CardContent>
        </Card>
      </div>

      <PageHeader
        title="System Health"
        description="Current backend status and metadata"
      />
      <div className="mb-8">
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
      </div>

      <PageHeader
        title="Tenants"
        description="Overview of tenant and project counts"
        actions={isAdmin && (
          <Button onClick={() => setShowCreateTenant(true)}>
            + Create Tenant
          </Button>
        )}
      />
      <div className="mb-8">
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
      </div>

      {/* QA Scorer Worker Status */}
      <PageHeader
        title="QA Scorer Worker"
        description="Background worker for scoring all requirements in a project"
        actions={state.tenant && state.project && (
          qaScorerStatusQuery.data?.isRunning ? (
            <Button
              variant="destructive"
              onClick={() => stopQAScorerMutation.mutate()}
              disabled={stopQAScorerMutation.isPending}
            >
              Stop Worker
            </Button>
          ) : (
            <Button
              onClick={() => startQAScorerMutation.mutate({ tenant: state.tenant!, project: state.project! })}
              disabled={startQAScorerMutation.isPending}
            >
              Start QA Scoring
            </Button>
          )
        )}
      />
      <div className="mb-8">
        {!state.tenant || !state.project ? (
          <p className="hint">Select a tenant and project to use the QA scorer.</p>
        ) : qaScorerStatusQuery.isLoading ? (
          <Spinner />
        ) : qaScorerStatusQuery.isError ? (
          <ErrorState message={(qaScorerStatusQuery.error as Error).message} />
        ) : qaScorerStatusQuery.data ? (
          <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
              <div>
                <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.25rem' }}>STATUS</div>
                <div style={{
                  fontWeight: 600,
                  color: qaScorerStatusQuery.data.isRunning ? '#3b82f6' : '#6b7280'
                }}>
                  {qaScorerStatusQuery.data.isRunning ? 'RUNNING' : 'IDLE'}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.25rem' }}>PROGRESS</div>
                <div>{qaScorerStatusQuery.data.processedCount} / {qaScorerStatusQuery.data.totalCount}</div>
              </div>
              {qaScorerStatusQuery.data.currentRequirement && (
                <div>
                  <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.25rem' }}>CURRENT</div>
                  <div>{qaScorerStatusQuery.data.currentRequirement}</div>
                </div>
              )}
              {qaScorerStatusQuery.data.startedAt && (
                <div>
                  <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.25rem' }}>STARTED</div>
                  <div>{formatDate(qaScorerStatusQuery.data.startedAt)}</div>
                </div>
              )}
              {qaScorerStatusQuery.data.completedAt && (
                <div>
                  <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.25rem' }}>COMPLETED</div>
                  <div>{formatDate(qaScorerStatusQuery.data.completedAt)}</div>
                </div>
              )}
            </div>
            {qaScorerStatusQuery.data.lastError && (
              <div style={{
                padding: '0.75rem',
                backgroundColor: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: '0.5rem',
                color: '#991b1b'
              }}>
                <strong>Error:</strong> {qaScorerStatusQuery.data.lastError}
              </div>
            )}
          </div>
        ) : null}
      </div>

      <PageHeader
        title="Active Project Metrics"
        description="Comprehensive metrics and health indicators for the current project"
        actions={state.tenant && state.project && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              graphDataQuery.refetch();
              projectsQuery.refetch();
              documentsQuery.refetch();
              traceLinksQuery.refetch();
            }}
            disabled={graphDataQuery.isFetching || projectsQuery.isFetching || documentsQuery.isFetching || traceLinksQuery.isFetching}
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
        )}
      />
      <div className="mb-8">
        {!state.tenant || !state.project ? (
          <p>Select a tenant and project to view project metrics.</p>
        ) : projectsQuery.isLoading || graphDataQuery.isLoading || documentsQuery.isLoading || traceLinksQuery.isLoading ? (
          <Spinner />
        ) : projectsQuery.isError ? (
          <ErrorState message={(projectsQuery.error as Error).message} />
        ) : graphDataQuery.isError ? (
          <ErrorState message={(graphDataQuery.error as Error).message} />
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
                  <span className="stat-label">Total Graph Nodes</span>
                  <span className="stat-value">{metrics.totalObjects}</span>
                </div>
                <div className="stat-card">
                  <span className="stat-label">Total Relationships</span>
                  <span className="stat-value">{metrics.totalRelationships}</span>
                </div>
              </div>
            </div>

            {/* Graph Structure */}
            <div>
              <h3 style={{ marginBottom: '1rem', fontSize: '1.1rem', fontWeight: '600' }}>Graph Structure</h3>
              <div className="grid grid-cols-4">
                <div className="stat-card">
                  <span className="stat-label">Documents</span>
                  <span className="stat-value">{metrics.totalDocuments}</span>
                </div>
                <div className="stat-card">
                  <span className="stat-label">Sections</span>
                  <span className="stat-value">{metrics.totalSections}</span>
                </div>
                <div className="stat-card">
                  <span className="stat-label">Linksets</span>
                  <span className="stat-value">{metrics.totalLinksets}</span>
                </div>
                <div className="stat-card">
                  <span className="stat-label">Trace Links</span>
                  <span className="stat-value">{metrics.totalTraceLinks}</span>
                </div>
              </div>
            </div>

            {/* Object Type Distribution */}
            <div>
              <h3 style={{ marginBottom: '1rem', fontSize: '1.1rem', fontWeight: '600' }}>Content Object Distribution</h3>
              <div className="grid grid-cols-4">
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
                <div className="stat-card">
                  <span className="stat-label">Candidates</span>
                  <span className="stat-value" style={{ color: '#f59e0b' }}>{metrics.objectTypeCounts.candidate}</span>
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
                    <span className="stat-value">{baselinesQuery.data.items?.length ?? 0}</span>
                  </div>
                  {latestBaseline && (
                    <>
                      <div className="stat-card">
                        <span className="stat-label">Latest Baseline</span>
                        <span className="stat-value" style={{ fontSize: '0.9rem' }}>{latestBaseline.ref}</span>
                        <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
                          {formatDate(latestBaseline.createdAt)}
                        </div>
                      </div>
                      <div className="stat-card">
                        <span className="stat-label">Requirements Captured</span>
                        <span className="stat-value">{latestBaselineRequirementCount}</span>
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
      </div>

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
    </PageLayout>
  );
}
