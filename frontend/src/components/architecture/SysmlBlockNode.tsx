import type { NodeProps } from "@xyflow/react";
import { Handle, NodeResizer, Position } from "@xyflow/react";
import type { SysmlBlock } from "../../hooks/useArchitectureApi";
import type { DocumentRecord } from "../../types";

export type SysmlBlockNodeData = {
  block: SysmlBlock;
  documents?: DocumentRecord[];
  onOpenDocument?: (documentSlug: string) => void;
};

function formatStereotype(value?: string) {
  if (!value || !value.trim()) return "«block»";
  const trimmed = value.trim();
  return trimmed.startsWith("«") ? trimmed : `«${trimmed.replace(/^<</, "").replace(/>>$/, "")}»`;
}

export function SysmlBlockNode({ id, data, selected }: NodeProps) {
  const { block, documents = [], onOpenDocument } = data as SysmlBlockNodeData;
  const leftPorts = block.ports.filter(port => port.direction !== "out");
  const rightPorts = block.ports.filter(port => port.direction !== "in");
  
  // Get linked documents
  const linkedDocuments = documents.filter(doc => 
    block.documentIds?.includes(doc.id)
  );

  const baseHeight = 56;
  const portSpacing = 22;

  // Apply block styling properties with defaults
  const blockStyle = {
    width: block.size.width,
    height: block.size.height,
    background: block.backgroundColor || "#ffffff",
    border: selected 
      ? "2px solid #2563eb" 
      : `${block.borderWidth || 1}px ${block.borderStyle || "solid"} ${block.borderColor || "#cbd5f5"}`,
    borderRadius: `${block.borderRadius || 8}px`,
    boxShadow: selected ? "0 8px 16px rgba(37, 99, 235, 0.25)" : "0 4px 12px rgba(15, 23, 42, 0.18)",
    outline: selected ? "3px solid rgba(59, 130, 246, 0.35)" : "none",
    outlineOffset: "4px",
    fontFamily: "'Inter', sans-serif",
    color: block.textColor || "#1f2937",
    position: "relative" as const,
    overflow: "hidden" as const,
    cursor: "pointer",
    fontSize: `${block.fontSize || 14}px`,
    fontWeight: block.fontWeight || "normal"
  };

  return (
    <div style={blockStyle}>
      <NodeResizer 
        minHeight={140} 
        minWidth={220} 
        maxWidth={500}
        maxHeight={400}
        isVisible={selected}
        shouldResize={() => true}
        lineStyle={{ 
          stroke: "#2563eb", 
          strokeWidth: 2,
          strokeDasharray: "4 4"
        }} 
        handleStyle={{ 
          fill: "#2563eb", 
          stroke: "#ffffff",
          strokeWidth: 2,
          width: 16, 
          height: 16,
          borderRadius: 3,
          cursor: "nwse-resize"
        }}
        lineClassName="node-resizer-line"
        handleClassName="node-resizer-handle"
      />
      <div style={{ 
        padding: "12px 16px", 
        position: "relative", 
        height: "100%",
        pointerEvents: "auto",
        overflow: "hidden"
      }}>
        <div style={{ 
          fontSize: `${(block.fontSize || 14) * 0.85}px`, 
          textTransform: "uppercase", 
          color: block.textColor ? `${block.textColor}99` : "#475569", 
          letterSpacing: "0.08em",
          fontWeight: block.fontWeight || "normal"
        }}>
          {formatStereotype(block.stereotype)}
        </div>
        <div style={{ 
          fontWeight: block.fontWeight === "bold" ? 700 : 600, 
          fontSize: `${(block.fontSize || 14) * 1.15}px`, 
          marginTop: "4px",
          color: block.textColor || "#1f2937"
        }}>
          {block.name}
        </div>
        {block.description && (
          <div style={{ 
            marginTop: "8px", 
            fontSize: `${(block.fontSize || 14) * 0.85}px`, 
            color: block.textColor ? `${block.textColor}cc` : "#6b7280",
            fontWeight: block.fontWeight || "normal"
          }}>
            {block.description}
          </div>
        )}
        
        {linkedDocuments.length > 0 && (
          <div style={{ marginTop: "12px", borderTop: "1px solid #e2e8f0", paddingTop: "8px" }}>
            <div style={{ 
              fontSize: "11px", 
              color: "#64748b", 
              marginBottom: "6px",
              display: "flex",
              alignItems: "center",
              gap: "4px"
            }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14,2 14,8 20,8"/>
              </svg>
              Documents ({linkedDocuments.length})
            </div>
            <div style={{ display: "grid", gap: "4px" }}>
              {linkedDocuments.map(doc => (
                <button
                  key={doc.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenDocument?.(doc.slug);
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    fontSize: "12px",
                    background: "#dbeafe",
                    borderRadius: "6px",
                    padding: "6px 8px",
                    border: "1px solid #bfdbfe",
                    cursor: "pointer",
                    transition: "all 0.2s ease",
                    width: "100%",
                    textAlign: "left"
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "#bfdbfe";
                    e.currentTarget.style.borderColor = "#93c5fd";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "#dbeafe";
                    e.currentTarget.style.borderColor = "#bfdbfe";
                  }}
                  title={`Open document: ${doc.name}`}
                >
                  <span style={{ 
                    color: "#1e40af",
                    fontWeight: 500,
                    textOverflow: "ellipsis",
                    overflow: "hidden",
                    whiteSpace: "nowrap"
                  }}>
                    {doc.name}
                  </span>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: "#3b82f6", flexShrink: 0 }}>
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                    <polyline points="15,3 21,3 21,9"/>
                    <line x1="10" y1="14" x2="21" y2="3"/>
                  </svg>
                </button>
              ))}
            </div>
          </div>
        )}
        
        {block.ports.length > 0 && (
          <div style={{ marginTop: "12px", borderTop: "1px solid #e2e8f0", paddingTop: "8px" }}>
            <div style={{ fontSize: "11px", color: "#64748b", marginBottom: "6px" }}>Ports</div>
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: "4px" }}>
              {block.ports.map(port => (
                <li key={port.id} style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: "12px",
                  background: "#f8fafc",
                  borderRadius: "6px",
                  padding: "4px 6px",
                  border: "1px solid #e2e8f0"
                }}>
                  <span>{port.name}</span>
                  <span style={{ textTransform: "uppercase", color: "#64748b", fontSize: "10px" }}>{port.direction}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {leftPorts.map((port, index) => (
        <Handle
          key={`in-${port.id}`}
          id={`in-${port.id}`}
          type="target"
          position={Position.Left}
          style={{
            top: Math.min(block.size.height - 24, baseHeight + index * portSpacing),
            background: "#0ea5e9",
            border: "3px solid #bae6fd",
            width: "16px",
            height: "16px",
            borderRadius: "8px",
            cursor: "crosshair",
            transition: "all 0.2s ease",
            zIndex: 10
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "#0284c7";
            e.currentTarget.style.borderColor = "#7dd3fc";
            e.currentTarget.style.transform = "scale(1.2)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "#0ea5e9";
            e.currentTarget.style.borderColor = "#bae6fd";
            e.currentTarget.style.transform = "scale(1)";
          }}
        />
      ))}
      {rightPorts.map((port, index) => (
        <Handle
          key={`out-${port.id}`}
          id={`out-${port.id}`}
          type="source"
          position={Position.Right}
          style={{
            top: Math.min(block.size.height - 24, baseHeight + index * portSpacing),
            background: "#22c55e",
            border: "3px solid #bbf7d0",
            width: "16px",
            height: "16px",
            borderRadius: "8px",
            cursor: "crosshair",
            transition: "all 0.2s ease",
            zIndex: 10
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "#16a34a";
            e.currentTarget.style.borderColor = "#86efac";
            e.currentTarget.style.transform = "scale(1.2)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "#22c55e";
            e.currentTarget.style.borderColor = "#bbf7d0";
            e.currentTarget.style.transform = "scale(1)";
          }}
        />
      ))}

      <Handle
        id="default-in"
        type="target"
        position={Position.Top}
        style={{
          background: "#0ea5e9",
          border: "3px solid #bae6fd",
          width: "16px",
          height: "16px",
          borderRadius: "8px",
          cursor: "crosshair",
          transition: "all 0.2s ease",
          zIndex: 10
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "#0284c7";
          e.currentTarget.style.borderColor = "#7dd3fc";
          e.currentTarget.style.transform = "scale(1.2)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "#0ea5e9";
          e.currentTarget.style.borderColor = "#bae6fd";
          e.currentTarget.style.transform = "scale(1)";
        }}
      />
      <Handle
        id="default-out"
        type="source"
        position={Position.Bottom}
        style={{
          background: "#22c55e",
          border: "3px solid #bbf7d0",
          width: "16px",
          height: "16px",
          borderRadius: "8px",
          cursor: "crosshair",
          transition: "all 0.2s ease",
          zIndex: 10
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "#16a34a";
          e.currentTarget.style.borderColor = "#86efac";
          e.currentTarget.style.transform = "scale(1.2)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "#22c55e";
          e.currentTarget.style.borderColor = "#bbf7d0";
          e.currentTarget.style.transform = "scale(1)";
        }}
      />
    </div>
  );
}
