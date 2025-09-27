import { MarkerType, type Edge } from "@xyflow/react";
import type { InterfaceConnector } from "../../../hooks/useInterfaceApi";

export function mapInterfaceConnectorToEdge(connector: InterfaceConnector): Edge {
  const kind = connector.kind;
  const isFlow = kind === "flow";
  const isDependency = kind === "dependency";
  const isAssociation = kind === "association";
  const strokeColor = isFlow ? "#2563eb" : isDependency ? "#0f172a" : "#334155";

  return {
    id: connector.id,
    source: connector.source,
    target: connector.target,
    sourceHandle: connector.sourcePortId ?? undefined,
    targetHandle: connector.targetPortId ?? undefined,
    label: connector.label,
    type: isFlow ? "smoothstep" : "straight",
    animated: isFlow,
    style: {
      strokeWidth: connector.strokeWidth ?? 2,
      strokeDasharray: connector.linePattern ?? (isDependency ? "6 4" : isAssociation ? "4 3" : undefined),
      stroke: connector.color ?? strokeColor
    },
    labelStyle: { fontSize: 12, fill: "#0f172a", fontWeight: 500 },
    labelBgPadding: [6, 4],
    labelBgBorderRadius: 4,
    labelBgStyle: { fill: "#ffffff", stroke: "#e2e8f0", strokeWidth: 1 },
    markerEnd: {
      type: (connector.markerEnd as MarkerType | undefined) ?? MarkerType.ArrowClosed,
      color: connector.color ?? strokeColor,
      width: 22,
      height: 22
    },
    markerStart: connector.markerStart
      ? {
          type: connector.markerStart as MarkerType,
          color: connector.color ?? strokeColor,
          width: 18,
          height: 18
        }
      : kind === "composition"
        ? { type: MarkerType.ArrowClosed, color: connector.color ?? strokeColor, width: 18, height: 18 }
        : undefined
  } satisfies Edge;
}
