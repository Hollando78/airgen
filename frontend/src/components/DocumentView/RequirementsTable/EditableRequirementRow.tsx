import type { RequirementRecord, TraceLink } from "../../../types";
import type { ColumnVisibility } from "./ColumnSelector";
import type { DraggableAttributes } from "@dnd-kit/core";
import type { SyntheticListenerMap } from "@dnd-kit/core/dist/hooks/utilities";
import { LinkIndicators } from "../LinkIndicators";

export interface EditableRequirementRowProps {
  requirement: RequirementRecord;
  columnWidths: Record<string, number>;
  visibleColumns: ColumnVisibility;
  setNodeRef: (node: HTMLElement | null) => void;
  style: React.CSSProperties;
  attributes: DraggableAttributes;
  listeners: SyntheticListenerMap | undefined;
  isDragging: boolean;
  // Editing state
  editingField: string | null;
  editValue: string;
  inputRef: React.RefObject<HTMLTextAreaElement>;
  // Handlers
  onDoubleClick: (field: string, currentValue: string) => void;
  onSave: () => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  onEdit: (requirement: RequirementRecord) => void;
  onContextMenu: (e: React.MouseEvent, requirement: RequirementRecord) => void;
  onEditAttributes?: (requirement: RequirementRecord) => void;
  onViewHistory?: (requirement: RequirementRecord) => void;
  // State setters for inline editing
  setEditValue: (value: string) => void;
  tenant: string;
  project: string;
  traceLinks?: TraceLink[];
}

