import type { Position } from "@xyflow/react";
import { Position as PositionEnum } from "@xyflow/react";
import type { BlockPort } from "../../hooks/useArchitectureApi";

/**
 * Port positioning and styling helpers for SysML block diagrams
 */

export const PORT_SIZE = 24;
export const HYSTERESIS = 20; // pixels - only switch edges if significantly closer

export type EdgeType = "top" | "right" | "bottom" | "left";

/**
 * Format SysML stereotype with guillemets
 */
export function formatStereotype(value?: string): string {
  if (!value || !value.trim()) {
    return "«block»";
  }
  const trimmed = value.trim();
  return trimmed.startsWith("«") ? trimmed : `«${trimmed.replace(/^<</, "").replace(/>>$/, "")}»`;
}

/**
 * Calculate port position on block edge
 */
export function calculatePortPosition(
  port: BlockPort,
  index: number,
  totalOnEdge: number,
  blockWidth: number,
  blockHeight: number,
  explicitEdge?: EdgeType,
  explicitOffset?: number
): { edge: EdgeType; position: Position; style: React.CSSProperties } {
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

  const halfPort = PORT_SIZE / 2;
  let style: React.CSSProperties = {};
  let position: Position;

  switch (edge) {
    case "top":
      position = PositionEnum.Top;
      style = {
        left: `${offset}%`,
        top: `-${halfPort}px`,
        transform: "translateX(-50%)"
      };
      break;
    case "right":
      position = PositionEnum.Right;
      style = {
        top: `${offset}%`,
        right: `-${halfPort}px`,
        transform: "translateY(-50%)"
      };
      break;
    case "bottom":
      position = PositionEnum.Bottom;
      style = {
        left: `${offset}%`,
        bottom: `-${halfPort}px`,
        transform: "translateX(-50%)"
      };
      break;
    case "left":
    default:
      position = PositionEnum.Left;
      style = {
        top: `${offset}%`,
        left: `-${halfPort}px`,
        transform: "translateY(-50%)"
      };
      break;
  }

  return { edge, position, style };
}

/**
 * Calculate closest edge to mouse position with hysteresis
 */
export function calculateClosestEdge(
  mouseX: number,
  mouseY: number,
  blockWidth: number,
  blockHeight: number,
  currentEdge: EdgeType
): EdgeType {
  // Calculate distances to each edge
  const distToLeft = mouseX;
  const distToRight = blockWidth - mouseX;
  const distToTop = mouseY;
  const distToBottom = blockHeight - mouseY;

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
      return "left";
    } else if (minDist === distToRight) {
      return "right";
    } else if (minDist === distToTop) {
      return "top";
    } else {
      return "bottom";
    }
  }

  // Stay on current edge
  return currentEdge;
}

/**
 * Calculate offset percentage on a specific edge
 */
export function calculateEdgeOffset(
  edge: EdgeType,
  mouseX: number,
  mouseY: number,
  blockWidth: number,
  blockHeight: number
): number {
  let offset: number;

  switch (edge) {
    case "left":
    case "right":
      offset = (mouseY / blockHeight) * 100;
      break;
    case "top":
    case "bottom":
      offset = (mouseX / blockWidth) * 100;
      break;
  }

  // Clamp offset to 5-95% to keep ports away from corners
  return Math.max(5, Math.min(95, offset));
}

/**
 * Calculate port label style based on edge and offsets
 * SysML style: minimal, clean appearance
 */
export function calculatePortLabelStyle(
  edge: EdgeType,
  offsetPercent: string,
  labelOffsetX: number,
  labelOffsetY: number
): React.CSSProperties {
  const baseStyle: React.CSSProperties = {
    position: "absolute",
    fontSize: "10px",
    fontWeight: 400,
    fontFamily: "'Inter', -apple-system, sans-serif",
    background: "#ffffff",  // Solid white
    padding: "2px 4px",
    borderRadius: "0px",  // SysML: no rounded corners
    color: "#000000",  // SysML: black text
    border: "1px solid #000000",  // SysML: black border
    pointerEvents: "auto",
    boxShadow: "none",  // SysML: no shadows
    maxWidth: "140px",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    overflow: "hidden",
    cursor: "move",
    userSelect: "none"
  };

  switch (edge) {
    case "left":
      return {
        ...baseStyle,
        top: `calc(${offsetPercent} + ${labelOffsetY}px)`,
        left: `calc(12px + ${labelOffsetX}px)`,
        transform: "translateY(-50%)",
        textAlign: "left"
      };
    case "right":
      return {
        ...baseStyle,
        top: `calc(${offsetPercent} + ${labelOffsetY}px)`,
        right: `calc(12px - ${labelOffsetX}px)`,
        transform: "translateY(-50%)",
        textAlign: "right"
      };
    case "top":
      return {
        ...baseStyle,
        top: `calc(-28px + ${labelOffsetY}px)`,
        left: `calc(${offsetPercent} + ${labelOffsetX}px)`,
        transform: "translateX(-50%)",
        textAlign: "center"
      };
    case "bottom":
    default:
      return {
        ...baseStyle,
        bottom: `calc(-28px - ${labelOffsetY}px)`,
        left: `calc(${offsetPercent} + ${labelOffsetX}px)`,
        transform: "translateX(-50%)",
        textAlign: "center"
      };
  }
}

/**
 * Group ports by edge for rendering
 */
export function groupPortsByEdge(
  ports: BlockPort[],
  draggingPort: { portId: string; edge: EdgeType; offset: number } | null
): Record<EdgeType, Array<BlockPort & { actualEdge: EdgeType; actualOffset: number }>> {
  const portsByEdge: Record<EdgeType, Array<BlockPort & { actualEdge: EdgeType; actualOffset: number }>> = {
    top: [],
    right: [],
    bottom: [],
    left: []
  };

  ports.forEach(port => {
    // Use dragging state if this port is being dragged
    const isDragging = draggingPort?.portId === port.id;
    const actualEdge: EdgeType = isDragging ? draggingPort.edge : (port.edge || (
      port.direction === "in" ? "left" :
      port.direction === "out" ? "right" : "left"
    ));
    const actualOffset = isDragging ? draggingPort.offset : (port.offset ?? 50);

    portsByEdge[actualEdge].push({ ...port, actualEdge, actualOffset });
  });

  return portsByEdge;
}
