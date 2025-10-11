import { useState } from "react";
import { Spinner } from "../components/Spinner";
import { toast } from "sonner";
import type { RequirementCandidate } from "../types";
import { RequirementsAdminTable } from "./admin/RequirementsAdminTable";
import { CandidatesAdminTable } from "./admin/CandidatesAdminTable";
import { TabNavigation } from "./admin/TabNavigation";
import { BulkActionBar } from "./admin/BulkActionBar";
import { useAdminMutations } from "./admin/useAdminMutations";
import { useAdminData } from "./admin/useAdminData";
import { useTenantProject } from "../hooks/useTenantProject";

type Requirement = {
  id: string;
  ref: string;
  tenant: string;
  projectKey: string;
  title: string;
  text: string;
  deleted?: boolean;
  archived?: boolean;
  deletedAt?: string;
  deletedBy?: string;
  restoredAt?: string;
  contentHash?: string;
  createdAt: string;
  updatedAt: string;
  brokenLinkIds?: string[];
  brokenLinkCount?: number;
  brokenLinksMetadata?: Array<{ linkId: string; type: 'broken' | 'duplicate' | 'missing_linkset' }>;
};

type Tab = "deleted" | "archived" | "drift" | "badlinks" | "candidates";

function formatDate(timestamp?: string): string {
  if (!timestamp) return "N/A";
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short"
    }).format(new Date(timestamp));
  } catch (error) {
    return timestamp;
  }
}

