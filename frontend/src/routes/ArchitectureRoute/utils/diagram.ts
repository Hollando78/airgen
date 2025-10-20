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
      case "polyline": return "polyline";
      case "bezier": return "default";
      default: return "straight";
    }
  };

  // Prefer explicit port handles when available, but gracefully fall back to defaults
  // so existing diagrams without port assignments continue to render correctly.
  let validatedSourceHandle: string | undefined;
  let validatedTargetHandle: string | undefined;

  if (connector.sourcePortId) {
    if (blocks) {
      const sourceBlock = blocks.find(block => block.id === connector.source);
      if (sourceBlock?.ports.some(port => port.id === connector.sourcePortId && !port.hidden)) {
        validatedSourceHandle = connector.sourcePortId;
      }
    } else {
      validatedSourceHandle = connector.sourcePortId;
    }
  }

  if (connector.targetPortId) {
    if (blocks) {
      const targetBlock = blocks.find(block => block.id === connector.target);
      if (targetBlock?.ports.some(port => port.id === connector.targetPortId && !port.hidden)) {
        validatedTargetHandle = `${connector.targetPortId}-target`;
      }
    } else {
      validatedTargetHandle = `${connector.targetPortId}-target`;
    }
  }

  const sourceHandle = validatedSourceHandle ?? "default-out";
  const targetHandle = validatedTargetHandle ?? "default-in";

  return {
    id: connector.id,
    source: connector.source,
    target: connector.target,
    sourceHandle,
    targetHandle,
    label: connector.label || "",
    type: getReactFlowEdgeType(lineStyle),
    animated: isFlow,
    data: {
      documentIds: connector.documentIds || [],
      originalLabel: connector.label,
      labelOffsetX: connector.labelOffsetX,
      labelOffsetY: connector.labelOffsetY,
      controlPoints: connector.controlPoints ?? []
    },
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
