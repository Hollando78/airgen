import { useState, useRef, useCallback, useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { RequirementRecord, DocumentSectionRecord, InfoRecord, SurrogateReferenceRecord, TraceLink, TraceLinkType } from "../../types";
import { RequirementContextMenu } from "../RequirementContextMenu";
import { LinkTypeSelectionModal } from "../LinkTypeSelectionModal";
import { useRequirementLinking } from "../../contexts/RequirementLinkingContext";
import { ColumnResizer } from "./RequirementsTable/ColumnResizer";
import { ColumnSelector, type ColumnVisibility } from "./RequirementsTable/ColumnSelector";
import { TableFilterBar, type FilterState } from "./RequirementsTable/TableFilterBar";
import { RequirementRow } from "./RequirementsTable/RequirementRow";
import { useApiClient } from "../../lib/client";

export interface RequirementsTableProps {
  sections: (DocumentSectionRecord & { requirements: RequirementRecord[]; infos: InfoRecord[]; surrogates?: SurrogateReferenceRecord[] })[];
  tenant: string;
  project: string;
  traceLinks?: TraceLink[];
  onAddRequirement: () => void;
  onEditRequirement: (requirement: RequirementRecord) => void;
  onOpenFloatingDocument?: () => void;
  onEditMarkdown?: () => void;
}

const DEFAULT_COLUMN_WIDTHS = {
  id: 100,
  description: 300,
  pattern: 120,
  verification: 120,
  qaScore: 80,
  actions: 60
};

export function RequirementsTable({
  sections,
  tenant,
  project,
  traceLinks = [],
  onAddRequirement,
  onEditRequirement,
  onOpenFloatingDocument,
  onEditMarkdown
}: RequirementsTableProps): JSX.Element {
  const [columnWidths, setColumnWidths] = useState(DEFAULT_COLUMN_WIDTHS);
  const [isResizing, setIsResizing] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [showColumnSelector, setShowColumnSelector] = useState(false);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    requirement: RequirementRecord;
  } | null>(null);
  const { linkingState, startLinking, completeLinking } = useRequirementLinking();
  const [linkModal, setLinkModal] = useState<{
    sourceRequirement: RequirementRecord;
    targetRequirement: RequirementRecord;
  } | null>(null);
  const [visibleColumns, setVisibleColumns] = useState<ColumnVisibility>({
    id: true,
    description: true,
    pattern: true,
    verification: true,
    qaScore: true,
    actions: true
  });
  const [filters, setFilters] = useState<FilterState>({
    text: "",
    pattern: "",
    verification: "",
    minQaScore: "",
    maxQaScore: "",
    objectTypes: ['requirement', 'info', 'surrogate'] // Default: show all types
  });
  const tableRef = useRef<HTMLTableElement>(null);
  const api = useApiClient();
  const queryClient = useQueryClient();

  const deleteLinkMutation = useMutation({
    mutationFn: (linkId: string) => api.deleteTraceLink(tenant, project, linkId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["traceLinks", tenant, project] });
    }
  });

  const handleDeleteLink = useCallback((linkId: string) => {
    deleteLinkMutation.mutate(linkId);
  }, [deleteLinkMutation]);

  const handleContextMenu = useCallback((e: React.MouseEvent, requirement: RequirementRecord) => {
    e.preventDefault();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      requirement
    });
  }, []);

  const handleStartLink = useCallback((requirement: RequirementRecord) => {
    startLinking(requirement);
  }, [startLinking]);

  const handleEndLink = useCallback((targetRequirement: RequirementRecord) => {
    if (linkingState.sourceRequirement) {
      setLinkModal({
        sourceRequirement: linkingState.sourceRequirement,
        targetRequirement
      });
    }
  }, [linkingState.sourceRequirement]);

  const handleCreateLink = useCallback(async (linkType: TraceLinkType, description?: string) => {
    if (linkModal) {
      await completeLinking(linkModal.targetRequirement, linkType, description);
      setLinkModal(null);
    }
  }, [linkModal, completeLinking]);

  const handleColumnWidthChange = useCallback((columnKey: string, width: number) => {
    setColumnWidths(prev => ({
      ...prev,
      [columnKey]: width
    }));
  }, []);

  // Merge requirements, infos, and surrogates from all sections into a single sorted list
  type ItemType =
    | { type: 'requirement'; data: RequirementRecord; sectionName: string; sectionOrder: number }
    | { type: 'info'; data: InfoRecord; sectionName: string; sectionOrder: number }
    | { type: 'surrogate'; data: SurrogateReferenceRecord; sectionName: string; sectionOrder: number }
    | { type: 'section-header'; sectionName: string; sectionOrder: number; sectionId: string };

  const sortedItems = useMemo(() => {
    const items: ItemType[] = [];

    // Add items from all sections in order
    sections.forEach((section, sectionIndex) => {
      // Add section header
      items.push({
        type: 'section-header' as const,
        sectionName: section.name,
        sectionOrder: sectionIndex,
        sectionId: section.id
      });

      // Add requirements, infos, and surrogates for this section
      const sectionItems = [
        ...section.requirements.map(req => ({ type: 'requirement' as const, data: req, order: 0, sectionName: section.name, sectionOrder: sectionIndex })),
        ...(section.infos || []).map(info => ({ type: 'info' as const, data: info, order: info.order || 0, sectionName: section.name, sectionOrder: sectionIndex })),
        ...(section.surrogates || []).map(surrogate => ({ type: 'surrogate' as const, data: surrogate, order: surrogate.order || 0, sectionName: section.name, sectionOrder: sectionIndex }))
      ];

      // Sort items within this section by order (line number from markdown)
      sectionItems.sort((a, b) => a.order - b.order);
      items.push(...sectionItems);
    });

    return items;
  }, [sections]);

  const filteredRequirements = useMemo(() => {
    const allRequirements = sections.flatMap(section => section.requirements);
    return allRequirements.filter(req => {
      // Text filter
      if (filters.text && !req.text.toLowerCase().includes(filters.text.toLowerCase()) && !req.ref.toLowerCase().includes(filters.text.toLowerCase())) {
        return false;
      }

      // Pattern filter
      if (filters.pattern && req.pattern !== filters.pattern) {
        return false;
      }

      // Verification filter
      if (filters.verification && req.verification !== filters.verification) {
        return false;
      }

      // QA Score filters
      if (filters.minQaScore && req.qaScore && req.qaScore < parseInt(filters.minQaScore)) {
        return false;
      }

      if (filters.maxQaScore && req.qaScore && req.qaScore > parseInt(filters.maxQaScore)) {
        return false;
      }

      return true;
    });
  }, [sections, filters]);

  const filteredItems = useMemo(() => {
    const allowedTypes = filters.objectTypes || ['requirement', 'info'];

    return sortedItems.filter(item => {
      // Always show section headers
      if (item.type === 'section-header') {
        return true;
      }

      // Check if object type is enabled
      if (!allowedTypes.includes(item.type)) {
        return false;
      }

      if (item.type === 'requirement') {
        return filteredRequirements.some(r => r.id === item.data.id);
      }

      // Info and surrogate items pass through if their type is enabled
      return true;
    });
  }, [sortedItems, filteredRequirements, filters.objectTypes]);

  const clearFilters = () => {
    setFilters({
      text: "",
      pattern: "",
      verification: "",
      minQaScore: "",
      maxQaScore: "",
      objectTypes: ['requirement', 'info', 'surrogate']
    });
  };

  const hasActiveFilters =
    filters.text !== "" ||
    filters.pattern !== "" ||
    filters.verification !== "" ||
    filters.minQaScore !== "" ||
    filters.maxQaScore !== "" ||
    (filters.objectTypes || []).length !== 3; // Active if not showing all three types
  const visibleColumnCount = Object.values(visibleColumns).filter(Boolean).length;

  const headerStyle = (width: number) => ({
    border: "1px solid #e2e8f0",
    padding: "12px",
    textAlign: "left" as const,
    width: `${width}px`,
    position: "relative" as const,
    userSelect: "none" as const
  });

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
      <div style={{
        padding: "16px 24px",
        borderBottom: "1px solid #e2e8f0",
        backgroundColor: "#f8f9fa"
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
          <h2 style={{ margin: 0, fontSize: "18px" }}>Requirements</h2>
          <div style={{ display: "flex", gap: "8px" }}>
            {onEditMarkdown && (
              <button
                onClick={onEditMarkdown}
                style={{
                  backgroundColor: "transparent",
                  color: "#64748b",
                  border: "1px solid #d1d5db",
                  padding: "6px 12px",
                  borderRadius: "4px",
                  cursor: "pointer",
                  fontSize: "12px",
                  display: "flex",
                  alignItems: "center",
                  gap: "4px"
                }}
                title="Edit in Markdown"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
                Edit Markdown
              </button>
            )}
            {onOpenFloatingDocument && (
              <button
                onClick={onOpenFloatingDocument}
                style={{
                  backgroundColor: "transparent",
                  color: "#64748b",
                  border: "1px solid #d1d5db",
                  padding: "6px 12px",
                  borderRadius: "4px",
                  cursor: "pointer",
                  fontSize: "12px",
                  display: "flex",
                  alignItems: "center",
                  gap: "4px"
                }}
                title="Open in floating window"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M13 3h8v8"/>
                  <path d="M21 3l-7 7"/>
                  <path d="M3 12v7a2 2 0 0 0 2 2h7"/>
                </svg>
                Pop Out
              </button>
            )}
            <button
              onClick={() => setShowColumnSelector(!showColumnSelector)}
              style={{
                backgroundColor: showColumnSelector ? "#059669" : "transparent",
                color: showColumnSelector ? "white" : "#64748b",
                border: "1px solid #d1d5db",
                padding: "6px 12px",
                borderRadius: "4px",
                cursor: "pointer",
                fontSize: "12px",
                display: "flex",
                alignItems: "center",
                gap: "4px"
              }}
            >
              ⚙️ Columns
            </button>
            <button
              onClick={() => setShowFilters(!showFilters)}
              style={{
                backgroundColor: showFilters ? "#3b82f6" : "transparent",
                color: showFilters ? "white" : "#64748b",
                border: "1px solid #d1d5db",
                padding: "6px 12px",
                borderRadius: "4px",
                cursor: "pointer",
                fontSize: "12px",
                display: "flex",
                alignItems: "center",
                gap: "4px"
              }}
            >
              🔍 Filter {hasActiveFilters && `(${filteredRequirements.length}/${sections.flatMap(s => s.requirements).length})`}
            </button>
          </div>
        </div>
        <p style={{ margin: "4px 0 0 0", color: "#64748b", fontSize: "14px" }}>
          All requirements across all sections
        </p>
      </div>

      {showFilters && (
        <TableFilterBar
          filters={filters}
          onFiltersChange={setFilters}
          onClearFilters={clearFilters}
          hasActiveFilters={hasActiveFilters}
        />
      )}

      {showColumnSelector && (
        <ColumnSelector
          visibleColumns={visibleColumns}
          onVisibleColumnsChange={setVisibleColumns}
        />
      )}


      <div style={{ flex: 1, overflow: "auto", scrollBehavior: "smooth", minHeight: 0 }}>
        <table ref={tableRef} style={{ borderCollapse: "collapse", fontSize: "14px", minWidth: "100%" }}>
          <thead style={{ position: "sticky", top: 0, backgroundColor: "#f1f5f9" }}>
            <tr>
              {visibleColumns.id && (
                <th style={headerStyle(columnWidths.id)}>
                  ID
                  <ColumnResizer
                    columnKey="id"
                    columnWidths={columnWidths}
                    isResizing={isResizing === "id"}
                    onColumnWidthChange={handleColumnWidthChange}
                    onResizingChange={setIsResizing}
                  />
                </th>
              )}
              {visibleColumns.description && (
                <th style={headerStyle(columnWidths.description)}>
                  Description
                  <ColumnResizer
                    columnKey="description"
                    columnWidths={columnWidths}
                    isResizing={isResizing === "description"}
                    onColumnWidthChange={handleColumnWidthChange}
                    onResizingChange={setIsResizing}
                  />
                </th>
              )}
              {visibleColumns.pattern && (
                <th style={headerStyle(columnWidths.pattern)}>
                  Pattern
                  <ColumnResizer
                    columnKey="pattern"
                    columnWidths={columnWidths}
                    isResizing={isResizing === "pattern"}
                    onColumnWidthChange={handleColumnWidthChange}
                    onResizingChange={setIsResizing}
                  />
                </th>
              )}
              {visibleColumns.verification && (
                <th style={headerStyle(columnWidths.verification)}>
                  Verification
                  <ColumnResizer
                    columnKey="verification"
                    columnWidths={columnWidths}
                    isResizing={isResizing === "verification"}
                    onColumnWidthChange={handleColumnWidthChange}
                    onResizingChange={setIsResizing}
                  />
                </th>
              )}
              {visibleColumns.qaScore && (
                <th style={headerStyle(columnWidths.qaScore)}>
                  QA Score
                  <ColumnResizer
                    columnKey="qaScore"
                    columnWidths={columnWidths}
                    isResizing={isResizing === "qaScore"}
                    onColumnWidthChange={handleColumnWidthChange}
                    onResizingChange={setIsResizing}
                  />
                </th>
              )}
              {visibleColumns.actions && (
                <th style={headerStyle(columnWidths.actions)}>
                  Actions
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {filteredItems.length === 0 ? (
              <tr>
                <td colSpan={visibleColumnCount} style={{
                  border: "1px solid #e2e8f0",
                  padding: "40px",
                  textAlign: "center",
                  color: "#64748b"
                }}>
                  {sections.flatMap(s => s.requirements).length === 0
                    ? "No requirements yet"
                    : "No requirements match the current filters"
                  }
                </td>
              </tr>
            ) : (
              filteredItems.map((item, index: number) => {
                if (item.type === 'section-header') {
                  return (
                    <tr key={`section-${item.sectionId}`}>
                      <td colSpan={visibleColumnCount} style={{
                        padding: "16px 24px",
                        backgroundColor: "#f8fafc",
                        borderTop: "2px solid #e2e8f0",
                        borderBottom: "1px solid #e2e8f0"
                      }}>
                        <div style={{
                          fontWeight: "600",
                          fontSize: "15px",
                          color: "#1e293b"
                        }}>
                          {item.sectionName}
                        </div>
                      </td>
                    </tr>
                  );
                } else if (item.type === 'info') {
                  const info = item.data as InfoRecord;
                  return (
                    <tr key={`info-${info.id}`}>
                      <td colSpan={visibleColumnCount} style={{
                        border: "1px solid #bae6fd",
                        padding: "12px 16px",
                        backgroundColor: "#f0f9ff"
                      }}>
                        <div style={{ display: "flex", alignItems: "flex-start", gap: "12px" }}>
                          <div style={{
                            fontSize: "20px",
                            lineHeight: "1",
                            marginTop: "2px"
                          }}>
                            ℹ️
                          </div>
                          <div style={{ flex: 1 }}>
                            {info.title && (
                              <div style={{
                                fontWeight: "600",
                                fontSize: "13px",
                                color: "#0369a1",
                                marginBottom: "6px"
                              }}>
                                {info.title}
                              </div>
                            )}
                            <div style={{
                              fontSize: "13px",
                              color: "#334155",
                              lineHeight: "1.5"
                            }}>
                              {info.text}
                            </div>
                            {info.ref && (
                              <div style={{
                                fontSize: "11px",
                                color: "#64748b",
                                marginTop: "6px",
                                fontFamily: "monospace"
                              }}>
                                {info.ref}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                } else if (item.type === 'surrogate') {
                  const surrogate = item.data as SurrogateReferenceRecord;
                  const surrogateKey = `surrogate-${surrogate.id}`;
                  const storedWidth = localStorage.getItem(surrogateKey);
                  const defaultWidth = 400;
                  const currentWidth = storedWidth ? parseInt(storedWidth, 10) : defaultWidth;

                  return (
                    <tr key={surrogateKey}>
                      <td colSpan={visibleColumnCount} style={{
                        border: "1px solid #d8b4fe",
                        padding: "12px 16px",
                        backgroundColor: "#faf5ff"
                      }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                          <div style={{ display: "flex", alignItems: "flex-start", gap: "12px" }}>
                            <div style={{
                              fontSize: "20px",
                              lineHeight: "1",
                              marginTop: "2px"
                            }}>
                              🔗
                            </div>
                            <div style={{ flex: 1 }}>
                              <div style={{
                                fontWeight: "600",
                                fontSize: "13px",
                                color: "#7c3aed",
                                marginBottom: "6px",
                                fontFamily: "monospace"
                              }}>
                                {surrogate.slug}
                              </div>
                              {surrogate.caption && (
                                <div style={{
                                  fontSize: "13px",
                                  color: "#334155",
                                  lineHeight: "1.5",
                                  marginBottom: "8px"
                                }}>
                                  {surrogate.caption}
                                </div>
                              )}
                            </div>
                          </div>
                          <div style={{
                            position: "relative",
                            width: "fit-content",
                            maxWidth: "100%"
                          }}>
                            {/* Use iframe/embed for documents, img for images */}
                            {surrogate.slug.match(/\.(pdf|docx?|pptx?|xlsx?)$/i) ? (
                              <embed
                                src={`/api/documents/${tenant}/${project}/${surrogate.slug}/view`}
                                type="application/pdf"
                                style={{
                                  width: `${currentWidth}px`,
                                  height: `${Math.floor(currentWidth * 1.414)}px`, // A4 aspect ratio
                                  maxWidth: "100%",
                                  borderRadius: "4px",
                                  border: "1px solid #e9d5ff",
                                  display: "block",
                                  backgroundColor: "white"
                                }}
                              />
                            ) : (
                              <img
                                src={`/api/documents/${tenant}/${project}/${surrogate.slug}/view`}
                                alt={surrogate.caption || surrogate.slug}
                                style={{
                                  width: `${currentWidth}px`,
                                  maxWidth: "100%",
                                  height: "auto",
                                  borderRadius: "4px",
                                  border: "1px solid #e9d5ff",
                                  display: "block"
                                }}
                                onError={(e) => {
                                  (e.target as HTMLImageElement).src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="150"><rect fill="%23faf5ff" width="200" height="150"/><text x="50%" y="50%" text-anchor="middle" dy=".3em" fill="%23a855f7" font-size="16">📄 Surrogate</text></svg>';
                                }}
                              />
                            )}
                            <div
                              style={{
                                position: "absolute",
                                right: 0,
                                bottom: 0,
                                width: "20px",
                                height: "20px",
                                cursor: "nwse-resize",
                                backgroundColor: "#7c3aed",
                                borderRadius: "0 0 4px 0",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                color: "white",
                                fontSize: "10px",
                                userSelect: "none"
                              }}
                              onMouseDown={(e) => {
                                e.preventDefault();
                                const startX = e.clientX;
                                const startWidth = currentWidth;

                                const handleMouseMove = (moveEvent: MouseEvent) => {
                                  const newWidth = Math.max(200, Math.min(1200, startWidth + (moveEvent.clientX - startX)));
                                  const content = (e.target as HTMLElement).previousElementSibling as HTMLElement;
                                  if (content) {
                                    content.style.width = `${newWidth}px`;
                                    // Also update height for embed elements to maintain aspect ratio
                                    if (content.tagName === 'EMBED') {
                                      content.style.height = `${Math.floor(newWidth * 1.414)}px`;
                                    }
                                  }
                                };

                                const handleMouseUp = (upEvent: MouseEvent) => {
                                  const finalWidth = Math.max(200, Math.min(1200, startWidth + (upEvent.clientX - startX)));
                                  localStorage.setItem(surrogateKey, finalWidth.toString());
                                  document.removeEventListener("mousemove", handleMouseMove);
                                  document.removeEventListener("mouseup", handleMouseUp);
                                };

                                document.addEventListener("mousemove", handleMouseMove);
                                document.addEventListener("mouseup", handleMouseUp);
                              }}
                            >
                              ⇲
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                } else {
                  const req = item.data as RequirementRecord;
                  return (
                    <RequirementRow
                      key={req.id}
                      requirement={req}
                      index={index}
                      columnWidths={columnWidths}
                      visibleColumns={visibleColumns}
                      tenant={tenant}
                      project={project}
                      traceLinks={traceLinks}
                      onContextMenu={handleContextMenu}
                      onEdit={onEditRequirement}
                    />
                  );
                }
              })
            )}
          </tbody>
        </table>
      </div>

      <div style={{
        padding: "16px 24px",
        borderTop: "1px solid #e2e8f0",
        backgroundColor: "#f8f9fa",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center"
      }}>
        <div>
          <strong>{filteredRequirements.length}</strong> of <strong>{sections.flatMap(s => s.requirements).length}</strong> requirement{sections.flatMap(s => s.requirements).length !== 1 ? 's' : ''} {hasActiveFilters ? '(filtered)' : ''}
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          <button
            onClick={onAddRequirement}
            style={{
              backgroundColor: "#2563eb",
              color: "white",
              border: "none",
              padding: "8px 12px",
              borderRadius: "4px",
              cursor: "pointer"
            }}
          >
            ＋ Add Requirement
          </button>
        </div>
      </div>

      {/* Requirement Context Menu */}
      {contextMenu && (
        <RequirementContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          requirement={contextMenu.requirement}
          tenant={tenant}
          project={project}
          onClose={() => setContextMenu(null)}
          onStartLink={handleStartLink}
          onEndLink={handleEndLink}
          onDeleteLink={handleDeleteLink}
          linkingRequirement={linkingState.sourceRequirement}
          traceLinks={traceLinks}
        />
      )}

      {/* Link Type Selection Modal */}
      {linkModal && (
        <LinkTypeSelectionModal
          isOpen={true}
          sourceRequirement={linkModal.sourceRequirement}
          targetRequirement={linkModal.targetRequirement}
          onConfirm={handleCreateLink}
          onCancel={() => setLinkModal(null)}
        />
      )}
    </div>
  );
}
