export type RequirementPattern = "ubiquitous" | "event" | "state" | "unwanted" | "optional";
export type VerificationMethod = "Test" | "Analysis" | "Inspection" | "Demonstration";
export type ComplianceStatus = "N/A" | "Compliant" | "Compliance Risk" | "Non-Compliant";

export type DraftItem = {
  text: string;
  pattern: RequirementPattern;
  verification: VerificationMethod;
  qaScore: number;
  qaVerdict: string;
  rationale: string;
  source: "heuristic" | "llm";
};

export type DraftMeta = {
  heuristics: number;
  llm: {
    requested: boolean;
    provided: number;
    error?: string;
  };
};

export type DraftResponse = {
  items: DraftItem[];
  meta: DraftMeta;
};

export type DraftRequest = {
  need: string;
  pattern?: RequirementPattern;
  verification?: VerificationMethod;
  count?: number;
  actor?: string;
  system?: string;
  trigger?: string;
  response?: string;
  constraint?: string;
  useLlm?: boolean;
};

export type QaRuleHit = { rule: string; ok: boolean; message?: string };

export type QAScorerStatus = {
  isRunning: boolean;
  processedCount: number;
  totalCount: number;
  currentRequirement: string | null;
  lastError: string | null;
  startedAt: string | null;
  completedAt: string | null;
};

export type QaResponse = {
  score: number;
  hits: QaRuleHit[];
  suggestions: string[];
  verdict: string;
  pattern?: RequirementPattern;
  verification?: VerificationMethod;
};

export type ApplyFixResponse = {
  before: string;
  after: string;
  notes: string[];
};

export type RequirementRecord = {
  id: string;
  hashId: string;
  ref: string;
  tenant: string;
  projectKey: string;
  title: string;
  text: string;
  order?: number;
  pattern?: RequirementPattern;
  verification?: VerificationMethod;
  rationale?: string;
  complianceStatus?: ComplianceStatus;
  complianceRationale?: string;
  qaScore?: number;
  qaVerdict?: string;
  suggestions?: string[];
  tags?: string[];
  path: string;
  documentSlug?: string;
  createdAt: string;
  updatedAt: string;
  deleted?: boolean;
  archived?: boolean;
  attributes?: Record<string, string | number | boolean | null>;
};

export type RequirementVersionRecord = {
  versionId: string;
  requirementId: string;
  versionNumber: number;
  timestamp: string;
  changedBy: string;
  changeType: "created" | "updated" | "archived" | "restored" | "deleted";
  changeDescription?: string;
  text: string;
  pattern?: RequirementPattern;
  verification?: VerificationMethod;
  rationale?: string;
  complianceStatus?: string;
  complianceRationale?: string;
  qaScore?: number;
  qaVerdict?: string;
  suggestions?: string[];
  tags?: string[];
  attributes?: Record<string, string | number | boolean | null>;
  contentHash: string;
};

export type RequirementDiff = {
  field: string;
  oldValue: any;
  newValue: any;
  changed: boolean;
};

export type RequirementHistoryResponse = {
  history: RequirementVersionRecord[];
};

export type RequirementDiffResponse = {
  diff: RequirementDiff[];
};

export type RestoreVersionResponse = {
  requirement: RequirementRecord;
  restoredFrom: number;
};

export type RequirementDetail = {
  record: RequirementRecord;
  markdown: string;
};

export type CreateRequirementRequest = {
  tenant: string;
  projectKey: string;
  documentSlug?: string;
  sectionId?: string;
  text: string;
  pattern?: RequirementPattern;
  verification?: VerificationMethod;
  qaScore?: number;
  qaVerdict?: string;
  suggestions?: string[];
  tags?: string[];
  attributes?: Record<string, string | number | boolean | null>;
};

export type RequirementCandidateStatus = "pending" | "accepted" | "rejected";

