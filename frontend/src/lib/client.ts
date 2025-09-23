import { useCallback, useMemo } from "react";
import { config } from "../config";
import { useAuth } from "../auth/AuthContext";
import type {
  DraftResponse,
  DraftRequest,
  QaResponse,
  ApplyFixResponse,
  RequirementRecord,
  RequirementDetail,
  CreateRequirementRequest,
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
  LinkSuggestResponse
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
      draft: (body: DraftRequest) => request<DraftResponse>(`/draft`, { method: "POST", body: JSON.stringify(body) }),
      qa: (text: string) => request<QaResponse>(`/qa`, { method: "POST", body: JSON.stringify({ text }) }),
      applyFix: (text: string) => request<ApplyFixResponse>(`/apply-fix`, { method: "POST", body: JSON.stringify({ text }) }),
      listRequirements: (tenant: string, project: string) =>
        request<{ items: RequirementRecord[] }>(`/requirements/${tenant}/${project}`),
      getRequirement: (tenant: string, project: string, ref: string) =>
        request<RequirementDetail>(`/requirements/${tenant}/${project}/${ref}`),
      createRequirement: (body: CreateRequirementRequest) =>
        request<{ requirement: RequirementRecord }>(`/requirements`, {
          method: "POST",
          body: JSON.stringify(body)
        }),
      createBaseline: (body: { tenant: string; projectKey: string; label?: string; author?: string }) =>
        request<BaselineResponse>(`/baseline`, { method: "POST", body: JSON.stringify(body) }),
      listBaselines: (tenant: string, project: string) =>
        request<BaselineListResponse>(`/baselines/${tenant}/${project}`),
      listDocuments: (tenant: string, project: string) =>
        request<DocumentsResponse>(`/documents/${tenant}/${project}`),
      getDocument: (tenant: string, project: string, documentSlug: string) =>
        request<DocumentResponse>(`/documents/${tenant}/${project}/${documentSlug}`),
      createDocument: (body: { tenant: string; projectKey: string; name: string; description?: string; parentFolder?: string }) =>
        request<DocumentResponse>(`/documents`, { method: "POST", body: JSON.stringify(body) }),
      updateDocumentFolder: (tenant: string, project: string, documentSlug: string, parentFolder?: string | null) =>
        request<DocumentResponse>(`/documents/${tenant}/${project}/${documentSlug}`, { method: "PATCH", body: JSON.stringify({ parentFolder }) }),
      deleteDocument: (tenant: string, project: string, documentSlug: string) =>
        request<DocumentResponse>(`/documents/${tenant}/${project}/${documentSlug}`, { method: "DELETE" }),
      listFolders: (tenant: string, project: string) =>
        request<FoldersResponse>(`/folders/${tenant}/${project}`),
      createFolder: (body: { tenant: string; projectKey: string; name: string; description?: string; parentFolder?: string }) =>
        request<FolderResponse>(`/folders`, { method: "POST", body: JSON.stringify(body) }),
      deleteFolder: (tenant: string, project: string, folderSlug: string) =>
        request<FolderResponse>(`/folders/${tenant}/${project}/${folderSlug}`, { method: "DELETE" }),
      listDocumentSections: (tenant: string, project: string, documentSlug: string) =>
        request<DocumentSectionsResponse>(`/sections/${tenant}/${project}/${documentSlug}`),
      createDocumentSection: (body: CreateSectionRequest) =>
        request<DocumentSectionResponse>(`/sections`, { method: "POST", body: JSON.stringify(body) }),
      updateDocumentSection: (sectionId: string, body: { name?: string; description?: string; order?: number }) =>
        request<DocumentSectionResponse>(`/sections/${sectionId}`, { method: "PATCH", body: JSON.stringify(body) }),
      deleteDocumentSection: (sectionId: string) =>
        request<{ success: boolean }>(`/sections/${sectionId}`, { method: "DELETE" }),
      listSectionRequirements: (sectionId: string) =>
        request<{ requirements: RequirementRecord[] }>(`/sections/${sectionId}/requirements`),
      suggestLinks: (body: LinkSuggestRequest) =>
        request<LinkSuggestResponse>(`/link/suggest`, { method: "POST", body: JSON.stringify(body) })
    }),
    [request]
  );
}
