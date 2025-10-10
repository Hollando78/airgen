import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "../lib/client";
import { Spinner } from "../components/Spinner";
import { ErrorState } from "../components/ErrorState";
import { toast } from "sonner";
import type { RequirementCandidate } from "../types";

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
  const api = useApiClient();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<Tab>("deleted");
  const [selectedTenant, setSelectedTenant] = useState<string>("hollando");
  const [selectedProject, setSelectedProject] = useState<string>("main-battle-tank");
  const [selectedRequirements, setSelectedRequirements] = useState<Set<string>>(new Set());
  const [selectedCandidates, setSelectedCandidates] = useState<Set<string>>(new Set());
  const [candidateStatusFilter, setCandidateStatusFilter] = useState<string>("");

  // Fetch tenants
  const { data: tenantsData } = useQuery({
    queryKey: ["tenants"],
    queryFn: async () => {
      const response = await api.get("/tenants");
      return response.data;
    }
  });
  const tenants = tenantsData?.tenants || [];

  // Fetch projects for selected tenant
  const { data: projectsData } = useQuery({
    queryKey: ["projects", selectedTenant],
    queryFn: async () => {
      const response = await api.get(`/tenants/${selectedTenant}/projects`);
      return response.data;
    },
    enabled: !!selectedTenant
  });
  const projects = projectsData?.projects || [];

  // Fetch deleted requirements
  const { data: deletedData, isLoading: isLoadingDeleted, error: deletedError } = useQuery({
    queryKey: ["admin", "requirements", "deleted", selectedTenant, selectedProject],
    queryFn: () => api.listDeletedRequirements(selectedTenant, selectedProject),
    enabled: activeTab === "deleted" && !!selectedTenant && !!selectedProject
  });

  // Fetch archived requirements
  const { data: archivedData, isLoading: isLoadingArchived, error: archivedError } = useQuery({
    queryKey: ["admin", "requirements", "archived", selectedTenant, selectedProject],
    queryFn: () => api.listArchivedRequirements(selectedTenant, selectedProject),
    enabled: activeTab === "archived" && !!selectedTenant && !!selectedProject
  });

  // Fetch drift
  const { data: driftData, isLoading: isLoadingDrift, error: driftError } = useQuery({
    queryKey: ["admin", "requirements", "drift", selectedTenant, selectedProject],
    queryFn: () => api.detectRequirementsDrift(selectedTenant, selectedProject),
    enabled: activeTab === "drift" && !!selectedTenant && !!selectedProject
  });

  // Fetch bad links
  const { data: badLinksData, isLoading: isLoadingBadLinks, error: badLinksError } = useQuery({
    queryKey: ["admin", "requirements", "badlinks", selectedTenant, selectedProject],
    queryFn: () => api.listBadLinksRequirements(selectedTenant, selectedProject),
    enabled: activeTab === "badlinks" && !!selectedTenant && !!selectedProject
  });

  // Fetch candidates
  const { data: candidatesData, isLoading: isLoadingCandidates, error: candidatesError } = useQuery({
    queryKey: ["admin", "requirements", "candidates", selectedTenant, selectedProject, candidateStatusFilter],
    queryFn: () => api.listCandidatesAdmin(selectedTenant, selectedProject, candidateStatusFilter || undefined),
    enabled: activeTab === "candidates" && !!selectedTenant && !!selectedProject
  });

  // Restore mutation
  const restoreMutation = useMutation({
    mutationFn: (requirementId: string) =>
      api.restoreRequirement(selectedTenant, selectedProject, requirementId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "requirements"] });
      queryClient.invalidateQueries({ queryKey: ["requirements"] });
      toast.success("Requirement restored successfully");
      setSelectedRequirements(new Set());
    },
    onError: (error: any) => {
      toast.error(error?.message || "Failed to restore requirement");
    }
  });

  // Bulk restore mutation
  const bulkRestoreMutation = useMutation({
    mutationFn: (requirementIds: string[]) =>
      api.bulkRestoreRequirements(selectedTenant, selectedProject, requirementIds),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["admin", "requirements"] });
      queryClient.invalidateQueries({ queryKey: ["requirements"] });
      toast.success(`Restored ${data.results.restored.length} requirements`);
      if (data.results.failed.length > 0) {
        toast.warning(`Failed to restore ${data.results.failed.length} requirements`);
      }
      setSelectedRequirements(new Set());
    },
    onError: (error: any) => {
      toast.error(error?.message || "Failed to restore requirements");
    }
  });

  // Sync to markdown mutation
  const syncMutation = useMutation({
    mutationFn: (requirementId: string) =>
      api.syncRequirementToMarkdown(selectedTenant, selectedProject, requirementId),
    onSuccess: () => {
      toast.success("Requirement synced to markdown");
    },
    onError: (error: any) => {
      toast.error(error?.message || "Failed to sync requirement");
    }
  });

  // Delete broken links mutation
  const deleteBrokenLinksMutation = useMutation({
    mutationFn: async (linkIds: string[]) => {
      // Filter out null/undefined link IDs and delete all valid broken links
      const validLinkIds = linkIds.filter(id => id != null && id !== '');
      const results = {
        deleted: 0,
        failed: 0
      };

      for (const linkId of validLinkIds) {
        try {
          await api.deleteTraceLink(selectedTenant, selectedProject, linkId);
          results.deleted++;
        } catch (error: any) {
          // If link doesn't exist (404), count as success since it's already gone
          if (error?.status === 404) {
            results.deleted++;
          } else {
            results.failed++;
            console.error(`Failed to delete link ${linkId}:`, error);
          }
        }
      }

      return results;
    },
    onSuccess: (results) => {
      queryClient.invalidateQueries({ queryKey: ["admin", "requirements", "badlinks"] });
      queryClient.invalidateQueries({ queryKey: ["trace-links"] });

      if (results.failed > 0) {
        toast.warning(`Removed ${results.deleted} link${results.deleted > 1 ? 's' : ''}, ${results.failed} failed`);
      } else {
        toast.success(`Removed ${results.deleted} broken link${results.deleted > 1 ? 's' : ''}`);
      }
    },
    onError: (error: any) => {
      toast.error(error?.message || "Failed to remove broken links");
    }
  });

  // Bulk delete candidates mutation
  const bulkDeleteCandidatesMutation = useMutation({
    mutationFn: (candidateIds: string[]) => api.bulkDeleteCandidates(candidateIds),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["admin", "requirements", "candidates"] });
      toast.success(`Deleted ${data.deleted} candidate${data.deleted > 1 ? 's' : ''}`);
      setSelectedCandidates(new Set());
    },
    onError: (error: any) => {
      toast.error(error?.message || "Failed to delete candidates");
    }
  });

  // Bulk reset candidates mutation
  const bulkResetCandidatesMutation = useMutation({
    mutationFn: (candidateIds: string[]) => api.bulkResetCandidates(candidateIds),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["admin", "requirements", "candidates"] });
      toast.success(`Reset ${data.reset} candidate${data.reset > 1 ? 's' : ''} to pending status`);
      setSelectedCandidates(new Set());
    },
    onError: (error: any) => {
      toast.error(error?.message || "Failed to reset candidates");
    }
  });

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

  const renderRequirementsTable = (requirements: Requirement[], showActions: "restore" | "sync" | "viewlinks") => {
    if (!requirements || requirements.length === 0) {
      return (
        <div style={{ textAlign: 'center', padding: '3rem 0', color: '#6b7280' }}>
          No requirements found
        </div>
      );
    }

    return (
      <div style={{ overflowX: 'auto' }}>
        <table style={{ minWidth: '100%', borderCollapse: 'collapse' }}>
          <thead style={{ backgroundColor: '#f9fafb' }}>
            <tr>
              {showActions === "restore" && (
                <th style={{
                  padding: '0.75rem 1.5rem',
                  textAlign: 'left',
                  borderBottom: '1px solid #e5e7eb'
                }}>
                  <input
                    type="checkbox"
                    checked={selectedRequirements.size === requirements.length}
                    onChange={() => handleSelectAll(requirements)}
                    style={{ cursor: 'pointer' }}
                  />
                </th>
              )}
              <th style={{
                padding: '0.75rem 1.5rem',
                textAlign: 'left',
                fontSize: '0.75rem',
                fontWeight: '500',
                color: '#6b7280',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                borderBottom: '1px solid #e5e7eb'
              }}>
                Ref
              </th>
              <th style={{
                padding: '0.75rem 1.5rem',
                textAlign: 'left',
                fontSize: '0.75rem',
                fontWeight: '500',
                color: '#6b7280',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                borderBottom: '1px solid #e5e7eb'
              }}>
                Title
              </th>
              <th style={{
                padding: '0.75rem 1.5rem',
                textAlign: 'left',
                fontSize: '0.75rem',
                fontWeight: '500',
                color: '#6b7280',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                borderBottom: '1px solid #e5e7eb'
              }}>
                {activeTab === "deleted" ? "Deleted" : activeTab === "badlinks" ? "Issues" : "Updated"}
              </th>
              <th style={{
                padding: '0.75rem 1.5rem',
                textAlign: 'left',
                fontSize: '0.75rem',
                fontWeight: '500',
                color: '#6b7280',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                borderBottom: '1px solid #e5e7eb'
              }}>
                Actions
              </th>
            </tr>
          </thead>
          <tbody style={{ backgroundColor: 'white' }}>
            {requirements.map((req) => (
              <tr key={req.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                {showActions === "restore" && (
                  <td style={{ padding: '1rem 1.5rem', whiteSpace: 'nowrap' }}>
                    <input
                      type="checkbox"
                      checked={selectedRequirements.has(req.id)}
                      onChange={() => handleToggleSelect(req.id)}
                      style={{ cursor: 'pointer' }}
                    />
                  </td>
                )}
                <td style={{
                  padding: '1rem 1.5rem',
                  whiteSpace: 'nowrap',
                  fontSize: '0.875rem',
                  fontWeight: '500',
                  color: '#111827'
                }}>
                  {req.ref}
                </td>
                <td style={{
                  padding: '1rem 1.5rem',
                  fontSize: '0.875rem',
                  color: '#111827',
                  maxWidth: '500px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap'
                }}>
                  {req.title}
                </td>
                <td style={{
                  padding: '1rem 1.5rem',
                  whiteSpace: 'nowrap',
                  fontSize: '0.875rem',
                  color: '#6b7280'
                }}>
                  {activeTab === "badlinks" && req.brokenLinksMetadata ? (
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                      {(() => {
                        const brokenCount = req.brokenLinksMetadata.filter(m => m.type === 'broken').length;
                        const duplicateCount = req.brokenLinksMetadata.filter(m => m.type === 'duplicate').length;
                        const missingLinksetCount = req.brokenLinksMetadata.filter(m => m.type === 'missing_linkset').length;
                        return (
                          <>
                            {brokenCount > 0 && (
                              <span style={{
                                fontSize: '0.75rem',
                                padding: '0.25rem 0.5rem',
                                borderRadius: '0.25rem',
                                backgroundColor: '#fee2e2',
                                color: '#991b1b',
                                fontWeight: '500'
                              }}>
                                {brokenCount} Broken
                              </span>
                            )}
                            {duplicateCount > 0 && (
                              <span style={{
                                fontSize: '0.75rem',
                                padding: '0.25rem 0.5rem',
                                borderRadius: '0.25rem',
                                backgroundColor: '#fef3c7',
                                color: '#92400e',
                                fontWeight: '500'
                              }}>
                                {duplicateCount} Duplicate
                              </span>
                            )}
                            {missingLinksetCount > 0 && (
                              <span style={{
                                fontSize: '0.75rem',
                                padding: '0.25rem 0.5rem',
                                borderRadius: '0.25rem',
                                backgroundColor: '#dbeafe',
                                color: '#1e40af',
                                fontWeight: '500'
                              }}>
                                {missingLinksetCount} Missing Linkset
                              </span>
                            )}
                          </>
                        );
                      })()}
                    </div>
                  ) : (
                    <>
                      <div>{formatDate(activeTab === "deleted" ? req.deletedAt : req.updatedAt)}</div>
                      {req.deletedBy && (
                        <div style={{ fontSize: '0.75rem', color: '#9ca3af' }}>by {req.deletedBy}</div>
                      )}
                    </>
                  )}
                </td>
                <td style={{
                  padding: '1rem 1.5rem',
                  whiteSpace: 'nowrap',
                  fontSize: '0.875rem'
                }}>
                  {showActions === "restore" && (
                    <button
                      onClick={() => restoreMutation.mutate(req.id)}
                      disabled={restoreMutation.isPending}
                      style={{
                        color: '#6366f1',
                        backgroundColor: 'transparent',
                        border: 'none',
                        cursor: restoreMutation.isPending ? 'not-allowed' : 'pointer',
                        opacity: restoreMutation.isPending ? 0.5 : 1,
                        textDecoration: 'none'
                      }}
                      onMouseEnter={(e) => {
                        if (!restoreMutation.isPending) {
                          e.currentTarget.style.color = '#4338ca';
                          e.currentTarget.style.textDecoration = 'underline';
                        }
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.color = '#6366f1';
                        e.currentTarget.style.textDecoration = 'none';
                      }}
                    >
                      Restore
                    </button>
                  )}
                  {showActions === "sync" && (
                    <button
                      onClick={() => syncMutation.mutate(req.id)}
                      disabled={syncMutation.isPending}
                      style={{
                        color: '#6366f1',
                        backgroundColor: 'transparent',
                        border: 'none',
                        cursor: syncMutation.isPending ? 'not-allowed' : 'pointer',
                        opacity: syncMutation.isPending ? 0.5 : 1,
                        textDecoration: 'none'
                      }}
                      onMouseEnter={(e) => {
                        if (!syncMutation.isPending) {
                          e.currentTarget.style.color = '#4338ca';
                          e.currentTarget.style.textDecoration = 'underline';
                        }
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.color = '#6366f1';
                        e.currentTarget.style.textDecoration = 'none';
                      }}
                    >
                      Sync to Markdown
                    </button>
                  )}
                  {showActions === "viewlinks" && req.brokenLinkIds && (
                    <button
                      onClick={() => deleteBrokenLinksMutation.mutate(req.brokenLinkIds!)}
                      disabled={deleteBrokenLinksMutation.isPending}
                      style={{
                        color: '#dc2626',
                        backgroundColor: 'transparent',
                        border: 'none',
                        cursor: deleteBrokenLinksMutation.isPending ? 'not-allowed' : 'pointer',
                        opacity: deleteBrokenLinksMutation.isPending ? 0.5 : 1,
                        textDecoration: 'none'
                      }}
                      onMouseEnter={(e) => {
                        if (!deleteBrokenLinksMutation.isPending) {
                          e.currentTarget.style.color = '#b91c1c';
                          e.currentTarget.style.textDecoration = 'underline';
                        }
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.color = '#dc2626';
                        e.currentTarget.style.textDecoration = 'none';
                      }}
                    >
                      Remove Link{req.brokenLinkCount && req.brokenLinkCount > 1 ? 's' : ''}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  const renderCandidatesTable = (candidates: RequirementCandidate[]) => {
    if (!candidates || candidates.length === 0) {
      return (
        <div style={{ textAlign: 'center', padding: '3rem 0', color: '#6b7280' }}>
          No candidates found
        </div>
      );
    }

    return (
      <div style={{ overflowX: 'auto' }}>
        <table style={{ minWidth: '100%', borderCollapse: 'collapse' }}>
          <thead style={{ backgroundColor: '#f9fafb' }}>
            <tr>
              <th style={{
                padding: '0.75rem 1.5rem',
                textAlign: 'left',
                borderBottom: '1px solid #e5e7eb'
              }}>
                <input
                  type="checkbox"
                  checked={selectedCandidates.size === candidates.length}
                  onChange={() => handleSelectAllCandidates(candidates)}
                  style={{ cursor: 'pointer' }}
                />
              </th>
              <th style={{
                padding: '0.75rem 1.5rem',
                textAlign: 'left',
                fontSize: '0.75rem',
                fontWeight: '500',
                color: '#6b7280',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                borderBottom: '1px solid #e5e7eb'
              }}>
                Text
              </th>
              <th style={{
                padding: '0.75rem 1.5rem',
                textAlign: 'left',
                fontSize: '0.75rem',
                fontWeight: '500',
                color: '#6b7280',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                borderBottom: '1px solid #e5e7eb'
              }}>
                Status
              </th>
              <th style={{
                padding: '0.75rem 1.5rem',
                textAlign: 'left',
                fontSize: '0.75rem',
                fontWeight: '500',
                color: '#6b7280',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                borderBottom: '1px solid #e5e7eb'
              }}>
                QA Score
              </th>
              <th style={{
                padding: '0.75rem 1.5rem',
                textAlign: 'left',
                fontSize: '0.75rem',
                fontWeight: '500',
                color: '#6b7280',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                borderBottom: '1px solid #e5e7eb'
              }}>
                Created
              </th>
            </tr>
          </thead>
          <tbody style={{ backgroundColor: 'white' }}>
            {candidates.map((cand) => (
              <tr key={cand.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                <td style={{ padding: '1rem 1.5rem', whiteSpace: 'nowrap' }}>
                  <input
                    type="checkbox"
                    checked={selectedCandidates.has(cand.id)}
                    onChange={() => handleToggleCandidateSelect(cand.id)}
                    style={{ cursor: 'pointer' }}
                  />
                </td>
                <td style={{
                  padding: '1rem 1.5rem',
                  fontSize: '0.875rem',
                  color: '#111827',
                  maxWidth: '500px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap'
                }}>
                  {cand.text}
                </td>
                <td style={{ padding: '1rem 1.5rem', whiteSpace: 'nowrap', fontSize: '0.875rem' }}>
                  <span style={{
                    fontSize: '0.75rem',
                    padding: '0.25rem 0.5rem',
                    borderRadius: '0.25rem',
                    backgroundColor: cand.status === 'pending' ? '#fef3c7' : cand.status === 'accepted' ? '#d1fae5' : '#fee2e2',
                    color: cand.status === 'pending' ? '#92400e' : cand.status === 'accepted' ? '#065f46' : '#991b1b',
                    fontWeight: '500'
                  }}>
                    {cand.status}
                  </span>
                </td>
                <td style={{
                  padding: '1rem 1.5rem',
                  whiteSpace: 'nowrap',
                  fontSize: '0.875rem',
                  color: '#6b7280'
                }}>
                  {cand.qaScore != null ? cand.qaScore.toFixed(1) : 'N/A'}
                </td>
                <td style={{
                  padding: '1rem 1.5rem',
                  whiteSpace: 'nowrap',
                  fontSize: '0.875rem',
                  color: '#6b7280'
                }}>
                  {formatDate(cand.createdAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  const currentData =
    activeTab === "deleted"
      ? deletedData?.requirements
      : activeTab === "archived"
      ? archivedData?.requirements
      : activeTab === "badlinks"
      ? badLinksData?.requirements
      : activeTab === "candidates"
      ? candidatesData?.candidates
      : driftData?.drifted;

  const isLoading =
    activeTab === "deleted"
      ? isLoadingDeleted
      : activeTab === "archived"
      ? isLoadingArchived
      : activeTab === "badlinks"
      ? isLoadingBadLinks
      : activeTab === "candidates"
      ? isLoadingCandidates
      : isLoadingDrift;

  const error =
    activeTab === "deleted"
      ? deletedError
      : activeTab === "archived"
      ? archivedError
      : activeTab === "badlinks"
      ? badLinksError
      : activeTab === "candidates"
      ? candidatesError
      : driftError;

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
          {/* Tenant/Project Selection */}
          <div style={{
            backgroundColor: 'white',
            borderRadius: '8px',
            boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
            padding: '1rem',
            marginBottom: '1.5rem'
          }}>
            <div style={{ display: 'flex', gap: '1rem' }}>
              <div style={{ flex: 1 }}>
                <label style={{
                  display: 'block',
                  fontSize: '0.875rem',
                  fontWeight: '500',
                  color: '#374151',
                  marginBottom: '0.5rem'
                }}>
                  Tenant
                </label>
                <select
                  value={selectedTenant}
                  onChange={(e) => setSelectedTenant(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    borderRadius: '0.375rem',
                    border: '1px solid #d1d5db',
                    fontSize: '0.875rem'
                  }}
                >
                  {tenants.map((t: any) => (
                    <option key={t.slug} value={t.slug}>
                      {t.name || t.slug}
                    </option>
                  ))}
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label style={{
                  display: 'block',
                  fontSize: '0.875rem',
                  fontWeight: '500',
                  color: '#374151',
                  marginBottom: '0.5rem'
                }}>
                  Project
                </label>
                <select
                  value={selectedProject}
                  onChange={(e) => setSelectedProject(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    borderRadius: '0.375rem',
                    border: '1px solid #d1d5db',
                    fontSize: '0.875rem'
                  }}
                >
                  {projects.map((p: any) => (
                    <option key={p.slug} value={p.slug}>
                      {p.key || p.slug}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div style={{
            backgroundColor: 'white',
            borderRadius: '8px',
            boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
            marginBottom: '1.5rem'
          }}>
            <div style={{ borderBottom: '1px solid #e5e7eb' }}>
              <nav style={{ display: 'flex', marginBottom: '-1px' }}>
                <button
                  onClick={() => setActiveTab("deleted")}
                  style={{
                    padding: '0.75rem 1.5rem',
                    fontSize: '0.875rem',
                    fontWeight: '500',
                    borderTop: 'none',
                    borderLeft: 'none',
                    borderRight: 'none',
                    borderBottom: activeTab === "deleted" ? '2px solid #6366f1' : '2px solid transparent',
                    color: activeTab === "deleted" ? '#6366f1' : '#6b7280',
                    backgroundColor: 'transparent',
                    cursor: 'pointer'
                  }}
                >
                  Deleted Requirements
                  {deletedData?.count !== undefined && (
                    <span style={{
                      marginLeft: '0.5rem',
                      fontSize: '0.75rem',
                      backgroundColor: '#f3f4f6',
                      padding: '0.25rem 0.5rem',
                      borderRadius: '9999px'
                    }}>
                      {deletedData.count}
                    </span>
                  )}
                </button>
                <button
                  onClick={() => setActiveTab("archived")}
                  style={{
                    padding: '0.75rem 1.5rem',
                    fontSize: '0.875rem',
                    fontWeight: '500',
                    borderTop: 'none',
                    borderLeft: 'none',
                    borderRight: 'none',
                    borderBottom: activeTab === "archived" ? '2px solid #6366f1' : '2px solid transparent',
                    color: activeTab === "archived" ? '#6366f1' : '#6b7280',
                    backgroundColor: 'transparent',
                    cursor: 'pointer'
                  }}
                >
                  Archived Requirements
                  {archivedData?.count !== undefined && (
                    <span style={{
                      marginLeft: '0.5rem',
                      fontSize: '0.75rem',
                      backgroundColor: '#f3f4f6',
                      padding: '0.25rem 0.5rem',
                      borderRadius: '9999px'
                    }}>
                      {archivedData.count}
                    </span>
                  )}
                </button>
                <button
                  onClick={() => setActiveTab("drift")}
                  style={{
                    padding: '0.75rem 1.5rem',
                    fontSize: '0.875rem',
                    fontWeight: '500',
                    borderTop: 'none',
                    borderLeft: 'none',
                    borderRight: 'none',
                    borderBottom: activeTab === "drift" ? '2px solid #6366f1' : '2px solid transparent',
                    color: activeTab === "drift" ? '#6366f1' : '#6b7280',
                    backgroundColor: 'transparent',
                    cursor: 'pointer'
                  }}
                >
                  Drift Detection
                  {driftData?.count !== undefined && driftData.count > 0 && (
                    <span style={{
                      marginLeft: '0.5rem',
                      fontSize: '0.75rem',
                      backgroundColor: '#fee2e2',
                      color: '#991b1b',
                      padding: '0.25rem 0.5rem',
                      borderRadius: '9999px'
                    }}>
                      {driftData.count}
                    </span>
                  )}
                </button>
                <button
                  onClick={() => setActiveTab("badlinks")}
                  style={{
                    padding: '0.75rem 1.5rem',
                    fontSize: '0.875rem',
                    fontWeight: '500',
                    borderTop: 'none',
                    borderLeft: 'none',
                    borderRight: 'none',
                    borderBottom: activeTab === "badlinks" ? '2px solid #6366f1' : '2px solid transparent',
                    color: activeTab === "badlinks" ? '#6366f1' : '#6b7280',
                    backgroundColor: 'transparent',
                    cursor: 'pointer'
                  }}
                >
                  Bad Links
                  {badLinksData?.count !== undefined && badLinksData.count > 0 && (
                    <span style={{
                      marginLeft: '0.5rem',
                      fontSize: '0.75rem',
                      backgroundColor: '#fef3c7',
                      color: '#92400e',
                      padding: '0.25rem 0.5rem',
                      borderRadius: '9999px'
                    }}>
                      {badLinksData.count}
                    </span>
                  )}
                </button>
                <button
                  onClick={() => setActiveTab("candidates")}
                  style={{
                    padding: '0.75rem 1.5rem',
                    fontSize: '0.875rem',
                    fontWeight: '500',
                    borderTop: 'none',
                    borderLeft: 'none',
                    borderRight: 'none',
                    borderBottom: activeTab === "candidates" ? '2px solid #6366f1' : '2px solid transparent',
                    color: activeTab === "candidates" ? '#6366f1' : '#6b7280',
                    backgroundColor: 'transparent',
                    cursor: 'pointer'
                  }}
                >
                  Candidates
                  {candidatesData?.count !== undefined && (
                    <span style={{
                      marginLeft: '0.5rem',
                      fontSize: '0.75rem',
                      backgroundColor: '#f3f4f6',
                      padding: '0.25rem 0.5rem',
                      borderRadius: '9999px'
                    }}>
                      {candidatesData.count}
                    </span>
                  )}
                </button>
              </nav>
            </div>

            {/* Bulk Actions */}
            {activeTab === "deleted" && selectedRequirements.size > 0 && (
              <div style={{
                padding: '1rem',
                backgroundColor: '#eef2ff',
                borderBottom: '1px solid #c7d2fe'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '0.875rem', color: '#4338ca' }}>
                    {selectedRequirements.size} requirement(s) selected
                  </span>
                  <button
                    onClick={handleBulkRestore}
                    disabled={bulkRestoreMutation.isPending}
                    style={{
                      padding: '0.5rem 1rem',
                      backgroundColor: '#6366f1',
                      color: 'white',
                      borderRadius: '0.375rem',
                      border: 'none',
                      fontSize: '0.875rem',
                      fontWeight: '500',
                      cursor: bulkRestoreMutation.isPending ? 'not-allowed' : 'pointer',
                      opacity: bulkRestoreMutation.isPending ? 0.5 : 1
                    }}
                  >
                    {bulkRestoreMutation.isPending ? "Restoring..." : "Restore Selected"}
                  </button>
                </div>
              </div>
            )}

            {activeTab === "candidates" && selectedCandidates.size > 0 && (
              <div style={{
                padding: '1rem',
                backgroundColor: '#eef2ff',
                borderBottom: '1px solid #c7d2fe'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '0.875rem', color: '#4338ca' }}>
                    {selectedCandidates.size} candidate(s) selected
                  </span>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                      onClick={handleBulkResetCandidates}
                      disabled={bulkResetCandidatesMutation.isPending}
                      style={{
                        padding: '0.5rem 1rem',
                        backgroundColor: '#f59e0b',
                        color: 'white',
                        borderRadius: '0.375rem',
                        border: 'none',
                        fontSize: '0.875rem',
                        fontWeight: '500',
                        cursor: bulkResetCandidatesMutation.isPending ? 'not-allowed' : 'pointer',
                        opacity: bulkResetCandidatesMutation.isPending ? 0.5 : 1
                      }}
                    >
                      {bulkResetCandidatesMutation.isPending ? "Resetting..." : "Reset to Pending"}
                    </button>
                    <button
                      onClick={handleBulkDeleteCandidates}
                      disabled={bulkDeleteCandidatesMutation.isPending}
                      style={{
                        padding: '0.5rem 1rem',
                        backgroundColor: '#dc2626',
                        color: 'white',
                        borderRadius: '0.375rem',
                        border: 'none',
                        fontSize: '0.875rem',
                        fontWeight: '500',
                        cursor: bulkDeleteCandidatesMutation.isPending ? 'not-allowed' : 'pointer',
                        opacity: bulkDeleteCandidatesMutation.isPending ? 0.5 : 1
                      }}
                    >
                      {bulkDeleteCandidatesMutation.isPending ? "Deleting..." : "Delete Selected"}
                    </button>
                  </div>
                </div>
              </div>
            )}

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
                    ? renderCandidatesTable(currentData as RequirementCandidate[])
                    : renderRequirementsTable(
                        currentData as Requirement[],
                        activeTab === "drift" ? "sync" : activeTab === "badlinks" ? "viewlinks" : "restore"
                      )
                  }
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default AdminRequirementsRoute;
