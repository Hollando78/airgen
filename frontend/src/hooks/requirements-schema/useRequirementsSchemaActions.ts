/**
 * Requirements Schema Actions Hook
 *
 * Manages all mutations and async actions for the requirements schema view:
 * - Create diagram
 * - Add document block
 * - Add connector (with linkset validation and synthetic linkset creation)
 * - Update block/connector
 * - Delete block/connector
 * - Linkset management (create, update, delete)
 */

import { useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "../../lib/client";
import { DOCUMENT_BLOCK_PRESET, LINK_TYPE_LABELS } from "../../types/requirements-schema";
import type { SysmlBlock, SysmlConnector } from "../../types/requirements-schema";
import type { DocumentRecord, DocumentLinkset, CreateArchitectureConnectorRequest } from "../../types";

export function useRequirementsSchemaActions(
  tenant: string,
  project: string,
  activeDiagramId: string | null,
  documentsIndex: Map<string, DocumentRecord>,
  blockIndex: Map<string, SysmlBlock>,
  resolveDocumentSlug: (blockId: string) => string | null,
  setPendingLinksetCreation: (value: any) => void,
  resetCreateDialogForm: () => void,
  setActiveDiagramId: (id: string) => void,
  setShowCreateDialog: (show: boolean) => void
) {
  const api = useApiClient();
  const queryClient = useQueryClient();

  // Create diagram mutation
  const createDiagramMutation = useMutation({
    mutationFn: async (input: { name: string; description: string }) => {
      return api.createArchitectureDiagram({
        tenant,
        projectKey: project,
        name: input.name || "Project Requirements Schema",
        description: input.description,
        view: "requirements_schema"
      });
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["requirements-schema-diagrams"] });
      setActiveDiagramId(data.diagram.id);
      setShowCreateDialog(false);
      resetCreateDialogForm();
    }
  });

  // Add document block to diagram
  const addDocumentBlock = useCallback(async (documentId: string, position: { x: number; y: number }) => {
    if (!activeDiagramId) return;

    const document = Array.from(documentsIndex.values()).find(d => d.id === documentId);
    if (!document) return;

    await api.createArchitectureBlock({
      tenant,
      projectKey: project,
      diagramId: activeDiagramId,
      name: document.name,
      kind: DOCUMENT_BLOCK_PRESET.kind,
      stereotype: DOCUMENT_BLOCK_PRESET.stereotype,
      description: `Document: ${document.slug}`,
      positionX: position.x,
      positionY: position.y,
      sizeWidth: DOCUMENT_BLOCK_PRESET.size.width,
      sizeHeight: DOCUMENT_BLOCK_PRESET.size.height,
      documentIds: [documentId]
    });

    queryClient.invalidateQueries({ queryKey: ["requirements-schema-content"] });
  }, [tenant, project, activeDiagramId, documentsIndex, api, queryClient]);

  // Seed synthetic linkset in cache
  const seedSyntheticLinkset = useCallback((sourceSlug: string, targetSlug: string, input: { source: string; target: string }) => {
    const sourceDoc = documentsIndex.get(blockIndex.get(input.source)?.documentIds?.[0] ?? "");
    const targetDoc = documentsIndex.get(blockIndex.get(input.target)?.documentIds?.[0] ?? "");

    if (!sourceDoc || !targetDoc) {
      return;
    }

    queryClient.setQueryData<{ linksets: DocumentLinkset[] } | undefined>(
      ["linksets", tenant, project],
      prev => {
        const existing = prev?.linksets ?? [];
        const alreadyPresent = existing.some(linkset =>
          linkset.sourceDocumentSlug === sourceSlug && linkset.targetDocumentSlug === targetSlug
        );
        if (alreadyPresent) {
          return prev;
        }

        const timestamp = new Date().toISOString();
        const synthetic: DocumentLinkset = {
          id: `synthetic-linkset-${Date.now()}`,
          tenant,
          projectKey: project,
          sourceDocumentSlug: sourceSlug,
          targetDocumentSlug: targetSlug,
          sourceDocument: sourceDoc,
          targetDocument: targetDoc,
          linkCount: 0,
          links: [],
          createdAt: timestamp,
          updatedAt: timestamp
        };

        return {
          linksets: [synthetic, ...existing]
        };
      }
    );
  }, [tenant, project, queryClient, documentsIndex, blockIndex]);

  // Add connector between documents
  const addConnector = useCallback(async (input: {
    source: string;
    target: string;
    sourcePortId?: string | null;
    targetPortId?: string | null;
    kind?: "dependency" | "association" | "composition" | "aggregation" | "flow" | "generalization";
    label?: string;
  }) => {
    if (!activeDiagramId) return null;

    // Check if linkset exists before allowing connector creation and get its default link type
    const sourceSlug = resolveDocumentSlug(input.source);
    const targetSlug = resolveDocumentSlug(input.target);

    if (!sourceSlug || !targetSlug) {
      throw new Error("Document slug unavailable for connector creation");
    }

    let linksetDefaultType = "satisfies"; // fallback
    try {
      const linkset = await api.getLinkset(tenant, project, sourceSlug, targetSlug);
      linksetDefaultType = linkset.linkset.defaultLinkType || "satisfies";
    } catch (error) {
      const message = error instanceof Error ? error.message.toLowerCase() : "";
      if (message.includes("not found")) {
        // Store the pending connector info and prompt user to create linkset
        setPendingLinksetCreation({
          sourceSlug,
          targetSlug,
          pendingConnector: input
        });
        throw new Error("LINKSET_REQUIRED"); // Special error to suppress default error handling
      }
      console.error("Failed to check linkset", { sourceSlug, targetSlug, error });
      throw error;
    }

    // Convert link type to label
    const connectorLabel = input.label || LINK_TYPE_LABELS[linksetDefaultType] || "traces to";

    const sourcePortId: string | undefined = input.sourcePortId ?? undefined;
    const targetPortId: string | undefined = input.targetPortId ?? undefined;

    const payload: CreateArchitectureConnectorRequest = {
      tenant,
      projectKey: project,
      diagramId: activeDiagramId,
      source: input.source,
      target: input.target,
      kind: "flow",
      label: connectorLabel,
      lineStyle: "smoothstep",
      markerStart: "none",
      markerEnd: "arrowclosed",
      linePattern: "solid",
      color: "#2563eb",
      strokeWidth: 2
    };
    if (sourcePortId !== undefined) {
      payload.sourcePortId = sourcePortId;
    }
    if (targetPortId !== undefined) {
      payload.targetPortId = targetPortId;
    }

    const result = await api.createArchitectureConnector(payload);

    queryClient.invalidateQueries({ queryKey: ["requirements-schema-content"] });

    return result.connector.id;
  }, [tenant, project, activeDiagramId, api, queryClient, resolveDocumentSlug, setPendingLinksetCreation]);

  // Update block
  const handleUpdateBlock = useCallback(async (blockId: string, updates: Partial<SysmlBlock>) => {
    if (!activeDiagramId) return;
    await api.updateArchitectureBlock(tenant, project, blockId, {
      diagramId: activeDiagramId,
      ...updates
    });
    queryClient.invalidateQueries({ queryKey: ["requirements-schema-content"] });
  }, [tenant, project, activeDiagramId, api, queryClient]);

  // Update block position
  const handleUpdateBlockPosition = useCallback(async (blockId: string, position: { x: number; y: number }) => {
    if (!activeDiagramId) return;
    await api.updateArchitectureBlock(tenant, project, blockId, {
      diagramId: activeDiagramId,
      positionX: position.x,
      positionY: position.y
    });
    queryClient.invalidateQueries({ queryKey: ["requirements-schema-content"] });
  }, [tenant, project, activeDiagramId, api, queryClient]);

  // Update block size
  const handleUpdateBlockSize = useCallback(async (blockId: string, size: { width: number; height: number }) => {
    if (!activeDiagramId) return;
    await api.updateArchitectureBlock(tenant, project, blockId, {
      diagramId: activeDiagramId,
      sizeWidth: size.width,
      sizeHeight: size.height
    });
    queryClient.invalidateQueries({ queryKey: ["requirements-schema-content"] });
  }, [tenant, project, activeDiagramId, api, queryClient]);

  // Remove block
  const handleRemoveBlock = useCallback(async (blockId: string) => {
    if (!activeDiagramId) return;
    await api.deleteArchitectureBlock(tenant, project, activeDiagramId, blockId);
    queryClient.invalidateQueries({ queryKey: ["requirements-schema-content"] });
  }, [tenant, project, activeDiagramId, api, queryClient]);

  // Update connector
  const handleUpdateConnector = useCallback(async (connectorId: string, updates: Partial<SysmlConnector>) => {
    if (!activeDiagramId) return;
    const sanitized = {
      ...updates,
      sourcePortId: updates.sourcePortId ?? undefined,
      targetPortId: updates.targetPortId ?? undefined
    } as Partial<CreateArchitectureConnectorRequest>;

    await api.updateArchitectureConnector(tenant, project, connectorId, {
      diagramId: activeDiagramId,
      kind: "flow",
      markerStart: "none",
      markerEnd: "arrowclosed",
      ...sanitized
    });
    queryClient.invalidateQueries({ queryKey: ["requirements-schema-content"] });
  }, [tenant, project, activeDiagramId, api, queryClient]);

  // Remove connector
  const handleRemoveConnector = useCallback(async (connectorId: string) => {
    if (!activeDiagramId) return;
    await api.deleteArchitectureConnector(tenant, project, activeDiagramId, connectorId);
    queryClient.invalidateQueries({ queryKey: ["requirements-schema-content"] });
  }, [tenant, project, activeDiagramId, api, queryClient]);

  // Linkset management handlers
  const handleCreateLinkset = useCallback(async (sourceDocSlug: string, targetDocSlug: string, defaultLinkType?: string) => {
    try {
      await api.createLinkset(tenant, project, {
        sourceDocumentSlug: sourceDocSlug,
        targetDocumentSlug: targetDocSlug,
        defaultLinkType: defaultLinkType as any
      });
      queryClient.invalidateQueries({ queryKey: ["linksets", tenant, project] });
    } catch (error) {
      throw error;
    }
  }, [tenant, project, api, queryClient]);

  const handleUpdateLinkset = useCallback(async (linksetId: string, defaultLinkType: string) => {
    try {
      await api.updateLinkset(tenant, project, linksetId, defaultLinkType);
      queryClient.invalidateQueries({ queryKey: ["linksets", tenant, project] });
    } catch (error) {
      throw error;
    }
  }, [tenant, project, api, queryClient]);

  const handleDeleteLinkset = useCallback(async (linksetId: string) => {
    try {
      await api.deleteLinkset(tenant, project, linksetId);
      queryClient.invalidateQueries({ queryKey: ["linksets", tenant, project] });
    } catch (error) {
      throw error;
    }
  }, [tenant, project, api, queryClient]);

  return {
    // Diagram mutations
    createDiagramMutation,

    // Block actions
    addDocumentBlock,
    handleUpdateBlock,
    handleUpdateBlockPosition,
    handleUpdateBlockSize,
    handleRemoveBlock,

    // Connector actions
    addConnector,
    handleUpdateConnector,
    handleRemoveConnector,

    // Linkset actions
    handleCreateLinkset,
    handleUpdateLinkset,
    handleDeleteLinkset
  };
}
