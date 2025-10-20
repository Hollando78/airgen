import type { BlockKind } from "../../hooks/useArchitectureApi";
import type { ConnectorMarkerType } from "../../types";

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
  markerEnd: ConnectorMarkerType;
  markerStart: ConnectorMarkerType;
  color?: string;
}
