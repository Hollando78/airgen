import { useEffect, useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "../../lib/client";
import { useTenantProject } from "../../hooks/useTenantProject";
import { Spinner } from "../Spinner";
import { ErrorState } from "../ErrorState";
import type {
  DocumentRecord,
  RequirementRecord,
  TraceLink,
  DocumentSectionWithRelations,
  DocumentSectionsWithRelationsResponse
} from "../../types";

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
  collapsedSections?: Set<string>;
  onToggleCollapse?: React.Dispatch<React.SetStateAction<Set<string>>>;
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
  filter = "",
  collapsedSections: collapsedSectionsProp,
  onToggleCollapse
}: DocumentTreeProps): JSX.Element {
  const api = useApiClient();
  const queryClient = useQueryClient();
  const { state } = useTenantProject();

  // State for inline editing (requirements)
  const [editingRequirementId, setEditingRequirementId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // State for section editing and creation
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
  const [sectionEditText, setSectionEditText] = useState("");
  const [sectionEditShortCode, setSectionEditShortCode] = useState("");
  const [isSavingSection, setIsSavingSection] = useState(false);
  const [isAddingSection, setIsAddingSection] = useState(false);
  const [newSectionName, setNewSectionName] = useState("");
  const [newSectionShortCode, setNewSectionShortCode] = useState("");

  // State for collapsed sections (use prop if provided, otherwise manage internally)
  const [internalCollapsedSections, setInternalCollapsedSections] = useState<Set<string>>(new Set());
  const collapsedSections = collapsedSectionsProp ?? internalCollapsedSections;
  const setCollapsedSections = onToggleCollapse ?? setInternalCollapsedSections;

  // Use optimized endpoint that fetches sections with all requirements in a single query
  // This eliminates N+1 query problem: Before: 1 + N queries, After: 1 query (~97% reduction)
  const sectionsQuery = useQuery<DocumentSectionsWithRelationsResponse | null>({
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

  // Section editing handlers
  const handleSectionDoubleClick = useCallback((section: DocumentSectionWithRelations, event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setEditingSectionId(section.id);
    setSectionEditText(section.name || "");
    setSectionEditShortCode(section.shortCode || "");
  }, []);

  const handleSaveSectionEdit = useCallback(async (sectionId: string) => {
    if (!state.tenant || !state.project || isSavingSection) return;

    const trimmedName = sectionEditText.trim();
    const trimmedShortCode = sectionEditShortCode.trim();
    const sections = sectionsQuery.data?.sections || [];
    const currentSection = sections.find(s => s.id === sectionId);

    // Check if anything changed
    if (!trimmedName ||
        (trimmedName === currentSection?.name && trimmedShortCode === (currentSection?.shortCode || ""))) {
      setEditingSectionId(null);
      return;
    }

    setIsSavingSection(true);
    try {
      await api.updateDocumentSection(sectionId, {
        tenant: state.tenant,  // Required by backend
        name: trimmedName,
        shortCode: trimmedShortCode || undefined
      });

      // Invalidate queries to refresh the UI
      await queryClient.invalidateQueries({
        queryKey: ["sections-with-relations", state.tenant, state.project, document?.slug]
      });

      setEditingSectionId(null);
    } catch (error) {
      console.error('Failed to update section:', error);
    } finally {
      setIsSavingSection(false);
    }
  }, [state.tenant, state.project, sectionEditText, sectionEditShortCode, api, queryClient, document?.slug, isSavingSection, sectionsQuery.data]);

  const handleCancelSectionEdit = useCallback(() => {
    setEditingSectionId(null);
    setSectionEditText("");
    setSectionEditShortCode("");
  }, []);

  const handleSectionKeyDown = useCallback((event: React.KeyboardEvent, sectionId: string) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      handleSaveSectionEdit(sectionId);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      handleCancelSectionEdit();
    }
  }, [handleSaveSectionEdit, handleCancelSectionEdit]);

  // Add new section handlers
  const handleAddSection = useCallback(() => {
    setIsAddingSection(true);
    setNewSectionName("");
  }, []);

  const handleSaveNewSection = useCallback(async () => {
    if (!state.tenant || !state.project || !document || isSavingSection) return;

    const trimmedName = newSectionName.trim();
    const trimmedShortCode = newSectionShortCode.trim();
    if (!trimmedName) {
      setIsAddingSection(false);
      return;
    }

    // Calculate next order value (max order + 1, or 0 if no sections)
    const sections = sectionsQuery.data?.sections || [];
    const maxOrder = sections.length > 0
      ? Math.max(...sections.map(s => s.order || 0))
      : -1;
    const nextOrder = maxOrder + 1;

    setIsSavingSection(true);
    try {
      await api.createDocumentSection({
        tenant: state.tenant,
        projectKey: state.project,
        documentSlug: document.slug,
        name: trimmedName,
        shortCode: trimmedShortCode || undefined,
        order: nextOrder  // Required by backend
      });

      // Invalidate queries to refresh the UI
      await queryClient.invalidateQueries({
        queryKey: ["sections-with-relations", state.tenant, state.project, document.slug]
      });

      setIsAddingSection(false);
      setNewSectionName("");
      setNewSectionShortCode("");
    } catch (error) {
      console.error('Failed to create section:', error);
    } finally {
      setIsSavingSection(false);
    }
  }, [state.tenant, state.project, document, newSectionName, newSectionShortCode, api, queryClient, isSavingSection, sectionsQuery.data]);

  const handleCancelAddSection = useCallback(() => {
    setIsAddingSection(false);
    setNewSectionName("");
    setNewSectionShortCode("");
  }, []);

  const handleNewSectionKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      handleSaveNewSection();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      handleCancelAddSection();
    }
  }, [handleSaveNewSection, handleCancelAddSection]);

  // Section collapse toggle
  const toggleSectionCollapse = useCallback((sectionId: string) => {
    setCollapsedSections(prev => {
      const newSet = new Set(prev);
      if (newSet.has(sectionId)) {
        newSet.delete(sectionId);
      } else {
        newSet.add(sectionId);
      }
      return newSet;
    });
  }, []);

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

  const sections: DocumentSectionWithRelations[] = sectionsQuery.data?.sections || [];

  return (
    <div className="document-tree">
      {sections.length === 0 && !isAddingSection ? (
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

            const isEditingSection = editingSectionId === section.id;
            const isCollapsed = collapsedSections.has(section.id);

            return (
              <div key={section.id} className="section-node">
                <div
                  className={`section-header ${isEditingSection ? 'editing' : ''}`}
                  onDragOver={!isEditingSection && onDropOnSection ? (e) => { e.stopPropagation(); onDragOver(e); } : undefined}
                  onDragLeave={!isEditingSection && onDropOnSection ? (e) => { e.stopPropagation(); onDragLeave(e); } : undefined}
                  onDrop={!isEditingSection && onDropOnSection && document ? (event) => { event.stopPropagation(); onDropOnSection(event, section.id, document.slug); } : undefined}
                >
                  {isEditingSection ? (
                    <div className="section-edit-container">
                      <div className="section-edit-fields">
                        <input
                          type="text"
                          className="section-edit-input section-name-input"
                          value={sectionEditText}
                          onChange={(e) => setSectionEditText(e.target.value)}
                          onKeyDown={(e) => handleSectionKeyDown(e, section.id)}
                          placeholder="Section name"
                          autoFocus
                          disabled={isSavingSection}
                        />
                        <input
                          type="text"
                          className="section-edit-input section-shortcode-input"
                          value={sectionEditShortCode}
                          onChange={(e) => setSectionEditShortCode(e.target.value)}
                          onKeyDown={(e) => handleSectionKeyDown(e, section.id)}
                          placeholder="Short code (optional)"
                          disabled={isSavingSection}
                        />
                      </div>
                      <div className="section-edit-actions">
                        <button
                          className="edit-action-btn save"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSaveSectionEdit(section.id);
                          }}
                          disabled={isSavingSection}
                        >
                          {isSavingSection ? "Saving..." : "Save"}
                        </button>
                        <button
                          className="edit-action-btn cancel"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCancelSectionEdit();
                          }}
                          disabled={isSavingSection}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-2 flex-1">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleSectionCollapse(section.id);
                          }}
                          className="section-collapse-toggle"
                          title={isCollapsed ? "Expand section" : "Collapse section"}
                        >
                          <svg
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            style={{
                              transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
                              transition: 'transform 0.2s ease'
                            }}
                          >
                            <polyline points="6 9 12 15 18 9"></polyline>
                          </svg>
                        </button>
                        <span
                          className="section-name"
                          onDoubleClick={(e) => handleSectionDoubleClick(section, e)}
                          title="Double-click to edit name and short code"
                        >
                          {section.name}
                          {section.shortCode && <span className="section-shortcode"> [{section.shortCode}]</span>}
                        </span>
                      </div>
                      <span className="section-count">({requirements.length}{filter.trim() ? ` of ${allRequirements.length}` : ''})</span>
                    </>
                  )}
                </div>

                {!isCollapsed && requirements.length > 0 && (
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

          {/* Add new section UI */}
          {isAddingSection ? (
            <div className="section-node section-add-new">
              <div className="section-header editing">
                <div className="section-edit-container">
                  <div className="section-edit-fields">
                    <input
                      type="text"
                      className="section-edit-input section-name-input"
                      value={newSectionName}
                      onChange={(e) => setNewSectionName(e.target.value)}
                      onKeyDown={handleNewSectionKeyDown}
                      placeholder="Section name"
                      autoFocus
                      disabled={isSavingSection}
                    />
                    <input
                      type="text"
                      className="section-edit-input section-shortcode-input"
                      value={newSectionShortCode}
                      onChange={(e) => setNewSectionShortCode(e.target.value)}
                      onKeyDown={handleNewSectionKeyDown}
                      placeholder="Short code (optional)"
                      disabled={isSavingSection}
                    />
                  </div>
                  <div className="section-edit-actions">
                    <button
                      className="edit-action-btn save"
                      onClick={handleSaveNewSection}
                      disabled={isSavingSection}
                    >
                      {isSavingSection ? "Creating..." : "Create"}
                    </button>
                    <button
                      className="edit-action-btn cancel"
                      onClick={handleCancelAddSection}
                      disabled={isSavingSection}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <button
              className="btn-add-section"
              onClick={handleAddSection}
              title="Add a new section to this document"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
              Add Section
            </button>
          )}
        </div>
      )}
    </div>
  );
}