export type RequirementCandidate = {
  id: string;
  text: string;
  status: RequirementCandidateStatus;
  qa: {
    score: number | null;
    verdict: string | null;
    suggestions: string[];
  };
  qaScore?: number;
  qaVerdict?: string;
  suggestions?: string[];
  prompt?: string | null;
  querySessionId?: string | null;
  requirementRef?: string | null;
  requirementId?: string | null;
  documentSlug?: string | null;
  sectionId?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DiagramCandidateStatus = "pending" | "accepted" | "rejected";

export type DiagramCandidateAction = "create" | "update" | "extend";

export type DiagramCandidateBlock = {
  id?: string; // For updates to existing blocks
  name: string;
  kind: BlockKind;
  stereotype?: string;
  description?: string;
  positionX: number;
  positionY: number;
  sizeWidth?: number;
  sizeHeight?: number;
  ports?: BlockPortRecord[];
  action?: "create" | "update" | "delete";
};

export type DiagramCandidateConnector = {
  id?: string; // For updates to existing connectors
  source: string; // Block name or ID
  target: string; // Block name or ID
  kind: ConnectorKind;
  label?: string;
  sourcePortId?: string;
  targetPortId?: string;
  action?: "create" | "update" | "delete";
};

export type DiagramCandidate = {
  id: string;
  status: DiagramCandidateStatus;
  action: DiagramCandidateAction;
  diagramId?: string; // For updates/extensions to existing diagrams
  diagramName?: string; // For new diagrams
  diagramDescription?: string;
  diagramView?: "block" | "internal" | "deployment";
  blocks: DiagramCandidateBlock[];
  connectors: DiagramCandidateConnector[];
  reasoning: string; // LLM explanation of the diagram design
  prompt?: string | null;
  querySessionId?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DocumentAttachment = {
  type: "native" | "surrogate";
  documentSlug: string;
  sectionIds?: string[]; // For native docs, specific sections
};

export type DiagramAttachment = {
  type: "diagram";
  diagramId: string;
  includeGeometry?: boolean; // Include positions/sizes for layout-aware requirements
  includeConnections?: boolean; // Include connectivity for interface requirements
};

export type AirGenAttachment = DocumentAttachment | DiagramAttachment;

export type AirGenChatRequest = {
  tenant: string;
  projectKey: string;
  user_input: string;
  glossary?: string;
  constraints?: string;
  n?: number;
  mode?: "requirements" | "diagram"; // New mode parameter
  attachedDocuments?: DocumentAttachment[];
  attachedDiagrams?: DiagramAttachment[];
};

export type AirGenChatResponse = {
  prompt: string;
  items: RequirementCandidate[];
};

export type AirGenDiagramResponse = {
  prompt: string;
  candidate: DiagramCandidate;
};

export type RequirementCandidateListResponse = {
  items: RequirementCandidate[];
};

export type RequirementCandidateActionResponse = {
  candidate: RequirementCandidate;
  requirement?: RequirementRecord;
};

export type RequirementCandidateGroup = {
  sessionId: string;
  prompt: string | null;
  count: number;
  candidates: RequirementCandidate[];
};

export type RequirementCandidateGroupedResponse = {
  groups: RequirementCandidateGroup[];
};

export type BaselineRecord = {
  id: string;
  ref: string;
  tenant: string;
  projectKey: string;
  createdAt: string;
  author?: string | null;
  label?: string | null;
  requirementRefs: string[];
  // Version snapshot counts
  requirementVersionCount?: number;
  documentVersionCount?: number;
  documentSectionVersionCount?: number;
  infoVersionCount?: number;
  surrogateVersionCount?: number;
  traceLinkVersionCount?: number;
  linksetVersionCount?: number;
  diagramVersionCount?: number;
  blockVersionCount?: number;
  connectorVersionCount?: number;
};

export type BaselineResponse = {
  baseline: BaselineRecord;
};

export type BaselineListResponse = {
  items: BaselineRecord[];
};

export type TenantRecord = {
  slug: string;
  name: string | null;
  createdAt: string | null;
  projectCount: number;
  isOwner: boolean;
};

export type TenantsResponse = {
  tenants: TenantRecord[];
};

export type TenantInvitationRecord = {
  id: string;
  tenantSlug: string;
  email: string;
  invitedBy: string;
  invitedByEmail: string | null;
  status: "pending" | "accepted" | "cancelled";
  createdAt: string;
  updatedAt: string;
  acceptedAt?: string | null;
  cancelledAt?: string | null;
};

export type TenantInvitationsResponse = {
  invitations: TenantInvitationRecord[];
};

export type CreateTenantInvitationResponse = {
  invitation: TenantInvitationRecord;
};

export type AcceptInvitationResponse = {
  message: string;
  tenantSlug: string;
  token: string;
  user: {
    id: string;
    email: string;
    name?: string;
    roles: string[];
    tenantSlugs: string[];
    ownedTenantSlugs: string[];
  };
};

export type ProjectRecord = {
  slug: string;
  tenantSlug: string;
  key: string | null;
  name: string | null;
  description: string | null;
  code: string | null;
  createdAt: string | null;
  requirementCount: number;
};

export type ProjectsResponse = {
  projects: ProjectRecord[];
};

export type DocumentKind = "structured" | "surrogate";

export type DocumentRecord = {
  id: string;
  slug: string;
  name: string;
  description?: string | null;
  shortCode?: string | null;
  tenant: string;
  projectKey: string;
  parentFolder?: string | null;
  createdAt: string;
  updatedAt: string;
  requirementCount?: number;
  kind: DocumentKind;
  originalFileName?: string | null;
  storedFileName?: string | null;
  mimeType?: string | null;
  fileSize?: number | null;
  storagePath?: string | null;
  previewPath?: string | null;
  previewMimeType?: string | null;
  downloadUrl?: string | null;
  previewDownloadUrl?: string | null;
};

export type FolderRecord = {
  id: string;
  slug: string;
  name: string;
  description?: string | null;
  tenant: string;
  projectKey: string;
  parentFolder?: string | null;
  createdAt: string;
  updatedAt: string;
  documentCount?: number;
  folderCount?: number;
};

export type DocumentSectionRecord = {
  id: string;
  name: string;
  description?: string | null;
  shortCode?: string | null;
  documentSlug: string;
  tenant: string;
  projectKey: string;
  order: number;
  createdAt: string;
  updatedAt: string;
};

export type DocumentSectionWithRelations = DocumentSectionRecord & {
  requirements: RequirementRecord[];
  infos: InfoRecord[];
  surrogates: SurrogateReferenceRecord[];
};

export type InfoRecord = {
  id: string;
  ref: string;
  tenant: string;
  projectKey: string;
  documentSlug: string;
  text: string;
  title?: string;
  sectionId?: string;
  order?: number;
  createdAt: string;
  updatedAt: string;
};

export type SurrogateReferenceRecord = {
  id: string;
  tenant: string;
  projectKey: string;
  documentSlug: string;
  slug: string;
  caption?: string;
  sectionId?: string;
  order?: number;
  createdAt: string;
  updatedAt: string;
};

export type DocumentsResponse = {
  documents: DocumentRecord[];
};

export type DocumentResponse = {
  document: DocumentRecord;
};

export type FoldersResponse = {
  folders: FolderRecord[];
};

export type FolderResponse = {
  folder: FolderRecord;
};

export type DocumentSectionsResponse = {
  sections: DocumentSectionRecord[];
};

export type DocumentSectionsWithRelationsResponse = {
  sections: DocumentSectionWithRelations[];
};

export type DocumentSectionResponse = {
  section: DocumentSectionRecord;
};

export type CreateSectionRequest = {
  tenant: string;
  projectKey: string;
  documentSlug: string;
  name: string;
  description?: string;
  shortCode?: string;
  order: number;
};

export type LinkSuggestRequest = {
  tenant: string;
  project: string;
  text: string;
  limit?: number;
};

export type LinkSuggestion = {
  ref: string;
  title: string;
  path: string;
};

export type LinkSuggestResponse = {
  suggestions: LinkSuggestion[];
};

// Trace Link Types
export type TraceLinkType = "satisfies" | "derives" | "verifies" | "implements" | "refines" | "conflicts";

// Legacy individual trace link (being phased out)
export type TraceLink = {
  id: string;
  sourceRequirementId: string;
  sourceRequirement: RequirementRecord;
  targetRequirementId: string;
  targetRequirement: RequirementRecord;
  linkType: TraceLinkType;
  description?: string;
  createdAt: string;
  updatedAt: string;
};

export type CreateTraceLinkRequest = {
  sourceRequirementId: string;
  targetRequirementId: string;
  linkType: TraceLinkType;
  description?: string;
};

// New Linkset Types
export type TraceLinkItem = {
  id: string;
  sourceRequirementId: string;
  targetRequirementId: string;
  linkType: TraceLinkType;
  description?: string;
  createdAt: string;
  updatedAt: string;
};

export type DocumentLinkset = {
  id: string;
  tenant: string;
  projectKey: string;
  sourceDocumentSlug: string;
  targetDocumentSlug: string;
  sourceDocument: DocumentRecord;
  targetDocument: DocumentRecord;
  linkCount: number;
  links: TraceLinkItem[];
  defaultLinkType?: TraceLinkType;
  createdAt: string;
  updatedAt: string;
};

export type CreateLinksetRequest = {
  sourceDocumentSlug: string;
  targetDocumentSlug: string;
  defaultLinkType?: TraceLinkType;
  links?: TraceLinkItem[];
};

export type AddLinkToLinksetRequest = {
  sourceRequirementId: string;
  targetRequirementId: string;
  linkType: TraceLinkType;
  description?: string;
};

export type DocumentTreeNode = {
  type: "document" | "section" | "requirement";
  id: string;
  name: string;
  ref?: string;
  children?: DocumentTreeNode[];
};

// Architecture Types
export type BlockKind = "system" | "subsystem" | "component" | "actor" | "external" | "interface";
export type ConnectorKind = "association" | "flow" | "dependency" | "composition";
export type PortDirection = "in" | "out" | "inout" | "none";
export type PortEdge = "top" | "right" | "bottom" | "left";
export type ConnectorLineStyle = "straight" | "smoothstep" | "step" | "bezier";
export type ConnectorMarkerType = "arrow" | "arrowclosed" | "none";
export type ConnectorLinePattern = "solid" | "dashed" | "dotted";

export type BlockPortRecord = {
  id: string;
  name: string;
  direction: PortDirection;
  edge?: PortEdge;      // Which edge of the block (default: auto-position based on direction)
  offset?: number;      // Position along the edge, 0-100% (default: evenly spaced)
  size?: number;
  backgroundColor?: string;
  borderColor?: string;
  borderWidth?: number;
  iconColor?: string;
  shape?: "circle" | "square" | "diamond";
  hidden?: boolean;
  showLabel?: boolean;  // Whether to show the label
  labelOffsetX?: number; // Label offset in pixels from port center
  labelOffsetY?: number; // Label offset in pixels from port center
};

export type BlockPortOverride = {
  edge?: PortEdge;
  offset?: number | null;
  hidden?: boolean | null;
  showLabel?: boolean | null;
  labelOffsetX?: number | null;
  labelOffsetY?: number | null;
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
  portOverrides?: Record<string, BlockPortOverride>;
};

export type ArchitectureBlockLibraryRecord = ArchitectureBlockDefinitionRecord & {
  diagrams: Array<{ id: string; name: string }>;
};

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
  lineStyle?: ConnectorLineStyle;
  markerStart?: ConnectorMarkerType;
  markerEnd?: ConnectorMarkerType;
  linePattern?: ConnectorLinePattern;
  color?: string;
  strokeWidth?: number;
  // Label positioning
  labelOffsetX?: number | null;
  labelOffsetY?: number | null;
  controlPoints?: Array<{ x: number; y: number }> | null;
};

export type CreateArchitectureBlockRequest = {
  tenant: string;
  projectKey: string;
  diagramId: string;
  name?: string;
  kind?: BlockKind;
  stereotype?: string;
  description?: string;
  positionX: number;
  positionY: number;
  sizeWidth?: number;
  sizeHeight?: number;
  ports?: BlockPortRecord[];
  documentIds?: string[];
  existingBlockId?: string;
};

export type UpdateArchitectureBlockRequest = {
  diagramId: string;
  name?: string;
  kind?: BlockKind;
  stereotype?: string;
  description?: string;
  positionX?: number;
  positionY?: number;
  sizeWidth?: number;
  sizeHeight?: number;
  ports?: BlockPortRecord[];
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
  portOverrides?: Record<string, BlockPortOverride>;
};

export type CreateArchitectureConnectorRequest = {
  tenant: string;
  projectKey: string;
  source: string;
  target: string;
  kind: ConnectorKind;
  label?: string;
  sourcePortId?: string;
  targetPortId?: string;
  diagramId: string;
  documentIds?: string[];
  // Styling properties
  lineStyle?: ConnectorLineStyle;
  markerStart?: ConnectorMarkerType;
  markerEnd?: ConnectorMarkerType;
  linePattern?: ConnectorLinePattern;
  color?: string;
  strokeWidth?: number;
  labelOffsetX?: number;
  labelOffsetY?: number;
  controlPoints?: Array<{ x: number; y: number }>;
};

export type ArchitectureBlocksResponse = {
  blocks: ArchitectureBlockRecord[];
};

export type ArchitectureBlockResponse = {
  block: ArchitectureBlockRecord;
};

export type ArchitectureBlockLibraryResponse = {
  blocks: ArchitectureBlockLibraryRecord[];
};

export type ArchitectureConnectorsResponse = {
  connectors: ArchitectureConnectorRecord[];
};

export type ArchitectureConnectorResponse = {
  connector: ArchitectureConnectorRecord;
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

export type ArchitectureDiagramsResponse = {
  diagrams: ArchitectureDiagramRecord[];
};

export type ArchitectureDiagramResponse = {
  diagram: ArchitectureDiagramRecord;
};

// SysML Types
export type SysmlPackageKind = "model" | "view" | "library";

export type SysmlPackageRecord = {
  id: string;
  name: string;
  packageKind: SysmlPackageKind;
  parentId: string | null;
  tenant: string;
  projectKey: string;
  isRoot?: boolean;
  defaultViewpoints?: string[];
  lifecycleState?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
};

export type SysmlPackagesResponse = {
  packages: SysmlPackageRecord[];
  meta?: { implementationPhase?: string; message?: string };
};

export type SysmlPackageResponse = {
  package: SysmlPackageRecord;
};

export type SysmlBlockData = {
  blockKind?: string | null;
  isAbstract?: boolean | null;
  defaultSize?: { width?: number | null; height?: number | null } | null;
  defaultStyle?: Record<string, unknown> | null;
};

export type SysmlInterfaceData = {
  protocol?: string | null;
  direction?: string | null;
  rate?: number | null;
};

export type SysmlPortData = {
  direction?: string | null;
  portType?: string | null;
  isConjugated?: boolean | null;
  typeRef?: string | null;
  protocol?: string | null;
  rate?: number | null;
};

export type SysmlElementType = "block" | "interface" | "port" | "activity" | "state" | "requirement" | "diagram";

export type SysmlElementRecord = {
  id: string;
  sysmlId: string;
  name: string;
  elementType: SysmlElementType;
  packageId: string | null;
  tenant: string;
  projectKey: string;
  lifecycleState: string;
  stereotype?: string | null;
  documentation?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  block?: SysmlBlockData | null;
  interface?: SysmlInterfaceData | null;
  port?: SysmlPortData | null;
};

export type SysmlRelationshipRecord = {
  id?: string;
  type: string;
  direction: "outgoing" | "incoming";
  targetId: string;
  metadata?: Record<string, unknown> | null;
};

export type SysmlElementListResponse = {
  elements: SysmlElementRecord[];
  meta?: { implementationPhase?: string; message?: string; count?: number };
};

export type SysmlElementResponse = {
  element: SysmlElementRecord;
};

export type SysmlElementDetailResponse = {
  element: SysmlElementRecord;
  relationships: SysmlRelationshipRecord[];
};

export type SysmlRelationshipResponse = {
  relationship: SysmlRelationshipRecord;
};

export type SysmlDiagramType = "bdd" | "ibd" | "deployment" | "requirements";

export type SysmlDiagramRecord = {
  id: string;
  name: string;
  description?: string | null;
  diagramType: SysmlDiagramType;
  tenant: string;
  projectKey: string;
  packageId?: string | null;
  layoutEngine?: "manual" | "dagre" | "fcose";
  viewport?: { x: number; y: number; zoom: number } | null;
  lifecycleState?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
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

export type SysmlDiagramsResponse = {
  diagrams: SysmlDiagramRecord[];
  meta?: { implementationPhase?: string; message?: string; count?: number };
};

export type SysmlDiagramResponse = {
  diagram: SysmlDiagramRecord;
};

export type SysmlDiagramDetailResponse = {
  diagram: SysmlDiagramRecord;
  nodes: SysmlDiagramNodeLayout[];
  connections: SysmlDiagramEdgeLayout[];
};

export type CreateSysmlPackageRequest = {
  name: string;
  packageKind?: SysmlPackageKind;
  parentId?: string | null;
  defaultViewpoints?: string[];
  metadata?: Record<string, unknown> | null;
};

export type UpdateSysmlPackageRequest = {
  name?: string;
  packageKind?: SysmlPackageKind;
  defaultViewpoints?: string[];
  metadata?: Record<string, unknown> | null;
};

export type CreateSysmlElementRequest = {
  elementType: SysmlElementType;
  name: string;
  packageId?: string;
  stereotype?: string | null;
  documentation?: string | null;
  metadata?: Record<string, unknown> | null;
  block?: SysmlBlockData;
  interface?: SysmlInterfaceData;
  port?: SysmlPortData;
};

export type UpdateSysmlElementRequest = {
  name?: string;
  stereotype?: string | null;
  documentation?: string | null;
  metadata?: Record<string, unknown> | null;
  block?: SysmlBlockData | null;
  interface?: SysmlInterfaceData | null;
  port?: SysmlPortData | null;
};

export type CreateSysmlRelationshipRequest = {
  targetElementId: string;
  type: string;
  metadata?: Record<string, unknown> | null;
};

export type CreateSysmlDiagramRequest = {
  name: string;
  diagramType: SysmlDiagramType;
  packageId?: string;
  description?: string | null;
  layoutEngine?: "manual" | "dagre" | "fcose";
  viewport?: { x: number; y: number; zoom: number } | null;
  metadata?: Record<string, unknown> | null;
};

export type UpdateSysmlDiagramRequest = {
  name?: string;
  description?: string | null;
  layoutEngine?: "manual" | "dagre" | "fcose" | null;
  viewport?: { x: number; y: number; zoom: number } | null;
  metadata?: Record<string, unknown> | null;
};

export type DevUser = {
  id: string;
  email: string;
  name?: string | null;
  emailVerified: boolean;
  mfaEnabled: boolean;
  permissions?: import("./lib/rbac").UserPermissions;
  roles?: string[];
  tenantSlugs?: string[];
  createdAt: string;
  updatedAt: string;
};

export type DevUserListResponse = {
  users: DevUser[];
};

export type DevUserResponse = {
  user: DevUser;
};

// Admin Recovery / Backup Types
export type BackupComponent = {
  id: string;
  label: string;
  filename: string;
  size: string;
  sizeBytes: number;
};

export type BackupInfo = {
  name: string;
  path: string;
  size: string;
  modified: string;
  files: number;
  components?: BackupComponent[];
  warnings?: string[];
};

export type RemoteSnapshot = {
  id: string;
  time: string;
  hostname: string;
  tags: string[];
  paths: string[];
};

export type BackupListResponse = {
  daily: BackupInfo[];
  weekly: BackupInfo[];
};

export type RemoteBackupListResponse = {
  snapshots: RemoteSnapshot[];
  configured: boolean;
};

export type BackupOperationResponse = {
  success: boolean;
  message: string;
  output: string;
};

export type BackupStatusResponse = {
  localBackups: {
    dailyCount: number;
    weeklyCount: number;
    lastDaily: string;
    lastWeekly: string;
    totalSize: string;
  };
  remoteBackups: {
    configured: boolean;
    count: number;
    lastSnapshot: string;
  };
  cronJobs: Array<{
    schedule: string;
    command: string;
  }>;
  diskSpace: {
    available: string;
    used: string;
    percentage: string;
  };
};

export type ProjectBackupRecord = {
  id: string;
  tenant: string;
  projectKey: string;
  backupType: "local" | "remote" | "both";
  format: "cypher" | "json";
  localPath?: string | null;
  remotePath?: string | null;
  resticSnapshotId?: string | null;
  createdAt: string;
  size: number;
  checksum: string;
  status: string;
};

export type ProjectBackupListResponse = {
  backups: ProjectBackupRecord[];
  total: number;
};

export type ProjectBackupExportResponse = {
  success: boolean;
  tenant: string;
  projectKey: string;
  outputPath: string | null;
  fileSize: number | null;
  nodesExported: number | null;
  relationshipsExported: number | null;
  duration: number;
  checksum: string | null;
  resticSnapshotId: string | null;
  log?: string | null;
  message?: string | null;
};

// Natural Language Query Types
export type NLQueryRequest = {
  tenant: string;
  projectKey: string;
  query: string;
  includeExplanation?: boolean;
};

export type NLQueryResult = {
  cypherQuery: string;
  results: unknown[];
  resultCount: number;
  executionTime: number;
  explanation?: string;
};

export type ExampleQuery = {
  natural: string;
  category: string;
};

// Semantic Search Types
export type SimilarRequirement = {
  id: string;
  ref: string;
  text: string;
  pattern?: RequirementPattern;
  verification?: VerificationMethod;
  qaScore?: number;
  similarity: number;
};

export type SimilarRequirementsResponse = {
  similar: SimilarRequirement[];
};

export type SemanticSearchRequest = {
  tenant: string;
  project: string;
  query: string;
  minSimilarity?: number;
  limit?: number;
};

export type SemanticSearchResponse = {
  results: SimilarRequirement[];
};

export type DuplicatesResponse = {
  duplicates: SimilarRequirement[];
};

// Embedding Worker Types
export type EmbeddingWorkerStatus = {
  isRunning: boolean;
  operation: 'backfill' | 'reembed-all' | null;
  processedCount: number;
  totalCount: number;
  currentRequirement: string | null;
  lastError: string | null;
  startedAt: string | null;
  completedAt: string | null;
};

export type EmbeddingWorkerStartRequest = {
  tenant: string;
  project: string;
  operation: 'backfill' | 'reembed-all';
};

export type EmbeddingWorkerStartResponse = {
  message: string;
  status: EmbeddingWorkerStatus;
};

export type EmbeddingWorkerStopResponse = {
  message: string;
  status: EmbeddingWorkerStatus;
};

// ============================================================================
// Activity Timeline Types
// ============================================================================

export type ActivityType =
  | 'requirement'
  | 'document'
  | 'section'
  | 'block'
  | 'diagram'
  | 'connector'
  | 'port'
  | 'package'
  | 'candidate'
  | 'diagram-candidate'
  | 'imagine'
  | 'baseline'
  | 'link';

export type ActionType =
  | 'created'
  | 'updated'
  | 'archived'
  | 'restored'
  | 'deleted'
  | 'accepted'
  | 'rejected'
  | 'generated';

export interface ActivityEvent {
  id: string;
  timestamp: string;
  activityType: ActivityType;
  actionType: ActionType;
  entityId: string;
  entityName: string;
  entityRef?: string;
  userId: string;
  userName?: string;
  description: string;
  metadata: Record<string, any>;
  tenantSlug: string;
  projectSlug: string;
}

export interface ActivityFilters {
  tenantSlug: string;
  projectSlug: string;
  activityTypes?: ActivityType[];
  actionTypes?: ActionType[];
  userIds?: string[];
  startDate?: string;
  endDate?: string;
  searchQuery?: string;
  limit?: number;
  offset?: number;
}

export interface ActivityResponse {
  events: ActivityEvent[];
  total: number;
  hasMore: boolean;
  nextOffset?: number;
}

export interface ActivityStats {
  totalEvents: number;
  eventsByType: Record<ActivityType, number>;
  eventsByAction: Record<ActionType, number>;
  recentUsers: Array<{ userId: string; count: number }>;
  activeUsers: number;
}
