export type BlockKind = "system" | "subsystem" | "component" | "actor" | "external" | "interface";

export type ConnectorControlPoint = {
  x: number;
  y: number;
};

export type BlockPortRecord = {
  id: string;
  name: string;
  direction: "in" | "out" | "inout" | "none";
  edge?: "top" | "right" | "bottom" | "left";
  offset?: number; // 0-100% position along edge
  // Styling properties
  backgroundColor?: string | null;
  borderColor?: string | null;
  borderWidth?: number | null;
  size?: number | null;
  shape?: "circle" | "square" | "diamond" | null;
  iconColor?: string | null;
  hidden?: boolean | null;
  showLabel?: boolean | null;
  labelOffsetX?: number | null;
  labelOffsetY?: number | null;
};

export type BlockPortOverrideRecord = {
  edge?: "top" | "right" | "bottom" | "left";
  offset?: number | null;
  hidden?: boolean | null;
  showLabel?: boolean | null;
  labelOffsetX?: number | null;
  labelOffsetY?: number | null;
};

// NEW: Port-as-Node types for function modeling

export type PortDirection = "in" | "out" | "inout" | "none";
export type PortType = "flow" | "service" | "proxy" | "full";
export type PortShape = "circle" | "square" | "diamond";

/**
 * PortDefinition: Reusable port template stored at block definition level
 * Multiple PortInstances can reference the same PortDefinition across diagrams
 */
export type PortDefinitionRecord = {
  id: string;
  name: string;
  direction: PortDirection;

  // SysML properties
  portType?: PortType | null;
  isConjugated?: boolean | null;

  // Function modeling
  dataType?: string | null;        // e.g., "float", "SensorReading", etc.
  protocol?: string | null;         // e.g., "HTTP", "MQTT", "CAN"
  rate?: number | null;             // Data rate in Hz
  bufferSize?: number | null;       // Buffer size for data flow

  // Default styling
  backgroundColor?: string | null;
  borderColor?: string | null;
  borderWidth?: number | null;
  size?: number | null;
  shape?: PortShape | null;
  iconColor?: string | null;

  // Metadata
  description?: string | null;
  stereotype?: string | null;
  tenant: string;
  projectKey: string;
  packageId?: string | null;

  createdAt: string;
  updatedAt: string;
};

/**
 * PortInstance: Diagram-specific port instance
 * Links to a PortDefinition and overrides visual properties
 */
export type PortInstanceRecord = {
  id: string;
  definitionId: string;            // FK to PortDefinition
  blockId: string;                 // Owner block
  diagramId: string;               // Diagram context

  // Instance-specific overrides (diagram placement)
  edge?: "top" | "right" | "bottom" | "left" | null;
  offset?: number | null;          // 0-100% position along edge
  hidden?: boolean | null;
  showLabel?: boolean | null;
  labelOffsetX?: number | null;
  labelOffsetY?: number | null;

  // Instance-specific styling overrides
  backgroundColor?: string | null;
  borderColor?: string | null;
  borderWidth?: number | null;
  size?: number | null;
  shape?: PortShape | null;
  iconColor?: string | null;

  createdAt: string;
  updatedAt: string;
};

export type ArchitectureBlockDefinitionRecord = {
  id: string;
  name: string;
  kind: BlockKind;
  stereotype?: string | null;
  description?: string | null;
  tenant: string;
  projectKey: string;
  packageId?: string | null;
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
  definitionPorts?: BlockPortRecord[];
  portOverrides?: Record<string, BlockPortOverrideRecord>;
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
  documentIds: string[];
  createdAt: string;
  updatedAt: string;
  // Styling properties
  lineStyle?: string | null;
  markerStart?: string | null;
  markerEnd?: string | null;
  linePattern?: string | null;
  color?: string | null;
  strokeWidth?: number | null;
  labelOffsetX?: number | null;
  labelOffsetY?: number | null;
  controlPoints?: ConnectorControlPoint[] | null;
};

export type ArchitectureDiagramRecord = {
  id: string;
  name: string;
  description?: string | null;
  tenant: string;
  projectKey: string;
  packageId?: string | null;
  view: "block" | "internal" | "deployment" | "requirements_schema";
  createdAt: string;
  updatedAt: string;
};
