import { useState, useRef, useCallback, useEffect, useMemo, type MouseEvent } from "react";
import type { NodeProps } from "@xyflow/react";
import { Handle, NodeResizer, Position, useUpdateNodeInternals } from "@xyflow/react";
import type { SysmlBlock, BlockPort } from "../../hooks/useArchitectureApi";
import type { DocumentRecord } from "../../types";
import { DiagramContextMenu } from "../diagram/DiagramContextMenu";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog";
import * as portHelpers from "./portHelpers";
import { PortHandle } from "./PortHandle";

export type SysmlBlockNodeData = {
  block: SysmlBlock;
  documents?: DocumentRecord[];
  onOpenDocument?: (documentSlug: string) => void;
  hideDefaultHandles?: boolean; // Hide default top/bottom handles (for interface view)
  isConnectMode?: boolean; // Whether ports should act as connection handles
  selectedPortId?: string | null; // Currently selected port ID
  onSelectPort?: (blockId: string, portId: string | null) => void;
  updatePort?: (blockId: string, portId: string, updates: Partial<BlockPort>) => void;
  removePort?: (blockId: string, portId: string) => void;
  updateBlock?: (blockId: string, updates: Partial<SysmlBlock>) => void;
  portContextMenu?: { blockId: string; portId: string; portName: string; hidden: boolean; direction: BlockPort["direction"]; x: number; y: number } | null;
  onPortContextMenu?: (blockId: string, portId: string, portName: string, hidden: boolean, direction: BlockPort["direction"], x: number, y: number) => void;
  onClosePortContextMenu?: () => void;
};

