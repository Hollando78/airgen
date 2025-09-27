import { useState, useRef, useCallback, useMemo } from "react";
import type { RequirementRecord, DocumentSectionRecord, TraceLink } from "../../types";
import { LinkIndicators } from "./LinkIndicators";

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
  const [visibleColumns, setVisibleColumns] = useState({
    id: true,
    description: true,
    pattern: true,
    verification: true,
    qaScore: true,
    actions: true
  });
  const [filters, setFilters] = useState({
    text: "",
    pattern: "",
    verification: "",
    minQaScore: "",
    maxQaScore: ""
  });
  const tableRef = useRef<HTMLTableElement>(null);

  const handleMouseDown = useCallback((e: React.MouseEvent, columnKey: string) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = columnWidths[columnKey as keyof typeof columnWidths];
    setIsResizing(columnKey);

    const handleMouseMove = (e: MouseEvent) => {
      const diff = e.clientX - startX;
      const newWidth = Math.max(50, startWidth + diff);
      
      setColumnWidths(prev => ({
        ...prev,
        [columnKey]: newWidth
      }));
    };

    const handleMouseUp = () => {
      setIsResizing(null);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [columnWidths]);

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

  const ResizeHandle = ({ columnKey }: { columnKey: string }) => (
    <div
      onMouseDown={(e) => handleMouseDown(e, columnKey)}
      style={{
        position: 'absolute',
        right: 0,
        top: 0,
        bottom: 0,
        width: '4px',
        cursor: 'col-resize',
        backgroundColor: isResizing === columnKey ? '#3b82f6' : 'transparent',
        zIndex: 1
      }}
      onMouseEnter={(e) => {
        if (!isResizing) {
          e.currentTarget.style.backgroundColor = '#e2e8f0';
        }
      }}
      onMouseLeave={(e) => {
        if (!isResizing) {
          e.currentTarget.style.backgroundColor = 'transparent';
        }
      }}
    />
  );

  const headerStyle = (width: number) => ({
    border: "1px solid #e2e8f0",
    padding: "12px",
    textAlign: "left" as const,
    width: `${width}px`,
    position: "relative" as const,
    userSelect: "none" as const
  });

  const cellStyle = (width: number) => ({
    border: "1px solid #e2e8f0",
    padding: "12px",
    width: `${width}px`,
    maxWidth: `${width}px`,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const
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
        <div style={{
          padding: "16px 24px",
          backgroundColor: "#f1f5f9",
          borderBottom: "1px solid #e2e8f0",
          display: "grid",
          gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr auto",
          gap: "12px",
          alignItems: "end"
        }}>
          <div>
            <label style={{ display: "block", fontSize: "12px", fontWeight: "500", color: "#374151", marginBottom: "4px" }}>
              Text Search
            </label>
            <input
              type="text"
              placeholder="Search in ID or description..."
              value={filters.text}
              onChange={(e) => setFilters(prev => ({ ...prev, text: e.target.value }))}
              style={{
                width: "100%",
                padding: "6px 8px",
                border: "1px solid #d1d5db",
                borderRadius: "4px",
                fontSize: "12px"
              }}
            />
          </div>
          
          <div>
            <label style={{ display: "block", fontSize: "12px", fontWeight: "500", color: "#374151", marginBottom: "4px" }}>
              Pattern
            </label>
            <select
              value={filters.pattern}
              onChange={(e) => setFilters(prev => ({ ...prev, pattern: e.target.value }))}
              style={{
                width: "100%",
                padding: "6px 8px",
                border: "1px solid #d1d5db",
                borderRadius: "4px",
                fontSize: "12px"
              }}
            >
              <option value="">All</option>
              <option value="ubiquitous">Ubiquitous</option>
              <option value="event">Event</option>
              <option value="state">State</option>
              <option value="unwanted">Unwanted</option>
              <option value="optional">Optional</option>
            </select>
          </div>
          
          <div>
            <label style={{ display: "block", fontSize: "12px", fontWeight: "500", color: "#374151", marginBottom: "4px" }}>
              Verification
            </label>
            <select
              value={filters.verification}
              onChange={(e) => setFilters(prev => ({ ...prev, verification: e.target.value }))}
              style={{
                width: "100%",
                padding: "6px 8px",
                border: "1px solid #d1d5db",
                borderRadius: "4px",
                fontSize: "12px"
              }}
            >
              <option value="">All</option>
              <option value="Test">Test</option>
              <option value="Analysis">Analysis</option>
              <option value="Inspection">Inspection</option>
              <option value="Demonstration">Demonstration</option>
            </select>
          </div>
          
          <div>
            <label style={{ display: "block", fontSize: "12px", fontWeight: "500", color: "#374151", marginBottom: "4px" }}>
              Min QA Score
            </label>
            <input
              type="number"
              min="0"
              max="100"
              placeholder="0"
              value={filters.minQaScore}
              onChange={(e) => setFilters(prev => ({ ...prev, minQaScore: e.target.value }))}
              style={{
                width: "100%",
                padding: "6px 8px",
                border: "1px solid #d1d5db",
                borderRadius: "4px",
                fontSize: "12px"
              }}
            />
          </div>
          
          <div>
            <label style={{ display: "block", fontSize: "12px", fontWeight: "500", color: "#374151", marginBottom: "4px" }}>
              Max QA Score
            </label>
            <input
              type="number"
              min="0"
              max="100"
              placeholder="100"
              value={filters.maxQaScore}
              onChange={(e) => setFilters(prev => ({ ...prev, maxQaScore: e.target.value }))}
              style={{
                width: "100%",
                padding: "6px 8px",
                border: "1px solid #d1d5db",
                borderRadius: "4px",
                fontSize: "12px"
              }}
            />
          </div>
          
          <button
            onClick={clearFilters}
            disabled={!hasActiveFilters}
            style={{
              padding: "6px 12px",
              backgroundColor: hasActiveFilters ? "#ef4444" : "#e5e7eb",
              color: hasActiveFilters ? "white" : "#9ca3af",
              border: "none",
              borderRadius: "4px",
              cursor: hasActiveFilters ? "pointer" : "not-allowed",
              fontSize: "12px",
              whiteSpace: "nowrap"
            }}
          >
            Clear
          </button>
        </div>
      )}

      {showColumnSelector && (
        <div style={{
          padding: "16px 24px",
          backgroundColor: "#f0f9ff",
          borderBottom: "1px solid #e2e8f0",
          display: "flex",
          flexDirection: "column",
          gap: "12px"
        }}>
          <div style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center"
          }}>
            <h4 style={{ margin: 0, fontSize: "14px", fontWeight: "600" }}>
              Column Visibility
            </h4>
            <button
              onClick={() => {
                const allVisible = Object.values(visibleColumns).every(v => v);
                if (allVisible) {
                  // Hide all except description and actions (keep these always visible)
                  setVisibleColumns({
                    id: false,
                    description: true,
                    pattern: false,
                    verification: false,
                    qaScore: false,
                    actions: true
                  });
                } else {
                  // Show all
                  setVisibleColumns({
                    id: true,
                    description: true,
                    pattern: true,
                    verification: true,
                    qaScore: true,
                    actions: true
                  });
                }
              }}
              style={{
                padding: "4px 8px",
                backgroundColor: "transparent",
                color: "#3b82f6",
                border: "1px solid #3b82f6",
                borderRadius: "4px",
                cursor: "pointer",
                fontSize: "11px"
              }}
            >
              {Object.values(visibleColumns).every(v => v) ? "Hide All" : "Show All"}
            </button>
          </div>
          
          <div style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "16px",
            alignItems: "center"
          }}>
            <label style={{ 
              display: "flex", 
              alignItems: "center", 
              gap: "6px", 
              fontSize: "13px",
              minWidth: "60px",
              fontWeight: "500"
            }}>
              <input
                type="checkbox"
                checked={visibleColumns.id}
                onChange={(e) => setVisibleColumns(prev => ({ ...prev, id: e.target.checked }))}
              />
              ID
            </label>
            
            <label style={{ 
              display: "flex", 
              alignItems: "center", 
              gap: "6px", 
              fontSize: "13px",
              minWidth: "120px",
              fontWeight: "500"
            }}>
              <input
                type="checkbox"
                checked={visibleColumns.description}
                onChange={(e) => setVisibleColumns(prev => ({ ...prev, description: e.target.checked }))}
                disabled={true}
              />
              Description
              <span style={{ fontSize: "10px", color: "#9ca3af", fontWeight: "normal" }}>(required)</span>
            </label>
            
            <label style={{ 
              display: "flex", 
              alignItems: "center", 
              gap: "6px", 
              fontSize: "13px",
              minWidth: "80px",
              fontWeight: "500"
            }}>
              <input
                type="checkbox"
                checked={visibleColumns.pattern}
                onChange={(e) => setVisibleColumns(prev => ({ ...prev, pattern: e.target.checked }))}
              />
              Pattern
            </label>
            
            <label style={{ 
              display: "flex", 
              alignItems: "center", 
              gap: "6px", 
              fontSize: "13px",
              minWidth: "100px",
              fontWeight: "500"
            }}>
              <input
                type="checkbox"
                checked={visibleColumns.verification}
                onChange={(e) => setVisibleColumns(prev => ({ ...prev, verification: e.target.checked }))}
              />
              Verification
            </label>
            
            <label style={{ 
              display: "flex", 
              alignItems: "center", 
              gap: "6px", 
              fontSize: "13px",
              minWidth: "90px",
              fontWeight: "500"
            }}>
              <input
                type="checkbox"
                checked={visibleColumns.qaScore}
                onChange={(e) => setVisibleColumns(prev => ({ ...prev, qaScore: e.target.checked }))}
              />
              QA Score
            </label>
            
            <label style={{ 
              display: "flex", 
              alignItems: "center", 
              gap: "6px", 
              fontSize: "13px",
              minWidth: "100px",
              fontWeight: "500"
            }}>
              <input
                type="checkbox"
                checked={visibleColumns.actions}
                onChange={(e) => setVisibleColumns(prev => ({ ...prev, actions: e.target.checked }))}
                disabled={true}
              />
              Actions
              <span style={{ fontSize: "10px", color: "#9ca3af", fontWeight: "normal" }}>(required)</span>
            </label>
          </div>
        </div>
      )}

      <div style={{ flex: 1, overflow: "auto" }}>
        <table ref={tableRef} style={{ borderCollapse: "collapse", fontSize: "14px", minWidth: "100%" }}>
          <thead style={{ position: "sticky", top: 0, backgroundColor: "#f1f5f9" }}>
            <tr>
              {visibleColumns.id && (
                <th style={headerStyle(columnWidths.id)}>
                  ID
                  <ResizeHandle columnKey="id" />
                </th>
              )}
              {visibleColumns.description && (
                <th style={headerStyle(columnWidths.description)}>
                  Description
                  <ResizeHandle columnKey="description" />
                </th>
              )}
              {visibleColumns.pattern && (
                <th style={headerStyle(columnWidths.pattern)}>
                  Pattern
                  <ResizeHandle columnKey="pattern" />
                </th>
              )}
              {visibleColumns.verification && (
                <th style={headerStyle(columnWidths.verification)}>
                  Verification
                  <ResizeHandle columnKey="verification" />
                </th>
              )}
              {visibleColumns.qaScore && (
                <th style={headerStyle(columnWidths.qaScore)}>
                  QA Score
                  <ResizeHandle columnKey="qaScore" />
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
                <tr key={req.id} style={{ backgroundColor: index % 2 === 0 ? "white" : "#f8f9fa" }}>
                  {visibleColumns.id && (
                    <td style={cellStyle(columnWidths.id)} title={req.ref}>{req.ref}</td>
                  )}
                  {visibleColumns.description && (
                    <td style={cellStyle(columnWidths.description)} title={req.text}>
                      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
                        <span style={{ flex: 1, marginRight: "8px" }}>{req.text}</span>
                        <LinkIndicators 
                          requirementId={req.id}
                          traceLinks={traceLinks}
                          tenant={tenant}
                          project={project}
                        />
                      </div>
                    </td>
                  )}
                  {visibleColumns.pattern && (
                    <td style={cellStyle(columnWidths.pattern)}>
                      <span style={{ padding: "2px 6px", borderRadius: "3px", fontSize: "12px", backgroundColor: "#e2e8f0" }}>
                        {req.pattern || "—"}
                      </span>
                    </td>
                  )}
                  {visibleColumns.verification && (
                    <td style={cellStyle(columnWidths.verification)}>
                      <span style={{ padding: "2px 6px", borderRadius: "3px", fontSize: "12px", backgroundColor: "#e2e8f0" }}>
                        {req.verification || "—"}
                      </span>
                    </td>
                  )}
                  {visibleColumns.qaScore && (
                    <td style={{ ...cellStyle(columnWidths.qaScore), textAlign: "center" }}>
                      {req.qaScore ? (
                        <span
                          style={{
                            padding: "2px 6px",
                            borderRadius: "3px",
                            fontSize: "12px",
                            backgroundColor:
                              req.qaScore >= 80 ? "#d4edda" : req.qaScore >= 60 ? "#fff3cd" : "#f8d7da",
                            color:
                              req.qaScore >= 80 ? "#155724" : req.qaScore >= 60 ? "#856404" : "#721c24"
                          }}
                        >
                          {req.qaScore}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                  )}
                  {visibleColumns.actions && (
                    <td style={{ ...cellStyle(columnWidths.actions), textAlign: "center" }}>
                      <button
                        onClick={() => onEditRequirement(req)}
                        style={{
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          padding: "4px",
                          borderRadius: "3px"
                        }}
                      >
                        ✏️
                      </button>
                    </td>
                  )}
                </tr>
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
    </div>
  );
}