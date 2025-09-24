import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTenantProject } from "../hooks/useTenantProject";
import { useApiClient } from "../lib/client";
import { Spinner } from "../components/Spinner";
import { ErrorState } from "../components/ErrorState";
import { Modal, TextInput, Select, TextArea, Button } from "../components/Modal";
import { CreateDocumentModal } from "../components/CreateDocumentModal";
import { AddSectionModal } from "../components/AddSectionModal";
import { EditDocumentModal } from "../components/EditDocumentModal";
import { EditSectionModal } from "../components/EditSectionModal";
import type {
  RequirementCandidate,
  RequirementCandidateGroup,
  RequirementPattern,
  VerificationMethod,
  DocumentRecord,
  DocumentSectionRecord
} from "../types";

const patternOptions: Array<{ value: RequirementPattern; label: string }> = [
  { value: "ubiquitous", label: "Ubiquitous" },
  { value: "event", label: "Event" },
  { value: "state", label: "State" },
  { value: "unwanted", label: "Unwanted" },
  { value: "optional", label: "Optional" }
];

const verificationOptions: Array<{ value: VerificationMethod; label: string }> = [
  { value: "Test", label: "Test" },
  { value: "Analysis", label: "Analysis" },
  { value: "Inspection", label: "Inspection" },
  { value: "Demonstration", label: "Demonstration" }
];

function summarize(text: string): string {
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (trimmed.length <= 80) return trimmed;
  return `${trimmed.slice(0, 77).trim()}…`;
}

function defaultTitle(text: string): string {
  const summary = summarize(text);
  return summary.replace(/shall/i, "shall");
}

type AcceptCandidateModalProps = {
  isOpen: boolean;
  candidate: RequirementCandidate | null;
  tenant: string;
  project: string;
  onClose: () => void;
  onAccepted: () => void;
};

