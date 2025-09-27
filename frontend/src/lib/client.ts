import { useCallback, useMemo } from "react";
import { config } from "../config";
import { useAuth } from "../contexts/AuthContext";
import type {
  DraftResponse,
  DraftRequest,
  QaResponse,
  ApplyFixResponse,
  RequirementRecord,
  RequirementPattern,
  VerificationMethod,
  RequirementDetail,
  CreateRequirementRequest,
  RequirementCandidateListResponse,
  RequirementCandidateGroupedResponse,
  AirGenChatRequest,
  AirGenChatResponse,
  RequirementCandidateActionResponse,
  BaselineResponse,
  BaselineListResponse,
  TenantsResponse,
  ProjectsResponse,
  DocumentsResponse,
  DocumentResponse,
  FoldersResponse,
  FolderResponse,
  DocumentSectionsResponse,
  DocumentSectionResponse,
  CreateSectionRequest,
  LinkSuggestRequest,
  LinkSuggestResponse,
  ArchitectureBlocksResponse,
  ArchitectureBlockResponse,
  ArchitectureBlockLibraryResponse,
  ArchitectureConnectorsResponse,
  ArchitectureConnectorResponse,
  ArchitectureDiagramsResponse,
  ArchitectureDiagramResponse,
  CreateArchitectureBlockRequest,
  UpdateArchitectureBlockRequest,
  CreateArchitectureConnectorRequest,
  CreateTraceLinkRequest,
  TraceLink,
  DevUserListResponse,
  DevUserResponse
} from "../types";

type RequestOptions = RequestInit & { skipAuth?: boolean };

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const text = await response.text();
    let message = text;
    try {
      const json = JSON.parse(text);
      message = json.error ?? json.message ?? text;
    } catch (error) {
      // keep original text
    }
    throw new Error(message || `Request failed with status ${response.status}`);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

