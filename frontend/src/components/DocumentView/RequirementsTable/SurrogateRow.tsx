import type { SurrogateReferenceRecord } from "../../../types";
import type { DraggableAttributes } from "@dnd-kit/core";
import type { SyntheticListenerMap } from "@dnd-kit/core/dist/hooks/utilities";

export interface SurrogateRowProps {
  surrogate: SurrogateReferenceRecord;
  visibleColumnCount: number;
  tenant: string;
  project: string;
  setNodeRef: (node: HTMLElement | null) => void;
  style: React.CSSProperties;
  attributes: DraggableAttributes;
  listeners: SyntheticListenerMap | undefined;
  isDragging: boolean;
}

export function SurrogateRow({
  surrogate,
  visibleColumnCount,
  tenant,
  project,
  setNodeRef,
  style,
  attributes,
  listeners,
  isDragging
}: SurrogateRowProps): JSX.Element {
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
}
