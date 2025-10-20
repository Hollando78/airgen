import React, { useState, useRef, useCallback, useMemo, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, DragEndEvent } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { toast } from "sonner";
import type { RequirementRecord, DocumentSectionRecord, InfoRecord, SurrogateReferenceRecord, TraceLink, TraceLinkType } from "../../types";
import { RequirementContextMenu } from "../RequirementContextMenu";
import { LinkTypeSelectionModal } from "../LinkTypeSelectionModal";
import { useRequirementLinking } from "../../contexts/RequirementLinkingContext";
import { ColumnResizer } from "./RequirementsTable/ColumnResizer";
import { ColumnSelector, type ColumnVisibility } from "./RequirementsTable/ColumnSelector";
import { TableFilterBar, type FilterState } from "./RequirementsTable/TableFilterBar";
import { RequirementRow } from "./RequirementsTable/RequirementRow";
import { AttributesEditor } from "./RequirementsTable/AttributesEditor";
import { SortableRow, type SortableItemData } from "./RequirementsTable/SortableRow";
import { HistoryModal } from "../HistoryModal";
import { useApiClient } from "../../lib/client";
import { useRequirementMutations } from "./RequirementsTable/useRequirementMutations";
import { useSortableItems } from "./RequirementsTable/useSortableItems";

export interface RequirementsTableProps {
  sections: (DocumentSectionRecord & { requirements: RequirementRecord[]; infos: InfoRecord[]; surrogates?: SurrogateReferenceRecord[] })[];
  tenant: string;
  project: string;
  documentSlug: string;
  traceLinks?: TraceLink[];
  onAddRequirement: () => void;
  onAddInfo: () => void;
  onAddSurrogate: () => void;
  onEditRequirement: (requirement: RequirementRecord) => void;
  onOpenFloatingDocument?: () => void;
  onEditMarkdown?: () => void;
  onReorderItems: (sectionId: string, items: Array<{type: 'requirement' | 'info' | 'surrogate', id: string}>) => void;
  sectionsWithUnsavedChanges: Set<string>;
  onSaveReorder: (sectionId: string) => void;
  isSaving: boolean;
}

const DEFAULT_COLUMN_WIDTHS = {
  id: 100,
  description: 300,
  pattern: 120,
  verification: 120,
  rationale: 200,
  complianceStatus: 140,
  complianceRationale: 200,
  qaScore: 80,
  attributes: 200,
  actions: 110
};

