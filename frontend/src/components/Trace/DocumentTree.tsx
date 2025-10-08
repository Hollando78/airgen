import { useEffect, useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "../../lib/client";
import { useTenantProject } from "../../hooks/useTenantProject";
import { Spinner } from "../Spinner";
import { ErrorState } from "../ErrorState";
import type { DocumentRecord, RequirementRecord, TraceLink } from "../../types";

export interface DocumentTreeProps {
  document: DocumentRecord | null;
  selectedRequirements: Set<string>;
  onRequirementSelect: (requirement: RequirementRecord, isMultiSelect: boolean) => void;
  onContextMenu: (requirement: RequirementRecord, event: React.MouseEvent) => void;
  onDragStart: (requirement: RequirementRecord) => void;
  onDragOver: (event: React.DragEvent) => void;
  onDragLeave: (event: React.DragEvent) => void;
  onDrop: (event: React.DragEvent, requirement: RequirementRecord) => void;
  onDropOnSection?: (event: React.DragEvent, sectionId: string, documentSlug: string) => void;
  traceLinks?: TraceLink[];
  documentSide?: "left" | "right";
  filter?: string;
}

export function DocumentTree({
  document,
  selectedRequirements,
  onRequirementSelect,
  onContextMenu,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDropOnSection,
  traceLinks = [],
  documentSide,
  filter = ""
}: DocumentTreeProps): JSX.Element {
  const api = useApiClient();
  const queryClient = useQueryClient();
  const { state } = useTenantProject();

  // State for inline editing
  const [editingRequirementId, setEditingRequirementId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // Use optimized endpoint that fetches sections with all requirements in a single query
  // This eliminates N+1 query problem: Before: 1 + N queries, After: 1 query (~97% reduction)
  const sectionsQuery = useQuery({
    queryKey: ["sections-with-relations", state.tenant, state.project, document?.slug],
    queryFn: () => (document ? api.listDocumentSectionsWithRelations(state.tenant!, state.project!, document.slug) : null),
    enabled: Boolean(state.tenant && state.project && document)
  });

  const handleRequirementClick = (requirement: RequirementRecord, event: React.MouseEvent) => {
    event.preventDefault();
    const isMultiSelect = event.ctrlKey || event.metaKey;
    onRequirementSelect(requirement, isMultiSelect);
  };

  const handleContextMenuInternal = (requirement: RequirementRecord, event: React.MouseEvent) => {
    event.preventDefault();
    onContextMenu(requirement, event);
  };

  const handleDoubleClick = useCallback((requirement: RequirementRecord, event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setEditingRequirementId(requirement.id);
    setEditText(requirement.text || "");
  }, []);

  const handleSaveEdit = useCallback(async (requirement: RequirementRecord) => {
    if (!state.tenant || !state.project || isSaving) return;

    const trimmedText = editText.trim();
    if (!trimmedText || trimmedText === requirement.text) {
      setEditingRequirementId(null);
      return;
    }

    setIsSaving(true);
    try {
      await api.updateRequirement(state.tenant, state.project, requirement.id, {
        text: trimmedText
      });

      // Invalidate queries to refresh the UI
      await queryClient.invalidateQueries({
        queryKey: ["sections-with-relations", state.tenant, state.project, document?.slug]
      });
      await queryClient.invalidateQueries({
        queryKey: ["trace-links", state.tenant, state.project]
      });

      setEditingRequirementId(null);
    } catch (error) {
      console.error('Failed to update requirement:', error);
    } finally {
      setIsSaving(false);
    }
  }, [state.tenant, state.project, editText, api, queryClient, document?.slug, isSaving]);

  const handleCancelEdit = useCallback(() => {
    setEditingRequirementId(null);
    setEditText("");
  }, []);

  const handleKeyDown = useCallback((event: React.KeyboardEvent, requirement: RequirementRecord) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSaveEdit(requirement);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      handleCancelEdit();
    }
  }, [handleSaveEdit, handleCancelEdit]);

  const getRequirementLinkInfo = (requirementId: string) => {
    const outgoingLinks = traceLinks.filter(link => link.sourceRequirementId === requirementId);
    const incomingLinks = traceLinks.filter(link => link.targetRequirementId === requirementId);

    // Check for broken links
    const brokenOutgoingLinks = outgoingLinks.filter(link =>
      !link.targetRequirement ||
      !link.targetRequirement.ref ||
      link.targetRequirement.archived ||
      link.targetRequirement.deleted
    );
    const brokenIncomingLinks = incomingLinks.filter(link =>
      !link.sourceRequirement ||
      !link.sourceRequirement.ref ||
      link.sourceRequirement.archived ||
      link.sourceRequirement.deleted
    );

    return {
      hasOutgoing: outgoingLinks.length > 0,
      hasIncoming: incomingLinks.length > 0,
      outgoingCount: outgoingLinks.length,
      incomingCount: incomingLinks.length,
      hasBrokenOutgoing: brokenOutgoingLinks.length > 0,
      hasBrokenIncoming: brokenIncomingLinks.length > 0,
      brokenOutgoingCount: brokenOutgoingLinks.length,
      brokenIncomingCount: brokenIncomingLinks.length
    };
  };

  if (!document) {
    return <div className="document-tree-empty">Select a document to view its requirements</div>;
  }

  if (sectionsQuery.isLoading) {
    return (
      <div className="document-tree-loading">
        <Spinner />
      </div>
    );
  }

  if (sectionsQuery.isError) {
    return <ErrorState message="Failed to load document sections" />;
  }

  const sections = sectionsQuery.data?.sections || [];

  return (
    <div className="document-tree">
      {sections.length === 0 ? (
        <div className="no-sections">No sections in this document</div>
      ) : (
        <div className="sections-list">
          {sections.map(section => {
            // Requirements are now included in the section data from the optimized query
            const allRequirements = section.requirements || [];
            // Filter requirements based on filter text
            const requirements = filter.trim()
              ? allRequirements.filter(req =>
                  req.ref.toLowerCase().includes(filter.toLowerCase()) ||
                  req.title?.toLowerCase().includes(filter.toLowerCase()) ||
                  req.text?.toLowerCase().includes(filter.toLowerCase())
                )
              : allRequirements;

            // Don't show section if no requirements match filter
            if (filter.trim() && requirements.length === 0) return null;

            return (
              <div key={section.id} className="section-node">
                <div
                  className="section-header"
                  onDragOver={onDropOnSection ? (e) => { e.stopPropagation(); onDragOver(e); } : undefined}
                  onDragLeave={onDropOnSection ? (e) => { e.stopPropagation(); onDragLeave(e); } : undefined}
                  onDrop={onDropOnSection && document ? (event) => { event.stopPropagation(); onDropOnSection(event, section.id, document.slug); } : undefined}
                >
                  <span className="section-name">{section.name}</span>
                  <span className="section-count">({requirements.length}{filter.trim() ? ` of ${allRequirements.length}` : ''})</span>
                </div>

                {requirements.length > 0 && (
                  <div className="requirements-list">
                    {requirements.map(requirement => {
                      const linkInfo = getRequirementLinkInfo(requirement.id);
                      const isEditing = editingRequirementId === requirement.id;

                      return (
                        <div
                          key={requirement.id}
                          data-requirement-id={requirement.id}
                          className={`requirement-node ${
                            selectedRequirements.has(requirement.id) ? "selected" : ""
                          } ${linkInfo.hasOutgoing || linkInfo.hasIncoming ? "has-links" : ""} ${isEditing ? "editing" : ""}`}
                          draggable={!isEditing}
                          onClick={isEditing ? undefined : (event => handleRequirementClick(requirement, event))}
                          onDoubleClick={isEditing ? undefined : (event => handleDoubleClick(requirement, event))}
                          onContextMenu={isEditing ? undefined : (event => handleContextMenuInternal(requirement, event))}
                          onDragStart={isEditing ? undefined : (() => onDragStart(requirement))}
                          onDragOver={isEditing ? undefined : onDragOver}
                          onDragLeave={isEditing ? undefined : onDragLeave}
                          onDrop={isEditing ? undefined : (event => onDrop(event, requirement))}
                          title={isEditing ? undefined : requirement.text}
                        >
                          <div className="requirement-content">
                            <span className="requirement-ref">{requirement.ref}</span>
                            {isEditing ? (
                              <div className="requirement-edit-container">
                                <textarea
                                  className="requirement-edit-input"
                                  value={editText}
                                  onChange={(e) => setEditText(e.target.value)}
                                  onKeyDown={(e) => handleKeyDown(e, requirement)}
                                  onBlur={() => handleSaveEdit(requirement)}
                                  autoFocus
                                  disabled={isSaving}
                                  rows={3}
                                />
                                <div className="requirement-edit-actions">
                                  <button
                                    className="edit-action-btn save"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleSaveEdit(requirement);
                                    }}
                                    disabled={isSaving}
                                  >
                                    {isSaving ? "Saving..." : "Save"}
                                  </button>
                                  <button
                                    className="edit-action-btn cancel"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleCancelEdit();
                                    }}
                                    disabled={isSaving}
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <span className="requirement-text">{requirement.text}</span>
                            )}
                          </div>

                          {!isEditing && (
                            <div className="requirement-indicators">
                              {linkInfo.hasIncoming && (
                                <div
                                  className={`link-indicator incoming ${linkInfo.hasBrokenIncoming ? 'broken' : ''}`}
                                  title={linkInfo.hasBrokenIncoming
                                    ? `${linkInfo.incomingCount} incoming link${linkInfo.incomingCount > 1 ? 's' : ''} (${linkInfo.brokenIncomingCount} broken)`
                                    : `${linkInfo.incomingCount} incoming link${linkInfo.incomingCount > 1 ? 's' : ''}`}
                                  style={linkInfo.hasBrokenIncoming ? { color: '#dc2626' } : {}}
                                >
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M19 12H5M12 19l-7-7 7-7"/>
                                  </svg>
                                  <span className="link-count">{linkInfo.incomingCount}</span>
                                </div>
                              )}
                              {linkInfo.hasOutgoing && (
                                <div
                                  className={`link-indicator outgoing ${linkInfo.hasBrokenOutgoing ? 'broken' : ''}`}
                                  title={linkInfo.hasBrokenOutgoing
                                    ? `${linkInfo.outgoingCount} outgoing link${linkInfo.outgoingCount > 1 ? 's' : ''} (${linkInfo.brokenOutgoingCount} broken)`
                                    : `${linkInfo.outgoingCount} outgoing link${linkInfo.outgoingCount > 1 ? 's' : ''}`}
                                  style={linkInfo.hasBrokenOutgoing ? { color: '#dc2626' } : {}}
                                >
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M5 12h14M12 5l7 7-7 7"/>
                                  </svg>
                                  <span className="link-count">{linkInfo.outgoingCount}</span>
                                </div>
                              )}
                              {selectedRequirements.has(requirement.id) && (
                                <div className="selection-indicator">✓</div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
