import { MarkerType, type Edge } from "@xyflow/react";
import type { InterfaceConnector, InterfaceBlock } from "../../../hooks/useInterfaceApi";

function getMarkerType(markerType?: string | null): MarkerType | undefined {
  if (!markerType) return undefined;

  switch (markerType) {
    case "arrow": return MarkerType.Arrow;
    case "arrowclosed": return MarkerType.ArrowClosed;
    case "none": return undefined;
    default: return undefined;
  }
}

export function mapInterfaceConnectorToEdge(connector: InterfaceConnector, blocks?: InterfaceBlock[]): Edge {
  const kind = connector.kind;
  const isFlow = kind === "flow";
  const isDependency = kind === "dependency";
  const isAssociation = kind === "association";
  const isComposition = kind === "composition";
  const defaultStrokeColor = isFlow ? "#2563eb" : isDependency ? "#0f172a" : "#334155";

  // Validate port existence if blocks are provided
  let validatedSourceHandle: string | undefined = undefined;
  let validatedTargetHandle: string | undefined = undefined;

  if (blocks && connector.sourcePortId) {
    const sourceBlock = blocks.find(b => b.id === connector.source);
    if (sourceBlock?.ports.some(p => p.id === connector.sourcePortId)) {
      validatedSourceHandle = connector.sourcePortId;
    }
  } else if (connector.sourcePortId) {
    validatedSourceHandle = connector.sourcePortId;
  }

  if (blocks && connector.targetPortId) {
    const targetBlock = blocks.find(b => b.id === connector.target);
    if (targetBlock?.ports.some(p => p.id === connector.targetPortId)) {
      validatedTargetHandle = `${connector.targetPortId}-target`;
    }
  } else if (connector.targetPortId) {
    validatedTargetHandle = `${connector.targetPortId}-target`;
  }

  // Handle styling properties with explicit null/undefined checks
  const lineStyle = connector.lineStyle !== undefined && connector.lineStyle !== null
    ? connector.lineStyle
    : (isComposition ? "step" : isFlow ? "smoothstep" : "straight");

  const strokeColor = connector.color !== undefined && connector.color !== null
    ? connector.color
    : defaultStrokeColor;

  const strokeWidth = connector.strokeWidth !== undefined && connector.strokeWidth !== null
    ? connector.strokeWidth
    : (isComposition ? 3 : 2);

  const linePattern = connector.linePattern !== undefined && connector.linePattern !== null
    ? connector.linePattern
    : (isDependency ? "dashed" : isAssociation ? "dotted" : "solid");

  const markerEndType = connector.markerEnd !== undefined && connector.markerEnd !== null
    ? getMarkerType(connector.markerEnd)
    : (isComposition ? MarkerType.Arrow : MarkerType.ArrowClosed);

  const markerStartType = connector.markerStart !== undefined && connector.markerStart !== null
    ? getMarkerType(connector.markerStart)
    : (isComposition ? MarkerType.ArrowClosed : undefined);

  const getReactFlowEdgeType = (style: string): string => {
    switch (style) {
      case "straight": return "straight";
      case "smoothstep": return "smoothstep";
      case "step": return "step";
      case "bezier": return "default";
      default: return "straight";
    }
  };

  const getStrokeDashArray = (pattern: string): string | undefined => {
    switch (pattern) {
      case "dashed": return "8 4";
      case "dotted": return "2 2";
      case "solid":
      default: return undefined;
    }
  };

  return {
    id: connector.id,
    source: connector.source,
    target: connector.target,
    sourceHandle: validatedSourceHandle,
    targetHandle: validatedTargetHandle,
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
