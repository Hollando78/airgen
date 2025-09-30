export type BlockKind = "system" | "subsystem" | "component" | "actor" | "external" | "interface";

export type BlockPortRecord = {
  id: string;
  name: string;
  direction: "in" | "out" | "inout";
};

export type ArchitectureBlockDefinitionRecord = {
  id: string;
  name: string;
  kind: BlockKind;
  stereotype?: string | null;
  description?: string | null;
  tenant: string;
  projectKey: string;
  ports: BlockPortRecord[];
  documentIds: string[];
  createdAt: string;
  updatedAt: string;
};

export type ArchitectureBlockLibraryRecord = ArchitectureBlockDefinitionRecord & {
  diagrams: Array<{ id: string; name: string }>;
};

export type ArchitectureBlockRecord = ArchitectureBlockDefinitionRecord & {
  diagramId: string;
  positionX: number;
  positionY: number;
  sizeWidth: number;
  sizeHeight: number;
  placementCreatedAt: string;
  placementUpdatedAt: string;
  // Styling properties
  backgroundColor?: string | null;
  borderColor?: string | null;
  borderWidth?: number | null;
  borderStyle?: string | null;
  textColor?: string | null;
  fontSize?: number | null;
  fontWeight?: string | null;
  borderRadius?: number | null;
};

export type ConnectorKind = "association" | "flow" | "dependency" | "composition";

export type ArchitectureConnectorRecord = {
  id: string;
  source: string;
  target: string;
  kind: ConnectorKind;
  label?: string | null;
  sourcePortId?: string | null;
  targetPortId?: string | null;
  tenant: string;
  projectKey: string;
  diagramId: string;
  createdAt: string;
  updatedAt: string;
  // Styling properties
  lineStyle?: string | null;
  markerStart?: string | null;
  markerEnd?: string | null;
  linePattern?: string | null;
  color?: string | null;
  strokeWidth?: number | null;
};

export type ArchitectureDiagramRecord = {
  id: string;
  name: string;
  description?: string | null;
  tenant: string;
  projectKey: string;
  view: "block" | "internal" | "deployment" | "requirements_schema";
  createdAt: string;
  updatedAt: string;
};
