import type { InfoRecord } from "../../../types";
import type { DraggableAttributes } from "@dnd-kit/core";
import type { SyntheticListenerMap } from "@dnd-kit/core/dist/hooks/utilities";

export interface InfoRowProps {
  info: InfoRecord;
  visibleColumnCount: number;
  setNodeRef: (node: HTMLElement | null) => void;
  style: React.CSSProperties;
  attributes: DraggableAttributes;
  listeners: SyntheticListenerMap | undefined;
  isDragging: boolean;
}

export function InfoRow({
  info,
  visibleColumnCount,
  setNodeRef,
  style,
  attributes,
  listeners,
  isDragging
}: InfoRowProps): JSX.Element {
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
}
