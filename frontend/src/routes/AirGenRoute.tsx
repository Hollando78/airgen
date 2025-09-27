import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTenantProject } from "../hooks/useTenantProject";
import { useApiClient } from "../lib/client";
import { Spinner } from "../components/Spinner";
import { ErrorState } from "../components/ErrorState";
import { AcceptCandidateModal } from "../components/AirGen/AcceptCandidateModal";
import { DocumentAttachmentSelector } from "../components/DocumentAttachmentSelector";
import type { RequirementCandidate, RequirementCandidateGroup, DocumentAttachment } from "../types";

const statusLabels: Record<RequirementCandidate["status"], { label: string; className: string }> = {
  pending: { label: "Pending", className: "status-pending" },
  accepted: { label: "Accepted", className: "status-accepted" },
  rejected: { label: "Rejected", className: "status-rejected" }
};

export function AirGenRoute(): JSX.Element {
  const { state } = useTenantProject();
  const api = useApiClient();
  const queryClient = useQueryClient();

  const [instruction, setInstruction] = useState("");
  const [glossary, setGlossary] = useState("");
  const [constraints, setConstraints] = useState("");
  const [count, setCount] = useState(5);
  const [attachedDocuments, setAttachedDocuments] = useState<DocumentAttachment[]>([]);
  const [selectedCandidate, setSelectedCandidate] = useState<RequirementCandidate | null>(null);
  const [showAcceptModal, setShowAcceptModal] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');
  const [textFilter, setTextFilter] = useState('');

  const tenant = state.tenant ?? "";
  const project = state.project ?? "";

  const candidatesQuery = useQuery({
    queryKey: ["airgen", "candidates", "grouped", tenant, project],
    queryFn: () => api.listRequirementCandidatesGrouped(tenant, project),
    enabled: Boolean(tenant && project)
  });

  const chatMutation = useMutation({
    mutationFn: async () => {
      if (!tenant || !project) throw new Error("Select a tenant and project first");
      if (!instruction.trim()) throw new Error("Enter a stakeholder instruction");
      return api.airgenChat({
        tenant,
        projectKey: project,
        user_input: instruction.trim(),
        glossary: glossary.trim() || undefined,
        constraints: constraints.trim() || undefined,
        n: count,
        attachedDocuments: attachedDocuments.length > 0 ? attachedDocuments : undefined
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["airgen", "candidates", "grouped", tenant, project] });
      setInstruction("");
    }
  });

  const rejectMutation = useMutation({
    mutationFn: async (candidate: RequirementCandidate) => {
      if (!tenant || !project) throw new Error("Select a tenant/project first");
      return api.rejectRequirementCandidate(candidate.id, {
        tenant,
        projectKey: project
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["airgen", "candidates", "grouped", tenant, project] });
    }
  });

  const returnMutation = useMutation({
    mutationFn: async (candidate: RequirementCandidate) => {
      if (!tenant || !project) throw new Error("Select a tenant/project first");
      return api.returnRequirementCandidate(candidate.id, {
        tenant,
        projectKey: project
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["airgen", "candidates", "grouped", tenant, project] });
    }
  });

  const candidateGroups = useMemo(() => {
    let groups = candidatesQuery.data?.groups ?? [];

    if (textFilter.trim()) {
      const filterText = textFilter.toLowerCase();
      groups = groups.filter(group => {
        const promptMatch = group.prompt?.toLowerCase().includes(filterText);
        const candidateMatch = group.candidates.some(candidate =>
          candidate.text.toLowerCase().includes(filterText)
        );
        return promptMatch || candidateMatch;
      });
    }

    const sortedGroups = [...groups].sort((a, b) => {
      const aTime = new Date(a.candidates[0]?.createdAt || 0).getTime();
      const bTime = new Date(b.candidates[0]?.createdAt || 0).getTime();
      return sortOrder === 'newest' ? bTime - aTime : aTime - bTime;
    });

    return sortedGroups;
  }, [candidatesQuery.data, textFilter, sortOrder]);

  useEffect(() => {
    if (candidateGroups.length > 1) {
      const groupsToCollapse = candidateGroups.slice(1).map(group => group.sessionId);
      setCollapsedGroups(new Set(groupsToCollapse));
    } else if (candidateGroups.length === 1) {
      setCollapsedGroups(new Set());
    }
  }, [candidateGroups]);

  const toggleGroupCollapse = (sessionId: string) => {
    setCollapsedGroups(prev => {
      const newSet = new Set(prev);
      if (newSet.has(sessionId)) {
        newSet.delete(sessionId);
      } else {
        newSet.add(sessionId);
      }
      return newSet;
    });
  };

  const handleAcceptClick = (candidate: RequirementCandidate) => {
    setSelectedCandidate(candidate);
    setShowAcceptModal(true);
  };

  const handleRejectClick = (candidate: RequirementCandidate) => {
    rejectMutation.mutate(candidate);
  };

  const handleReturnClick = (candidate: RequirementCandidate) => {
    returnMutation.mutate(candidate);
  };

  const handleGenerate = (event: React.FormEvent) => {
    event.preventDefault();
    chatMutation.mutate();
  };

  const disabled = !tenant || !project;

  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <h1>AIRGen</h1>
          {tenant && project ? (
            <p>
              {tenant} / {project}
            </p>
          ) : (
            <p>Select a tenant and project to begin drafting requirements.</p>
          )}
        </div>
      </div>

      <div className="airgen-layout">
        <section className="airgen-chat">
          <h2>Generate candidate requirements</h2>
          <form className="airgen-form" onSubmit={handleGenerate}>
            <label htmlFor="instruction">Stakeholder instruction</label>
            <textarea
              id="instruction"
              value={instruction}
              onChange={event => setInstruction(event.target.value)}
              placeholder="Describe the stakeholder need or scenario..."
              rows={4}
            />

            <label htmlFor="glossary">Glossary (optional)</label>
            <textarea
              id="glossary"
              value={glossary}
              onChange={event => setGlossary(event.target.value)}
              placeholder="List key terms and definitions..."
              rows={3}
            />

            <label htmlFor="constraints">Constraints (optional)</label>
            <textarea
              id="constraints"
              value={constraints}
              onChange={event => setConstraints(event.target.value)}
              placeholder="Document assumptions, limits, certification targets, etc."
              rows={3}
            />

            <label htmlFor="count">Number of candidates</label>
            <input
              id="count"
              type="number"
              min={1}
              max={10}
              value={count}
              onChange={event => setCount(Number(event.target.value) || 1)}
            />

            <DocumentAttachmentSelector
              tenant={tenant}
              project={project}
              attachments={attachedDocuments}
              onAttachmentsChange={setAttachedDocuments}
            />

            <button type="submit" disabled={disabled || chatMutation.isPending}>
              {chatMutation.isPending ? "Generating…" : "Generate requirements"}
            </button>
          </form>
        </section>

        <section className="airgen-results">
          <header className="results-header">
            <h2>Candidate requirements</h2>
            <div className="results-actions">
              <input
                type="search"
                placeholder="Filter by text"
                value={textFilter}
                onChange={event => setTextFilter(event.target.value)}
                aria-label="Filter candidates"
              />
              <select
                value={sortOrder}
                onChange={event => setSortOrder(event.target.value as 'newest' | 'oldest')}
              >
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
              </select>
            </div>
          </header>

          {candidatesQuery.isLoading && (
            <div className="results-loading">
              <Spinner />
              <p className="hint">Loading candidates…</p>
            </div>
          )}

          {candidatesQuery.isError && (
            <ErrorState message={(candidatesQuery.error as Error)?.message ?? "Unknown error"} />
          )}

          {!candidatesQuery.isLoading && !disabled && candidateGroups.length === 0 && !textFilter && (
            <p className="hint">No candidates yet. Generate requirements to populate this list.</p>
          )}
          {!candidatesQuery.isLoading && !disabled && candidateGroups.length === 0 && textFilter && (
            <p className="hint">No groups match your filter. Try a different search term.</p>
          )}
          {!candidatesQuery.isLoading && !disabled && candidateGroups.length > 0 && textFilter && (
            <p className="filter-results">Showing {candidateGroups.length} group{candidateGroups.length !== 1 ? 's' : ''} matching "{textFilter}"</p>
          )}

          <div className="candidate-groups">
            {candidateGroups.map(group => {
              const isCollapsed = collapsedGroups.has(group.sessionId);
              const groupTitle = group.prompt || `Session ${group.sessionId}`;
              const displayTitle = group.sessionId === 'ungrouped' ? 'Previous Requirements' : groupTitle;

              return (
                <div key={group.sessionId} className="candidate-group">
                  <div className="group-header" onClick={() => toggleGroupCollapse(group.sessionId)}>
                    <h3 className="group-title">
                      {isCollapsed ? '▶' : '▼'} {displayTitle} ({group.count})
                    </h3>
                  </div>

                  {!isCollapsed && (
                    <div className="candidate-list">
                      {group.candidates.map(candidate => {
                        const status = statusLabels[candidate.status];
                        return (
                          <article key={candidate.id} className={`candidate-card ${status.className}`}>
                            <header className="candidate-header">
                              <span className="candidate-status">{status.label}</span>
                              {candidate.requirementRef && (
                                <span className="candidate-ref">{candidate.requirementRef}</span>
                              )}
                            </header>
                            <p className="candidate-text">{candidate.text}</p>
                            <div className="candidate-meta">
                              <span>
                                <strong>Score:</strong> {candidate.qa.score ?? "—"}
                              </span>
                              <span>
                                <strong>Verdict:</strong> {candidate.qa.verdict ?? "—"}
                              </span>
                            </div>
                            {candidate.qa.suggestions.length > 0 && (
                              <details>
                                <summary>Suggestions ({candidate.qa.suggestions.length})</summary>
                                <ul>
                                  {candidate.qa.suggestions.map((suggestion, index) => (
                                    <li key={index}>{suggestion}</li>
                                  ))}
                                </ul>
                              </details>
                            )}
                            {candidate.status === "pending" && (
                              <div className="candidate-actions">
                                <button type="button" onClick={() => handleAcceptClick(candidate)}>
                                  Accept
                                </button>
                                <button
                                  type="button"
                                  className="candidate-reject"
                                  onClick={() => handleRejectClick(candidate)}
                                  disabled={rejectMutation.isPending}
                                >
                                  {rejectMutation.isPending ? "Rejecting…" : "Reject"}
                                </button>
                              </div>
                            )}
                            {candidate.status === "accepted" && candidate.requirementRef && (
                              <p className="candidate-note">Added to requirements as {candidate.requirementRef}.</p>
                            )}
                            {candidate.status === "rejected" && (
                              <div className="candidate-actions">
                                <button
                                  type="button"
                                  className="candidate-return"
                                  onClick={() => handleReturnClick(candidate)}
                                  disabled={returnMutation.isPending}
                                >
                                  {returnMutation.isPending ? "Returning…" : "Return to candidates"}
                                </button>
                              </div>
                            )}
                          </article>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      </div>

      <AcceptCandidateModal
        isOpen={showAcceptModal}
        candidate={selectedCandidate}
        tenant={tenant}
        project={project}
        onClose={() => {
          setShowAcceptModal(false);
          setSelectedCandidate(null);
        }}
        onAccepted={() => {
          setSelectedCandidate(null);
          queryClient.invalidateQueries({ queryKey: ["airgen", "candidates", "grouped", tenant, project] });
        }}
      />
    </div>
  );
}
