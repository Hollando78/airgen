import { Fragment, type MouseEvent, type RefObject } from "react";
import { Handle } from "@xyflow/react";
import type { BlockPort } from "../../hooks/useArchitectureApi";
import * as portHelpers from "./portHelpers";
import { generatePortArrowSvg } from "./portArrows";

export interface PortHandleProps {
  port: BlockPort & { actualEdge: string; actualOffset: number };
  edge: string;
  index: number;
  totalPorts: number;
  blockId: string;
  blockWidth: number;
  blockHeight: number;
  draggingPort: { portId: string; edge: portHelpers.EdgeType; offset: number } | null;
  hidePortsVisually: boolean;
  isConnectMode: boolean;
  selectedPortId: string | null;
  editingPortId: string | null;
  editedPortName: string;
  portLabelInputRef: RefObject<HTMLInputElement>;
  handlePortMouseDown: (e: MouseEvent<HTMLDivElement>, portId: string, edge: portHelpers.EdgeType, currentOffset: number, hidden?: boolean) => void;
  handlePortClick: (e: MouseEvent<HTMLDivElement>, portId: string, hidden?: boolean) => void;
  handlePortContextMenu: (e: MouseEvent<HTMLDivElement>, portId: string, portName: string, hidden: boolean, direction: BlockPort["direction"]) => void;
  handlePortLabelDoubleClick: (e: MouseEvent, portId: string, portName: string) => void;
  setEditingPortId: (portId: string | null) => void;
  setEditedPortName: (name: string) => void;
  handlePortLabelSubmit: () => void;
  handlePortLabelKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  updatePort?: (blockId: string, portId: string, updates: Partial<BlockPort>) => void;
}

/**
 * PortHandle component - Renders a single port with its handle and label
 * Handles port selection, dragging, label editing, and context menu
 */
