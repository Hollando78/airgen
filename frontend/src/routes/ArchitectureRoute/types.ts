import type { BlockKind } from "../../hooks/useArchitectureApi";

export interface BlockPreset {
  label: string;
  kind: BlockKind;
  stereotype: string;
  description?: string;
}

export interface ConnectorPreset {
  label: string;
  lineStyle: string;
  linePattern: string;
  markerEnd: string;
  markerStart: string;
  color?: string;
}
