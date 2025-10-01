import { MarkerType, type Edge, type XYPosition } from "@xyflow/react";
import type { SysmlConnector, SysmlBlock } from "../../../hooks/useArchitectureApi";

export function getMarkerType(markerType?: string) {
  switch (markerType) {
    case "arrow": return MarkerType.Arrow;
    case "arrowclosed": return MarkerType.ArrowClosed;
    case "none": return undefined;
    default: return undefined;
  }
}

export function getStrokeDashArray(linePattern?: string): string | undefined {
  switch (linePattern) {
    case "dashed": return "8 4";
    case "dotted": return "2 2";
    case "solid":
    default: return undefined;
  }
}

export function getDefaultColorByKind(kind: string): string {
  switch (kind) {
    case "flow": return "#2563eb";
    case "dependency": return "#7c3aed";
    case "association": return "#334155";
    case "composition": return "#16a34a"; // Green for parent-child hierarchy
    default: return "#334155";
  }
}

export function mapConnectorToEdge(connector: SysmlConnector, blocks?: SysmlBlock[]): Edge {
  const kind = connector.kind;
  const isFlow = kind === "flow";
  const isComposition = kind === "composition";

  // Use explicit values if set, otherwise fall back to kind-based defaults
  // Check if properties are explicitly set (even to "none") vs. undefined (not set)
  const lineStyle = connector.lineStyle !== undefined && connector.lineStyle !== null
    ? connector.lineStyle
    : (isComposition ? "step" : isFlow ? "smoothstep" : "straight");

  const strokeColor = connector.color !== undefined && connector.color !== null
    ? connector.color
    : getDefaultColorByKind(kind);

  const strokeWidth = connector.strokeWidth !== undefined && connector.strokeWidth !== null
    ? connector.strokeWidth
    : (isComposition ? 3 : 2);

  const linePattern = connector.linePattern !== undefined && connector.linePattern !== null
    ? connector.linePattern
    : "solid";

  const markerEndType = connector.markerEnd !== undefined && connector.markerEnd !== null
    ? getMarkerType(connector.markerEnd)
    : getMarkerType(isComposition ? "arrow" : "arrowclosed");

  const markerStartType = connector.markerStart !== undefined && connector.markerStart !== null
    ? getMarkerType(connector.markerStart)
    : getMarkerType(isComposition ? "arrowclosed" : "none");

  const getReactFlowEdgeType = (style: string): string => {
    switch (style) {
      case "straight": return "straight";
      case "smoothstep": return "smoothstep";
      case "step": return "step";
      case "bezier": return "default";
      default: return "straight";
    }
  };

  // In Architecture view, don't use port handles - always use default top/bottom handles
  // Port handles are only used in specialized views like Interface diagrams
  // Use explicit "default-out" and "default-in" to force React Flow to use the default handles
  const sourceHandle = "default-out";
  const targetHandle = "default-in";

  return {
    id: connector.id,
    source: connector.source,
    target: connector.target,
    sourceHandle,
    targetHandle,
    label: connector.label,
    type: getReactFlowEdgeType(lineStyle),
    animated: isFlow,
    style: {
      strokeWidth,
      strokeDasharray: getStrokeDashArray(linePattern),
      stroke: strokeColor
    },
    labelStyle: { fontSize: 12, fill: "#0f172a", fontWeight: 500 },
    labelBgPadding: [6, 4],
    labelBgBorderRadius: 4,
    labelBgStyle: { fill: "#ffffff", stroke: "#e2e8f0", strokeWidth: 1 },
    markerEnd: markerEndType ? {
      type: markerEndType,
      color: strokeColor,
      width: 22,
      height: 22
    } : undefined,
    markerStart: markerStartType ? {
      type: markerStartType,
      color: strokeColor,
      width: 18,
      height: 18
    } : undefined
  } satisfies Edge;
}

export function computeBlockPlacement(blockCount: number): XYPosition {
  const offset = blockCount;
  return {
    x: 160 + offset * 60 + Math.random() * 40,
    y: 160 + offset * 40 + Math.random() * 40
  };
}
