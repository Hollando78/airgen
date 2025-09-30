import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
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
  traceLinks?: TraceLink[];
  documentSide?: "left" | "right";
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
  traceLinks = [],
  documentSide
}: DocumentTreeProps): JSX.Element {
  const api = useApiClient();
  const { state } = useTenantProject();

  const sectionsQuery = useQuery({
    queryKey: ["sections", state.tenant, state.project, document?.slug],
    queryFn: () => (document ? api.listDocumentSections(state.tenant!, state.project!, document.slug) : null),
    enabled: Boolean(state.tenant && state.project && document)
  });

  const [sectionRequirements, setSectionRequirements] = useState<Record<string, RequirementRecord[]>>({});

  useEffect(() => {
    const loadRequirements = async () => {
      if (sectionsQuery.data?.sections) {
        const requirements: Record<string, RequirementRecord[]> = {};
        for (const section of sectionsQuery.data.sections) {
          try {
            const response = await api.listSectionRequirements(section.id);
            requirements[section.id] = response.requirements;
          } catch (error) {
            console.error(`Failed to load requirements for section ${section.id}:`, error);
            requirements[section.id] = [];
          }
        }
        setSectionRequirements(requirements);
      }
    };

    loadRequirements();
  }, [sectionsQuery.data, api]);

  const handleRequirementClick = (requirement: RequirementRecord, event: React.MouseEvent) => {
    event.preventDefault();
    const isMultiSelect = event.ctrlKey || event.metaKey;
    onRequirementSelect(requirement, isMultiSelect);
  };

  const handleContextMenuInternal = (requirement: RequirementRecord, event: React.MouseEvent) => {
    event.preventDefault();
    onContextMenu(requirement, event);
  };

  const getRequirementLinkInfo = (requirementId: string) => {
    const outgoingLinks = traceLinks.filter(link => link.sourceRequirementId === requirementId);
    const incomingLinks = traceLinks.filter(link => link.targetRequirementId === requirementId);
    return {
      hasOutgoing: outgoingLinks.length > 0,
      hasIncoming: incomingLinks.length > 0,
      outgoingCount: outgoingLinks.length,
      incomingCount: incomingLinks.length
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
      <div className="document-header">
        <h3>{document.name}</h3>
        <span className="document-slug">{document.slug}</span>
      </div>

      {sections.length === 0 ? (
        <div className="no-sections">No sections in this document</div>
      ) : (
        <div className="sections-list">
          {sections.map(section => {
            const requirements = sectionRequirements[section.id] || [];
            return (
              <div key={section.id} className="section-node">
                <div className="section-header">
                  <span className="section-name">{section.name}</span>
                  <span className="section-count">({requirements.length})</span>
                </div>

                {requirements.length > 0 && (
                  <div className="requirements-list">
                    {requirements.map(requirement => {
                      const linkInfo = getRequirementLinkInfo(requirement.id);
                      return (
                        <div
                          key={requirement.id}
                          data-requirement-id={requirement.id}
                          className={`requirement-node ${
                            selectedRequirements.has(requirement.id) ? "selected" : ""
                          } ${linkInfo.hasOutgoing || linkInfo.hasIncoming ? "has-links" : ""}`}
                          draggable
                          onClick={event => handleRequirementClick(requirement, event)}
                          onContextMenu={event => handleContextMenuInternal(requirement, event)}
                          onDragStart={() => onDragStart(requirement)}
                          onDragOver={onDragOver}
                          onDragLeave={onDragLeave}
                          onDrop={event => onDrop(event, requirement)}
                          title={requirement.text}
                        >
                          <div className="requirement-content">
                            <span className="requirement-ref">{requirement.ref}</span>
                            <span className="requirement-title">{requirement.title}</span>
                            <span className="requirement-text">{requirement.text}</span>
                          </div>
                          
                          <div className="requirement-indicators">
                            {linkInfo.hasIncoming && (
                              <div className="link-indicator incoming" title={`${linkInfo.incomingCount} incoming link${linkInfo.incomingCount > 1 ? 's' : ''}`}>
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <path d="M19 12H5M12 19l-7-7 7-7"/>
                                </svg>
                                <span className="link-count">{linkInfo.incomingCount}</span>
                              </div>
                            )}
                            {linkInfo.hasOutgoing && (
                              <div className="link-indicator outgoing" title={`${linkInfo.outgoingCount} outgoing link${linkInfo.outgoingCount > 1 ? 's' : ''}`}>
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
