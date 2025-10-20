/**
 * Document View Data Hook
 *
 * Manages all data fetching for document view:
 * - Document metadata
 * - Sections with nested requirements/infos/surrogates
 * - Trace links
 */

import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "../../lib/client";

export function useDocumentData(tenant: string, project: string, documentSlug: string) {
  const api = useApiClient();

  // Fetch document details
  const documentQuery = useQuery({
    queryKey: ["document", tenant, project, documentSlug],
    queryFn: () => api.getDocument(tenant, project, documentSlug)
  });

  // Fetch sections for this document with all related data in one optimized query
  // This replaces the N+1 query pattern (1 + 3*N API calls) with a single batched query
  const sectionsQuery = useQuery({
    queryKey: ["sections", tenant, project, documentSlug],
    queryFn: () => api.listDocumentSectionsWithRelations(tenant, project, documentSlug),
    enabled: Boolean(tenant && project && documentSlug)
  });

  // Fetch trace links for this project
  const traceLinksQuery = useQuery({
    queryKey: ["traceLinks", tenant, project],
    queryFn: () => api.listTraceLinks(tenant, project),
    enabled: Boolean(tenant && project)
  });

  // Sections now come directly from the optimized query with all relations included
  const sections = sectionsQuery.data?.sections || [];
  const document = documentQuery.data?.document;
  const traceLinks = traceLinksQuery.data?.traceLinks || [];

  return {
    documentQuery,
    sectionsQuery,
    traceLinksQuery,
    document,
    sections,
    traceLinks,
    isLoading: documentQuery.isLoading || sectionsQuery.isLoading,
    isError: documentQuery.isError || sectionsQuery.isError,
    error: documentQuery.error || sectionsQuery.error
  };
}
