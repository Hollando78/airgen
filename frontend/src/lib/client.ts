import { useCallback, useMemo } from "react";
import { config } from "../config";
import { useAuth } from "../contexts/AuthContext";
import type { UserPermissions } from "./rbac";
import type {
  DraftResponse,
  DraftRequest,
  QaResponse,
  QAScorerStatus,
  ApplyFixResponse,
  RequirementRecord,
  RequirementPattern,
  VerificationMethod,
  RequirementDetail,
  CreateRequirementRequest,
  RequirementCandidateListResponse,
  RequirementCandidateGroupedResponse,
  RequirementCandidate,
  AirGenChatRequest,
  AirGenChatResponse,
  RequirementCandidateActionResponse,
  BaselineResponse,
  BaselineListResponse,
  TenantsResponse,
  TenantRecord,
  TenantInvitationsResponse,
  CreateTenantInvitationResponse,
  AcceptInvitationResponse,
  ProjectsResponse,
  DocumentsResponse,
  DocumentResponse,
  FoldersResponse,
  FolderResponse,
  DocumentSectionsResponse,
  DocumentSectionResponse,
  DocumentSectionsWithRelationsResponse,
  CreateSectionRequest,
  InfoRecord,
  SurrogateReferenceRecord,
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
  DocumentLinkset,
  CreateLinksetRequest,
  AddLinkToLinksetRequest,
  DevUserListResponse,
  DevUserResponse,
  DiagramCandidate,
  RequirementHistoryResponse,
  RequirementDiffResponse,
  RestoreVersionResponse,
  BackupListResponse,
  RemoteBackupListResponse,
  BackupOperationResponse,
  BackupStatusResponse,
  ProjectBackupListResponse,
  ProjectBackupExportResponse,
  NLQueryRequest,
  NLQueryResult,
  ExampleQuery,
  SimilarRequirementsResponse,
  SemanticSearchRequest,
  SemanticSearchResponse,
  DuplicatesResponse,
  EmbeddingWorkerStatus,
  EmbeddingWorkerStartResponse,
  EmbeddingWorkerStopResponse,
  ActivityEvent,
  ActivityFilters,
  ActivityResponse,
  ActivityStats
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

async function handleBlobResponse(response: Response): Promise<Blob> {
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
  return await response.blob();
}

export function useApiClient() {
  const { token } = useAuth();

  const request = useCallback(
    async <T>(path: string, options: RequestOptions = {}): Promise<T> => {
      const headers = new Headers(options.headers);
      const isFormData = typeof FormData !== "undefined" && options.body instanceof FormData;
      if (!headers.has("Content-Type") && options.body && !isFormData) {
        headers.set("Content-Type", "application/json");
      }
      if (!options.skipAuth && token) {
        headers.set("Authorization", `Bearer ${token}`);
      }

      const response = await fetch(`${config.apiBaseUrl}${path}`, {
        ...options,
        headers,
        credentials: "include", // Enable cookies for refresh tokens
        cache: "no-store" // Prevent browser caching of API responses
      });

      return handleResponse<T>(response);
    },
    [token]
  );

  const requestBlob = useCallback(
    async (path: string, options: RequestOptions = {}): Promise<Blob> => {
      const headers = new Headers(options.headers);
      if (!options.skipAuth && token) {
        headers.set("Authorization", `Bearer ${token}`);
      }

      const response = await fetch(`${config.apiBaseUrl}${path}`, {
        ...options,
        headers,
        credentials: "include",
        cache: "no-store"
      });

      return handleBlobResponse(response);
    },
    [token]
  );

  return useMemo(
    () => ({
      health: () => request<{ ok: boolean; env: string; workspace: string; time: string }>(`/health`),
      listTenants: () => request<TenantsResponse>(`/tenants`),
      listProjects: (tenant: string) => request<ProjectsResponse>(`/tenants/${tenant}/projects`),
      listTenantInvitations: (tenant: string) =>
        request<TenantInvitationsResponse>(`/tenants/${tenant}/invitations`),
      inviteToTenant: (tenant: string, data: { email: string }) =>
        request<CreateTenantInvitationResponse>(`/tenants/${tenant}/invitations`, {
          method: "POST",
          body: JSON.stringify(data)
        }),
      acceptTenantInvitation: (token: string) =>
        request<AcceptInvitationResponse>(`/auth/invitations/accept`, {
          method: "POST",
          body: JSON.stringify({ token })
        }),
      
      // Tenant management functions
      createTenant: (data: { slug: string; name?: string }) => 
        request<{ tenant: TenantRecord }>(`/tenants`, { method: "POST", body: JSON.stringify(data) }),
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
      // Diagram candidate methods
      listDiagramCandidates: (tenant: string, project: string) =>
        request<{ items: DiagramCandidate[] }>(`/airgen/diagram-candidates/${tenant}/${project}`),
      acceptDiagramCandidate: (
        id: string,
        body: { tenant: string; projectKey: string; diagramId?: string; diagramName?: string; diagramDescription?: string }
      ) =>
        request<{ candidate: DiagramCandidate; diagramId?: string }>(`/airgen/diagram-candidates/${id}/accept`, {
          method: "POST",
          body: JSON.stringify(body)
        }),
      rejectDiagramCandidate: (id: string, body: { tenant: string; projectKey: string }) =>
        request<{ candidate: DiagramCandidate }>(`/airgen/diagram-candidates/${id}/reject`, {
          method: "POST",
          body: JSON.stringify(body)
        }),
      returnDiagramCandidate: (id: string, body: { tenant: string; projectKey: string }) =>
        request<{ candidate: DiagramCandidate }>(`/airgen/diagram-candidates/${id}/return`, {
          method: "POST",
          body: JSON.stringify(body)
        }),
      listRequirements: (tenant: string, project: string) =>
        request<{ data: RequirementRecord[]; meta: { currentPage: number; pageSize: number; totalItems: number; totalPages: number; hasNextPage: boolean; hasPrevPage: boolean } }>(`/requirements/${tenant}/${project}`),
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

      // Version history API methods
      getRequirementHistory: (tenant: string, project: string, requirementId: string) =>
        request<RequirementHistoryResponse>(`/requirements/${tenant}/${project}/${requirementId}/history`),
      getRequirementDiff: (tenant: string, project: string, requirementId: string, fromVersion: number, toVersion: number) => {
        const params = new URLSearchParams({ from: fromVersion.toString(), to: toVersion.toString() });
        return request<RequirementDiffResponse>(`/requirements/${tenant}/${project}/${requirementId}/diff?${params}`);
      },
      restoreRequirementVersion: (tenant: string, project: string, requirementId: string, versionNumber: number) =>
        request<RestoreVersionResponse>(`/requirements/${tenant}/${project}/${requirementId}/restore/${versionNumber}`, { method: "POST" }),

      createInfo: (body: { tenant: string; projectKey: string; documentSlug: string; text: string; title?: string; sectionId?: string }) =>
        request<{ info: InfoRecord }>(`/infos`, {
          method: "POST",
          body: JSON.stringify(body)
        }),
      createSurrogate: (body: { tenant: string; projectKey: string; documentSlug: string; slug: string; caption?: string; sectionId?: string }) =>
        request<{ surrogate: SurrogateReferenceRecord }>(`/surrogates`, {
          method: "POST",
          body: JSON.stringify(body)
        }),
      archiveRequirements: (tenant: string, project: string, requirementIds: string[]) =>
        request<{ requirements: RequirementRecord[]; count: number }>(`/requirements/${tenant}/${project}/archive`, { method: "POST", body: JSON.stringify({ requirementIds }) }),
      unarchiveRequirements: (tenant: string, project: string, requirementIds: string[]) =>
        request<{ requirements: RequirementRecord[]; count: number }>(`/requirements/${tenant}/${project}/unarchive`, { method: "POST", body: JSON.stringify({ requirementIds }) }),
      archiveCandidates: (candidateIds: string[]) =>
        request<{ archived: number }>(`/airgen/candidates/archive`, { method: "POST", body: JSON.stringify({ candidateIds }) }),
      createBaseline: (body: { tenant: string; projectKey: string; label?: string; author?: string }) =>
        request<BaselineResponse>(`/baseline`, { method: "POST", body: JSON.stringify(body) }),
      listBaselines: (tenant: string, project: string) =>
        request<BaselineListResponse>(`/baselines/${tenant}/${project}`),
      getBaselineDetails: (tenant: string, project: string, baselineRef: string) =>
        request<any>(`/baselines/${tenant}/${project}/${baselineRef}`),
      compareBaselines: (tenant: string, project: string, fromRef: string, toRef: string) => {
        const params = new URLSearchParams({ from: fromRef, to: toRef });
        return request<any>(`/baselines/${tenant}/${project}/compare?${params}`);
      },
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
      uploadSurrogateDocument: (params: {
        tenant: string;
        projectKey: string;
        file: File;
        name?: string;
        description?: string;
        parentFolder?: string;
      }) => {
        const formData = new FormData();
        formData.append("tenant", params.tenant);
        formData.append("projectKey", params.projectKey);
        if (params.name) {
          formData.append("name", params.name);
        }
        if (params.description) {
          formData.append("description", params.description);
        }
        if (params.parentFolder) {
          formData.append("parentFolder", params.parentFolder);
        }
        formData.append("file", params.file);

        return request<DocumentResponse>(`/documents/upload`, {
          method: "POST",
          body: formData
        });
      },
      downloadDocumentFile: async (downloadPath: string, fallbackName?: string) => {
        const headers = new Headers();
        if (token) {
          headers.set("Authorization", `Bearer ${token}`);
        }

        const response = await fetch(`${config.apiBaseUrl}${downloadPath}`, {
          headers
        });

        if (!response.ok) {
          const text = await response.text();
          let message = text;
          try {
            const json = JSON.parse(text);
            message = json.error ?? json.message ?? text;
          } catch (error) {
            // keep raw text message
          }
          throw new Error(message || `Failed to download file (${response.status})`);
        }

        const blob = await response.blob();
        const disposition =
          response.headers.get("Content-Disposition") ?? response.headers.get("content-disposition");
        let fileName = fallbackName ?? "download";

        if (disposition) {
          const filenameStarMatch = disposition.match(/filename\*=([^;]+)/i);
          if (filenameStarMatch) {
            const raw = filenameStarMatch[1].trim().replace(/^"|"$/g, "");
            const parts = raw.split("''");
            if (parts.length === 2) {
              fileName = decodeURIComponent(parts[1]);
            } else {
              try {
                fileName = decodeURIComponent(raw);
              } catch {
                fileName = raw;
              }
            }
          } else {
            const filenameMatch = disposition.match(/filename="?([^";]+)"?/i);
            if (filenameMatch) {
              fileName = filenameMatch[1];
            }
          }

          fileName = fileName.replace(/"/g, "").trim();
        }

        if (!fileName) {
          fileName = fallbackName ?? "download";
        }

        return { blob, fileName };
      },
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
      // Optimized endpoint that fetches sections with all related data in a single query
      // Reduces N+1 queries: 30 API calls → 1 API call for 10 sections (~97% reduction)
      listDocumentSectionsWithRelations: (tenant: string, project: string, documentSlug: string) =>
        request<DocumentSectionsWithRelationsResponse>(`/sections/${tenant}/${project}/${documentSlug}/full`),
      createDocumentSection: (body: CreateSectionRequest) =>
        request<DocumentSectionResponse>(`/sections`, { method: "POST", body: JSON.stringify(body) }),
      updateDocumentSection: (sectionId: string, body: { name?: string; description?: string; order?: number; shortCode?: string }) =>
        request<DocumentSectionResponse>(`/sections/${sectionId}`, { method: "PATCH", body: JSON.stringify(body) }),
      deleteDocumentSection: (sectionId: string) =>
        request<{ success: boolean }>(`/sections/${sectionId}`, { method: "DELETE" }),
      listSectionRequirements: (sectionId: string, tenant: string) =>
        request<{ requirements: RequirementRecord[] }>(`/sections/${sectionId}/requirements?tenant=${encodeURIComponent(tenant)}`),
      listSectionInfos: (sectionId: string, tenant: string) =>
        request<{ infos: InfoRecord[] }>(`/sections/${sectionId}/infos?tenant=${encodeURIComponent(tenant)}`),
      listSectionSurrogates: (sectionId: string, tenant: string) =>
        request<{ surrogates: SurrogateReferenceRecord[] }>(`/sections/${sectionId}/surrogates?tenant=${encodeURIComponent(tenant)}`),
      reorderRequirements: (sectionId: string, requirementIds: string[]) =>
        request<{ success: boolean }>(`/sections/${sectionId}/reorder-requirements`, { method: "POST", body: JSON.stringify({ requirementIds }) }),
      reorderInfos: (sectionId: string, infoIds: string[]) =>
        request<{ success: boolean }>(`/sections/${sectionId}/reorder-infos`, { method: "POST", body: JSON.stringify({ infoIds }) }),
      reorderSurrogates: (sectionId: string, surrogateIds: string[]) =>
        request<{ success: boolean }>(`/sections/${sectionId}/reorder-surrogates`, { method: "POST", body: JSON.stringify({ surrogateIds }) }),
      reorderWithOrder: (
        sectionId: string,
        payload: {
          tenant: string;
          requirements?: Array<{ id: string; order: number }>;
          infos?: Array<{ id: string; order: number }>;
          surrogates?: Array<{ id: string; order: number }>;
        }
      ) =>
        request<{ success: boolean }>(`/sections/${sectionId}/reorder-with-order`, { method: "POST", body: JSON.stringify(payload) }),
      suggestLinks: (body: LinkSuggestRequest) =>
        request<LinkSuggestResponse>(`/link/suggest`, { method: "POST", body: JSON.stringify(body) }),
      // Architecture API methods
      listArchitectureDiagrams: (tenant: string, project: string) =>
        request<ArchitectureDiagramsResponse>(`/architecture/diagrams/${tenant}/${project}`),
      listArchitectureBlockLibrary: (tenant: string, project: string) =>
        request<ArchitectureBlockLibraryResponse>(`/architecture/block-library/${tenant}/${project}`),
      createArchitectureDiagram: (body: { tenant: string; projectKey: string; name: string; description?: string; view?: "block" | "internal" | "deployment" | "requirements_schema" }) =>
        request<ArchitectureDiagramResponse>(`/architecture/diagrams`, { method: "POST", body: JSON.stringify(body) }),
      updateArchitectureDiagram: (tenant: string, project: string, diagramId: string, body: { name?: string; description?: string; view?: "block" | "internal" | "deployment" | "requirements_schema" }) =>
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
      updateArchitectureConnector: (tenant: string, project: string, connectorId: string, body: { diagramId: string } & Partial<Pick<CreateArchitectureConnectorRequest, "kind" | "label" | "sourcePortId" | "targetPortId" | "documentIds" | "lineStyle" | "markerStart" | "markerEnd" | "linePattern" | "color" | "strokeWidth" | "labelOffsetX" | "labelOffsetY" | "controlPoints">>) =>
        request<ArchitectureConnectorResponse>(`/architecture/connectors/${tenant}/${project}/${connectorId}`, { method: "PATCH", body: JSON.stringify(body) }),
      deleteArchitectureConnector: (tenant: string, project: string, diagramId: string, connectorId: string) =>
        request<{ success: boolean }>(`/architecture/connectors/${tenant}/${project}/${connectorId}?diagramId=${diagramId}`, { method: "DELETE" }),

      // Package API methods
      listArchitecturePackages: (tenant: string, project: string) =>
        request<{ packages: Array<{ id: string; name: string; description?: string | null; tenant: string; projectKey: string; parentId?: string | null; order: number; createdAt: string; updatedAt: string }> }>(`/architecture/packages/${tenant}/${project}`),
      createArchitecturePackage: (body: { tenant: string; projectKey: string; name: string; description?: string; parentId?: string | null; order?: number }) =>
        request<{ package: { id: string; name: string; description?: string | null; tenant: string; projectKey: string; parentId?: string | null; order: number; createdAt: string; updatedAt: string } }>(`/architecture/packages`, { method: "POST", body: JSON.stringify(body) }),
      updateArchitecturePackage: (tenant: string, project: string, packageId: string, body: { name?: string; description?: string; order?: number }) =>
        request<{ package: { id: string; name: string; description?: string | null; tenant: string; projectKey: string; parentId?: string | null; order: number; createdAt: string; updatedAt: string } }>(`/architecture/packages/${tenant}/${project}/${packageId}`, { method: "PATCH", body: JSON.stringify(body) }),
      deleteArchitecturePackage: (tenant: string, project: string, packageId: string, cascade?: boolean) =>
        request<{ success: boolean }>(`/architecture/packages/${tenant}/${project}/${packageId}${cascade ? "?cascade=true" : ""}`, { method: "DELETE" }),
      moveToArchitecturePackage: (body: { tenant: string; projectKey: string; itemId: string; itemType: "package" | "block" | "diagram"; targetPackageId: string | null; order?: number }) =>
        request<{ success: boolean }>(`/architecture/packages/move`, { method: "POST", body: JSON.stringify(body) }),
      reorderInArchitecturePackage: (body: { tenant: string; projectKey: string; packageId: string | null; itemIds: string[] }) =>
        request<{ success: boolean }>(`/architecture/packages/reorder`, { method: "POST", body: JSON.stringify(body) }),

      // Trace Links API methods
      createTraceLink: (tenant: string, project: string, body: CreateTraceLinkRequest) =>
        request<{ traceLink: TraceLink }>(`/trace-links`, { method: "POST", body: JSON.stringify({ ...body, tenant, projectKey: project }) }),
      listTraceLinks: (tenant: string, project: string) =>
        request<{ traceLinks: TraceLink[] }>(`/trace-links/${tenant}/${project}`),
      listTraceLinksByRequirement: (tenant: string, project: string, requirementId: string) =>
        request<{ traceLinks: TraceLink[] }>(`/trace-links/${tenant}/${project}/${requirementId}`),
      deleteTraceLink: (tenant: string, project: string, linkId: string) =>
        request<{ success: boolean }>(`/trace-links/${tenant}/${project}/${linkId}`, { method: "DELETE" }),
      
      // Linkset API methods
      listLinksets: (tenant: string, project: string) =>
        request<{ linksets: DocumentLinkset[] }>(`/linksets/${tenant}/${project}`),
      getLinkset: (tenant: string, project: string, sourceDoc: string, targetDoc: string) =>
        request<{ linkset: DocumentLinkset }>(`/linksets/${tenant}/${project}/${sourceDoc}/${targetDoc}`),
      createLinkset: (tenant: string, project: string, body: CreateLinksetRequest) =>
        request<{ linkset: DocumentLinkset }>(`/linksets/${tenant}/${project}`, { method: "POST", body: JSON.stringify(body) }),
      addLinkToLinkset: (tenant: string, project: string, linksetId: string, body: AddLinkToLinksetRequest) =>
        request<{ linkset: DocumentLinkset }>(`/linksets/${tenant}/${project}/${linksetId}/links`, { method: "POST", body: JSON.stringify(body) }),
      removeLinkFromLinkset: (tenant: string, project: string, linksetId: string, linkId: string) =>
        request<{ linkset: DocumentLinkset }>(`/linksets/${tenant}/${project}/${linksetId}/links/${linkId}`, { method: "DELETE" }),
      updateLinkset: (tenant: string, project: string, linksetId: string, defaultLinkType: string) =>
        request<{ linkset: DocumentLinkset }>(`/linksets/${tenant}/${project}/${linksetId}`, { method: "PATCH", body: JSON.stringify({ defaultLinkType }) }),
      deleteLinkset: (tenant: string, project: string, linksetId: string) =>
        request<{ success: boolean }>(`/linksets/${tenant}/${project}/${linksetId}`, { method: "DELETE" }),

      // Markdown Editor API methods
      getMarkdownContent: (tenant: string, project: string, documentSlug: string) =>
        request<{ content: string; document: any; draft?: { updatedAt: string } }>(`/markdown/${tenant}/${project}/${documentSlug}/content`),
      saveMarkdownContent: (tenant: string, project: string, documentSlug: string, content: string, validate?: boolean) =>
        request<{ success: boolean; document: any; validation?: any; parsed?: any; draft?: { updatedAt: string } }>(`/markdown/${tenant}/${project}/${documentSlug}/content`, {
          method: "PUT",
          body: JSON.stringify({ content, validate })
        }),
      validateMarkdown: (tenant: string, project: string, documentSlug: string, content: string) =>
        request<{ validation: any; parsed: any }>(`/markdown/${tenant}/${project}/${documentSlug}/validate`, {
          method: "POST",
          body: JSON.stringify({ content })
        }),

      // Natural Language Query API methods
      naturalLanguageQuery: (body: NLQueryRequest) =>
        request<NLQueryResult>(`/query/natural-language`, {
          method: "POST",
          body: JSON.stringify(body)
        }),
      getExampleQueries: () =>
        request<{ examples: ExampleQuery[] }>(`/query/examples`),

      // Admin user utilities
      listDevUsers: () => request<DevUserListResponse>(`/admin/users`),
      createDevUser: (body: { email: string; name?: string; password: string; permissions?: UserPermissions }) =>
        request<DevUserResponse>(`/admin/users`, { method: "POST", body: JSON.stringify(body) }),
      updateDevUser: (
        id: string,
        body: { email?: string; name?: string | null; password?: string; emailVerified?: boolean }
      ) => request<DevUserResponse>(`/admin/users/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
      updateDevUserPermissions: (id: string, permissions: UserPermissions) =>
        request<DevUserResponse>(`/admin/users/${id}/permissions`, {
          method: "PATCH",
          body: JSON.stringify({ permissions })
        }),
      deleteDevUser: (id: string) =>
        request<{ success: boolean }>(`/admin/users/${id}`, { method: "DELETE" }),

      // Admin requirements management (development only)
      listDeletedRequirements: (tenant: string, project: string, limit?: number, offset?: number) => {
        const params = new URLSearchParams({ tenant, project });
        if (limit !== undefined) params.append("limit", limit.toString());
        if (offset !== undefined) params.append("offset", offset.toString());
        return request<{ requirements: RequirementRecord[]; count: number }>(`/admin/requirements/deleted?${params}`);
      },
      listArchivedRequirements: (tenant: string, project: string, limit?: number, offset?: number) => {
        const params = new URLSearchParams({ tenant, project });
        if (limit !== undefined) params.append("limit", limit.toString());
        if (offset !== undefined) params.append("offset", offset.toString());
        return request<{ requirements: RequirementRecord[]; count: number }>(`/admin/requirements/archived?${params}`);
      },
      detectRequirementsDrift: (tenant: string, project: string) => {
        const params = new URLSearchParams({ tenant, project });
        return request<{ drifted: RequirementRecord[]; count: number; total: number }>(`/admin/requirements/drift?${params}`);
      },
      restoreRequirement: (tenant: string, project: string, requirementId: string) =>
        request<{ message: string; requirement: RequirementRecord }>(`/admin/requirements/${tenant}/${project}/${requirementId}/restore`, { method: "POST" }),
      syncRequirementToMarkdown: (tenant: string, project: string, requirementId: string) =>
        request<{ message: string; requirement: RequirementRecord }>(`/admin/requirements/${tenant}/${project}/${requirementId}/sync-to-markdown`, { method: "POST" }),
      bulkRestoreRequirements: (tenant: string, project: string, requirementIds: string[]) =>
        request<{ message: string; results: { restored: string[]; failed: { id: string; error: string }[] } }>(`/admin/requirements/bulk-restore`, {
          method: "POST",
          body: JSON.stringify({ tenant, project, requirementIds })
        }),
      listBadLinksRequirements: (tenant: string, project: string, limit?: number, offset?: number) => {
        const params = new URLSearchParams({ tenant, project });
        if (limit !== undefined) params.append("limit", limit.toString());
        if (offset !== undefined) params.append("offset", offset.toString());
        return request<{ requirements: (RequirementRecord & { brokenLinkCount?: number })[]; count: number }>(`/admin/requirements/bad-links?${params}`);
      },
      listCandidatesAdmin: (tenant: string, project: string, status?: string, limit?: number, offset?: number) => {
        const params = new URLSearchParams({ tenant, project });
        if (status) params.append("status", status);
        if (limit !== undefined) params.append("limit", limit.toString());
        if (offset !== undefined) params.append("offset", offset.toString());
        return request<{ candidates: RequirementCandidate[]; count: number }>(`/admin/requirements/candidates?${params}`);
      },
      bulkDeleteCandidates: (candidateIds: string[]) =>
        request<{ message: string; deleted: number }>(`/admin/requirements/candidates/bulk-delete`, {
          method: "POST",
          body: JSON.stringify({ candidateIds })
        }),
      bulkResetCandidates: (candidateIds: string[]) =>
        request<{ message: string; reset: number }>(`/admin/requirements/candidates/bulk-reset`, {
          method: "POST",
          body: JSON.stringify({ candidateIds })
        }),
      getGraphData: (tenant: string, project: string) => {
        const params = new URLSearchParams({ tenant, project });
        return request<{
          nodes: Array<{ id: string; label: string; type: string; properties: Record<string, any> }>;
          relationships: Array<{ id: string; source: string; target: string; type: string; properties: Record<string, any> }>;
        }>(`/graph/data?${params}`);
      },

      // QA Scorer Worker
      startQAScorer: (tenant: string, project: string) =>
        request<{ message: string; status: QAScorerStatus }>(`/workers/qa-scorer/start`, {
          method: "POST",
          body: JSON.stringify({ tenant, project })
        }),
      getQAScorerStatus: () =>
        request<QAScorerStatus>(`/workers/qa-scorer/status`),
      stopQAScorer: () =>
        request<{ message: string; status: QAScorerStatus }>(`/workers/qa-scorer/stop`, {
          method: "POST"
        }),

      // Semantic Search API methods
      getSimilarRequirements: (tenant: string, project: string, requirementId: string, minSimilarity?: number, limit?: number) => {
        const params = new URLSearchParams();
        if (minSimilarity !== undefined) params.append("minSimilarity", minSimilarity.toString());
        if (limit !== undefined) params.append("limit", limit.toString());
        const queryString = params.toString() ? `?${params}` : "";
        return request<SimilarRequirementsResponse>(`/requirements/${tenant}/${project}/${requirementId}/similar${queryString}`);
      },
      searchRequirementsSemantic: (body: SemanticSearchRequest) =>
        request<SemanticSearchResponse>(`/requirements/search/semantic`, {
          method: "POST",
          body: JSON.stringify(body)
        }),
      getPotentialDuplicates: (tenant: string, project: string, requirementId: string) =>
        request<DuplicatesResponse>(`/requirements/${tenant}/${project}/${requirementId}/duplicates`),

      // Embedding Worker API methods
      startEmbeddingWorker: (tenant: string, project: string, operation: 'backfill' | 'reembed-all') =>
        request<EmbeddingWorkerStartResponse>(`/workers/embedding/start`, {
          method: "POST",
          body: JSON.stringify({ tenant, project, operation })
        }),
      getEmbeddingWorkerStatus: () =>
        request<EmbeddingWorkerStatus>(`/workers/embedding/status`),
      stopEmbeddingWorker: () =>
        request<EmbeddingWorkerStopResponse>(`/workers/embedding/stop`, {
          method: "POST"
        }),

      // Admin Recovery / Backup Operations
      triggerDailyBackup: () =>
        request<BackupOperationResponse>(`/admin/recovery/backup/daily`, {
          method: "POST"
        }),
      triggerWeeklyBackup: () =>
        request<BackupOperationResponse>(`/admin/recovery/backup/weekly`, {
          method: "POST"
        }),
      listBackups: () =>
        request<BackupListResponse>(`/admin/recovery/backups`),
      listRemoteBackups: () =>
        request<RemoteBackupListResponse>(`/admin/recovery/backups/remote`),
      verifyBackup: (backupPath: string) =>
        request<BackupOperationResponse>(`/admin/recovery/verify`, {
          method: "POST",
          body: JSON.stringify({ backupPath })
        }),
      restoreBackupDryRun: (backupPath: string, component?: string) =>
        request<BackupOperationResponse>(`/admin/recovery/restore/dry-run`, {
          method: "POST",
          body: JSON.stringify({ backupPath, component })
        }),
      getBackupStatus: () =>
        request<BackupStatusResponse>(`/admin/recovery/status`),
      listProjectBackups: (params: { tenant: string; projectKey?: string; backupType?: string; status?: string }) => {
        const search = new URLSearchParams();
        if (params.tenant) search.set("tenant", params.tenant);
        if (params.projectKey) search.set("projectKey", params.projectKey);
        if (params.backupType) search.set("backupType", params.backupType);
        if (params.status) search.set("status", params.status);
        return request<ProjectBackupListResponse>(`/admin/recovery/project/backups?${search.toString()}`);
      },
      exportProjectBackup: (body: {
        tenant: string;
        projectKey?: string;
        format?: "cypher" | "json";
        skipVersionHistory?: boolean;
        skipBaselines?: boolean;
        compress?: boolean;
      }) =>
        request<ProjectBackupExportResponse>(`/admin/recovery/project/export`, {
          method: "POST",
          body: JSON.stringify(body)
        }),

      // Super-Admin API methods
      listAllSuperAdminUsers: () =>
        request<DevUserListResponse>(`/super-admin/users`),
      getSuperAdminUser: (id: string) =>
        request<DevUserResponse>(`/super-admin/users/${id}`),
      createSuperAdminUser: (body: { email: string; name?: string; password?: string; permissions?: any }) =>
        request<DevUserResponse>(`/super-admin/users`, { method: "POST", body: JSON.stringify(body) }),
      updateSuperAdminUserPermissions: (id: string, permissions: any) =>
        request<DevUserResponse>(`/super-admin/users/${id}/permissions`, { method: "PATCH", body: JSON.stringify({ permissions }) }),
      deleteSuperAdminUser: (id: string) =>
        request<{ success: boolean }>(`/super-admin/users/${id}`, { method: "DELETE" }),
      listAllSuperAdminTenants: () =>
        request<TenantsResponse>(`/super-admin/tenants`),
      grantPermission: (body: {
        userId: string;
        tenantSlug?: string;
        projectKey?: string;
        role: string;
        grantedBy?: string;
      }) =>
        request<{ success: boolean; user: any }>(`/super-admin/permissions/grant`, { method: "POST", body: JSON.stringify(body) }),
      revokePermission: (body: {
        userId: string;
        tenantSlug?: string;
        projectKey?: string;
      }) =>
        request<{ success: boolean; user: any }>(`/super-admin/permissions/revoke`, { method: "POST", body: JSON.stringify(body) }),

      // Tenant-Admin API methods
      listTenantUsers: (tenant: string) =>
        request<DevUserListResponse>(`/tenant-admin/${tenant}/users`),
      getTenantUser: (tenant: string, id: string) =>
        request<DevUserResponse>(`/tenant-admin/${tenant}/users/${id}`),
      grantTenantUserAccess: (tenant: string, userId: string, role: string, isOwner?: boolean) =>
        request<{ success: boolean; user: any }>(`/tenant-admin/${tenant}/users/${userId}/grant-access`, {
          method: "POST",
          body: JSON.stringify({ role, isOwner })
        }),
      revokeTenantUserAccess: (tenant: string, userId: string) =>
        request<{ success: boolean; user: any }>(`/tenant-admin/${tenant}/users/${userId}/revoke-access`, {
          method: "POST"
        }),
      grantProjectUserAccess: (tenant: string, project: string, userId: string, role: string) =>
        request<{ success: boolean; user: any }>(`/tenant-admin/${tenant}/projects/${project}/grant-access`, {
          method: "POST",
          body: JSON.stringify({ userId, role })
        }),
      revokeProjectUserAccess: (tenant: string, project: string, userId: string) =>
        request<{ success: boolean; user: any }>(`/tenant-admin/${tenant}/projects/${project}/revoke-access`, {
          method: "POST",
          body: JSON.stringify({ userId })
        }),
      listTenantProjects: (tenant: string) =>
        request<ProjectsResponse>(`/tenant-admin/${tenant}/projects`),

      // Imagine Visualization API methods
      getImagineRequirements: (tenant: string, project: string, elementId: string) =>
        request<{ success: boolean; data: { requirements: Array<{ id: string; ref: string; title: string; text: string; type?: string; priority?: string }> } }>(
          `/${tenant}/${project}/imagine/requirements/${elementId}`
        ),
      generateImagination: (tenant: string, project: string, body: {
        elementId: string;
        elementType: 'Block' | 'Interface';
        requirementIds?: string[];
        customPrompt?: string;
        referenceImages?: string[];
      }) =>
        request<{
          success: boolean;
          data: {
            id: string;
            elementId: string;
            elementType: 'Block' | 'Interface';
            prompt: string;
            imageUrl: string;
            metadata: {
              model: string;
              aspectRatio: string;
              generatedAt: string;
              estimatedCost: number;
            };
            createdBy: string;
            createdAt: string;
          };
        }>(`/${tenant}/${project}/imagine/generate`, {
          method: 'POST',
          body: JSON.stringify(body)
        }),

      // Imagine Gallery API methods
      listImagineImages: (tenant: string, project: string) =>
        request<{
          success: boolean;
          data: {
            images: Array<{
              id: string;
              elementId: string;
              elementName: string;
              elementType: 'Block' | 'Interface';
              tenantSlug: string;
              projectSlug: string;
              prompt: string;
              customPrompt?: string;
              imageUrl: string;
              version: number;
              parentVersionId?: string;
              requirementIds?: string[];
              metadata: {
                model: string;
                aspectRatio: string;
                generatedAt: string;
                estimatedCost: number;
              };
              createdBy: string;
              createdAt: string;
            }>;
            total: number;
          };
        }>(`/${tenant}/${project}/imagine/images`),

      getImagineImageDetails: (tenant: string, project: string, imageId: string) =>
        request<{
          success: boolean;
          data: {
            image: {
              id: string;
              elementId: string;
              elementName: string;
              elementType: 'Block' | 'Interface';
              tenantSlug: string;
              projectSlug: string;
              prompt: string;
              customPrompt?: string;
              imageUrl: string;
              version: number;
              parentVersionId?: string;
              requirementIds?: string[];
              metadata: {
                model: string;
                aspectRatio: string;
                generatedAt: string;
                estimatedCost: number;
              };
              createdBy: string;
              createdAt: string;
            };
            versions: Array<{
              id: string;
              elementId: string;
              elementName: string;
              elementType: 'Block' | 'Interface';
              tenantSlug: string;
              projectSlug: string;
              prompt: string;
              customPrompt?: string;
              imageUrl: string;
              version: number;
              parentVersionId?: string;
              requirementIds?: string[];
              metadata: {
                model: string;
                aspectRatio: string;
                generatedAt: string;
                estimatedCost: number;
              };
              createdBy: string;
              createdAt: string;
            }>;
          };
        }>(`/${tenant}/${project}/imagine/images/${imageId}`),

      reImagineImage: (tenant: string, project: string, body: {
        parentImageId: string;
        iterationInstructions: string;
      }) =>
        request<{
          success: boolean;
          data: {
            image: {
              id: string;
              elementId: string;
              elementName: string;
              elementType: 'Block' | 'Interface';
              tenantSlug: string;
              projectSlug: string;
              prompt: string;
              customPrompt?: string;
              imageUrl: string;
              version: number;
              parentVersionId?: string;
              requirementIds?: string[];
              metadata: {
                model: string;
                aspectRatio: string;
                generatedAt: string;
                estimatedCost: number;
              };
              createdBy: string;
              createdAt: string;
            };
          };
        }>(`/${tenant}/${project}/imagine/reimagine`, {
          method: 'POST',
          body: JSON.stringify(body)
        }),

      getImagineElementMetadata: (tenant: string, project: string, elementId: string, elementType: 'Block' | 'Interface') =>
        request<{
          success: boolean;
          data: {
            diagramId: string;
            documentIds: string[];
          };
        }>(`/${tenant}/${project}/imagine/element/${elementId}?elementType=${elementType}`),

      // Activity Timeline API
      listActivity: (filters: ActivityFilters) => {
        const params = new URLSearchParams();
        params.append('tenantSlug', filters.tenantSlug);
        params.append('projectSlug', filters.projectSlug);
        if (filters.activityTypes) {
          filters.activityTypes.forEach(type => params.append('activityTypes', type));
        }
        if (filters.actionTypes) {
          filters.actionTypes.forEach(action => params.append('actionTypes', action));
        }
        if (filters.userIds) {
          filters.userIds.forEach(userId => params.append('userIds', userId));
        }
        if (filters.startDate) params.append('startDate', filters.startDate);
        if (filters.endDate) params.append('endDate', filters.endDate);
        if (filters.searchQuery) params.append('searchQuery', filters.searchQuery);
        if (filters.limit) params.append('limit', filters.limit.toString());
        if (filters.offset) params.append('offset', filters.offset.toString());

        return request<ActivityResponse>(`/activity?${params.toString()}`);
      },

      getActivityStats: (tenantSlug: string, projectSlug: string) => {
        const params = new URLSearchParams({ tenantSlug, projectSlug });
        return request<ActivityStats>(`/activity/stats?${params.toString()}`);
      }
    }),
    [request, requestBlob]
  );
}
