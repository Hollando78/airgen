import React, { useState, useRef, useCallback, useMemo, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, DragEndEvent } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
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
  qaScore: 80,
  actions: 60
};

// Define types for sortable items
type SortableItemData = {
  id: string;
  type: 'requirement' | 'info' | 'surrogate';
  sectionId: string;
  data: RequirementRecord | InfoRecord | SurrogateReferenceRecord;
};

// SortableRow component for drag-and-drop
interface SortableRowProps {
  item: SortableItemData;
  columnWidths: Record<string, number>;
  visibleColumns: ColumnVisibility;
  tenant: string;
  project: string;
  traceLinks: TraceLink[];
  onContextMenu: (e: React.MouseEvent, requirement: RequirementRecord) => void;
  onEdit: (requirement: RequirementRecord) => void;
  onFieldUpdate?: (requirement: RequirementRecord, field: string, value: string) => void;
  visibleColumnCount: number;
}

function SortableRow({
  item,
  columnWidths,
  visibleColumns,
  tenant,
  project,
  traceLinks,
  onContextMenu,
  onEdit,
  onFieldUpdate,
  visibleColumnCount
}: SortableRowProps): JSX.Element {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: item.id });

  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string>("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editingField && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingField]);

  const handleDoubleClick = (field: string, currentValue: string) => {
    if (field === 'id') return;
    setEditingField(field);
    setEditValue(currentValue || "");
  };

  const handleSave = () => {
    if (editingField && onFieldUpdate && item.type === 'requirement') {
      const req = item.data as RequirementRecord;
      if (editValue !== req[editingField as keyof RequirementRecord]) {
        onFieldUpdate(req, editingField, editValue);
      }
    }
    setEditingField(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSave();
    } else if (e.key === 'Escape') {
      setEditingField(null);
    }
  };

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    backgroundColor: isDragging ? "#f0f9ff" : undefined
  };

  if (item.type === 'info') {
    const info = item.data as InfoRecord;
    return (
      <tr ref={setNodeRef} style={style}>
        <td colSpan={visibleColumnCount} style={{
          border: "1px solid #bae6fd",
          padding: "12px 16px",
          backgroundColor: "#f0f9ff"
        }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: "12px" }}>
            <div
              {...attributes}
              {...listeners}
              style={{
                cursor: isDragging ? "grabbing" : "grab",
                fontSize: "16px",
                lineHeight: "1",
                marginTop: "2px",
                color: "#64748b",
                userSelect: "none",
                touchAction: "none"
              }}
            >
              ⋮⋮
            </div>
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
      <tr ref={setNodeRef} style={style}>
        <td colSpan={visibleColumnCount} style={{
          border: "1px solid #d8b4fe",
          padding: "12px 16px",
          backgroundColor: "#faf5ff"
        }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: "12px" }}>
              <div
                {...attributes}
                {...listeners}
                style={{
                  cursor: isDragging ? "grabbing" : "grab",
                  fontSize: "16px",
                  lineHeight: "1",
                  marginTop: "2px",
                  color: "#64748b",
                  userSelect: "none",
                  touchAction: "none"
                }}
              >
                ⋮⋮
              </div>
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
              {surrogate.slug.match(/\.(pdf|docx?|pptx?|xlsx?)$/i) ? (
                <embed
                  src={`/api/documents/${tenant}/${project}/${surrogate.slug}/view`}
                  type="application/pdf"
                  style={{
                    width: `${currentWidth}px`,
                    height: `${Math.floor(currentWidth * 1.414)}px`,
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
    // Requirement row
    const req = item.data as RequirementRecord;
    return (
      <tr ref={setNodeRef} style={style}>
        {visibleColumns.id && (
          <td style={{
            border: "1px solid #e2e8f0",
            padding: "12px",
            width: `${columnWidths.id}px`,
            position: "relative"
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <div
                {...attributes}
                {...listeners}
                style={{
                  cursor: isDragging ? "grabbing" : "grab",
                  fontSize: "16px",
                  lineHeight: "1",
                  color: "#64748b",
                  userSelect: "none",
                  touchAction: "none"
                }}
              >
                ⋮⋮
              </div>
              <span style={{
                fontFamily: "monospace",
                fontSize: "12px",
                backgroundColor: "#f1f5f9",
                padding: "2px 6px",
                borderRadius: "4px"
              }}>
                {req.ref}
              </span>
            </div>
          </td>
        )}
        {visibleColumns.description && (
          <td
            style={{
              border: "1px solid #e2e8f0",
              padding: "12px",
              width: `${columnWidths.description}px`,
              whiteSpace: editingField === 'text' ? 'normal' : 'normal',
              cursor: editingField === 'text' ? 'text' : 'default'
            }}
            onDoubleClick={() => handleDoubleClick('text', req.text)}
          >
            {editingField === 'text' ? (
              <textarea
                ref={inputRef}
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onBlur={handleSave}
                onKeyDown={handleKeyDown}
                style={{
                  width: "100%",
                  minHeight: "60px",
                  padding: "4px",
                  border: "2px solid #3b82f6",
                  borderRadius: "4px",
                  fontSize: "13px",
                  fontFamily: "inherit",
                  resize: "vertical"
                }}
              />
            ) : (
              req.text
            )}
          </td>
        )}
        {visibleColumns.pattern && (
          <td style={{
            border: "1px solid #e2e8f0",
            padding: "12px",
            width: `${columnWidths.pattern}px`
          }}>
            {req.pattern && (
              <span style={{
                backgroundColor: "#e0f2fe",
                color: "#0369a1",
                padding: "4px 8px",
                borderRadius: "4px",
                fontSize: "11px",
                fontWeight: "600"
              }}>
                {req.pattern}
              </span>
            )}
          </td>
        )}
        {visibleColumns.verification && (
          <td style={{
            border: "1px solid #e2e8f0",
            padding: "12px",
            width: `${columnWidths.verification}px`
          }}>
            {req.verification && (
              <span style={{
                backgroundColor: "#e0e7ff",
                color: "#4f46e5",
                padding: "4px 8px",
                borderRadius: "4px",
                fontSize: "11px",
                fontWeight: "600"
              }}>
                {req.verification}
              </span>
            )}
          </td>
        )}
        {visibleColumns.qaScore && (
          <td style={{
            border: "1px solid #e2e8f0",
            padding: "12px",
            width: `${columnWidths.qaScore}px`,
            textAlign: "center"
          }}>
            {req.qaScore !== null && req.qaScore !== undefined ? (
              <span style={{
                fontWeight: "bold",
                color: req.qaScore >= 80 ? "#059669" : req.qaScore >= 60 ? "#f59e0b" : "#dc2626"
              }}>
                {req.qaScore}
              </span>
            ) : (
              <span style={{ color: "#94a3b8" }}>-</span>
            )}
          </td>
        )}
        {visibleColumns.actions && (
          <td style={{
            border: "1px solid #e2e8f0",
            padding: "12px",
            width: `${columnWidths.actions}px`,
            textAlign: "center"
          }}>
            <button
              onClick={() => onEdit(req)}
              onContextMenu={(e) => onContextMenu(e, req)}
              style={{
                background: "none",
                border: "1px solid #d1d5db",
                borderRadius: "4px",
                padding: "4px 8px",
                cursor: "pointer",
                fontSize: "11px",
                color: "#6b7280"
              }}
            >
              Edit
            </button>
          </td>
        )}
      </tr>
    );
  }
}

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

  // Mutation for inline field updates with optimistic updates
  const updateRequirementMutation = useMutation({
    mutationFn: async ({ requirement, field, value }: { requirement: RequirementRecord; field: string; value: string }) => {
      const updates: Partial<RequirementRecord> = { [field]: value };
      return api.updateRequirement(tenant, project, requirement.id, updates);
    },
    onMutate: async ({ requirement, field, value }) => {
      // Cancel any outgoing refetches to avoid overwriting optimistic update
      await queryClient.cancelQueries({ queryKey: ["sections", tenant, project, documentSlug] });

      // Snapshot the previous value
      const previousSections = queryClient.getQueryData(["sections", tenant, project, documentSlug]);

      // Optimistically update the requirement in sections
      queryClient.setQueryData(["sections", tenant, project, documentSlug], (old: any) => {
        if (!old?.sections) return old;

        return {
          ...old,
          sections: old.sections.map((section: any) => ({
            ...section,
            requirements: section.requirements?.map((req: RequirementRecord) =>
              req.id === requirement.id ? { ...req, [field]: value } : req
            )
          }))
        };
      });

      // Return context with the previous value
      return { previousSections };
    },
    onError: (err, variables, context) => {
      // If mutation fails, rollback to previous value and refetch
      if (context?.previousSections) {
        queryClient.setQueryData(
          ["sections", tenant, project, documentSlug],
          context.previousSections
        );
      }
      // Only refetch on error to show user the correct server state
      queryClient.invalidateQueries({ queryKey: ["sections", tenant, project, documentSlug] });
    }
    // Note: We don't refetch on success - the optimistic update is trusted
    // The next time the user navigates away and back, they'll get fresh data
  });

  const handleFieldUpdate = useCallback((requirement: RequirementRecord, field: string, value: string) => {
    updateRequirementMutation.mutate({ requirement, field, value });
  }, [updateRequirementMutation]);

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
      // Use stored order field if available, otherwise use index
      const sectionItems = [
        ...section.requirements.map((req, idx) => ({
          type: 'requirement' as const,
          data: req,
          order: req.order ?? idx,
          sectionName: section.name,
          sectionOrder: sectionIndex
        })),
        ...(section.infos || []).map((info, idx) => ({
          type: 'info' as const,
          data: info,
          order: info.order ?? (section.requirements.length + idx),
          sectionName: section.name,
          sectionOrder: sectionIndex
        })),
        ...(section.surrogates || []).map((surrogate, idx) => ({
          type: 'surrogate' as const,
          data: surrogate,
          order: surrogate.order ?? (section.requirements.length + (section.infos?.length || 0) + idx),
          sectionName: section.name,
          sectionOrder: sectionIndex
        }))
      ];

      // Sort items within this section by order
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

  // Create sortable items grouped by section for drag-and-drop
  const sortableItemsBySection = useMemo(() => {
    const itemsBySectionMap = new Map<string, SortableItemData[]>();
    let currentSectionId: string | null = null;

    filteredItems.forEach(item => {
      if (item.type === 'section-header') {
        // Initialize the section in the map and track it as current
        currentSectionId = item.sectionId;
        if (!itemsBySectionMap.has(item.sectionId)) {
          itemsBySectionMap.set(item.sectionId, []);
        }
      } else {
        // Use the current section ID from the most recent section header
        if (currentSectionId) {
          if (!itemsBySectionMap.has(currentSectionId)) {
            itemsBySectionMap.set(currentSectionId, []);
          }

          // Create a unique ID for the sortable item: type-sectionId-itemId
          const sortableId = `${item.type}-${currentSectionId}-${item.data.id}`;

          itemsBySectionMap.get(currentSectionId)!.push({
            id: sortableId,
            type: item.type,
            sectionId: currentSectionId,
            data: item.data
          });
        }
      }
    });

    return itemsBySectionMap;
  }, [filteredItems, sections]);

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
    </div>
  );
}
