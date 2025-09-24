export type RequirementPattern = "ubiquitous" | "event" | "state" | "unwanted" | "optional";
export type VerificationMethod = "Test" | "Analysis" | "Inspection" | "Demonstration";

export type DraftItem = {
  text: string;
  title: string;
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
  title: string;
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

export type AirGenChatRequest = {
  tenant: string;
  projectKey: string;
  user_input: string;
  glossary?: string;
  constraints?: string;
  n?: number;
};

export type AirGenChatResponse = {
  prompt: string;
  items: RequirementCandidate[];
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

// Architecture Types
export type BlockKind = "system" | "subsystem" | "component" | "actor" | "external" | "interface";
export type ConnectorKind = "association" | "flow" | "dependency" | "composition";
export type PortDirection = "in" | "out" | "inout";

export type BlockPortRecord = {
  id: string;
  name: string;
  direction: PortDirection;
};

export type ArchitectureBlockRecord = {
  id: string;
  name: string;
  kind: BlockKind;
  stereotype?: string | null;
  description?: string | null;
  tenant: string;
  projectKey: string;
  positionX: number;
  positionY: number;
  sizeWidth: number;
  sizeHeight: number;
  ports: BlockPortRecord[];
  documentIds: string[];
  createdAt: string;
  updatedAt: string;
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
  createdAt: string;
  updatedAt: string;
};

export type CreateArchitectureBlockRequest = {
  tenant: string;
  projectKey: string;
  name: string;
  kind: BlockKind;
  stereotype?: string;
  description?: string;
  positionX: number;
  positionY: number;
  sizeWidth?: number;
  sizeHeight?: number;
  ports?: BlockPortRecord[];
  documentIds?: string[];
};

export type UpdateArchitectureBlockRequest = {
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
};

export type ArchitectureBlocksResponse = {
  blocks: ArchitectureBlockRecord[];
};

export type ArchitectureBlockResponse = {
  block: ArchitectureBlockRecord;
};

export type ArchitectureConnectorsResponse = {
  connectors: ArchitectureConnectorRecord[];
};

export type ArchitectureConnectorResponse = {
  connector: ArchitectureConnectorRecord;
};
