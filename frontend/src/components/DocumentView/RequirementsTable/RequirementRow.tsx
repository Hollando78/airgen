import type { RequirementRecord, TraceLink } from "../../../types";
import { LinkIndicators } from "../LinkIndicators";
import type { ColumnVisibility } from "./ColumnSelector";

/**
 * Props for the RequirementRow component
 */
export interface RequirementRowProps {
  /** Requirement record to display */
  requirement: RequirementRecord;
  /** Row index for alternating colors */
  index: number;
  /** Column widths map */
  columnWidths: Record<string, number>;
  /** Visible columns configuration */
  visibleColumns: ColumnVisibility;
  /** Tenant slug */
  tenant: string;
  /** Project key */
  project: string;
  /** Trace links for this requirement */
  traceLinks: TraceLink[];
  /** Handler for context menu */
  onContextMenu: (e: React.MouseEvent, requirement: RequirementRecord) => void;
  /** Handler for edit button click */
  onEdit: (requirement: RequirementRecord) => void;
}

/**
 * Individual requirement row component displaying all requirement data
 * with conditional column visibility
 */
export function RequirementRow({
  requirement,
  index,
  columnWidths,
  visibleColumns,
  tenant,
  project,
  traceLinks,
  onContextMenu,
  onEdit
}: RequirementRowProps): JSX.Element {
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
    <tr
      style={{
        backgroundColor: index % 2 === 0 ? "white" : "#f8f9fa",
        cursor: "pointer"
      }}
      onContextMenu={(e) => onContextMenu(e, requirement)}
    >
      {visibleColumns.id && (
        <td style={cellStyle(columnWidths.id)} title={requirement.ref}>{requirement.ref}</td>
      )}
      {visibleColumns.description && (
        <td style={cellStyle(columnWidths.description)} title={requirement.text}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
            <span style={{ flex: 1, marginRight: "8px" }}>{requirement.text}</span>
            <LinkIndicators
              requirementId={requirement.id}
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
            {requirement.pattern || "—"}
          </span>
        </td>
      )}
      {visibleColumns.verification && (
        <td style={cellStyle(columnWidths.verification)}>
          <span style={{ padding: "2px 6px", borderRadius: "3px", fontSize: "12px", backgroundColor: "#e2e8f0" }}>
            {requirement.verification || "—"}
          </span>
        </td>
      )}
      {visibleColumns.qaScore && (
        <td style={{ ...cellStyle(columnWidths.qaScore), textAlign: "center" }}>
          {requirement.qaScore ? (
            <span
              style={{
                padding: "2px 6px",
                borderRadius: "3px",
                fontSize: "12px",
                backgroundColor:
                  requirement.qaScore >= 80 ? "#d4edda" : requirement.qaScore >= 60 ? "#fff3cd" : "#f8d7da",
                color:
                  requirement.qaScore >= 80 ? "#155724" : requirement.qaScore >= 60 ? "#856404" : "#721c24"
              }}
            >
              {requirement.qaScore}
            </span>
          ) : (
            "—"
          )}
        </td>
      )}
      {visibleColumns.actions && (
        <td style={{ ...cellStyle(columnWidths.actions), textAlign: "center" }}>
          <button
            onClick={() => onEdit(requirement)}
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
  );
}
