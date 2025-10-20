/**
 * Requirements Schema Data Hook
 *
 * Manages data fetching and derived state for the requirements schema view:
 * - Documents query
 * - Linksets query
 * - Diagrams query (filtered for requirements_schema view)
 * - Diagram content query
 * - Derived indexes and utilities
 */

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "../../lib/client";
import { isRequirementsSchemaDiagram } from "../../lib/architectureDiagrams";
import { mapBlockFromApi, mapConnectorFromApi } from "../../lib/requirements-schema-mappers";
import type { SysmlBlock } from "../../types/requirements-schema";
import type { DocumentRecord } from "../../types";

export function useRequirementsSchemaData(
  tenant: string,
  project: string,
  activeDiagramId: string | null
) {
  const api = useApiClient();

  // Fetch documents for the project
  const documentsQuery = useQuery({
    queryKey: ["documents", tenant, project],
    queryFn: () => api.listDocuments(tenant, project),
    enabled: Boolean(tenant && project)
  });

  // Fetch linksets for the project
  const linksetsQuery = useQuery({
    queryKey: ["linksets", tenant, project],
    queryFn: () => api.listLinksets(tenant, project),
    enabled: Boolean(tenant && project)
  });

  // Fetch requirements schema diagrams (filtered)
  const diagramsQuery = useQuery({
    queryKey: ["requirements-schema-diagrams", tenant, project],
    queryFn: async () => {
      const response = await api.listArchitectureDiagrams(tenant, project);
      return response.diagrams.filter(isRequirementsSchemaDiagram);
    },
    enabled: Boolean(tenant && project)
  });

  // Fetch active diagram content
  const diagramContentQuery = useQuery({
    queryKey: ["requirements-schema-content", tenant, project, activeDiagramId],
    queryFn: async () => {
      if (!activeDiagramId) return null;
      const blocks = await api.listArchitectureBlocks(tenant, project, activeDiagramId);
      const connectors = await api.listArchitectureConnectors(tenant, project, activeDiagramId);
      return { blocks: blocks.blocks, connectors: connectors.connectors };
    },
    enabled: Boolean(tenant && project && activeDiagramId)
  });

  // Computed: diagrams array
  const diagrams = useMemo(() => diagramsQuery.data ?? [], [diagramsQuery.data]);

  // Computed: active diagram
  const activeDiagram = useMemo(
    () => diagrams.find(diagram => diagram.id === activeDiagramId) ?? null,
    [diagrams, activeDiagramId]
  );

  // Computed: blocks (transformed to SysML format)
  const blocks = useMemo(
    () => (diagramContentQuery.data?.blocks ?? []).map(mapBlockFromApi),
    [diagramContentQuery.data?.blocks]
  );

  // Computed: connectors (transformed to SysML format)
  const connectors = useMemo(
    () => (diagramContentQuery.data?.connectors ?? []).map(mapConnectorFromApi),
    [diagramContentQuery.data?.connectors]
  );

  // Computed: documents index (by ID)
  const documentsIndex = useMemo(() => {
    const index = new Map<string, DocumentRecord>();
    (documentsQuery.data?.documents ?? []).forEach(doc => {
      index.set(doc.id, doc);
    });
    return index;
  }, [documentsQuery.data?.documents]);

  // Computed: block index (by ID)
  const blockIndex = useMemo(() => {
    const index = new Map<string, SysmlBlock>();
    blocks.forEach(block => index.set(block.id, block));
    return index;
  }, [blocks]);

  // Utility: resolve document slug from block ID
  const resolveDocumentSlug = useMemo(() => {
    return (blockId: string): string | null => {
      const block = blockIndex.get(blockId);
      if (!block || !block.documentIds || block.documentIds.length === 0) {
        return null;
      }
      const documentId = block.documentIds[0];
      const document = documentsIndex.get(documentId);
      return document?.slug ?? null;
    };
  }, [blockIndex, documentsIndex]);

  return {
    // Queries
    documentsQuery,
    linksetsQuery,
    diagramsQuery,
    diagramContentQuery,

    // Computed data
    diagrams,
    activeDiagram,
    blocks,
    connectors,
    documentsIndex,
    blockIndex,

    // Utilities
    resolveDocumentSlug,

    // Loading states
    isLoadingDiagrams: diagramsQuery.isLoading,
    isLoadingContent: diagramContentQuery.isLoading
  };
}