export function PortHandle({
  port,
  edge,
  index,
  totalPorts,
  blockId,
  blockWidth,
  blockHeight,
  draggingPort,
  hidePortsVisually,
  isConnectMode,
  selectedPortId,
  editingPortId,
  editedPortName,
  portLabelInputRef,
  handlePortMouseDown,
  handlePortClick,
  handlePortContextMenu,
  handlePortLabelDoubleClick,
  setEditingPortId,
  setEditedPortName,
  handlePortLabelSubmit,
  handlePortLabelKeyDown,
  updatePort
}: PortHandleProps) {
  // Check if this port is being dragged
  const isDragging = draggingPort?.portId === port.id;

  const { position, style } = portHelpers.calculatePortPosition(
    port,
    index,
    totalPorts,
    blockWidth,
    blockHeight,
    isDragging ? draggingPort.edge : undefined,
    isDragging ? draggingPort.offset : undefined
  );

  // Edge-aware arrow direction
  const actualEdge = isDragging ? draggingPort.edge : edge;
  const portSize = portHelpers.PORT_SIZE;
  const offsetPercent = `${port.actualOffset}%`;
  const isHidden = Boolean(port.hidden);

  const arrowSvg = generatePortArrowSvg(port, actualEdge as portHelpers.EdgeType, isHidden);

  // Port selection state
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
    boxSizing: "border-box" as const
  };

  const showPortLabel = !isHidden && (port.showLabel !== false || !hidePortsVisually);

  const labelOffsetX = port.labelOffsetX || 0;
  const labelOffsetY = port.labelOffsetY || 0;

  const labelStyle = portHelpers.calculatePortLabelStyle(
    actualEdge as portHelpers.EdgeType,
    offsetPercent,
    labelOffsetX,
    labelOffsetY
  );

  const handleLabelDragStart = (e: MouseEvent) => {
    if (!updatePort || isHidden || editingPortId === port.id) return;
    e.stopPropagation();
    e.preventDefault();

    const startX = e.clientX;
    const startY = e.clientY;
    const startOffsetX = labelOffsetX;
    const startOffsetY = labelOffsetY;
    const labelElement = e.currentTarget as HTMLElement;

    // Get ReactFlow viewport zoom from the transform applied to the viewport
    const reactFlowViewport = document.querySelector('.react-flow__viewport');
    let zoom = 1;
    if (reactFlowViewport) {
      const transform = window.getComputedStyle(reactFlowViewport).transform;
      const matrix = new DOMMatrix(transform);
      zoom = matrix.a; // Scale X from the transform matrix
    }

    let currentOffsetX = startOffsetX;
    let currentOffsetY = startOffsetY;

    const handleDrag = (moveEvent: globalThis.MouseEvent) => {
      const deltaX = (moveEvent.clientX - startX) / zoom;
      const deltaY = (moveEvent.clientY - startY) / zoom;
      currentOffsetX = startOffsetX + deltaX;
      currentOffsetY = startOffsetY + deltaY;

      // Update DOM directly for smooth visual feedback
      if (actualEdge === "left") {
        labelElement.style.top = `calc(${offsetPercent} + ${currentOffsetY}px)`;
        labelElement.style.left = `calc(12px + ${currentOffsetX}px)`;
      } else if (actualEdge === "right") {
        labelElement.style.top = `calc(${offsetPercent} + ${currentOffsetY}px)`;
        labelElement.style.right = `calc(12px - ${currentOffsetX}px)`;
      } else if (actualEdge === "top") {
        labelElement.style.top = `calc(-28px + ${currentOffsetY}px)`;
        labelElement.style.left = `calc(${offsetPercent} + ${currentOffsetX}px)`;
      } else {
        labelElement.style.bottom = `calc(-28px - ${currentOffsetY}px)`;
        labelElement.style.left = `calc(${offsetPercent} + ${currentOffsetX}px)`;
      }
    };

    const handleDragEnd = () => {
      document.removeEventListener("mousemove", handleDrag);
      document.removeEventListener("mouseup", handleDragEnd);
      // Only send the final position to the server
      updatePort(blockId, port.id, {
        labelOffsetX: currentOffsetX,
        labelOffsetY: currentOffsetY
      });
    };

    document.addEventListener("mousemove", handleDrag);
    document.addEventListener("mouseup", handleDragEnd);
  };

  return (
    <Fragment key={`${edge}-${port.id}`}>
      {/* Invisible target handle - for incoming connections */}
      <Handle
        id={`${port.id}-target`}
        type="target"
        position={position}
        isConnectableStart={false}
        isConnectableEnd={hidePortsVisually ? false : (isHidden ? false : isConnectMode)}
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
        isConnectableStart={hidePortsVisually ? false : (isHidden ? false : isConnectMode)}
        isConnectableEnd={false}
        className="nodrag nopan"
        onMouseDown={(e) => {
          if (!hidePortsVisually && !isHidden && !isConnectMode) {
            handlePortMouseDown(e, port.id, edge as portHelpers.EdgeType, port.actualOffset, isHidden);
          }
        }}
        onClick={(e) => {
          if (!hidePortsVisually && !isHidden) {
            handlePortClick(e, port.id, isHidden);
          }
        }}
        onPointerDown={(e) => e.stopPropagation()}
        onContextMenu={(e) => {
          if (!hidePortsVisually && !isHidden) {
            handlePortContextMenu(e, port.id, port.name, isHidden, port.direction);
          }
        }}
        style={{
          ...sharedHandleStyle,
          background: hidePortsVisually ? "transparent" : (port.backgroundColor ?? "#ffffff"),
          border: hidePortsVisually ? "none" : (isSelected
            ? "2px solid #2563eb"
            : `${port.borderWidth ?? 2}px solid ${port.borderColor ?? "#64748b"}`),
          cursor: isHidden ? "default" : (isConnectMode ? "crosshair" : "pointer"),
          zIndex: selectedPortId === port.id ? 50 : 30,
          pointerEvents: hidePortsVisually || isHidden ? "none" : "auto",
          boxShadow: hidePortsVisually ? "none" : (isSelected ? "0 4px 12px rgba(37, 99, 235, 0.4)" : "none"),
          outline: hidePortsVisually ? "none" : (isSelected ? "2px solid rgba(59, 130, 246, 0.35)" : "none"),
          outlineOffset: isSelected ? "2px" : "0",
          opacity: hidePortsVisually ? 0 : (isHidden ? 0 : 1)
        }}
        title={!isHidden
          ? (isConnectMode
            ? `${port.name} (${port.direction})`
            : `${port.name} - Click to select, drag to reposition`)
          : undefined}
      >
        {!hidePortsVisually && arrowSvg}
      </Handle>

      {!hidePortsVisually && showPortLabel && (
        editingPortId === port.id ? (
          <input
            ref={portLabelInputRef}
            type="text"
            value={editedPortName}
            onChange={(e) => setEditedPortName(e.target.value)}
            onKeyDown={handlePortLabelKeyDown}
            onBlur={handlePortLabelSubmit}
            className="nodrag nopan"
            style={{
              ...labelStyle,
              border: "2px solid #2563eb",
              outline: "none",
              minWidth: "80px"
            }}
          />
        ) : (
          <div
            className="nodrag nopan"
            style={{
              ...labelStyle,
              cursor: updatePort ? "text" : "move"
            }}
            onMouseDown={handleLabelDragStart}
            onClick={(event) => {
              event.stopPropagation();
              handlePortClick(event as unknown as MouseEvent<HTMLDivElement>, port.id, isHidden);
            }}
            onDoubleClick={(event) => handlePortLabelDoubleClick(event, port.id, port.name)}
            onContextMenu={(event) => {
              if (hidePortsVisually) {
                event.preventDefault();
                event.stopPropagation();
                return;
              }
              event.preventDefault();
              event.stopPropagation();
              handlePortContextMenu(event as unknown as MouseEvent<HTMLDivElement>, port.id, port.name, isHidden, port.direction);
            }}
            title={updatePort ? "Double-click or press F2 to rename" : undefined}
          >
            <span>{port.name}</span>
          </div>
        )
      )}
    </Fragment>
  );
}
