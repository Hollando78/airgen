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
  isPreview?: boolean; // Flag for AI diagram previews
  useVanillaStyle?: boolean; // Use vanilla styling (clean, minimal appearance)
};

/**
 * Get SysML-compliant block styling following OMG SysML standards
 * - Sharp rectangular corners
 * - Black borders on white background
 * - No shadows or gradients
 * - Clean, technical appearance
 */
function getSysMLBlockStyle(
  block: SysmlBlock,
  selected: boolean,
  isPreview: boolean = false
): React.CSSProperties {
  // For AI diagram previews, use minimal styling
  if (isPreview) {
    return {
      width: block.size.width,
      height: block.size.height,
      background: "#ffffff",
      border: "1px solid #000000",
      borderRadius: "0px",
      boxShadow: "none",
      fontFamily: "'Inter', -apple-system, sans-serif",
      color: "#000000",
      fontSize: "13px",
      fontWeight: "normal",
      position: "relative" as const,
      overflow: "visible" as const,
      cursor: "default"
    };
  }

  // For interactive diagrams, use SysML standard styling
  return {
    width: block.size.width,
    height: block.size.height,
    background: "#ffffff",
    border: selected
      ? "2px solid #000000"  // Thicker border when selected
      : "1px solid #000000",
    borderRadius: "0px",  // Sharp corners per SysML spec
    boxShadow: "none",  // No shadows
    outline: "none",
    fontFamily: "'Inter', -apple-system, sans-serif",
    color: "#000000",
    fontSize: "13px",
    fontWeight: "normal",
    position: "relative" as const,
    overflow: "visible" as const,
    cursor: "pointer"
  };
}

export function SysmlBlockNode({ id, data, selected }: NodeProps) {
  const { block, documents = [], onOpenDocument, hideDefaultHandles = false, isConnectMode = false, selectedPortId = null, onSelectPort, updatePort, removePort, updateBlock, portContextMenu, onPortContextMenu, onClosePortContextMenu, isPreview = false, useVanillaStyle = false } = data as SysmlBlockNodeData;

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

  // Use SysML-compliant styling
  const blockStyle = getSysMLBlockStyle(block, selected, isPreview);

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
          stroke: "#000000",  // SysML: black
          strokeWidth: 1,
          strokeDasharray: "4 4"
        }}
        handleStyle={{
          fill: "#000000",  // SysML: black
          stroke: "#ffffff",
          strokeWidth: 1,
          width: 10,  // Smaller handles
          height: 10,
          borderRadius: 0,  // SysML: square handles
          cursor: "nwse-resize"
        }}
        lineClassName="node-resizer-line"
        handleClassName="node-resizer-handle"
      />
      <div style={{
        padding: "0",
        position: "relative",
        height: "100%",
        pointerEvents: "auto",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column"
      }}>
        {/* Header Compartment - Stereotype and Name (centered per SysML spec) */}
        <div style={{
          padding: "10px 12px",
          borderBottom: (block.description || linkedDocuments.length > 0) ? "1px solid #000000" : "none"
        }}>
          <div style={{
            fontSize: "11px",
            color: "#000000",
            textAlign: "center",
            fontWeight: "normal",
            marginBottom: "4px"
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
                fontWeight: "600",
                fontSize: "14px",
                color: "#000000",
                background: "#ffffff",
                border: "1px solid #000000",
                borderRadius: "0px",
                padding: "2px 4px",
                width: "100%",
                outline: "none",
                textAlign: "center"
              }}
            />
          ) : (
            <div
              style={{
                fontWeight: "600",
                fontSize: "14px",
                color: "#000000",
                cursor: "text",
                textAlign: "center"
              }}
              onDoubleClick={handleNameDoubleClick}
              title="Double-click or press F2 to rename"
            >
              {block.name}
            </div>
          )}
        </div>

        {/* Properties/Description Compartment */}
        {block.description && (
          <div style={{
            padding: "10px 12px",
            borderBottom: linkedDocuments.length > 0 ? "1px solid #000000" : "none"
          }}>
            <div style={{
              fontSize: "11px",
              color: "#666666",
              marginBottom: "6px",
              fontStyle: "italic"
            }}>
              properties
            </div>
            <div style={{
              fontSize: "12px",
              color: "#000000",
              fontFamily: "'Courier New', monospace",
              lineHeight: "1.5"
            }}>
              {block.description}
            </div>
          </div>
        )}

        {/* References Compartment - Simplified SysML style */}
        {linkedDocuments.length > 0 && (
          <div style={{
            padding: "10px 12px"
          }}>
            <div style={{
              fontSize: "11px",
              color: "#666666",
              marginBottom: "6px",
              fontStyle: "italic"
            }}>
              references
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
              {linkedDocuments.map(doc => (
                <div
                  key={doc.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenDocument?.(doc.slug);
                  }}
                  style={{
                    fontSize: "12px",
                    color: "#000000",
                    fontFamily: "'Courier New', monospace",
                    cursor: "pointer",
                    textDecoration: "underline",
                    textOverflow: "ellipsis",
                    overflow: "hidden",
                    whiteSpace: "nowrap"
                  }}
                  title={`Open document: ${doc.name}`}
                >
                  {doc.name}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Hidden ports indicator (minimal, top-right corner) */}
        {!hidePortsVisually && hiddenPortCount > 0 && (
          <div
            style={{
              position: "absolute",
              top: 4,
              right: 4,
              background: "#000000",
              color: "#ffffff",
              borderRadius: "0px",
              padding: "2px 6px",
              fontSize: "9px",
              fontWeight: 600,
              pointerEvents: "none",
              zIndex: 5
            }}
            title={`${hiddenPortCount} hidden port${hiddenPortCount === 1 ? "" : "s"}`}
          >
            {hiddenPortCount}
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

      {/* Default top/bottom handles - SysML style: square, black */}
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
              background: "#000000",
              border: "1px solid #000000",
              width: "8px",
              height: "8px",
              borderRadius: "0px",  // Square for SysML
              cursor: "crosshair",
              transition: "all 0.15s ease",
              zIndex: 10
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "scale(1.3)";
            }}
            onMouseLeave={(e) => {
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
              background: "#000000",
              border: "1px solid #000000",
              width: "8px",
              height: "8px",
              borderRadius: "0px",  // Square for SysML
              cursor: "crosshair",
              transition: "all 0.15s ease",
              zIndex: 10
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "scale(1.3)";
            }}
            onMouseLeave={(e) => {
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
