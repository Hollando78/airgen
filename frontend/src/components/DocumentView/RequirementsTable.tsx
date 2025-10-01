import { useState, useRef, useCallback, useMemo } from "react";
import type { RequirementRecord, DocumentSectionRecord, TraceLink, TraceLinkType } from "../../types";
import { RequirementContextMenu } from "../RequirementContextMenu";
import { LinkTypeSelectionModal } from "../LinkTypeSelectionModal";
import { useRequirementLinking } from "../../contexts/RequirementLinkingContext";
import { ColumnResizer } from "./RequirementsTable/ColumnResizer";
import { ColumnSelector, type ColumnVisibility } from "./RequirementsTable/ColumnSelector";
import { TableFilterBar, type FilterState } from "./RequirementsTable/TableFilterBar";
import { RequirementRow } from "./RequirementsTable/RequirementRow";

export interface RequirementsTableProps {
  section: DocumentSectionRecord & { requirements: RequirementRecord[] };
  tenant: string;
  project: string;
  traceLinks?: TraceLink[];
  onAddRequirement: () => void;
  onEditRequirement: (requirement: RequirementRecord) => void;
  onOpenFloatingDocument?: () => void;
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
  section,
  tenant,
  project,
  traceLinks = [],
  onAddRequirement,
  onEditRequirement,
  onOpenFloatingDocument
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
    maxQaScore: ""
  });
  const tableRef = useRef<HTMLTableElement>(null);

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

  const filteredRequirements = useMemo(() => {
    return section.requirements.filter(req => {
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
  }, [section.requirements, filters]);

  const clearFilters = () => {
    setFilters({
      text: "",
      pattern: "",
      verification: "",
      minQaScore: "",
      maxQaScore: ""
    });
  };

  const hasActiveFilters = Object.values(filters).some(value => value !== "");
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
    <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
      <div style={{
        padding: "16px 24px",
        borderBottom: "1px solid #e2e8f0",
        backgroundColor: "#f8f9fa"
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
          <h2 style={{ margin: 0, fontSize: "18px" }}>{section.name}</h2>
          <div style={{ display: "flex", gap: "8px" }}>
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
              🔍 Filter {hasActiveFilters && `(${filteredRequirements.length}/${section.requirements.length})`}
            </button>
          </div>
        </div>
        <p style={{ margin: "4px 0 0 0", color: "#64748b", fontSize: "14px" }}>
          {section.description}
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

      <div style={{ flex: 1, overflow: "auto" }}>
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
            {filteredRequirements.length === 0 ? (
              <tr>
                <td colSpan={visibleColumnCount} style={{
                  border: "1px solid #e2e8f0",
                  padding: "40px",
                  textAlign: "center",
                  color: "#64748b"
                }}>
                  {section.requirements.length === 0
                    ? "No requirements in this section yet"
                    : "No requirements match the current filters"
                  }
                </td>
              </tr>
            ) : (
              filteredRequirements.map((req: RequirementRecord, index: number) => (
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
              ))
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
          <strong>{filteredRequirements.length}</strong> of <strong>{section.requirements.length}</strong> requirement{section.requirements.length !== 1 ? 's' : ''} {hasActiveFilters ? '(filtered)' : ''}
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
          <a
            href={`#/documents/${tenant}/${project}/${section.documentSlug}/sections/${section.id}`}
            style={{
              color: "#2563eb",
              textDecoration: "none",
              padding: "8px 12px"
            }}
          >
            Open in detail
          </a>
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
