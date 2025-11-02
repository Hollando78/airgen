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
  // SysML standard: all connectors are black
  return "#000000";
}

export function mapConnectorToEdge(connector: SysmlConnector, blocks?: SysmlBlock[]): Edge {
  const kind = connector.kind;
  const isFlow = kind === "flow";
  const isComposition = kind === "composition";
  const isAggregation = kind === "aggregation";
  const isGeneralization = kind === "generalization";
  const isDependency = kind === "dependency";

  // Use explicit values if set, otherwise fall back to SysML standard defaults
  const lineStyle = connector.lineStyle !== undefined && connector.lineStyle !== null
    ? connector.lineStyle
    : (isComposition || isAggregation ? "straight" :
       isFlow ? "smoothstep" :
       "straight");

  const strokeColor = connector.color !== undefined && connector.color !== null
    ? connector.color
    : "#000000";  // SysML standard: black

  const strokeWidth = connector.strokeWidth !== undefined && connector.strokeWidth !== null
    ? connector.strokeWidth
    : 1;  // SysML standard: thin lines

  const linePattern = connector.linePattern !== undefined && connector.linePattern !== null
    ? connector.linePattern
    : (isDependency ? "dashed" : "solid");

  // SysML standard markers based on relationship type
  const markerEndType = connector.markerEnd !== undefined && connector.markerEnd !== null
    ? getMarkerType(connector.markerEnd)
    : (isGeneralization ? getMarkerType("arrowclosed") :  // Hollow triangle
       isDependency ? getMarkerType("arrow") :  // Open arrow
       isComposition ? getMarkerType("arrowclosed") :  // Filled diamond (using arrow as placeholder)
       getMarkerType("none"));

  const markerStartType = connector.markerStart !== undefined && connector.markerStart !== null
    ? getMarkerType(connector.markerStart)
    : ((isComposition || isAggregation) ? getMarkerType("arrowclosed") :  // Diamond (using arrow as placeholder)
       getMarkerType("none"));

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
    labelStyle: { fontSize: 11, fill: "#000000", fontWeight: 400, fontFamily: "'Inter', sans-serif" },
    labelBgPadding: [4, 2],
    labelBgBorderRadius: 0,  // SysML: no rounded corners
    labelBgStyle: { fill: "#ffffff", stroke: "#000000", strokeWidth: 1 },
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
