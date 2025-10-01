import { useState, useRef, useCallback, useEffect, Fragment, type MouseEvent } from "react";
import type { NodeProps } from "@xyflow/react";
import { Handle, NodeResizer, Position, useUpdateNodeInternals } from "@xyflow/react";
import type { SysmlBlock } from "../../hooks/useArchitectureApi";
import type { DocumentRecord } from "../../types";
import { DiagramContextMenu } from "../diagram/DiagramContextMenu";

export type SysmlBlockNodeData = {
  block: SysmlBlock;
  documents?: DocumentRecord[];
  onOpenDocument?: (documentSlug: string) => void;
  hideDefaultHandles?: boolean; // Hide default top/bottom handles (for interface view)
  isConnectMode?: boolean; // Whether ports should act as connection handles
  selectedPortId?: string | null; // Currently selected port ID
  onSelectPort?: (blockId: string, portId: string | null) => void;
  updatePort?: (blockId: string, portId: string, updates: { edge?: "top" | "right" | "bottom" | "left"; offset?: number }) => void;
  removePort?: (blockId: string, portId: string) => void;
};

function formatStereotype(value?: string) {
  if (!value || !value.trim()) {return "«block»";}
  const trimmed = value.trim();
  return trimmed.startsWith("«") ? trimmed : `«${trimmed.replace(/^<</, "").replace(/>>$/, "")}»`;
}

function calculatePortPosition(
  port: import("../../hooks/useArchitectureApi").BlockPort,
  index: number,
  totalOnEdge: number,
  blockWidth: number,
  blockHeight: number,
  explicitEdge?: "top" | "right" | "bottom" | "left",
  explicitOffset?: number
): { edge: "top" | "right" | "bottom" | "left", position: Position, style: React.CSSProperties } {
  // Use explicit edge if provided, otherwise port's edge, otherwise default based on direction
  const edge = explicitEdge || port.edge || (
    port.direction === "in" ? "left" :
    port.direction === "out" ? "right" : "left"
  );

  // Calculate offset (prefer explicit, then port.offset, then distribute evenly)
  const offset = explicitOffset !== undefined
    ? explicitOffset
    : (port.offset !== undefined
      ? port.offset
      : ((index + 1) / (totalOnEdge + 1)) * 100);

  const portSize = 24;
  const halfPort = portSize / 2;
  let style: React.CSSProperties = {};
  let position: Position;

  switch (edge) {
    case "top":
      position = Position.Top;
      style = {
        left: `${offset}%`,
        top: `-${halfPort}px`,
        transform: "translateX(-50%)"
      };
      break;
    case "right":
      position = Position.Right;
      style = {
        top: `${offset}%`,
        right: `-${halfPort}px`,
        transform: "translateY(-50%)"
      };
      break;
    case "bottom":
      position = Position.Bottom;
      style = {
        left: `${offset}%`,
        bottom: `-${halfPort}px`,
        transform: "translateX(-50%)"
      };
      break;
    case "left":
    default:
      position = Position.Left;
      style = {
        top: `${offset}%`,
        left: `-${halfPort}px`,
        transform: "translateY(-50%)"
      };
      break;
  }

  return { edge, position, style };
}

