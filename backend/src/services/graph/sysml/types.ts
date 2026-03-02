export type SysmlPackageKind = "model" | "view" | "library";

export type SysmlPackage = {
  id: string;
  name: string;
  packageKind: SysmlPackageKind;
  parentId?: string | null;
  tenant: string;
  projectKey: string;
  isRoot?: boolean;
  defaultViewpoints?: string[];
  metadata?: Record<string, unknown> | null;
  lifecycleState?: "active" | "archived";
  createdAt: string;
  updatedAt: string;
};

export type SysmlViewpoint = {
  id: string;
  name: string;
  description?: string | null;
  elementTypes: string[];
  diagramTypes: string[];
  tenant: string;
  projectKey: string;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
};

export type SysmlElementType =
  | "block"
  | "interface"
  | "port"
  | "activity"
  | "state"
  | "requirement"
  | "diagram";

export type SysmlBlockData = {
  blockKind?: string | null;
  isAbstract?: boolean | null;
  defaultSize?: {
    width?: number | null;
    height?: number | null;
  } | null;
  defaultStyle?: Record<string, unknown> | null;
};

export type SysmlInterfaceData = {
  protocol?: string | null;
  direction?: string | null;
  rate?: number | null;
  stereotype?: string | null;
};

export type SysmlPortData = {
  direction?: "in" | "out" | "inout" | "none" | string | null;
  portType?: string | null;
  conjugated?: boolean | null;
  typeRef?: string | null;
  protocol?: string | null;
  rate?: number | null;
};

export type SysmlElement = {
  id: string;
  sysmlId: string;
  name: string;
  elementType: SysmlElementType;
  packageId?: string | null;
  tenant: string;
  projectKey: string;
  lifecycleState: "draft" | "review" | "approved" | "deprecated";
  versionId?: string | null;
  stereotype?: string | null;
  documentation?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  block?: SysmlBlockData | null;
  interface?: SysmlInterfaceData | null;
  port?: SysmlPortData | null;
};

export type SysmlElementRelationship = {
  id?: string;
  type: string;
  direction: "outgoing" | "incoming";
  targetId: string;
  metadata?: Record<string, unknown> | null;
};

export type SysmlDiagramType = "bdd" | "ibd" | "deployment" | "requirements";

export type SysmlDiagram = {
  id: string;
  name: string;
  description?: string | null;
  diagramType: SysmlDiagramType;
  tenant: string;
  projectKey: string;
  packageId?: string | null;
  layoutEngine?: "manual" | "dagre" | "fcose";
  viewport?: { x: number; y: number; zoom: number } | null;
  versionId?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  lifecycleState?: string | null;
};

export type SysmlDiagramNodeLayout = {
  elementId: string;
  position?: { x?: number | null; y?: number | null } | null;
  size?: { width?: number | null; height?: number | null } | null;
  styleOverrides?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
};

export type SysmlDiagramEdgeLayout = {
  connectionId: string;
  sourceId: string;
  targetId: string;
  controlPoints?: Array<{ x: number; y: number }> | null;
  style?: Record<string, unknown> | null;
};

export type SysmlDiagramDetail = {
  diagram: SysmlDiagram;
  nodes: SysmlDiagramNodeLayout[];
  connections: SysmlDiagramEdgeLayout[];
};

export type SysmlServiceStatus = {
  ready: boolean;
  phase: "architecture" | "mvp" | "integration" | "traceability" | "ai";
  message: string;
  version: string;
};