export function useApiClient() {
  const { token } = useAuth();

  const request = useCallback(
    async <T>(path: string, options: RequestOptions = {}): Promise<T> => {
      const headers = new Headers(options.headers);
      if (!headers.has("Content-Type") && options.body) {
        headers.set("Content-Type", "application/json");
      }
      if (!options.skipAuth && token) {
        headers.set("Authorization", `Bearer ${token}`);
      }

      const response = await fetch(`${config.apiBaseUrl}${path}`, {
        ...options,
        headers
      });

      return handleResponse<T>(response);
    },
    [token]
  );

  return useMemo(
    () => ({
      health: () => request<{ ok: boolean; env: string; workspace: string; time: string }>(`/health`),
      listTenants: () => request<TenantsResponse>(`/tenants`),
      listProjects: (tenant: string) => request<ProjectsResponse>(`/tenants/${tenant}/projects`),
      
      // Admin-only management functions
      createTenant: (data: { slug: string; name?: string }) => 
        request<{ tenant: any }>(`/tenants`, { method: "POST", body: JSON.stringify(data) }),
      deleteTenant: (tenant: string) => 
        request<{ success: boolean }>(`/tenants/${tenant}`, { method: "DELETE" }),
      createProject: (tenant: string, data: { slug: string; key?: string }) => 
        request<{ project: any }>(`/tenants/${tenant}/projects`, { method: "POST", body: JSON.stringify(data) }),
      deleteProject: (tenant: string, project: string) => 
        request<{ success: boolean }>(`/tenants/${tenant}/projects/${project}`, { method: "DELETE" }),
      draft: (body: DraftRequest) => request<DraftResponse>(`/draft`, { method: "POST", body: JSON.stringify(body) }),
      airgenChat: (body: AirGenChatRequest) =>
        request<AirGenChatResponse>(`/airgen/chat`, { method: "POST", body: JSON.stringify(body) }),
      qa: (text: string) => request<QaResponse>(`/qa`, { method: "POST", body: JSON.stringify({ text }) }),
      applyFix: (text: string) => request<ApplyFixResponse>(`/apply-fix`, { method: "POST", body: JSON.stringify({ text }) }),
      listRequirementCandidates: (tenant: string, project: string) =>
        request<RequirementCandidateListResponse>(`/airgen/candidates/${tenant}/${project}`),
      listRequirementCandidatesGrouped: (tenant: string, project: string) =>
        request<RequirementCandidateGroupedResponse>(`/airgen/candidates/${tenant}/${project}/grouped`),
      acceptRequirementCandidate: (
        id: string,
        body: {
          tenant: string;
          projectKey: string;
          pattern?: RequirementPattern;
          verification?: VerificationMethod;
          documentSlug?: string;
          sectionId?: string;
          tags?: string[];
        }
      ) =>
        request<RequirementCandidateActionResponse>(`/airgen/candidates/${id}/accept`, {
          method: "POST",
          body: JSON.stringify(body)
        }),
      rejectRequirementCandidate: (id: string, body: { tenant: string; projectKey: string }) =>
        request<RequirementCandidateActionResponse>(`/airgen/candidates/${id}/reject`, {
          method: "POST",
          body: JSON.stringify(body)
        }),
      returnRequirementCandidate: (id: string, body: { tenant: string; projectKey: string }) =>
        request<RequirementCandidateActionResponse>(`/airgen/candidates/${id}/return`, {
          method: "POST",
          body: JSON.stringify(body)
        }),
      listRequirements: (tenant: string, project: string) =>
        request<{ items: RequirementRecord[] }>(`/requirements/${tenant}/${project}`),
      getRequirement: (tenant: string, project: string, ref: string) =>
        request<RequirementDetail>(`/requirements/${tenant}/${project}/${ref}`),
      createRequirement: (body: CreateRequirementRequest) =>
        request<{ requirement: RequirementRecord }>(`/requirements`, {
          method: "POST",
          body: JSON.stringify(body)
        }),
      updateRequirement: (tenant: string, project: string, requirementId: string, updates: { text?: string; pattern?: string; verification?: string }) =>
        request<{ requirement: RequirementRecord }>(`/requirements/${tenant}/${project}/${requirementId}`, { method: "PATCH", body: JSON.stringify(updates) }),
      deleteRequirement: (tenant: string, project: string, requirementId: string) =>
        request<{ requirement: RequirementRecord }>(`/requirements/${tenant}/${project}/${requirementId}`, { method: "DELETE" }),
      createBaseline: (body: { tenant: string; projectKey: string; label?: string; author?: string }) =>
        request<BaselineResponse>(`/baseline`, { method: "POST", body: JSON.stringify(body) }),
      listBaselines: (tenant: string, project: string) =>
        request<BaselineListResponse>(`/baselines/${tenant}/${project}`),
      listDocuments: (tenant: string, project: string) =>
        request<DocumentsResponse>(`/documents/${tenant}/${project}`),
      getDocument: (tenant: string, project: string, documentSlug: string) =>
        request<DocumentResponse>(`/documents/${tenant}/${project}/${documentSlug}`),
      createDocument: (body: { tenant: string; projectKey: string; name: string; description?: string; shortCode?: string; parentFolder?: string }) =>
        request<DocumentResponse>(`/documents`, { method: "POST", body: JSON.stringify(body) }),
      updateDocument: (tenant: string, project: string, documentSlug: string, updates: { name?: string; description?: string; shortCode?: string }) =>
        request<DocumentResponse>(`/documents/${tenant}/${project}/${documentSlug}`, { method: "PATCH", body: JSON.stringify(updates) }),
      updateDocumentFolder: (tenant: string, project: string, documentSlug: string, parentFolder?: string | null) =>
        request<DocumentResponse>(`/documents/${tenant}/${project}/${documentSlug}`, { method: "PATCH", body: JSON.stringify({ parentFolder }) }),
      deleteDocument: (tenant: string, project: string, documentSlug: string) =>
        request<DocumentResponse>(`/documents/${tenant}/${project}/${documentSlug}`, { method: "DELETE" }),
      listFolders: (tenant: string, project: string) =>
        request<FoldersResponse>(`/folders/${tenant}/${project}`),
      createFolder: (body: { tenant: string; projectKey: string; name: string; description?: string; parentFolder?: string }) =>
        request<FolderResponse>(`/folders`, { method: "POST", body: JSON.stringify(body) }),
      updateFolder: (tenant: string, project: string, folderSlug: string, updates: { name?: string; description?: string }) =>
        request<FolderResponse>(`/folders/${tenant}/${project}/${folderSlug}`, { method: "PATCH", body: JSON.stringify(updates) }),
      deleteFolder: (tenant: string, project: string, folderSlug: string) =>
        request<FolderResponse>(`/folders/${tenant}/${project}/${folderSlug}`, { method: "DELETE" }),
      listDocumentSections: (tenant: string, project: string, documentSlug: string) =>
        request<DocumentSectionsResponse>(`/sections/${tenant}/${project}/${documentSlug}`),
      createDocumentSection: (body: CreateSectionRequest) =>
        request<DocumentSectionResponse>(`/sections`, { method: "POST", body: JSON.stringify(body) }),
      updateDocumentSection: (sectionId: string, body: { name?: string; description?: string; order?: number; shortCode?: string }) =>
        request<DocumentSectionResponse>(`/sections/${sectionId}`, { method: "PATCH", body: JSON.stringify(body) }),
      deleteDocumentSection: (sectionId: string) =>
        request<{ success: boolean }>(`/sections/${sectionId}`, { method: "DELETE" }),
      listSectionRequirements: (sectionId: string) =>
        request<{ requirements: RequirementRecord[] }>(`/sections/${sectionId}/requirements`),
      suggestLinks: (body: LinkSuggestRequest) =>
        request<LinkSuggestResponse>(`/link/suggest`, { method: "POST", body: JSON.stringify(body) }),
      // Architecture API methods
      listArchitectureDiagrams: (tenant: string, project: string) =>
        request<ArchitectureDiagramsResponse>(`/architecture/diagrams/${tenant}/${project}`),
      listArchitectureBlockLibrary: (tenant: string, project: string) =>
        request<ArchitectureBlockLibraryResponse>(`/architecture/block-library/${tenant}/${project}`),
      createArchitectureDiagram: (body: { tenant: string; projectKey: string; name: string; description?: string; view?: "block" | "internal" | "deployment" }) =>
        request<ArchitectureDiagramResponse>(`/architecture/diagrams`, { method: "POST", body: JSON.stringify(body) }),
      updateArchitectureDiagram: (tenant: string, project: string, diagramId: string, body: { name?: string; description?: string; view?: "block" | "internal" | "deployment" }) =>
        request<ArchitectureDiagramResponse>(`/architecture/diagrams/${tenant}/${project}/${diagramId}`, { method: "PATCH", body: JSON.stringify(body) }),
      deleteArchitectureDiagram: (tenant: string, project: string, diagramId: string) =>
        request<{ success: boolean }>(`/architecture/diagrams/${tenant}/${project}/${diagramId}`, { method: "DELETE" }),
      listArchitectureBlocks: (tenant: string, project: string, diagramId: string) =>
        request<ArchitectureBlocksResponse>(`/architecture/blocks/${tenant}/${project}/${diagramId}`),
      createArchitectureBlock: (body: CreateArchitectureBlockRequest) =>
        request<ArchitectureBlockResponse>(`/architecture/blocks`, { method: "POST", body: JSON.stringify(body) }),
      updateArchitectureBlock: (tenant: string, project: string, blockId: string, body: UpdateArchitectureBlockRequest) =>
        request<ArchitectureBlockResponse>(`/architecture/blocks/${tenant}/${project}/${blockId}`, { method: "PATCH", body: JSON.stringify(body) }),
      deleteArchitectureBlock: (tenant: string, project: string, diagramId: string, blockId: string) =>
        request<{ success: boolean }>(`/architecture/blocks/${tenant}/${project}/${blockId}?diagramId=${diagramId}`, { method: "DELETE" }),
      listArchitectureConnectors: (tenant: string, project: string, diagramId: string) =>
        request<ArchitectureConnectorsResponse>(`/architecture/connectors/${tenant}/${project}/${diagramId}`),
      createArchitectureConnector: (body: CreateArchitectureConnectorRequest) =>
        request<ArchitectureConnectorResponse>(`/architecture/connectors`, { method: "POST", body: JSON.stringify(body) }),
      updateArchitectureConnector: (tenant: string, project: string, connectorId: string, body: { diagramId: string } & Partial<Pick<CreateArchitectureConnectorRequest, "kind" | "label" | "sourcePortId" | "targetPortId" | "lineStyle" | "markerStart" | "markerEnd" | "linePattern" | "color" | "strokeWidth">>) =>
        request<ArchitectureConnectorResponse>(`/architecture/connectors/${tenant}/${project}/${connectorId}`, { method: "PATCH", body: JSON.stringify(body) }),
      deleteArchitectureConnector: (tenant: string, project: string, diagramId: string, connectorId: string) =>
        request<{ success: boolean }>(`/architecture/connectors/${tenant}/${project}/${connectorId}?diagramId=${diagramId}`, { method: "DELETE" }),
      // Trace Links API methods
      createTraceLink: (body: CreateTraceLinkRequest & { tenant: string; projectKey: string }) =>
        request<{ traceLink: TraceLink }>(`/trace-links`, { method: "POST", body: JSON.stringify(body) }),
      listTraceLinks: (tenant: string, project: string) =>
        request<{ traceLinks: TraceLink[] }>(`/trace-links/${tenant}/${project}`),
      listTraceLinksByRequirement: (tenant: string, project: string, requirementId: string) =>
        request<{ traceLinks: TraceLink[] }>(`/trace-links/${tenant}/${project}/${requirementId}`),
      deleteTraceLink: (tenant: string, project: string, linkId: string) =>
        request<{ success: boolean }>(`/trace-links/${tenant}/${project}/${linkId}`, { method: "DELETE" }),
      // Dev admin utilities (development only)
      listDevUsers: () => request<DevUserListResponse>(`/dev/admin/users`),
      createDevUser: (body: { email: string; name?: string; password?: string; roles?: string[]; tenantSlugs?: string[] }) =>
        request<DevUserResponse>(`/dev/admin/users`, { method: "POST", body: JSON.stringify(body) }),
      updateDevUser: (
        id: string,
        body: { email?: string; name?: string | null; password?: string; roles?: string[]; tenantSlugs?: string[] }
      ) => request<DevUserResponse>(`/dev/admin/users/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
      deleteDevUser: (id: string) =>
        request<{ success: boolean }>(`/dev/admin/users/${id}`, { method: "DELETE" })
    }),
    [request]
  );
}