export function RequirementsTable({
  sections,
  tenant,
  project,
  documentSlug,
  traceLinks = [],
  onAddRequirement,
  onAddInfo,
  onAddSurrogate,
  onEditRequirement,
  onOpenFloatingDocument,
  onEditMarkdown,
  onReorderItems,
  sectionsWithUnsavedChanges,
  onSaveReorder,
  isSaving
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
    rationale: false,
    complianceStatus: false,
    complianceRationale: false,
    qaScore: true,
    attributes: false,
    actions: true
  });
  const [filters, setFilters] = useState<FilterState>({
    text: "",
    pattern: "",
    verification: "",
    rationale: "",
    complianceStatus: "",
    complianceRationale: "",
    minQaScore: "",
    maxQaScore: "",
    objectTypes: ['requirement', 'info', 'surrogate'] // Default: show all types
  });
  const [attributesEditor, setAttributesEditor] = useState<{
    requirement: RequirementRecord;
    attributes: Record<string, string | number | boolean | null>;
  } | null>(null);
  const [historyModal, setHistoryModal] = useState<{
    requirement: RequirementRecord;
  } | null>(null);
  const tableRef = useRef<HTMLTableElement>(null);
  const api = useApiClient();
  const queryClient = useQueryClient();

  // Use mutations hook
  const { updateRequirementMutation, updateAttributesMutation } = useRequirementMutations(tenant, project, documentSlug);

  const handleFieldUpdate = useCallback((requirement: RequirementRecord, field: string, value: string) => {
    updateRequirementMutation.mutate({ requirement, field, value });
  }, [updateRequirementMutation]);

  // Handler for opening attributes editor
  const handleEditAttributes = useCallback((requirement: RequirementRecord) => {
    setAttributesEditor({
      requirement,
      attributes: requirement.attributes || {}
    });
  }, []);

  // Handler for updating attributes
  const handleAttributesSave = useCallback((attributes: Record<string, string | number | boolean | null>) => {
    if (attributesEditor) {
      updateAttributesMutation.mutate({
        requirement: attributesEditor.requirement,
        attributes
      });
      setAttributesEditor(null);
    }
  }, [attributesEditor, updateAttributesMutation]);

  // Handler for opening version history modal
  const handleViewHistory = useCallback((requirement: RequirementRecord) => {
    setHistoryModal({ requirement });
  }, []);

  // Handler for restore callback - invalidate queries to refresh data
  const handleHistoryRestore = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["sections", tenant, project, documentSlug] });
  }, [queryClient, tenant, project, documentSlug]);

  // Handler for saving view preferences (columns visibility and widths)
  const handleSaveView = useCallback(() => {
    const viewPreferences = {
      visibleColumns,
      columnWidths
    };
    const storageKey = `requirementsTableView:${tenant}:${project}:${documentSlug}`;
    localStorage.setItem(storageKey, JSON.stringify(viewPreferences));

    toast.success('View preferences saved!', {
      description: 'Column visibility and widths will be restored when you return to this document.'
    });
  }, [visibleColumns, columnWidths, tenant, project, documentSlug]);

  // Load saved view preferences on mount
  useEffect(() => {
    const storageKey = `requirementsTableView:${tenant}:${project}:${documentSlug}`;
    const saved = localStorage.getItem(storageKey);
    if (saved) {
      try {
        const viewPreferences = JSON.parse(saved);
        if (viewPreferences.visibleColumns) {
          // Merge with current state to ensure all fields are defined
          setVisibleColumns(prev => ({ ...prev, ...viewPreferences.visibleColumns }));
        }
        if (viewPreferences.columnWidths) {
          setColumnWidths(prev => ({ ...prev, ...viewPreferences.columnWidths }));
        }
      } catch (e) {
        console.error('Failed to load saved view preferences:', e);
      }
    }
  }, [tenant, project, documentSlug]);

  // Setup DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // Require 8px of movement before drag starts
      },
    })
  );

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

  // Use sortable items hook for filtering and sorting
  const { sortedItems, filteredRequirements, filteredItems, sortableItemsBySection } = useSortableItems(sections, filters);

  const clearFilters = () => {
    setFilters({
      text: "",
      pattern: "",
      verification: "",
      rationale: "",
      complianceStatus: "",
      complianceRationale: "",
      minQaScore: "",
      maxQaScore: "",
      objectTypes: ['requirement', 'info', 'surrogate']
    });
  };

  // Handle drag end for reordering items
  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;

    if (!over || active.id === over.id) {
      return;
    }

    // Parse the IDs to get sectionId
    // ID format: type-section-SECTIONID-itemId (where itemId may contain hyphens and colons)
    const activeId = active.id as string;
    const overId = over.id as string;

    // Extract section ID: find "section-" prefix and take the next segment
    const activeSectionMatch = activeId.match(/-(section-[^-]+)-/);
    const overSectionMatch = overId.match(/-(section-[^-]+)-/);

    if (!activeSectionMatch || !overSectionMatch) {
      return;
    }

    const activeSectionId = activeSectionMatch[1];
    const overSectionId = overSectionMatch[1];

    // Only allow reordering within the same section
    if (activeSectionId !== overSectionId) {
      return;
    }

    // Get the sortable items for this section
    const sectionItems = sortableItemsBySection.get(activeSectionId);

    if (!sectionItems || sectionItems.length === 0) {
      return;
    }

    // Find the indices in the sortable items list
    const activeIndex = sectionItems.findIndex(item => item.id === activeId);
    const overIndex = sectionItems.findIndex(item => item.id === overId);

    if (activeIndex === -1 || overIndex === -1) {
      return;
    }

    // Reorder using arrayMove
    const reorderedItems = arrayMove(sectionItems, activeIndex, overIndex);

    // Map back to the simplified format for the handler
    const items = reorderedItems.map(item => ({
      type: item.type,
      id: item.data.id
    }));

    onReorderItems(activeSectionId, items);
  }, [sortableItemsBySection, onReorderItems]);

  const hasActiveFilters =
    filters.text !== "" ||
    filters.pattern !== "" ||
    filters.verification !== "" ||
    filters.rationale !== "" ||
    filters.complianceStatus !== "" ||
    filters.complianceRationale !== "" ||
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
              onClick={handleSaveView}
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
              title="Save current column visibility and widths"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
                <polyline points="17 21 17 13 7 13 7 21"/>
                <polyline points="7 3 7 8 15 8"/>
              </svg>
              Save View
            </button>
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
          visibleColumns={visibleColumns}
        />
      )}

      {showColumnSelector && (
        <ColumnSelector
          visibleColumns={visibleColumns}
          onVisibleColumnsChange={setVisibleColumns}
        />
      )}


      <div style={{ flex: 1, overflow: "auto", scrollBehavior: "smooth", minHeight: 0 }}>
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
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
                {visibleColumns.rationale && (
                  <th style={headerStyle(columnWidths.rationale)}>
                    Rationale
                    <ColumnResizer
                      columnKey="rationale"
                      columnWidths={columnWidths}
                      isResizing={isResizing === "rationale"}
                      onColumnWidthChange={handleColumnWidthChange}
                      onResizingChange={setIsResizing}
                    />
                  </th>
                )}
                {visibleColumns.complianceStatus && (
                  <th style={headerStyle(columnWidths.complianceStatus)}>
                    Compliance Status
                    <ColumnResizer
                      columnKey="complianceStatus"
                      columnWidths={columnWidths}
                      isResizing={isResizing === "complianceStatus"}
                      onColumnWidthChange={handleColumnWidthChange}
                      onResizingChange={setIsResizing}
                    />
                  </th>
                )}
                {visibleColumns.complianceRationale && (
                  <th style={headerStyle(columnWidths.complianceRationale)}>
                    Compliance Rationale
                    <ColumnResizer
                      columnKey="complianceRationale"
                      columnWidths={columnWidths}
                      isResizing={isResizing === "complianceRationale"}
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
                {visibleColumns.attributes && (
                  <th style={headerStyle(columnWidths.attributes)}>
                    Attributes
                    <ColumnResizer
                      columnKey="attributes"
                      columnWidths={columnWidths}
                      isResizing={isResizing === "attributes"}
                      onColumnWidthChange={handleColumnWidthChange}
                      onResizingChange={setIsResizing}
                    />
                  </th>
                )}
                {visibleColumns.actions && (
                  <th style={headerStyle(columnWidths.actions)}>
                    Actions
                    <ColumnResizer
                      columnKey="actions"
                      columnWidths={columnWidths}
                      isResizing={isResizing === "actions"}
                      onColumnWidthChange={handleColumnWidthChange}
                      onResizingChange={setIsResizing}
                    />
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
                filteredItems.map((item) => {
                  if (item.type === 'section-header') {
                    const sectionItems = sortableItemsBySection.get(item.sectionId) || [];
                    const hasUnsavedChanges = sectionsWithUnsavedChanges.has(item.sectionId);
                    return (
                      <React.Fragment key={`section-${item.sectionId}`}>
                        <tr>
                          <td colSpan={visibleColumnCount} style={{
                            padding: "16px 24px",
                            backgroundColor: "#f8fafc",
                            borderTop: "2px solid #e2e8f0",
                            borderBottom: "1px solid #e2e8f0"
                          }}>
                            <div style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between"
                            }}>
                              <div style={{
                                fontWeight: "600",
                                fontSize: "15px",
                                color: "#1e293b"
                              }}>
                                {item.sectionName}
                                {hasUnsavedChanges && (
                                  <span style={{
                                    marginLeft: "8px",
                                    fontSize: "12px",
                                    color: "#f59e0b",
                                    fontWeight: "normal"
                                  }}>
                                    (unsaved changes)
                                  </span>
                                )}
                              </div>
                              {hasUnsavedChanges && (
                                <button
                                  onClick={() => onSaveReorder(item.sectionId)}
                                  disabled={isSaving}
                                  style={{
                                    padding: "6px 12px",
                                    backgroundColor: "#3b82f6",
                                    color: "white",
                                    border: "none",
                                    borderRadius: "4px",
                                    fontSize: "13px",
                                    fontWeight: "500",
                                    cursor: isSaving ? "not-allowed" : "pointer",
                                    opacity: isSaving ? 0.6 : 1
                                  }}
                                >
                                  {isSaving ? "Saving..." : "Save Order"}
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                        {sectionItems.length > 0 && (
                          <SortableContext
                            items={sectionItems.map(si => si.id)}
                            strategy={verticalListSortingStrategy}
                          >
                            {sectionItems.map((sortableItem) => (
                              <SortableRow
                                key={sortableItem.id}
                                item={sortableItem}
                                columnWidths={columnWidths}
                                visibleColumns={visibleColumns}
                                tenant={tenant}
                                project={project}
                                traceLinks={traceLinks}
                                onContextMenu={handleContextMenu}
                                onEdit={onEditRequirement}
                                onFieldUpdate={handleFieldUpdate}
                                onEditAttributes={handleEditAttributes}
                                onViewHistory={handleViewHistory}
                                visibleColumnCount={visibleColumnCount}
                              />
                            ))}
                          </SortableContext>
                        )}
                      </React.Fragment>
                    );
                  }
                  return null;
                })
              )}
            </tbody>
          </table>
        </DndContext>
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
          <button
            onClick={onAddInfo}
            style={{
              backgroundColor: "#059669",
              color: "white",
              border: "none",
              padding: "8px 12px",
              borderRadius: "4px",
              cursor: "pointer"
            }}
          >
            ＋ Add Info
          </button>
          <button
            onClick={onAddSurrogate}
            style={{
              backgroundColor: "#7c3aed",
              color: "white",
              border: "none",
              padding: "8px 12px",
              borderRadius: "4px",
              cursor: "pointer"
            }}
          >
            ＋ Add Surrogate
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

      {attributesEditor && (
        <AttributesEditor
          attributes={attributesEditor.attributes}
          onSave={handleAttributesSave}
          onClose={() => setAttributesEditor(null)}
        />
      )}

      {historyModal && (
        <HistoryModal
          isOpen={true}
          onClose={() => setHistoryModal(null)}
          tenant={tenant}
          project={project}
          requirementId={historyModal.requirement.id}
          requirementRef={historyModal.requirement.ref}
          onRestore={handleHistoryRestore}
        />
      )}
    </div>
  );
}
