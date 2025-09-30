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
    <div className="min-h-screen bg-gray-50">
      <div className="airgen-container">
        <header className="airgen-header">
          <div className="header-content">
            <h1 className="header-title">AIRGen</h1>
            {tenant && project ? (
              <p className="header-subtitle">
                {tenant} / {project}
              </p>
            ) : (
              <p className="header-subtitle">Select a tenant and project to begin drafting requirements.</p>
            )}
          </div>
        </header>

        <div className="airgen-layout">
        <section className="airgen-chat">
          <div className="chat-card">
            <div className="mode-selector">
              <h2 className="section-title">AIRGen Mode</h2>
              <div className="mode-options">
                <label className="mode-option">
                  <input
                    type="radio"
                    name="mode"
                    value="requirements"
                    checked={mode === 'requirements'}
                    onChange={(e) => setMode(e.target.value as 'requirements' | 'diagram')}
                  />
                  <span>Requirements</span>
                </label>
                <label className="mode-option">
                  <input
                    type="radio"
                    name="mode"
                    value="diagram"
                    checked={mode === 'diagram'}
                    onChange={(e) => setMode(e.target.value as 'requirements' | 'diagram')}
                  />
                  <span>Diagram</span>
                </label>
              </div>
            </div>
            
            <div className="form-section">
              <h2 className="form-title">{mode === 'requirements' ? 'Generate candidate requirements' : 'Generate candidate diagram'}</h2>
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
            </div>
          </div>
        </section>

        <section className="airgen-results">
          <div className="results-card">
            <header className="results-header">
              <h2 className="results-title">{mode === 'requirements' ? 'Candidate requirements' : 'Candidate diagrams'}</h2>
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
          </div>
        </section>
        </div>
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
        /* Main Container */
        .airgen-container {
          max-width: 1400px;
          margin: 0 auto;
          padding: 0 24px;
        }
        
        /* Header */
        .airgen-header {
          background: white;
          border-bottom: 1px solid #e2e8f0;
          margin-bottom: 32px;
          padding: 24px 0;
        }
        
        .header-content {
          max-width: 100%;
        }
        
        .header-title {
          font-size: 32px;
          font-weight: 700;
          color: #1e293b;
          margin: 0 0 8px 0;
          letter-spacing: -0.025em;
        }
        
        .header-subtitle {
          font-size: 16px;
          color: #64748b;
          margin: 0;
          font-weight: 500;
        }
        
        /* Two Column Layout */
        .airgen-layout {
          display: grid;
          grid-template-columns: 380px 1fr;
          gap: 28px;
          align-items: start;
          min-height: calc(100vh - 200px);
        }
        
        /* Left Column - Input Form */
        .airgen-chat {
          position: sticky;
          top: 20px;
        }
        
        .chat-card {
          background: white;
          border-radius: 12px;
          border: 1px solid #e2e8f0;
          box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06);
          overflow: hidden;
        }
        
        /* Mode Selector */
        .mode-selector {
          padding: 20px;
          background: #f8fafc;
          border-bottom: 1px solid #e2e8f0;
        }
        
        .section-title {
          font-size: 15px;
          font-weight: 600;
          color: #1e293b;
          margin: 0 0 12px 0;
        }
        
        .mode-options {
          display: flex;
          gap: 12px;
        }
        
        .mode-option {
          display: flex;
          align-items: center;
          gap: 6px;
          cursor: pointer;
          padding: 6px 10px;
          border-radius: 6px;
          transition: all 0.2s ease;
          background: white;
          border: 1px solid #e2e8f0;
          flex: 1;
          justify-content: center;
        }
        
        .mode-option:hover {
          background: #f1f5f9;
          border-color: #cbd5e1;
        }
        
        .mode-option input[type="radio"] {
          margin: 0;
          accent-color: #3b82f6;
        }
        
        .mode-option span {
          font-weight: 500;
          color: #475569;
          font-size: 13px;
        }
        
        /* Form Section */
        .form-section {
          padding: 20px;
        }
        
        .form-title {
          font-size: 16px;
          font-weight: 600;
          color: #1e293b;
          margin: 0 0 18px 0;
        }
        
        .airgen-form {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        
        .airgen-form .space-y-2 {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        
        .airgen-form label {
          font-size: 13px;
          font-weight: 500;
          color: #374151;
        }
        
        .airgen-form textarea {
          min-height: 70px;
          resize: vertical;
        }
        
        .airgen-form input[type="number"] {
          width: 80px;
        }
        
        /* Right Column - Results */
        .airgen-results {
          min-height: 600px;
        }
        
        .results-card {
          background: white;
          border-radius: 12px;
          border: 1px solid #e2e8f0;
          box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06);
          overflow: hidden;
        }
        
        .results-header {
          padding: 24px;
          border-bottom: 1px solid #e2e8f0;
          background: #f8fafc;
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 16px;
        }
        
        .results-title {
          font-size: 18px;
          font-weight: 600;
          color: #1e293b;
          margin: 0;
        }
        
        .results-actions {
          display: flex;
          gap: 12px;
          align-items: center;
        }
        
        .results-loading {
          padding: 48px 24px;
          text-align: center;
          color: #64748b;
        }
        
        .filter-results {
          padding: 16px 24px;
          background: #fef3c7;
          border-bottom: 1px solid #f59e0b;
          color: #92400e;
          font-size: 14px;
          font-weight: 500;
        }
        
        /* Candidate Groups */
        .candidate-groups {
          padding: 24px;
        }
        
        .candidate-group {
          margin-bottom: 32px;
        }
        
        .candidate-group:last-child {
          margin-bottom: 0;
        }
        
        .group-header {
          cursor: pointer;
          padding: 16px 20px;
          background: #f1f5f9;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          margin-bottom: 16px;
          transition: all 0.2s ease;
        }
        
        .group-header:hover {
          background: #e2e8f0;
        }
        
        .group-title {
          font-size: 16px;
          font-weight: 600;
          color: #1e293b;
          margin: 0;
        }
        
        .candidate-list {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        
        /* Candidate Cards */
        .candidate-card {
          background: white;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          padding: 20px;
          transition: all 0.2s ease;
        }
        
        .candidate-card:hover {
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
        }
        
        .candidate-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
        }
        
        .candidate-status {
          padding: 4px 12px;
          border-radius: 12px;
          font-size: 12px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.025em;
        }
        
        .status-pending .candidate-status {
          background: #fef3c7;
          color: #92400e;
        }
        
        .status-accepted .candidate-status {
          background: #d1fae5;
          color: #065f46;
        }
        
        .status-rejected .candidate-status {
          background: #fee2e2;
          color: #991b1b;
        }
        
        .candidate-ref {
          font-family: ui-monospace, 'Cascadia Code', 'Source Code Pro', Menlo, Consolas, 'DejaVu Sans Mono', monospace;
          background: #f1f5f9;
          color: #475569;
          padding: 4px 8px;
          border-radius: 4px;
          font-size: 12px;
          font-weight: 500;
        }
        
        .candidate-text {
          color: #1e293b;
          font-size: 15px;
          line-height: 1.6;
          margin: 0 0 16px 0;
        }
        
        .candidate-meta {
          display: flex;
          gap: 24px;
          margin-bottom: 16px;
          font-size: 13px;
          color: #64748b;
        }
        
        .candidate-actions {
          display: flex;
          gap: 8px;
          margin-top: 16px;
        }
        
        .candidate-actions button {
          padding: 8px 16px;
          border-radius: 6px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s ease;
          border: 1px solid;
        }
        
        .candidate-actions button:first-child {
          background: #3b82f6;
          color: white;
          border-color: #3b82f6;
        }
        
        .candidate-actions button:first-child:hover {
          background: #2563eb;
          border-color: #2563eb;
        }
        
        .candidate-reject {
          background: white;
          color: #dc2626;
          border-color: #dc2626;
        }
        
        .candidate-reject:hover {
          background: #dc2626;
          color: white;
        }
        
        .candidate-return {
          background: white;
          color: #059669;
          border-color: #059669;
        }
        
        .candidate-return:hover {
          background: #059669;
          color: white;
        }
        
        .candidate-note {
          background: #f0f9ff;
          border: 1px solid #bae6fd;
          color: #0c4a6e;
          padding: 12px;
          border-radius: 6px;
          font-size: 14px;
          margin-top: 16px;
        }
        
        /* Diagram Specific Styles */
        .diagram-candidates {
          padding: 24px;
          display: flex;
          flex-direction: column;
          gap: 24px;
        }
        
        .diagram-info h3 {
          font-size: 18px;
          font-weight: 600;
          color: #1e293b;
          margin: 0 0 8px 0;
        }
        
        .diagram-description {
          color: #64748b;
          font-size: 14px;
          margin: 0 0 12px 0;
          line-height: 1.5;
        }
        
        .diagram-meta {
          display: flex;
          gap: 20px;
          flex-wrap: wrap;
          margin-bottom: 16px;
          font-size: 13px;
        }
        
        .diagram-meta span {
          color: #475569;
        }
        
        .diagram-action {
          background: #f1f5f9;
          color: #475569;
          padding: 4px 8px;
          border-radius: 4px;
          font-size: 11px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.025em;
        }
        
        .diagram-reasoning {
          margin-bottom: 20px;
        }
        
        .diagram-reasoning details {
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          padding: 16px;
        }
        
        .diagram-reasoning summary {
          cursor: pointer;
          font-weight: 500;
          color: #475569;
          margin-bottom: 12px;
          user-select: none;
        }
        
        .diagram-reasoning p {
          margin: 0;
          color: #64748b;
          font-size: 14px;
          line-height: 1.6;
        }
        
        .diagram-preview {
          margin: 20px 0;
          border-radius: 8px;
          overflow: hidden;
          border: 1px solid #e2e8f0;
        }
        
        .hint {
          color: #64748b;
          font-style: italic;
          text-align: center;
          padding: 48px 24px;
        }
        
        /* Responsive Design */
        @media (max-width: 1200px) {
          .airgen-layout {
            grid-template-columns: 340px 1fr;
            gap: 20px;
          }
        }
        
        @media (max-width: 1024px) {
          .airgen-layout {
            grid-template-columns: 1fr;
            gap: 20px;
          }
          
          .airgen-chat {
            position: static;
          }
          
          .mode-selector {
            padding: 16px;
          }
          
          .form-section {
            padding: 16px;
          }
        }
        
        @media (max-width: 768px) {
          .airgen-container {
            padding: 0 16px;
          }
          
          .results-header {
            flex-direction: column;
            align-items: stretch;
          }
          
          .results-actions {
            justify-content: stretch;
          }
          
          .candidate-meta {
            flex-direction: column;
            gap: 8px;
          }
        }
      `}</style>
    </div>
  );
}