export function EditableRequirementRow({
  requirement: req,
  columnWidths,
  visibleColumns,
  setNodeRef,
  style,
  attributes,
  listeners,
  isDragging,
  editingField,
  editValue,
  inputRef,
  onDoubleClick,
  onSave,
  onKeyDown,
  onEdit,
  onContextMenu,
  onEditAttributes,
  onViewHistory,
  setEditValue,
  tenant,
  project,
  traceLinks = []
}: EditableRequirementRowProps): JSX.Element {
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
          onDoubleClick={() => onDoubleClick('text', req.text)}
        >
          {editingField === 'text' ? (
            <textarea
              ref={inputRef}
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={onSave}
              onKeyDown={onKeyDown}
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
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
              <span style={{ flex: 1, marginRight: "8px" }}>{req.text}</span>
              <LinkIndicators
                requirementId={req.id}
                traceLinks={traceLinks}
                tenant={tenant}
                project={project}
              />
            </div>
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
        <td
          style={{
            border: "1px solid #e2e8f0",
            padding: "12px",
            width: `${columnWidths.verification}px`,
            cursor: "pointer"
          }}
          onDoubleClick={() => onDoubleClick('verification', req.verification || "")}
        >
          {editingField === 'verification' ? (
            <select
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={onSave}
              onKeyDown={onKeyDown}
              autoFocus
              style={{
                width: "100%",
                padding: "4px 8px",
                border: "2px solid #3b82f6",
                borderRadius: "4px",
                fontSize: "11px",
                fontWeight: "600",
                backgroundColor: "#e0e7ff",
                color: "#4f46e5"
              }}
            >
              <option value="">None</option>
              <option value="Test">Test</option>
              <option value="Analysis">Analysis</option>
              <option value="Inspection">Inspection</option>
              <option value="Demonstration">Demonstration</option>
            </select>
          ) : (
            req.verification ? (
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
            ) : (
              <span style={{ color: "#94a3b8", fontSize: "11px" }}>Double-click to set</span>
            )
          )}
        </td>
      )}
      {visibleColumns.rationale && (
        <td
          style={{
            border: "1px solid #e2e8f0",
            padding: "12px",
            width: `${columnWidths.rationale}px`,
            cursor: "pointer",
            fontSize: "11px"
          }}
          onDoubleClick={() => onDoubleClick('rationale', req.rationale || "")}
        >
          {editingField === 'rationale' ? (
            <textarea
              ref={inputRef}
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={onSave}
              onKeyDown={onKeyDown}
              style={{
                width: "100%",
                minHeight: "60px",
                padding: "4px 8px",
                border: "2px solid #3b82f6",
                borderRadius: "4px",
                fontSize: "11px",
                resize: "vertical"
              }}
            />
          ) : (
            req.rationale ? (
              <span style={{ fontSize: "11px", color: "#1e293b" }}>{req.rationale}</span>
            ) : (
              <span style={{ color: "#94a3b8", fontSize: "11px" }}>Double-click to add</span>
            )
          )}
        </td>
      )}
      {visibleColumns.complianceStatus && (
        <td
          style={{
            border: "1px solid #e2e8f0",
            padding: "12px",
            width: `${columnWidths.complianceStatus}px`,
            cursor: "pointer"
          }}
          onDoubleClick={() => onDoubleClick('complianceStatus', req.complianceStatus || "")}
        >
          {editingField === 'complianceStatus' ? (
            <select
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={onSave}
              onKeyDown={onKeyDown}
              autoFocus
              style={{
                width: "100%",
                padding: "4px 8px",
                border: "2px solid #3b82f6",
                borderRadius: "4px",
                fontSize: "11px",
                fontWeight: "600"
              }}
            >
              <option value="">None</option>
              <option value="N/A">N/A</option>
              <option value="Compliant">Compliant</option>
              <option value="Compliance Risk">Compliance Risk</option>
              <option value="Non-Compliant">Non-Compliant</option>
            </select>
          ) : (
            req.complianceStatus ? (
              <span style={{
                backgroundColor: req.complianceStatus === "Compliant" ? "#d1fae5" :
                               req.complianceStatus === "Compliance Risk" ? "#fed7aa" :
                               req.complianceStatus === "Non-Compliant" ? "#fee2e2" : "#e5e7eb",
                color: req.complianceStatus === "Compliant" ? "#065f46" :
                       req.complianceStatus === "Compliance Risk" ? "#92400e" :
                       req.complianceStatus === "Non-Compliant" ? "#991b1b" : "#374151",
                padding: "4px 8px",
                borderRadius: "4px",
                fontSize: "11px",
                fontWeight: "600"
              }}>
                {req.complianceStatus}
              </span>
            ) : (
              <span style={{ color: "#94a3b8", fontSize: "11px" }}>Double-click to set</span>
            )
          )}
        </td>
      )}
      {visibleColumns.complianceRationale && (
        <td
          style={{
            border: "1px solid #e2e8f0",
            padding: "12px",
            width: `${columnWidths.complianceRationale}px`,
            cursor: "pointer",
            fontSize: "11px"
          }}
          onDoubleClick={() => onDoubleClick('complianceRationale', req.complianceRationale || "")}
        >
          {editingField === 'complianceRationale' ? (
            <textarea
              ref={inputRef}
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={onSave}
              onKeyDown={onKeyDown}
              style={{
                width: "100%",
                minHeight: "60px",
                padding: "4px 8px",
                border: "2px solid #3b82f6",
                borderRadius: "4px",
                fontSize: "11px",
                resize: "vertical"
              }}
            />
          ) : (
            req.complianceRationale ? (
              <span style={{ fontSize: "11px", color: "#1e293b" }}>{req.complianceRationale}</span>
            ) : (
              <span style={{ color: "#94a3b8", fontSize: "11px" }}>Double-click to add</span>
            )
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
      {visibleColumns.attributes && (
        <td
          style={{
            border: "1px solid #e2e8f0",
            padding: "8px",
            width: `${columnWidths.attributes}px`,
            fontSize: "11px",
            cursor: "pointer"
          }}
          onClick={() => onEditAttributes?.(req)}
          title="Click to edit custom attributes"
        >
          {req.attributes && Object.keys(req.attributes).length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              {Object.entries(req.attributes).slice(0, 3).map(([key, value]) => (
                <div key={key} style={{ display: "flex", gap: "4px" }}>
                  <span style={{ fontWeight: "600", color: "#64748b" }}>{key}:</span>
                  <span style={{ color: "#1e293b" }}>
                    {typeof value === 'boolean' ? (value ? 'true' : 'false') : String(value)}
                  </span>
                </div>
              ))}
              {Object.keys(req.attributes).length > 3 && (
                <span style={{ color: "#94a3b8", fontSize: "10px" }}>
                  +{Object.keys(req.attributes).length - 3} more
                </span>
              )}
            </div>
          ) : (
            <span style={{ color: "#94a3b8" }}>Click to add</span>
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
          <div style={{ display: "flex", gap: "4px", justifyContent: "center" }}>
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
              title="Edit requirement"
            >
              Edit
            </button>
            <button
              onClick={() => onViewHistory?.(req)}
              style={{
                background: "none",
                border: "1px solid #d1d5db",
                borderRadius: "4px",
                padding: "4px 8px",
                cursor: "pointer",
                fontSize: "11px",
                color: "#6b7280"
              }}
              title="View version history"
            >
              📜
            </button>
          </div>
        </td>
      )}
    </tr>
  );
}
