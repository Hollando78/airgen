import type { NodeProps } from "@xyflow/react";
import { Handle, NodeResizer, Position } from "@xyflow/react";
import type { SysmlBlock } from "../../hooks/useArchitecture";

export type SysmlBlockNodeData = {
  block: SysmlBlock;
};

function formatStereotype(value?: string) {
  if (!value || !value.trim()) return "«block»";
  const trimmed = value.trim();
  return trimmed.startsWith("«") ? trimmed : `«${trimmed.replace(/^<</, "").replace(/>>$/, "")}»`;
}

export function SysmlBlockNode({ id, data, selected }: NodeProps) {
  const { block } = data as SysmlBlockNodeData;
  const leftPorts = block.ports.filter(port => port.direction !== "out");
  const rightPorts = block.ports.filter(port => port.direction !== "in");

  const baseHeight = 56;
  const portSpacing = 22;

  return (
    <div
      style={{
        width: block.size.width,
        height: block.size.height,
        background: "#ffffff",
        border: selected ? "2px solid #2563eb" : "1px solid #cbd5f5",
        borderRadius: "8px",
        boxShadow: selected ? "0 8px 16px rgba(37, 99, 235, 0.25)" : "0 4px 12px rgba(15, 23, 42, 0.18)",
        outline: selected ? "3px solid rgba(59, 130, 246, 0.35)" : "none",
        outlineOffset: "4px",
        fontFamily: "'Inter', sans-serif",
        color: "#1f2937",
        position: "relative",
        overflow: "hidden",
        cursor: "pointer"
      }}
    >
      <NodeResizer minHeight={120} minWidth={200} isVisible={selected} lineStyle={{ stroke: "#2563eb" }} handleStyle={{ fill: "#2563eb" }} />
      <div style={{ padding: "12px 16px", position: "relative", height: "100%" }}>
        <div style={{ fontSize: "12px", textTransform: "uppercase", color: "#475569", letterSpacing: "0.08em" }}>
          {formatStereotype(block.stereotype)}
        </div>
        <div style={{ fontWeight: 600, fontSize: "16px", marginTop: "4px" }}>{block.name}</div>
        {block.description && (
          <div style={{ marginTop: "8px", fontSize: "12px", color: "#6b7280" }}>{block.description}</div>
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
            border: "2px solid #bae6fd"
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
            border: "2px solid #bbf7d0"
          }}
        />
      ))}

      <Handle
        id="default-in"
        type="target"
        position={Position.Top}
        style={{ background: "#0ea5e9", border: "2px solid #bae6fd" }}
      />
      <Handle
        id="default-out"
        type="source"
        position={Position.Bottom}
        style={{ background: "#22c55e", border: "2px solid #bbf7d0" }}
      />
    </div>
  );
}
