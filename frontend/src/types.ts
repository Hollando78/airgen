export type RequirementPattern = "ubiquitous" | "event" | "state" | "unwanted" | "optional";
export type VerificationMethod = "Test" | "Analysis" | "Inspection" | "Demonstration";

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
  pattern?: RequirementPattern;
  verification?: VerificationMethod;
  qaScore?: number;
  qaVerdict?: string;
  suggestions?: string[];
  tags?: string[];
  path: string;
  documentSlug?: string;
  createdAt: string;
  updatedAt: string;
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
};

export type TenantsResponse = {
  tenants: TenantRecord[];
};

export type ProjectRecord = {
  slug: string;
  tenantSlug: string;
  key: string | null;
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
  createdAt: string;
  updatedAt: string;
};

export type CreateLinksetRequest = {
  sourceDocumentSlug: string;
  targetDocumentSlug: string;
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
export type PortDirection = "in" | "out" | "inout";
export type ConnectorLineStyle = "straight" | "smoothstep" | "step" | "bezier";
export type ConnectorMarkerType = "arrow" | "arrowclosed" | "diamond" | "circle" | "none";
export type ConnectorLinePattern = "solid" | "dashed" | "dotted";

export type BlockPortRecord = {
  id: string;
  name: string;
  direction: PortDirection;
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
  createdAt: string;
  updatedAt: string;
  // Styling properties
  lineStyle?: ConnectorLineStyle;
  markerStart?: ConnectorMarkerType;
  markerEnd?: ConnectorMarkerType;
  linePattern?: ConnectorLinePattern;
  color?: string;
  strokeWidth?: number;
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
  // Styling properties
  lineStyle?: ConnectorLineStyle;
  markerStart?: ConnectorMarkerType;
  markerEnd?: ConnectorMarkerType;
  linePattern?: ConnectorLinePattern;
  color?: string;
  strokeWidth?: number;
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

export type DevUser = {
  id: string;
  email: string;
  name?: string;
  roles: string[];
  tenantSlugs: string[];
  createdAt: string;
  updatedAt: string;
};

export type DevUserListResponse = {
  users: DevUser[];
};

export type DevUserResponse = {
  user: DevUser;
};
