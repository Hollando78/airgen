import { MarkerType, type Edge, type XYPosition } from "@xyflow/react";
import type { SysmlConnector } from "../../../hooks/useArchitectureApi";

export function getMarkerType(markerType?: string) {
  switch (markerType) {
    case "arrow": return MarkerType.Arrow;
    case "arrowclosed": return MarkerType.ArrowClosed;
    case "none": return undefined;
    default: return MarkerType.ArrowClosed;
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

export function mapConnectorToEdge(connector: SysmlConnector): Edge {
  const kind = connector.kind;
  const isFlow = kind === "flow";
  const isComposition = kind === "composition";

  // Composition connectors get special treatment for hierarchy visualization
  const lineStyle = connector.lineStyle || (isComposition ? "step" : isFlow ? "smoothstep" : "straight");
  const strokeColor = connector.color || getDefaultColorByKind(kind);
  const strokeWidth = connector.strokeWidth || (isComposition ? 3 : 2);
  const linePattern = connector.linePattern || "solid";
  const markerEndType = getMarkerType(connector.markerEnd || (isComposition ? "arrow" : "arrowclosed"));
  const markerStartType = getMarkerType(connector.markerStart || (isComposition ? "arrowclosed" : "none"));

  const getReactFlowEdgeType = (style: string): string => {
    switch (style) {
      case "straight": return "straight";
      case "smoothstep": return "smoothstep";
      case "step": return "step";
      case "bezier": return "default";
      default: return "straight";
    }
  };

  return {
    id: connector.id,
    source: connector.source,
    target: connector.target,
    sourceHandle: connector.sourcePortId ?? undefined,
    targetHandle: connector.targetPortId ?? undefined,
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
