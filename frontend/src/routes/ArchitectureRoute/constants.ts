import type { BlockPreset, ConnectorPreset } from "./types";

export const BLOCK_PRESETS: BlockPreset[] = [
  { label: "System", kind: "system", stereotype: "<<system>>" },
  { label: "Subsystem", kind: "subsystem", stereotype: "<<subsystem>>" },
  { label: "Component", kind: "component", stereotype: "<<component>>" },
  { label: "Actor", kind: "actor", stereotype: "<<actor>>" },
  { label: "External", kind: "external", stereotype: "<<external>>" }
];

export const CONNECTOR_PRESETS: ConnectorPreset[] = [
  { label: "Default", lineStyle: "straight", linePattern: "solid", markerEnd: "arrowclosed", markerStart: "none" },
  { label: "Flow", lineStyle: "smoothstep", linePattern: "solid", markerEnd: "arrowclosed", markerStart: "none", color: "#2563eb" },
  { label: "Dependency", lineStyle: "straight", linePattern: "dashed", markerEnd: "arrowclosed", markerStart: "none", color: "#7c3aed" },
  { label: "Composition", lineStyle: "straight", linePattern: "solid", markerEnd: "arrowclosed", markerStart: "arrowclosed", color: "#dc2626" },
  { label: "Association", lineStyle: "straight", linePattern: "dotted", markerEnd: "none", markerStart: "none", color: "#334155" }
];
