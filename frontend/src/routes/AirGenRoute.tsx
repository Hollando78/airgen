import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTenantProject } from "../hooks/useTenantProject";
import { useApiClient } from "../lib/client";
import { Spinner } from "../components/Spinner";
import { ErrorState } from "../components/ErrorState";
import { AcceptCandidateModal } from "../components/AirGen/AcceptCandidateModal";
import { DocumentAttachmentSelector } from "../components/DocumentAttachmentSelector";
import { DiagramAttachmentSelector } from "../components/DiagramAttachmentSelector";
import { DiagramCandidatePreview } from "../components/DiagramCandidatePreview";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Label } from "../components/ui/label";
import type { RequirementCandidate, RequirementCandidateGroup, DocumentAttachment, DiagramAttachment, DiagramCandidate } from "../types";

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
  const [attachedDiagrams, setAttachedDiagrams] = useState<DiagramAttachment[]>([]);
  const [selectedCandidate, setSelectedCandidate] = useState<RequirementCandidate | null>(null);
  const [showAcceptModal, setShowAcceptModal] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');
  const [textFilter, setTextFilter] = useState('');
  const [mode, setMode] = useState<'requirements' | 'diagram'>('requirements');

  const tenant = state.tenant ?? "";
  const project = state.project ?? "";

  const candidatesQuery = useQuery({
    queryKey: ["airgen", "candidates", "grouped", tenant, project],
    queryFn: () => api.listRequirementCandidatesGrouped(tenant, project),
    enabled: Boolean(tenant && project && mode === 'requirements')
  });

  const diagramCandidatesQuery = useQuery({
    queryKey: ["airgen", "diagram-candidates", tenant, project],
    queryFn: () => api.listDiagramCandidates(tenant, project),
    enabled: Boolean(tenant && project && mode === 'diagram')
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
        mode,
        attachedDocuments: attachedDocuments.length > 0 ? attachedDocuments : undefined,
        attachedDiagrams: attachedDiagrams.length > 0 ? attachedDiagrams : undefined
      });
    },
    onSuccess: () => {
      if (mode === 'requirements') {
        queryClient.invalidateQueries({ queryKey: ["airgen", "candidates", "grouped", tenant, project] });
      } else {
        queryClient.invalidateQueries({ queryKey: ["airgen", "diagram-candidates", tenant, project] });
      }
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

  const rejectDiagramMutation = useMutation({
    mutationFn: async (candidate: DiagramCandidate) => {
      if (!tenant || !project) throw new Error("Select a tenant/project first");
      return api.rejectDiagramCandidate(candidate.id, {
        tenant,
        projectKey: project
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["airgen", "diagram-candidates", tenant, project] });
    }
  });

  const returnDiagramMutation = useMutation({
    mutationFn: async (candidate: DiagramCandidate) => {
      if (!tenant || !project) throw new Error("Select a tenant/project first");
      return api.returnDiagramCandidate(candidate.id, {
        tenant,
        projectKey: project
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["airgen", "diagram-candidates", tenant, project] });
    }
  });

  const acceptDiagramMutation = useMutation({
    mutationFn: async (params: { candidate: DiagramCandidate; diagramName?: string; diagramDescription?: string }) => {
      if (!tenant || !project) throw new Error("Select a tenant/project first");
      return api.acceptDiagramCandidate(params.candidate.id, {
        tenant,
        projectKey: project,
        diagramName: params.diagramName,
        diagramDescription: params.diagramDescription
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["airgen", "diagram-candidates", tenant, project] });
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
          <div className="mode-selector">
            <h2>AIRGen Mode</h2>
            <div className="mode-options">
              <label className="mode-option">
                <input
                  type="radio"
                  name="mode"
                  value="requirements"
                  checked={mode === 'requirements'}
                  onChange={(e) => setMode(e.target.value as 'requirements' | 'diagram')}
                />
                Requirements
              </label>
              <label className="mode-option">
                <input
                  type="radio"
                  name="mode"
                  value="diagram"
                  checked={mode === 'diagram'}
                  onChange={(e) => setMode(e.target.value as 'requirements' | 'diagram')}
                />
                Diagram
              </label>
            </div>
          </div>
          
          <h2>{mode === 'requirements' ? 'Generate candidate requirements' : 'Generate candidate diagram'}</h2>
          <form className="airgen-form" onSubmit={handleGenerate}>
            <div className="space-y-2">
              <Label htmlFor="instruction">Stakeholder instruction</Label>
              <Textarea
                id="instruction"
                value={instruction}
                onChange={event => setInstruction(event.target.value)}
                placeholder="Describe the stakeholder need or scenario..."
                rows={4}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="glossary">Glossary (optional)</Label>
              <Textarea
                id="glossary"
                value={glossary}
                onChange={event => setGlossary(event.target.value)}
                placeholder="List key terms and definitions..."
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="constraints">Constraints (optional)</Label>
              <Textarea
                id="constraints"
                value={constraints}
                onChange={event => setConstraints(event.target.value)}
                placeholder="Document assumptions, limits, certification targets, etc."
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="count">Number of candidates</Label>
              <Input
                id="count"
                type="number"
                min={1}
                max={10}
                value={count}
                onChange={event => setCount(Number(event.target.value) || 1)}
              />
            </div>

            <DocumentAttachmentSelector
              tenant={tenant}
              project={project}
              attachments={attachedDocuments}
              onAttachmentsChange={setAttachedDocuments}
            />

            <DiagramAttachmentSelector
              tenant={tenant}
              project={project}
              attachments={attachedDiagrams}
              onAttachmentsChange={setAttachedDiagrams}
            />

            <Button type="submit" disabled={disabled || chatMutation.isPending} className="w-full">
              {chatMutation.isPending ? "Generating…" : mode === 'requirements' ? "Generate requirements" : "Generate diagram"}
            </Button>
          </form>
        </section>

        <section className="airgen-results">
          <header className="results-header">
            <h2>{mode === 'requirements' ? 'Candidate requirements' : 'Candidate diagrams'}</h2>
            <div className="results-actions">
              <Input
                type="search"
                placeholder="Filter by text"
                value={textFilter}
                onChange={event => setTextFilter(event.target.value)}
                aria-label="Filter candidates"
                className="max-w-xs"
              />
              <Select value={sortOrder} onValueChange={(value) => setSortOrder(value as 'newest' | 'oldest')}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="newest">Newest first</SelectItem>
                  <SelectItem value="oldest">Oldest first</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </header>

          {(mode === 'requirements' ? candidatesQuery.isLoading : diagramCandidatesQuery.isLoading) && (
            <div className="results-loading">
              <Spinner />
              <p className="hint">Loading candidates…</p>
            </div>
          )}

          {(mode === 'requirements' ? candidatesQuery.isError : diagramCandidatesQuery.isError) && (
            <ErrorState message={((mode === 'requirements' ? candidatesQuery.error : diagramCandidatesQuery.error) as Error)?.message ?? "Unknown error"} />
          )}

          {mode === 'requirements' && !candidatesQuery.isLoading && !disabled && candidateGroups.length === 0 && !textFilter && (
            <p className="hint">No candidates yet. Generate requirements to populate this list.</p>
          )}
          {mode === 'requirements' && !candidatesQuery.isLoading && !disabled && candidateGroups.length === 0 && textFilter && (
            <p className="hint">No groups match your filter. Try a different search term.</p>
          )}
          {mode === 'requirements' && !candidatesQuery.isLoading && !disabled && candidateGroups.length > 0 && textFilter && (
            <p className="filter-results">Showing {candidateGroups.length} group{candidateGroups.length !== 1 ? 's' : ''} matching "{textFilter}"</p>
          )}

          {mode === 'diagram' && !diagramCandidatesQuery.isLoading && !disabled && (diagramCandidatesQuery.data?.items.length ?? 0) === 0 && (
            <p className="hint">No diagram candidates yet. Generate diagrams to populate this list.</p>
          )}

          {mode === 'requirements' && (
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
          )}

          {mode === 'diagram' && (
            <div className="diagram-candidates">
              {diagramCandidatesQuery.data?.items.map(candidate => {
                const statusInfo = { 
                  pending: { label: "Pending", className: "status-pending" },
                  accepted: { label: "Accepted", className: "status-accepted" },
                  rejected: { label: "Rejected", className: "status-rejected" }
                }[candidate.status] || { label: "Unknown", className: "" };

                return (
                  <article key={candidate.id} className={`candidate-card ${statusInfo.className}`}>
                    <header className="candidate-header">
                      <span className="candidate-status">{statusInfo.label}</span>
                      <span className="diagram-action">{candidate.action}</span>
                    </header>
                    
                    <div className="diagram-info">
                      <h3>{candidate.diagramName || 'Untitled Diagram'}</h3>
                      {candidate.diagramDescription && (
                        <p className="diagram-description">{candidate.diagramDescription}</p>
                      )}
                      <div className="diagram-meta">
                        <span><strong>View:</strong> {candidate.diagramView}</span>
                        <span><strong>Blocks:</strong> {candidate.blocks.length}</span>
                        <span><strong>Connectors:</strong> {candidate.connectors.length}</span>
                      </div>
                    </div>

                    <div className="diagram-preview">
                      <DiagramCandidatePreview candidate={candidate} height={250} />
                    </div>

                    <div className="diagram-reasoning">
                      <details>
                        <summary>Design Reasoning</summary>
                        <p>{candidate.reasoning}</p>
                      </details>
                    </div>

                    {candidate.status === "pending" && (
                      <div className="candidate-actions">
                        <button 
                          type="button" 
                          onClick={() => acceptDiagramMutation.mutate({ candidate })}
                          disabled={acceptDiagramMutation.isPending}
                        >
                          {acceptDiagramMutation.isPending ? "Accepting…" : "Accept"}
                        </button>
                        <button
                          type="button"
                          className="candidate-reject"
                          onClick={() => rejectDiagramMutation.mutate(candidate)}
                          disabled={rejectDiagramMutation.isPending}
                        >
                          {rejectDiagramMutation.isPending ? "Rejecting…" : "Reject"}
                        </button>
                      </div>
                    )}

                    {candidate.status === "accepted" && (
                      <p className="candidate-note">Diagram has been accepted and created.</p>
                    )}

                    {candidate.status === "rejected" && (
                      <div className="candidate-actions">
                        <button
                          type="button"
                          className="candidate-return"
                          onClick={() => returnDiagramMutation.mutate(candidate)}
                          disabled={returnDiagramMutation.isPending}
                        >
                          {returnDiagramMutation.isPending ? "Returning…" : "Return to candidates"}
                        </button>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
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
      
      <style>{`
        .mode-selector {
          margin-bottom: 24px;
          padding: 16px;
          background: #f8fafc;
          border-radius: 8px;
          border: 1px solid #e2e8f0;
        }
        
        .mode-selector h2 {
          margin: 0 0 12px 0;
          font-size: 16px;
          font-weight: 600;
          color: #1e293b;
        }
        
        .mode-options {
          display: flex;
          gap: 16px;
        }
        
        .mode-option {
          display: flex;
          align-items: center;
          gap: 6px;
          cursor: pointer;
          font-weight: 500;
          color: #475569;
        }
        
        .mode-option input[type="radio"] {
          margin: 0;
        }
        
        .mode-option:hover {
          color: #1e293b;
        }
        
        .diagram-candidates {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        
        .diagram-info h3 {
          margin: 0 0 8px 0;
          font-size: 18px;
          font-weight: 600;
          color: #1e293b;
        }
        
        .diagram-description {
          margin: 0 0 12px 0;
          color: #64748b;
          font-size: 14px;
        }
        
        .diagram-meta {
          display: flex;
          gap: 16px;
          flex-wrap: wrap;
          margin-bottom: 12px;
          font-size: 13px;
        }
        
        .diagram-meta span {
          color: #475569;
        }
        
        .diagram-action {
          background: #f1f5f9;
          color: #475569;
          padding: 2px 8px;
          border-radius: 4px;
          font-size: 11px;
          font-weight: 500;
          text-transform: uppercase;
        }
        
        .diagram-reasoning {
          margin-bottom: 16px;
        }
        
        .diagram-reasoning details {
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 6px;
          padding: 12px;
        }
        
        .diagram-reasoning summary {
          cursor: pointer;
          font-weight: 500;
          color: #475569;
          margin-bottom: 8px;
        }
        
        .diagram-reasoning p {
          margin: 0;
          color: #64748b;
          font-size: 14px;
          line-height: 1.5;
        }
        
        .diagram-preview {
          margin: 16px 0;
          border-radius: 8px;
          overflow: hidden;
        }
      `}</style>
    </div>
  );
}
