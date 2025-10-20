/**
 * Architecture Domain Types
 *
 * Type definitions for the SysML architecture modeling domain.
 * These types represent the frontend data model for blocks, connectors, and ports.
 */

import type {
  BlockKind,
  PortDirection,
  BlockPortRecord,
  BlockPortOverride,
  ConnectorKind,
  ConnectorMarkerType
} from "../types";

// Re-export types from main types file
export { BlockKind, ConnectorKind, PortDirection };
export type { BlockPortRecord, BlockPortOverride };

/**
 * SysML Block - Frontend representation
 * A block in a diagram with position, size, ports, and styling
 */
export interface SysmlBlock {
  id: string;
  name: string;
  kind: BlockKind;
  stereotype?: string;
  description?: string;
  position: { x: number; y: number };
  size: { width: number; height: number };
  ports: BlockPort[];
  definitionPorts?: BlockPort[];
  portOverrides?: Record<string, BlockPortOverride>;
  documentIds?: string[];

  // Styling properties
  backgroundColor?: string;
  borderColor?: string;
  borderWidth?: number;
  borderStyle?: string;
  textColor?: string;
  fontSize?: number;
  fontWeight?: string;
  borderRadius?: number;
}

/**
 * Block Port - Diagram-level port representation
 * Ports on blocks for connectors
 */
export interface BlockPort {
  id: string;
  name: string;
  direction: PortDirection;
  edge?: "top" | "right" | "bottom" | "left";
  offset?: number;  // 0-100%
  size?: number;
  backgroundColor?: string;
  borderColor?: string;
  borderWidth?: number;
  iconColor?: string;
  shape?: "circle" | "square" | "diamond";
  hidden?: boolean;
  showLabel?: boolean;
  labelOffsetX?: number;
  labelOffsetY?: number;
}

/**
 * Port-as-Node Types (Phase 1+ function modeling)
 */

export type PortType = "flow" | "service" | "proxy" | "full";
export type PortShape = "circle" | "square" | "diamond";

/**
 * PortDefinition: Reusable port template
 * Defines a reusable port that can be instantiated on blocks
 */
export interface PortDefinition {
  id: string;
  name: string;
  direction: PortDirection;

  // SysML properties
  portType?: PortType;
  isConjugated?: boolean;

  // Function modeling
  dataType?: string;
  protocol?: string;
  rate?: number;
  bufferSize?: number;

  // Default styling
  backgroundColor?: string;
  borderColor?: string;
  borderWidth?: number;
  size?: number;
  shape?: PortShape;
  iconColor?: string;

  // Metadata
  description?: string;
  stereotype?: string;
  tenant: string;
  projectKey: string;
  packageId?: string;

  createdAt: string;
  updatedAt: string;
}

/**
 * PortInstance: Diagram-specific port instance
 * An instance of a PortDefinition on a specific block in a diagram
 */
export interface PortInstance {
  id: string;
  definitionId: string;
  blockId: string;
  diagramId: string;

  // Instance overrides
  edge?: "top" | "right" | "bottom" | "left";
  offset?: number;
  hidden?: boolean;
  showLabel?: boolean;
  labelOffsetX?: number;
  labelOffsetY?: number;

  // Styling overrides
  backgroundColor?: string;
  borderColor?: string;
  borderWidth?: number;
  size?: number;
  shape?: PortShape;
  iconColor?: string;

  createdAt: string;
  updatedAt: string;
}

/**
 * SysML Connector - Frontend representation
 * Connection between two blocks in a diagram
 */
export interface SysmlConnector {
  id: string;
  source: string;
  target: string;
  kind: ConnectorKind;
  label?: string;
  sourcePortId?: string | null;
  targetPortId?: string | null;
  documentIds?: string[];

  // Styling properties
  lineStyle?: string;
  markerStart?: ConnectorMarkerType;
  markerEnd?: ConnectorMarkerType;
  linePattern?: string;
  color?: string;
  strokeWidth?: number;

  // Label positioning
  labelOffsetX?: number;
  labelOffsetY?: number;
  controlPoints?: Array<{ x: number; y: number }>;
}

/**
 * Architecture State - Complete diagram state
 * Represents the full state of blocks and connectors in a diagram
 */
export interface ArchitectureState {
  blocks: SysmlBlock[];
  connectors: SysmlConnector[];
  lastModified: string;
}

/**
 * Diagram port override keys
 * Keys that can be overridden at the diagram level
 */
export const DIAGRAM_PORT_OVERRIDE_KEYS: Array<keyof BlockPortOverride> = [
  "edge",
  "offset",
  "hidden",
  "showLabel",
  "labelOffsetX",
  "labelOffsetY"
];