export function AdminRequirementsRoute(): JSX.Element {
  const { state } = useTenantProject();
  const [activeTab, setActiveTab] = useState<Tab>("deleted");
  const [selectedRequirements, setSelectedRequirements] = useState<Set<string>>(new Set());
  const [selectedCandidates, setSelectedCandidates] = useState<Set<string>>(new Set());
  const [candidateStatusFilter, setCandidateStatusFilter] = useState<string>("");

  // Get tenant and project from global context
  const selectedTenant = state.tenant ?? "";
  const selectedProject = state.project ?? "";

  // All queries extracted to custom hook
  const {
    tenants,
    projects,
    deletedData,
    archivedData,
    driftData,
    badLinksData,
    candidatesData,
    currentData,
    isLoading,
    error
  } = useAdminData(selectedTenant, selectedProject, candidateStatusFilter, activeTab);

  // All mutations extracted to custom hook
  const {
    restoreMutation,
    bulkRestoreMutation,
    syncMutation,
    deleteBrokenLinksMutation,
    bulkDeleteCandidatesMutation,
    bulkResetCandidatesMutation
  } = useAdminMutations(selectedTenant, selectedProject, setSelectedRequirements, setSelectedCandidates);

  const handleToggleSelect = (requirementId: string) => {
    const newSelection = new Set(selectedRequirements);
    if (newSelection.has(requirementId)) {
      newSelection.delete(requirementId);
    } else {
      newSelection.add(requirementId);
    }
    setSelectedRequirements(newSelection);
  };

  const handleSelectAll = (requirements: Requirement[]) => {
    if (selectedRequirements.size === requirements.length) {
      setSelectedRequirements(new Set());
    } else {
      setSelectedRequirements(new Set(requirements.map(r => r.id)));
    }
  };

  const handleBulkRestore = () => {
    if (selectedRequirements.size === 0) {
      toast.error("No requirements selected");
      return;
    }
    bulkRestoreMutation.mutate(Array.from(selectedRequirements));
  };

  const handleToggleCandidateSelect = (candidateId: string) => {
    const newSelection = new Set(selectedCandidates);
    if (newSelection.has(candidateId)) {
      newSelection.delete(candidateId);
    } else {
      newSelection.add(candidateId);
    }
    setSelectedCandidates(newSelection);
  };

  const handleSelectAllCandidates = (candidates: RequirementCandidate[]) => {
    if (selectedCandidates.size === candidates.length) {
      setSelectedCandidates(new Set());
    } else {
      setSelectedCandidates(new Set(candidates.map(c => c.id)));
    }
  };

  const handleBulkDeleteCandidates = () => {
    if (selectedCandidates.size === 0) {
      toast.error("No candidates selected");
      return;
    }
    bulkDeleteCandidatesMutation.mutate(Array.from(selectedCandidates));
  };

  const handleBulkResetCandidates = () => {
    if (selectedCandidates.size === 0) {
      toast.error("No candidates selected");
      return;
    }
    bulkResetCandidatesMutation.mutate(Array.from(selectedCandidates));
  };

  return (
    <div style={{
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      backgroundColor: '#f9fafb'
    }}>
      <div style={{
        backgroundColor: 'white',
        borderBottom: '1px solid #e5e7eb',
        padding: '1.5rem 2rem'
      }}>
        <h1 style={{
          fontSize: '1.5rem',
          fontWeight: 'bold',
          color: '#111827',
          margin: 0
        }}>
          Requirements Administration
        </h1>
        <p style={{
          marginTop: '0.25rem',
          fontSize: '0.875rem',
          color: '#6b7280',
          margin: '0.25rem 0 0 0'
        }}>
          Manage deleted requirements, detect drift, and restore data
        </p>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '1.5rem' }}>
          {/* Show selected tenant and project */}
          {state.tenant && state.project && (
            <div style={{
              marginBottom: '1.5rem',
              padding: '1rem',
              backgroundColor: '#f0f9ff',
              border: '1px solid #bfdbfe',
              borderRadius: '8px'
            }}>
              <p style={{ margin: 0, fontSize: '0.875rem', color: '#1e40af' }}>
                <strong>Managing:</strong> {state.tenant} / {state.project}
              </p>
              <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.75rem', color: '#60a5fa' }}>
                Tenant and project selection is managed from the Dashboard
              </p>
            </div>
          )}

          {!state.tenant || !state.project ? (
            <div style={{
              padding: '3rem 1rem',
              textAlign: 'center',
              backgroundColor: '#fef3c7',
              border: '1px solid #fde68a',
              borderRadius: '8px'
            }}>
              <p style={{ fontSize: '1.25rem', fontWeight: '600', color: '#92400e', margin: '0 0 0.5rem 0' }}>
                No Workspace Selected
              </p>
              <p style={{ fontSize: '0.875rem', color: '#78350f', margin: 0 }}>
                Please select a tenant and project from the Dashboard to manage requirements.
              </p>
            </div>
          ) : (
            <>
              {/* Tabs */}
          <div style={{
            backgroundColor: 'white',
            borderRadius: '8px',
            boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
            marginBottom: '1.5rem'
          }}>
            <TabNavigation
              activeTab={activeTab}
              onTabChange={setActiveTab}
              deletedCount={deletedData?.count}
              archivedCount={archivedData?.count}
              driftCount={driftData?.count}
              badLinksCount={badLinksData?.count}
              candidatesCount={candidatesData?.count}
            />

            <BulkActionBar
              activeTab={activeTab}
              selectedRequirementsSize={selectedRequirements.size}
              selectedCandidatesSize={selectedCandidates.size}
              bulkRestoreMutation={bulkRestoreMutation}
              bulkResetCandidatesMutation={bulkResetCandidatesMutation}
              bulkDeleteCandidatesMutation={bulkDeleteCandidatesMutation}
              handleBulkRestore={handleBulkRestore}
              handleBulkResetCandidates={handleBulkResetCandidates}
              handleBulkDeleteCandidates={handleBulkDeleteCandidates}
            />

            {/* Content */}
            <div style={{ padding: '1.5rem' }}>
              {isLoading && (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem 0' }}>
                  <Spinner />
                </div>
              )}

              {error && (
                <div style={{
                  padding: '1rem',
                  backgroundColor: '#fee2e2',
                  border: '1px solid #fca5a5',
                  borderRadius: '0.375rem',
                  marginBottom: '1rem'
                }}>
                  <p style={{ fontSize: '0.875rem', color: '#991b1b', margin: 0 }}>
                    <strong>Error:</strong> {error instanceof Error ? error.message : JSON.stringify(error)}
                  </p>
                </div>
              )}

              {!isLoading && !error && currentData && (
                <>
                  {activeTab === "candidates" && (
                    <div style={{ marginBottom: '1rem' }}>
                      <label style={{
                        display: 'block',
                        fontSize: '0.875rem',
                        fontWeight: '500',
                        color: '#374151',
                        marginBottom: '0.5rem'
                      }}>
                        Filter by Status
                      </label>
                      <select
                        value={candidateStatusFilter}
                        onChange={(e) => setCandidateStatusFilter(e.target.value)}
                        style={{
                          padding: '0.5rem',
                          borderRadius: '0.375rem',
                          border: '1px solid #d1d5db',
                          fontSize: '0.875rem',
                          minWidth: '200px'
                        }}
                      >
                        <option value="">All Statuses</option>
                        <option value="pending">Pending</option>
                        <option value="accepted">Accepted</option>
                        <option value="rejected">Rejected</option>
                      </select>
                    </div>
                  )}
                  {activeTab === "drift" && (
                    <div style={{
                      marginBottom: '1rem',
                      padding: '1rem',
                      backgroundColor: '#fef3c7',
                      border: '1px solid #fde68a',
                      borderRadius: '0.375rem'
                    }}>
                      <p style={{ fontSize: '0.875rem', color: '#92400e', margin: 0 }}>
                        <strong>Drift detected:</strong> {driftData?.count} of {driftData?.total}{" "}
                        requirements have content that differs between Neo4j and markdown files.
                      </p>
                    </div>
                  )}
                  {activeTab === "candidates"
                    ? <CandidatesAdminTable
                        candidates={currentData as RequirementCandidate[]}
                        selectedCandidates={selectedCandidates}
                        formatDate={formatDate}
                        handleToggleCandidateSelect={handleToggleCandidateSelect}
                        handleSelectAllCandidates={handleSelectAllCandidates}
                      />
                    : <RequirementsAdminTable
                        requirements={currentData as Requirement[]}
                        showActions={activeTab === "drift" ? "sync" : activeTab === "badlinks" ? "viewlinks" : "restore"}
                        activeTab={activeTab}
                        selectedRequirements={selectedRequirements}
                        formatDate={formatDate}
                        handleToggleSelect={handleToggleSelect}
                        handleSelectAll={handleSelectAll}
                        restoreMutation={restoreMutation}
                        syncMutation={syncMutation}
                        deleteBrokenLinksMutation={deleteBrokenLinksMutation}
                      />
                  }
                </>
              )}
            </div>
          </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default AdminRequirementsRoute;
