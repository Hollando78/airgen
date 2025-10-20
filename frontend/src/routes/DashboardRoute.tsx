import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "../lib/client";
import { useTenantProject } from "../hooks/useTenantProject";
import { useTenantManagement } from "../hooks/useTenantManagement";
import { useProjectManagement } from "../hooks/useProjectManagement";
import { useProjectMetrics } from "../hooks/useProjectMetrics";
import { PageLayout } from "../components/layout/PageLayout";
import { PageHeader } from "../components/layout/PageHeader";
import { Button } from "../components/ui/button";
import { TenantProjectSelector } from "../components/TenantProjectSelector";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { SystemHealthCard } from "../components/dashboard/SystemHealthCard";
import { TenantsTable } from "../components/dashboard/TenantsTable";
import { QAScorerPanel } from "../components/dashboard/QAScorerPanel";
import { ProjectMetricsOverview } from "../components/dashboard/ProjectMetricsOverview";
import { CreateTenantModal } from "../components/dashboard/modals/CreateTenantModal";
import { CreateProjectModal } from "../components/dashboard/modals/CreateProjectModal";
import { InviteUserDialog } from "../components/dashboard/modals/InviteUserDialog";
import { DeleteTenantDialog } from "../components/dashboard/modals/DeleteTenantDialog";
import { DeleteProjectDialog } from "../components/dashboard/modals/DeleteProjectDialog";

/**
 * Dashboard route component - orchestrates data fetching and rendering
 *
 * Refactored from 1,027 lines to ~200 lines by extracting:
 * - Custom hooks for data management
 * - Sub-components for UI sections
 * - Modal components for dialogs
 */
export function DashboardRoute(): JSX.Element {
  const api = useApiClient();
  const { state } = useTenantProject();

  // Health query (not in hooks since it's dashboard-specific)
  const healthQuery = useQuery({
    queryKey: ["health"],
    queryFn: api.health
  });

  // Custom hooks for feature domains
  const tenantManagement = useTenantManagement();
  const projectManagement = useProjectManagement();
  const projectMetrics = useProjectMetrics();

  // Derived state
  const hasTenantAndProject = Boolean(state.tenant && state.project);
  const hasBaselines = Boolean(projectMetrics.baselinesQuery.data?.items?.length);

  return (
    <PageLayout
      title="Dashboard"
      description="System overview, project metrics, and administrative controls"
      breadcrumbs={[{ label: 'Dashboard' }]}
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

      {/* System Health */}
      <PageHeader
        title="System Health"
        description="Current backend status and metadata"
      />
      <div className="mb-8">
        <SystemHealthCard healthQuery={healthQuery} />
      </div>

      {/* Tenants */}
      <PageHeader
        title="Tenants"
        description="Overview of tenant and project counts"
        actions={
          <Button onClick={() => tenantManagement.setShowCreateTenant(true)}>
            + Create Tenant
          </Button>
        }
      />
      <div className="mb-8">
        <TenantsTable
          tenantsQuery={tenantManagement.tenantsQuery}
          showOwnerActions={tenantManagement.showOwnerActions}
          onCreateProject={projectManagement.openCreateProjectDialog}
          onInvite={tenantManagement.openInviteDialog}
          onDelete={tenantManagement.setTenantSlugPendingDeletion}
          deleteTenantMutation={tenantManagement.deleteTenantMutation}
        />
      </div>

      {/* QA Scorer Worker */}
      <PageHeader
        title="QA Scorer Worker"
        description="Background worker for scoring all requirements in a project"
        actions={state.tenant && state.project && (
          projectMetrics.qaScorerStatusQuery.data?.isRunning ? (
            <Button
              variant="destructive"
              onClick={() => projectMetrics.stopQAScorerMutation.mutate()}
              disabled={projectMetrics.stopQAScorerMutation.isPending}
            >
              Stop Worker
            </Button>
          ) : (
            <Button
              onClick={() => projectMetrics.startQAScorerMutation.mutate({
                tenant: state.tenant!,
                project: state.project!
              })}
              disabled={projectMetrics.startQAScorerMutation.isPending}
            >
              Start QA Scoring
            </Button>
          )
        )}
      />
      <div className="mb-8">
        <QAScorerPanel
          qaScorerStatusQuery={projectMetrics.qaScorerStatusQuery}
          hasTenantAndProject={hasTenantAndProject}
        />
      </div>

      {/* Active Project Metrics */}
      {hasTenantAndProject && (
        <>
          <PageHeader
            title="Active Project Metrics"
            description="Comprehensive metrics and health indicators for the current project"
          />
          <div className="mb-8">
            {projectMetrics.graphDataQuery.isLoading ? (
              <p>Loading project metrics...</p>
            ) : projectMetrics.graphDataQuery.isError ? (
              <p>Error loading metrics: {projectMetrics.graphDataQuery.error.message}</p>
            ) : (
              <ProjectMetricsOverview
                metrics={projectMetrics.metrics}
                latestBaseline={projectMetrics.latestBaseline}
                latestBaselineRequirementCount={projectMetrics.latestBaselineRequirementCount}
                hasBaselines={hasBaselines}
              />
            )}
          </div>
        </>
      )}

      {/* Modals */}
      <CreateTenantModal
        isOpen={tenantManagement.showCreateTenant}
        onClose={() => tenantManagement.setShowCreateTenant(false)}
        tenantData={tenantManagement.newTenantData}
        setTenantData={tenantManagement.setNewTenantData}
        onSubmit={tenantManagement.handleCreateTenant}
        createTenantMutation={tenantManagement.createTenantMutation}
      />

      <CreateProjectModal
        isOpen={projectManagement.showCreateProject}
        onClose={projectManagement.closeCreateProjectDialog}
        tenantSlug={projectManagement.selectedTenantForProject}
        projectData={projectManagement.newProjectData}
        setProjectData={projectManagement.setNewProjectData}
        onSubmit={projectManagement.handleCreateProject}
        createProjectMutation={projectManagement.createProjectMutation}
      />

      <InviteUserDialog
        isOpen={Boolean(tenantManagement.inviteTenantSlug)}
        onClose={tenantManagement.closeInviteModal}
        tenantSlug={tenantManagement.inviteTenantSlug}
        email={tenantManagement.inviteEmail}
        setEmail={tenantManagement.setInviteEmail}
        onSubmit={tenantManagement.handleSendInvite}
        inviteTenantMutation={tenantManagement.inviteTenantMutation}
        tenantInvitationsQuery={tenantManagement.tenantInvitationsQuery}
      />

      <DeleteTenantDialog
        tenantSlug={tenantManagement.tenantSlugPendingDeletion}
        onClose={() => tenantManagement.setTenantSlugPendingDeletion(null)}
        onConfirm={tenantManagement.handleDeleteTenant}
        deleteTenantMutation={tenantManagement.deleteTenantMutation}
      />

      <DeleteProjectDialog
        projectInfo={projectManagement.projectPendingDeletion}
        onClose={() => projectManagement.setProjectPendingDeletion(null)}
        onConfirm={projectManagement.handleDeleteProject}
        deleteProjectMutation={projectManagement.deleteProjectMutation}
      />
    </PageLayout>
  );
}