export function SysmlBlockNode({ id, data, selected }: NodeProps) {
  const { block, documents = [], onOpenDocument, hideDefaultHandles = false, isConnectMode = false, selectedPortId, onSelectPort, updatePort, removePort } = data as SysmlBlockNodeData;

  // Port dragging state
  const [draggingPort, setDraggingPort] = useState<{
    portId: string;
    edge: "top" | "right" | "bottom" | "left";
    offset: number;
  } | null>(null);
  const blockRef = useRef<HTMLDivElement>(null);
  const updateTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const updateNodeInternals = useUpdateNodeInternals();

  // Port context menu state
  const [portContextMenu, setPortContextMenu] = useState<{
    portId: string;
    portName: string;
    x: number;
    y: number;
  } | null>(null);

  const handlePortMouseDown = useCallback((e: MouseEvent<HTMLDivElement>, portId: string, edge: "top" | "right" | "bottom" | "left", currentOffset: number) => {
    if (isConnectMode) return; // Don't drag in connect mode
    e.stopPropagation();
    e.preventDefault();

    // Select the port immediately on mouse down
    if (onSelectPort) {
      onSelectPort(block.id, portId);
    }

    // Then set up for potential dragging
    setDraggingPort({ portId, edge, offset: currentOffset });
  }, [isConnectMode, onSelectPort, block.id]);

  const handlePortClick = useCallback((e: MouseEvent<HTMLDivElement>, portId: string) => {
    e.stopPropagation();
    e.preventDefault();
    if (onSelectPort && !isConnectMode) {
      onSelectPort(block.id, portId);
    }
  }, [onSelectPort, isConnectMode, block.id]);

  const handlePortContextMenu = useCallback((e: MouseEvent<HTMLDivElement>, portId: string, portName: string) => {
    e.preventDefault();
    e.stopPropagation();
    setPortContextMenu({
      portId,
      portName,
      x: e.clientX,
      y: e.clientY
    });
  }, []);

  const handleMouseMove = useCallback((e: globalThis.MouseEvent) => {
    if (!draggingPort || !blockRef.current) return;

    const blockRect = blockRef.current.getBoundingClientRect();

    // Calculate mouse position relative to block
    const mouseX = e.clientX - blockRect.left;
    const mouseY = e.clientY - blockRect.top;

    // Calculate distances to each edge
    const distToLeft = mouseX;
    const distToRight = blockRect.width - mouseX;
    const distToTop = mouseY;
    const distToBottom = blockRect.height - mouseY;

    // Find the closest edge with hysteresis to prevent rapid switching
    const HYSTERESIS = 20; // pixels - only switch edges if significantly closer
    const currentEdge = draggingPort.edge;
    let newEdge: "top" | "right" | "bottom" | "left";
    let newOffset: number;

    // Get distance to current edge
    let currentEdgeDist = 0;
    switch (currentEdge) {
      case "left": currentEdgeDist = distToLeft; break;
      case "right": currentEdgeDist = distToRight; break;
      case "top": currentEdgeDist = distToTop; break;
      case "bottom": currentEdgeDist = distToBottom; break;
    }

    // Find minimum distance to any edge
    const minDist = Math.min(distToLeft, distToRight, distToTop, distToBottom);

    // Only switch edges if the new edge is significantly closer (hysteresis)
    if (minDist < currentEdgeDist - HYSTERESIS || currentEdgeDist > 100) {
      // Determine which edge is closest
      if (minDist === distToLeft) {
        newEdge = "left";
      } else if (minDist === distToRight) {
        newEdge = "right";
      } else if (minDist === distToTop) {
        newEdge = "top";
      } else {
        newEdge = "bottom";
      }
    } else {
      // Stay on current edge
      newEdge = currentEdge;
    }

    // Calculate offset based on the selected edge
    switch (newEdge) {
      case "left":
      case "right":
        newOffset = (mouseY / blockRect.height) * 100;
        break;
      case "top":
      case "bottom":
        newOffset = (mouseX / blockRect.width) * 100;
        break;
    }

    // Clamp offset to 5-95% to keep ports away from corners
    newOffset = Math.max(5, Math.min(95, newOffset));

    // Update local state immediately for smooth dragging
    setDraggingPort({ portId: draggingPort.portId, edge: newEdge, offset: newOffset });

    // Tell ReactFlow to update edge positions
    updateNodeInternals(id);

    // Debounce API call
    if (updateTimeoutRef.current) {
      clearTimeout(updateTimeoutRef.current);
    }
  }, [draggingPort, id, updateNodeInternals]);

  const handleMouseUp = useCallback(() => {
    if (draggingPort && updatePort) {
      // Clear any pending timeout
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
        updateTimeoutRef.current = null;
      }

      // Send final update to API
      if (updatePort) {
        updatePort(block.id, draggingPort.portId, {
          edge: draggingPort.edge,
          offset: draggingPort.offset
        });
      }

      // Tell ReactFlow to update edge positions one final time
      updateNodeInternals(id);
    }
    setDraggingPort(null);
  }, [draggingPort, block.id, updatePort, id, updateNodeInternals]);

  // Add/remove global mouse event listeners for dragging
  useEffect(() => {
    if (draggingPort) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [draggingPort, handleMouseMove, handleMouseUp]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
      }
    };
  }, []);

  // Group ports by edge for positioning (use dragging state if available)
  const portsByEdge: Record<string, Array<typeof block.ports[0] & { actualEdge: string; actualOffset: number }>> = {
    top: [],
    right: [],
    bottom: [],
    left: []
  };

  block.ports.forEach(port => {
    // Use dragging state if this port is being dragged
    const isDragging = draggingPort?.portId === port.id;
    const actualEdge = isDragging ? draggingPort.edge : (port.edge || (
      port.direction === "in" ? "left" :
      port.direction === "out" ? "right" : "left"
    ));
    const actualOffset = isDragging ? draggingPort.offset : (port.offset ?? 50);

    portsByEdge[actualEdge].push({ ...port, actualEdge, actualOffset });
  });
  
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
    overflow: "visible" as const,
    cursor: "pointer",
    fontSize: `${block.fontSize || 14}px`,
    fontWeight: block.fontWeight || "normal"
  };

  return (
    <div ref={blockRef} style={blockStyle}>
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
      </div>

      {/* Render ports on all edges - hidden in Architecture view (when hideDefaultHandles is false) */}
      {Object.entries(portsByEdge).flatMap(([edge, ports]) =>
        ports.map((port, index) => {
          // Check if this port is being dragged
          const isDragging = draggingPort?.portId === port.id;
          const hidePortsVisually = !hideDefaultHandles; // Hide ports visually in Architecture view

          const { position, style } = calculatePortPosition(
            port,
            index,
            ports.length,
            block.size.width,
            block.size.height,
            isDragging ? draggingPort.edge : undefined,
            isDragging ? draggingPort.offset : undefined
          );

          // Edge-aware arrow direction: horizontal for left/right, vertical for top/bottom
          // Use actual edge from calculation (which respects dragging state)
          const actualEdge = isDragging ? draggingPort.edge : edge;
          const isHorizontalEdge = actualEdge === "left" || actualEdge === "right";
          const portSize = 24;

          const arrowSvg = (
            <svg
              width={portSize - 4}
              height={portSize - 4}
              viewBox="0 0 20 20"
              style={{
                pointerEvents: "none",
                transition: "transform 0.2s ease"
              }}
            >
              {isHorizontalEdge ? (
                // Horizontal arrows (left/right edges)
                <>
                  {/* Left arrow */}
                  <path d="M 7 10 L 2 10 M 2 10 L 4.5 7.5 M 2 10 L 4.5 12.5"
                    stroke="#64748b"
                    strokeWidth="2"
                    strokeLinecap="round"
                    fill="none" />
                  {/* Right arrow */}
                  <path d="M 13 10 L 18 10 M 18 10 L 15.5 7.5 M 18 10 L 15.5 12.5"
                    stroke="#64748b"
                    strokeWidth="2"
                    strokeLinecap="round"
                    fill="none" />
                </>
              ) : (
                // Vertical arrows (top/bottom edges)
                <>
                  {/* Up arrow */}
                  <path d="M 10 7 L 10 2 M 10 2 L 7.5 4.5 M 10 2 L 12.5 4.5"
                    stroke="#64748b"
                    strokeWidth="2"
                    strokeLinecap="round"
                    fill="none" />
                  {/* Down arrow */}
                  <path d="M 10 13 L 10 18 M 10 18 L 7.5 15.5 M 10 18 L 12.5 15.5"
                    stroke="#64748b"
                    strokeWidth="2"
                    strokeLinecap="round"
                    fill="none" />
                </>
              )}
            </svg>
          );

          // Render single visible port using overlapping source/target Handles
          const isSelected = selectedPortId === port.id;

          // Shared positioning and size for perfect alignment of source/target handles
          const sharedHandleStyle = {
            ...style, // Contains positioning: left/right/top/bottom and transform
            width: `${port.size ?? portSize}px`,
            height: `${port.size ?? portSize}px`,
            borderRadius: "3px",
            display: "flex" as const,
            alignItems: "center" as const,
            justifyContent: "center" as const,
            transition: draggingPort?.portId === port.id ? "none" : "all 0.2s ease",
            // Ensure box-sizing is consistent for both handles
            boxSizing: "border-box" as const
          };

          return (
            <Fragment key={`${edge}-${port.id}`}>
              {/* Invisible target handle - for incoming connections */}
              <Handle
                id={`${port.id}-target`}
                type="target"
                position={position}
                isConnectableStart={false}
                isConnectableEnd={hidePortsVisually ? false : isConnectMode}
                style={{
                  ...sharedHandleStyle,
                  background: "transparent",
                  border: "none",
                  zIndex: 29,
                  pointerEvents: "none",
                  opacity: 0
                }}
              />

              {/* Visible source handle - for outgoing connections and interactions */}
              <Handle
                id={port.id}
                type="source"
                position={position}
                isConnectableStart={hidePortsVisually ? false : isConnectMode}
                isConnectableEnd={false}
                className="nodrag nopan"
                onMouseDown={(e) => !isConnectMode && !hidePortsVisually && handlePortMouseDown(e, port.id, edge as "top" | "right" | "bottom" | "left", port.actualOffset)}
                onClick={(e) => !hidePortsVisually && handlePortClick(e, port.id)}
                onPointerDown={(e) => e.stopPropagation()}
                onContextMenu={(e) => !hidePortsVisually && handlePortContextMenu(e, port.id, port.name)}
                style={{
                  ...sharedHandleStyle,
                  background: hidePortsVisually ? "transparent" : (port.backgroundColor ?? "#ffffff"),
                  border: hidePortsVisually ? "none" : (isSelected
                    ? "2px solid #2563eb"
                    : `${port.borderWidth ?? 2}px solid ${port.borderColor ?? "#64748b"}`),
                  cursor: isConnectMode ? "crosshair" : "pointer",
                  zIndex: selectedPortId === port.id ? 50 : 30,
                  pointerEvents: hidePortsVisually ? "none" : "auto",
                  boxShadow: hidePortsVisually ? "none" : (isSelected ? "0 4px 12px rgba(37, 99, 235, 0.4)" : "none"),
                  outline: hidePortsVisually ? "none" : (isSelected ? "2px solid rgba(59, 130, 246, 0.35)" : "none"),
                  outlineOffset: isSelected ? "2px" : "0",
                  opacity: hidePortsVisually ? 0 : 1
                }}
                title={isConnectMode ? `${port.name} (${port.direction})` : `${port.name} - Click to select, drag to reposition`}
              >
                {!hidePortsVisually && arrowSvg}
              </Handle>
            </Fragment>
          );
        })
      )}

      {/* Default top/bottom handles - hidden in interface view */}
      {!hideDefaultHandles && (
        <>
          <Handle
            id="default-in"
            type="target"
            position={Position.Top}
            isConnectable={true}
            isConnectableStart={false}
            isConnectableEnd={true}
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
            isConnectable={true}
            isConnectableStart={true}
            isConnectableEnd={false}
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
        </>
      )}

      {/* Port context menu */}
      {portContextMenu && (
        <DiagramContextMenu
          x={portContextMenu.x}
          y={portContextMenu.y}
          items={[
            {
              label: `Delete "${portContextMenu.portName}"`,
              onSelect: () => {
                if (removePort) {
                  removePort(block.id, portContextMenu.portId);
                }
              }
            }
          ]}
          onClose={() => setPortContextMenu(null)}
        />
      )}
    </div>
  );
}