function AcceptCandidateModal({
  isOpen,
  candidate,
  tenant,
  project,
  onClose,
  onAccepted
}: AcceptCandidateModalProps): JSX.Element | null {
  const api = useApiClient();
  const queryClient = useQueryClient();

  const [title, setTitle] = useState("");
  const [pattern, setPattern] = useState<string>("");
  const [verification, setVerification] = useState<string>("");
  const [documentSlug, setDocumentSlug] = useState<string>("");
  const [sectionId, setSectionId] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [showCreateDocument, setShowCreateDocument] = useState(false);
  const [showAddSection, setShowAddSection] = useState(false);
  const [showEditDocument, setShowEditDocument] = useState(false);
  const [showEditSection, setShowEditSection] = useState(false);
  const [editingDocument, setEditingDocument] = useState<DocumentRecord | null>(null);
  const [editingSection, setEditingSection] = useState<DocumentSectionRecord | null>(null);

  const documentsQuery = useQuery({
    queryKey: ["documents", tenant, project],
    queryFn: () => api.listDocuments(tenant, project),
    enabled: isOpen && Boolean(tenant && project)
  });

  const sectionsQuery = useQuery({
    queryKey: ["sections", tenant, project, documentSlug],
    queryFn: () => api.listDocumentSections(tenant, project, documentSlug),
    enabled: isOpen && Boolean(tenant && project && documentSlug)
  });

  const createSectionMutation = useMutation({
    mutationFn: async (payload: { name: string; description: string; shortCode?: string }) => {
      if (!documentSlug) {
        throw new Error("Select a document before adding a section.");
      }
      const order = sectionsQuery.data?.sections.length ?? 0;
      const result = await api.createDocumentSection({
        tenant,
        projectKey: project,
        documentSlug,
        name: payload.name,
        description: payload.description || undefined,
        shortCode: payload.shortCode,
        order
      });
      return result.section;
    },
    onSuccess: section => {
      queryClient.invalidateQueries({ queryKey: ["sections", tenant, project, documentSlug] });
      setSectionId(section.id);
      setShowAddSection(false);
      setError(null);
    },
    onError: (err: Error) => {
      setError(err.message);
    }
  });

  const acceptMutation = useMutation({
    mutationFn: async () => {
      if (!candidate) {
        throw new Error("No candidate selected");
      }
      setError(null);
      return api.acceptRequirementCandidate(candidate.id, {
        tenant,
        projectKey: project,
        title: title.trim(),
        pattern: pattern ? (pattern as RequirementPattern) : undefined,
        verification: verification ? (verification as VerificationMethod) : undefined,
        documentSlug: documentSlug || undefined,
        sectionId: sectionId || undefined
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["airgen", "candidates", "grouped", tenant, project] });
      queryClient.invalidateQueries({ queryKey: ["requirements", tenant, project] });
      if (documentSlug) {
        queryClient.invalidateQueries({ queryKey: ["documents", tenant, project] });
        queryClient.invalidateQueries({ queryKey: ["sections", tenant, project, documentSlug] });
      }
      onAccepted();
      onClose();
    },
    onError: (err: Error) => {
      setError(err.message);
    }
  });

  useEffect(() => {
    if (isOpen && candidate) {
      setTitle(defaultTitle(candidate.text));
      setPattern("");
      setVerification("");
      setDocumentSlug(candidate.documentSlug ?? "");
      setSectionId(candidate.sectionId ?? "");
      setError(null);
    }
    if (!isOpen) {
      setShowCreateDocument(false);
      setShowAddSection(false);
    }
  }, [isOpen, candidate]);

  const documents = documentsQuery.data?.documents ?? [];
  const sections = sectionsQuery.data?.sections ?? [];

  const footer = (
    <>
      <Button variant="secondary" onClick={onClose}>
        Cancel
      </Button>
      <Button
        type="submit"
        loading={acceptMutation.isPending}
        onClick={() => acceptMutation.mutate()}
        disabled={!title.trim()}
      >
        Accept requirement
      </Button>
    </>
  );

  return (
    <>
      <Modal
        isOpen={isOpen && Boolean(candidate)}
        onClose={onClose}
        title="Accept candidate requirement"
        subtitle="Review metadata and choose where the requirement should live"
        size="large"
        footer={footer}
      >
        {candidate && (
          <div className="accept-modal">
            <section className="accept-preview">
              <h3>Candidate requirement</h3>
              <p>{candidate.text}</p>
              <div className="accept-qa">
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
            </section>

            <form className="accept-form" onSubmit={event => event.preventDefault()}>
              <TextInput
                label="Requirement title"
                value={title}
                onChange={event => setTitle(event.target.value)}
                required
                placeholder="Short title for the requirement"
              />

              <div className="accept-grid">
                <Select
                  label="Pattern"
                  value={pattern}
                  onChange={event => setPattern(event.target.value)}
                  options={patternOptions}
                  placeholder="Select pattern"
                />
                <Select
                  label="Verification"
                  value={verification}
                  onChange={event => setVerification(event.target.value)}
                  options={verificationOptions}
                  placeholder="Select method"
                />
              </div>

              <Select
                label="Document"
                value={documentSlug}
                onChange={event => {
                  setDocumentSlug(event.target.value);
                  setSectionId("");
                }}
                options={documents.map((doc: DocumentRecord) => ({
                  value: doc.slug,
                  label: doc.name
                }))}
                placeholder="Select target document"
                help="Create a new document if needed"
              />

              <div className="accept-actions">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setShowCreateDocument(true)}
                  disabled={!tenant || !project}
                >
                  New document
                </Button>
                {documentSlug && documents.length > 0 && (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      const selectedDoc = documents.find(d => d.slug === documentSlug);
                      if (selectedDoc) handleEditDocumentClick(selectedDoc);
                    }}
                  >
                    Edit document
                  </Button>
                )}
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setShowAddSection(true)}
                  disabled={!documentSlug}
                >
                  New section
                </Button>
                {sectionId && sections.length > 0 && (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      const selectedSection = sections.find(s => s.id === sectionId);
                      if (selectedSection) handleEditSectionClick(selectedSection);
                    }}
                  >
                    Edit section
                  </Button>
                )}
              </div>

              <Select
                label="Section"
                value={sectionId}
                onChange={event => setSectionId(event.target.value)}
                options={sections.map((section: DocumentSectionRecord) => ({
                  value: section.id,
                  label: section.name
                }))}
                placeholder={documentSlug ? "Select section" : "Select a document first"}
                disabled={!documentSlug || sections.length === 0}
              />

              {error && <p className="accept-error">{error}</p>}
            </form>
          </div>
        )}
      </Modal>

      {tenant && project && (
        <CreateDocumentModal
          isOpen={showCreateDocument}
          tenant={tenant}
          project={project}
          onClose={() => setShowCreateDocument(false)}
          onCreated={slug => {
            queryClient.invalidateQueries({ queryKey: ["documents", tenant, project] });
            setDocumentSlug(slug);
            setShowCreateDocument(false);
          }}
        />
      )}

      <AddSectionModal
        isOpen={showAddSection}
        onClose={() => setShowAddSection(false)}
        onAdd={({ name, description, shortCode }) =>
          createSectionMutation.mutate({
            name,
            description,
            shortCode
          })
        }
      />

      {tenant && project && (
        <EditDocumentModal
          isOpen={showEditDocument}
          tenant={tenant}
          project={project}
          document={editingDocument}
          onClose={() => {
            setShowEditDocument(false);
            setEditingDocument(null);
          }}
          onUpdated={() => {
            // Refresh the current section list if document's shortCode changed
            if (documentSlug) {
              sectionsQuery.refetch();
            }
          }}
        />
      )}

      {tenant && project && (
        <EditSectionModal
          isOpen={showEditSection}
          tenant={tenant}
          project={project}
          documentSlug={documentSlug}
          section={editingSection}
          onClose={() => {
            setShowEditSection(false);
            setEditingSection(null);
          }}
          onUpdated={() => {
            // Refresh sections and requirements
            sectionsQuery.refetch();
          }}
        />
      )}
    </>
  );
}

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
        n: count
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
    
    // Apply text filter
    if (textFilter.trim()) {
      const filterText = textFilter.toLowerCase();
      groups = groups.filter(group => {
        // Filter by prompt or candidate text
        const promptMatch = group.prompt?.toLowerCase().includes(filterText);
        const candidateMatch = group.candidates.some(candidate => 
          candidate.text.toLowerCase().includes(filterText)
        );
        return promptMatch || candidateMatch;
      });
    }
    
    // Apply sorting
    const sortedGroups = [...groups].sort((a, b) => {
      const aTime = new Date(a.candidates[0]?.createdAt || 0).getTime();
      const bTime = new Date(b.candidates[0]?.createdAt || 0).getTime();
      return sortOrder === 'newest' ? bTime - aTime : aTime - bTime;
    });
    
    return sortedGroups;
  }, [candidatesQuery.data, textFilter, sortOrder]);

  // Auto-collapse older groups, keep only the most recent group expanded
  useEffect(() => {
    if (candidateGroups.length > 1) {
      const groupsToCollapse = candidateGroups.slice(1).map(group => group.sessionId);
      setCollapsedGroups(new Set(groupsToCollapse));
    } else if (candidateGroups.length === 1) {
      // If there's only one group, make sure it's expanded
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

  const handleEditDocumentClick = (document: DocumentRecord) => {
    setEditingDocument(document);
    setShowEditDocument(true);
  };

  const handleEditSectionClick = (section: DocumentSectionRecord) => {
    setEditingSection(section);
    setShowEditSection(true);
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
            <label className="airgen-label" htmlFor="airgen-input">
              Stakeholder instruction
            </label>
            <textarea
              id="airgen-input"
              value={instruction}
              onChange={event => setInstruction(event.target.value)}
              rows={6}
              placeholder="Describe the stakeholder need or instruction..."
              disabled={disabled}
            />

            <div className="airgen-grid">
              <label className="airgen-label">
                Count
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={count}
                  onChange={event => setCount(Number(event.target.value) || 1)}
                  disabled={disabled}
                />
              </label>
              <label className="airgen-label">
                Glossary (optional)
                <textarea
                  value={glossary}
                  onChange={event => setGlossary(event.target.value)}
                  rows={2}
                  disabled={disabled}
                />
              </label>
              <label className="airgen-label">
                Constraints (optional)
                <textarea
                  value={constraints}
                  onChange={event => setConstraints(event.target.value)}
                  rows={2}
                  disabled={disabled}
                />
              </label>
            </div>

            <div className="airgen-actions">
              <button type="submit" disabled={disabled || chatMutation.isPending}>
                {chatMutation.isPending ? "Generating…" : "Generate candidates"}
              </button>
              <button
                type="button"
                onClick={() => candidatesQuery.refetch()}
                disabled={disabled || candidatesQuery.isFetching}
              >
                Refresh
              </button>
            </div>

            {chatMutation.isError && (
              <p className="airgen-error">{(chatMutation.error as Error).message}</p>
            )}
          </form>
        </section>

        <section className="airgen-candidates">
          <h2>
            Candidate requirements
            {!disabled && candidateGroups.length > 0 && !textFilter && (
              <span className="group-count"> ({candidateGroups.length} group{candidateGroups.length !== 1 ? 's' : ''})</span>
            )}
          </h2>
          
          {!disabled && (
            <div className="candidates-controls">
              <div className="filter-controls">
                <input
                  type="text"
                  placeholder="Filter by text..."
                  value={textFilter}
                  onChange={(e) => setTextFilter(e.target.value)}
                  className="text-filter"
                />
                <select
                  value={sortOrder}
                  onChange={(e) => setSortOrder(e.target.value as 'newest' | 'oldest')}
                  className="sort-select"
                >
                  <option value="newest">Newest first</option>
                  <option value="oldest">Oldest first</option>
                </select>
              </div>
              {textFilter && (
                <button
                  type="button"
                  onClick={() => setTextFilter('')}
                  className="clear-filter"
                >
                  Clear filter
                </button>
              )}
            </div>
          )}
          
          {disabled && <p className="hint">Select a tenant/project to view candidates.</p>}
          {candidatesQuery.isLoading && <Spinner />}
          {candidatesQuery.isError && (
            <ErrorState message={(candidatesQuery.error as Error).message} />
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