export function SysmlBlockNode({ id, data, selected }: NodeProps) {
  const { block, documents = [], onOpenDocument, hideDefaultHandles = false, isConnectMode = false, selectedPortId, onSelectPort, updatePort, removePort, updateBlock, portContextMenu, onPortContextMenu, onClosePortContextMenu } = data as SysmlBlockNodeData;

  // Port dragging state
  const [draggingPort, setDraggingPort] = useState<{
    portId: string;
    edge: "top" | "right" | "bottom" | "left";
    offset: number;
  } | null>(null);
  const blockRef = useRef<HTMLDivElement>(null);
  const updateTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const updateNodeInternals = useUpdateNodeInternals();

  // Track a lightweight signature so ReactFlow handles refresh when port metadata changes
  const portsSignature = useMemo(() => {
    return block.ports
      .map(port => `${port.id}:${port.edge ?? ""}:${port.offset ?? ""}:${port.hidden ? "hidden" : "visible"}`)
      .join("|");
  }, [block.ports]);

  // Rename dialog state (local only)
  const [renameDialog, setRenameDialog] = useState<{
    portId: string;
    draft: string;
  } | null>(null);

  // Block name editing state
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState(block.name);
  const nameInputRef = useRef<HTMLInputElement>(null);

  // Port label editing state
  const [editingPortId, setEditingPortId] = useState<string | null>(null);
  const [editedPortName, setEditedPortName] = useState("");
  const portLabelInputRef = useRef<HTMLInputElement>(null);

  const handlePortMouseDown = useCallback((e: MouseEvent<HTMLDivElement>, portId: string, edge: "top" | "right" | "bottom" | "left", currentOffset: number, hidden?: boolean) => {
    if (isConnectMode || hidden) return; // Don't drag in connect mode or when hidden
    e.stopPropagation();
    e.preventDefault();

    // Select the port immediately on mouse down
    if (onSelectPort) {
      onSelectPort(block.id, portId);
    }

    // Then set up for potential dragging
    setDraggingPort({ portId, edge, offset: currentOffset });
  }, [isConnectMode, onSelectPort, block.id]);

  const handlePortClick = useCallback((e: MouseEvent<HTMLDivElement>, portId: string, hidden?: boolean) => {
    e.stopPropagation();
    e.preventDefault();
    if (hidden) {
      return;
    }
    if (onSelectPort && !isConnectMode) {
      onSelectPort(block.id, portId);
    }
  }, [onSelectPort, isConnectMode, block.id]);

  const handlePortContextMenu = useCallback((e: MouseEvent<HTMLDivElement>, portId: string, portName: string, hidden: boolean, direction: BlockPort["direction"]) => {
    e.preventDefault();
    e.stopPropagation();
    onSelectPort?.(block.id, portId);
    onPortContextMenu?.(block.id, portId, portName, hidden, direction, e.clientX, e.clientY);
  }, [block.id, onSelectPort, onPortContextMenu]);

  const handleMouseMove = useCallback((e: globalThis.MouseEvent) => {
    if (!draggingPort || !blockRef.current) return;

    const blockRect = blockRef.current.getBoundingClientRect();

    // Calculate mouse position relative to block
    const mouseX = e.clientX - blockRect.left;
    const mouseY = e.clientY - blockRect.top;

    // Find the closest edge with hysteresis to prevent rapid switching
    const newEdge = portHelpers.calculateClosestEdge(
      mouseX,
      mouseY,
      blockRect.width,
      blockRect.height,
      draggingPort.edge
    );

    // Calculate offset based on the selected edge
    const newOffset = portHelpers.calculateEdgeOffset(
      newEdge,
      mouseX,
      mouseY,
      blockRect.width,
      blockRect.height
    );

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

  // Ensure ReactFlow recalculates handle geometry when ports or block dimensions change
  useEffect(() => {
    updateNodeInternals(id);
  }, [id, portsSignature, block.size.width, block.size.height, updateNodeInternals]);

  // Handle F2 key for renaming
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (selected && e.key === "F2" && !isEditingName) {
        e.preventDefault();
        setIsEditingName(true);
        setEditedName(block.name);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selected, block.name, isEditingName]);

  // Focus input when editing starts
  useEffect(() => {
    if (isEditingName && nameInputRef.current) {
      nameInputRef.current.focus();
      nameInputRef.current.select();
    }
  }, [isEditingName]);

  // Handle name edit submission
  const handleNameSubmit = useCallback(() => {
    const trimmed = editedName.trim();
    if (trimmed && trimmed !== block.name && updateBlock) {
      updateBlock(block.id, { name: trimmed });
    }
    setIsEditingName(false);
  }, [editedName, block.name, block.id, updateBlock]);

  const handleNameKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleNameSubmit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      setIsEditingName(false);
      setEditedName(block.name);
    }
  }, [handleNameSubmit, block.name]);

  const handleNameDoubleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setIsEditingName(true);
    setEditedName(block.name);
  }, [block.name]);

  // Handle F2 key for port label editing
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (selectedPortId && e.key === "F2" && !editingPortId && !isEditingName) {
        e.preventDefault();
        const port = block.ports.find(p => p.id === selectedPortId);
        if (port) {
          setEditingPortId(selectedPortId);
          setEditedPortName(port.name);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedPortId, block.ports, editingPortId, isEditingName]);

  // Focus port label input when editing starts
  useEffect(() => {
    if (editingPortId && portLabelInputRef.current) {
      portLabelInputRef.current.focus();
      portLabelInputRef.current.select();
    }
  }, [editingPortId]);

  const handlePortLabelSubmit = useCallback(() => {
    if (!editingPortId || !updatePort) return;
    const trimmed = editedPortName.trim();
    if (trimmed) {
      updatePort(block.id, editingPortId, { name: trimmed });
    }
    setEditingPortId(null);
    setEditedPortName("");
  }, [editingPortId, editedPortName, block.id, updatePort]);

  const handlePortLabelKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handlePortLabelSubmit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      setEditingPortId(null);
      setEditedPortName("");
    }
  }, [handlePortLabelSubmit]);

  const handlePortLabelDoubleClick = useCallback((e: React.MouseEvent, portId: string, portName: string) => {
    if (!updatePort) return;
    e.stopPropagation();
    e.preventDefault();
    setEditingPortId(portId);
    setEditedPortName(portName);
  }, [updatePort]);

  // Group ports by edge for positioning (use dragging state if available)
  const portsByEdge = portHelpers.groupPortsByEdge(block.ports, draggingPort);
  
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

  const hiddenPortCount = block.ports.filter(port => port.hidden).length;
  const hidePortsVisually = !hideDefaultHandles; // Hide ports visually in Architecture view

  return (
    <div ref={blockRef} style={blockStyle}>
      <NodeResizer
        minHeight={100}
        minWidth={150}
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
        {!hidePortsVisually && hiddenPortCount > 0 && (
          <div
            style={{
              position: "absolute",
              top: 10,
              right: 12,
              background: "rgba(15, 23, 42, 0.75)",
              color: "#ffffff",
              borderRadius: "999px",
              padding: "2px 8px",
              fontSize: "10px",
              fontWeight: 600,
              letterSpacing: "0.02em",
              pointerEvents: "none",
              zIndex: 5
            }}
            title={`${hiddenPortCount} hidden port${hiddenPortCount === 1 ? "" : "s"}`}
          >
            {hiddenPortCount} hidden
          </div>
        )}
        <div style={{
          fontSize: `${(block.fontSize || 14) * 0.85}px`,
          textTransform: "uppercase",
          color: block.textColor ? `${block.textColor}99` : "#475569",
          letterSpacing: "0.08em",
          fontWeight: block.fontWeight || "normal"
        }}>
          {portHelpers.formatStereotype(block.stereotype)}
        </div>
        {isEditingName ? (
          <input
            ref={nameInputRef}
            type="text"
            value={editedName}
            onChange={(e) => setEditedName(e.target.value)}
            onKeyDown={handleNameKeyDown}
            onBlur={handleNameSubmit}
            className="nodrag nopan"
            style={{
              fontWeight: block.fontWeight === "bold" ? 700 : 600,
              fontSize: `${(block.fontSize || 14) * 1.15}px`,
              marginTop: "4px",
              color: block.textColor || "#1f2937",
              background: "#ffffff",
              border: "2px solid #2563eb",
              borderRadius: "4px",
              padding: "2px 4px",
              width: "100%",
              outline: "none"
            }}
          />
        ) : (
          <div
            style={{
              fontWeight: block.fontWeight === "bold" ? 700 : 600,
              fontSize: `${(block.fontSize || 14) * 1.15}px`,
              marginTop: "4px",
              color: block.textColor || "#1f2937",
              cursor: "text"
            }}
            onDoubleClick={handleNameDoubleClick}
            title="Double-click or press F2 to rename"
          >
            {block.name}
          </div>
        )}
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
        ports.map((port, index) => (
          <PortHandle
            key={`${edge}-${port.id}`}
            port={port}
            edge={edge}
            index={index}
            totalPorts={ports.length}
            blockId={block.id}
            blockWidth={block.size.width}
            blockHeight={block.size.height}
            draggingPort={draggingPort}
            hidePortsVisually={hidePortsVisually}
            isConnectMode={isConnectMode}
            selectedPortId={selectedPortId}
            editingPortId={editingPortId}
            editedPortName={editedPortName}
            portLabelInputRef={portLabelInputRef}
            handlePortMouseDown={handlePortMouseDown}
            handlePortClick={handlePortClick}
            handlePortContextMenu={handlePortContextMenu}
            handlePortLabelDoubleClick={handlePortLabelDoubleClick}
            setEditingPortId={setEditingPortId}
            setEditedPortName={setEditedPortName}
            handlePortLabelSubmit={handlePortLabelSubmit}
            handlePortLabelKeyDown={handlePortLabelKeyDown}
            updatePort={updatePort}
          />
        ))
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
      {portContextMenu && portContextMenu.blockId === block.id && (() => {

        const items = [
          {
            label: portContextMenu.hidden ? "Show port" : "Hide port",
            onSelect: () => {
              if (updatePort) {
                updatePort(block.id, portContextMenu.portId, { hidden: !portContextMenu.hidden });
              }
            }
          },
          {
            label: "Set direction → Input",
            disabled: portContextMenu.direction === "in",
            onSelect: () => updatePort?.(block.id, portContextMenu.portId, { direction: "in" })
          },
          {
            label: "Set direction → Output",
            disabled: portContextMenu.direction === "out",
            onSelect: () => updatePort?.(block.id, portContextMenu.portId, { direction: "out" })
          },
          {
            label: "Set direction → Bidirectional",
            disabled: portContextMenu.direction === "inout",
            onSelect: () => updatePort?.(block.id, portContextMenu.portId, { direction: "inout" })
          },
          {
            label: "Rename port",
            onSelect: () => {
              setRenameDialog({ portId: portContextMenu.portId, draft: portContextMenu.portName });
              onClosePortContextMenu?.();
            }
          },
          {
            label: `Delete "${portContextMenu.portName}"`,
            onSelect: () => {
              if (removePort) {
                removePort(block.id, portContextMenu.portId);
              }
            }
          }
        ];

        return (
          <DiagramContextMenu
            x={portContextMenu.x}
            y={portContextMenu.y}
            items={items}
            onClose={() => onClosePortContextMenu?.()}
          />
        );
      })()}

      <Dialog open={Boolean(renameDialog)} onOpenChange={(open) => {
        if (!open) {
          setRenameDialog(null);
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename Port</DialogTitle>
            <DialogDescription>Update the label shown on this diagram.</DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (!renameDialog) {return;}
              const trimmed = renameDialog.draft.trim();
              if (!trimmed) {
                return;
              }
              updatePort?.(block.id, renameDialog.portId, { name: trimmed });
              setRenameDialog(null);
            }}
          >
            <input
              className="text-input"
              value={renameDialog?.draft ?? ""}
              onChange={(event) => setRenameDialog(prev => prev ? { ...prev, draft: event.target.value } : prev)}
              placeholder="Port name"
              autoFocus
            />
            <DialogFooter style={{ marginTop: "1rem" }}>
              <button type="button" className="ghost-button" onClick={() => setRenameDialog(null)}>
                Cancel
              </button>
              <button type="submit" className="primary-button" disabled={!renameDialog?.draft.trim()}>
                Save
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
