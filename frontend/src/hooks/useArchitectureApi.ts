import { useState, useEffect, useCallback, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "../lib/client";
import type {
  ArchitectureBlockRecord,
  ArchitectureBlockLibraryRecord,
  ArchitectureConnectorRecord,
  ArchitectureDiagramRecord,
  BlockKind,
  PortDirection,
  BlockPortRecord,
  ConnectorKind,
  UpdateArchitectureBlockRequest,
  CreateArchitectureConnectorRequest
} from "../types";

// Convert backend types to frontend types
export interface SysmlBlock {
  id: string;
  name: string;
  kind: BlockKind;
  stereotype?: string;
  description?: string;
  position: { x: number; y: number };
  size: { width: number; height: number };
  ports: BlockPort[];
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
}

export interface BlockPort {
  id: string;
  name: string;
  direction: PortDirection;
}

export interface SysmlConnector {
  id: string;
  source: string;
  target: string;
  kind: ConnectorKind;
  label?: string;
  sourcePortId?: string | null;
  targetPortId?: string | null;
  // Styling properties
  lineStyle?: string;
  markerStart?: string;
  markerEnd?: string;
  linePattern?: string;
  color?: string;
  strokeWidth?: number;
}

export { BlockKind, ConnectorKind, PortDirection };

export interface ArchitectureState {
  blocks: SysmlBlock[];
  connectors: SysmlConnector[];
  lastModified: string;
}

function mapBlockFromApi(block: ArchitectureBlockRecord): SysmlBlock {
  return {
    id: block.id,
    name: block.name,
    kind: block.kind,
    stereotype: block.stereotype || undefined,
    description: block.description || undefined,
    position: { x: block.positionX, y: block.positionY },
    size: { width: block.sizeWidth, height: block.sizeHeight },
    ports: block.ports,
    documentIds: block.documentIds,
    // Styling properties
    backgroundColor: block.backgroundColor || undefined,
    borderColor: block.borderColor || undefined,
    borderWidth: block.borderWidth || undefined,
    borderStyle: block.borderStyle || undefined,
    textColor: block.textColor || undefined,
    fontSize: block.fontSize || undefined,
    fontWeight: block.fontWeight || undefined,
    borderRadius: block.borderRadius || undefined
  };
}

function mapConnectorFromApi(connector: ArchitectureConnectorRecord): SysmlConnector {
  return {
    id: connector.id,
    source: connector.source,
    target: connector.target,
    kind: connector.kind,
    label: connector.label || undefined,
    sourcePortId: connector.sourcePortId,
    targetPortId: connector.targetPortId,
    // Styling properties
    lineStyle: connector.lineStyle,
    markerStart: connector.markerStart,
    markerEnd: connector.markerEnd,
    linePattern: connector.linePattern,
    color: connector.color,
    strokeWidth: connector.strokeWidth
  };
}

export function useArchitecture(tenant: string | null, project: string | null) {
  const api = useApiClient();
  const queryClient = useQueryClient();

  const [activeDiagramId, setActiveDiagramId] = useState<string | null>(null);

  useEffect(() => {
    setActiveDiagramId(null);
  }, [tenant, project]);

  const diagramsQuery = useQuery({
    queryKey: ["architecture-diagrams", tenant, project],
    queryFn: () => api.listArchitectureDiagrams(tenant!, project!),
    enabled: Boolean(tenant && project)
  });

  const diagrams = useMemo<ArchitectureDiagramRecord[]>(
    () => diagramsQuery.data?.diagrams ?? [],
    [diagramsQuery.data?.diagrams]
  );

  useEffect(() => {
    if (!diagrams.length) {
      setActiveDiagramId(null);
      return;
    }

    setActiveDiagramId(prev => {
      if (prev && diagrams.some(diagram => diagram.id === prev)) {
        return prev;
      }
      return diagrams[0].id;
    });
  }, [diagrams]);

  const activeDiagram = useMemo(
    () => (activeDiagramId ? diagrams.find(diagram => diagram.id === activeDiagramId) ?? null : null),
    [diagrams, activeDiagramId]
  );

  const blockLibraryQuery = useQuery({
    queryKey: ["architecture-block-library", tenant, project],
    queryFn: () => api.listArchitectureBlockLibrary(tenant!, project!),
    enabled: Boolean(tenant && project)
  });

  const blocksLibrary = useMemo<ArchitectureBlockLibraryRecord[]>(
    () => blockLibraryQuery.data?.blocks ?? [],
    [blockLibraryQuery.data?.blocks]
  );

  const blocksQuery = useQuery({
    queryKey: ["architecture-blocks", tenant, project, activeDiagramId],
    queryFn: () => api.listArchitectureBlocks(tenant!, project!, activeDiagramId!),
    enabled: Boolean(tenant && project && activeDiagramId)
  });

  const connectorsQuery = useQuery({
    queryKey: ["architecture-connectors", tenant, project, activeDiagramId],
    queryFn: () => api.listArchitectureConnectors(tenant!, project!, activeDiagramId!),
    enabled: Boolean(tenant && project && activeDiagramId)
  });

  const createDiagramMutation = useMutation({
    mutationFn: (input: { name: string; description?: string; view?: ArchitectureDiagramRecord["view"] }) =>
      api.createArchitectureDiagram({
        tenant: tenant!,
        projectKey: project!,
        name: input.name,
        description: input.description,
        view: input.view
      }),
    onSuccess: ({ diagram }) => {
      queryClient.invalidateQueries({ queryKey: ["architecture-diagrams", tenant, project] });
      setActiveDiagramId(diagram.id);
    }
  });

  const updateDiagramMutation = useMutation({
    mutationFn: ({ diagramId, updates }: { diagramId: string; updates: Partial<Pick<ArchitectureDiagramRecord, "name" | "description" | "view">> }) =>
      api.updateArchitectureDiagram(tenant!, project!, diagramId, {
        ...updates,
        description: updates.description ?? undefined
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["architecture-diagrams", tenant, project] });
    }
  });

  const deleteDiagramMutation = useMutation({
    mutationFn: (diagramId: string) => api.deleteArchitectureDiagram(tenant!, project!, diagramId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["architecture-diagrams", tenant, project] });
    }
  });

  const createBlockMutation = useMutation({
    mutationFn: (input: {
      positionX: number;
      positionY: number;
      sizeWidth?: number;
      sizeHeight?: number;
      name?: string;
      kind?: BlockKind;
      stereotype?: string;
      description?: string;
      ports?: BlockPortRecord[];
      documentIds?: string[];
      existingBlockId?: string;
    }) => {
      if (!activeDiagramId) {
        throw new Error("Cannot create block without an active diagram");
      }

      return api.createArchitectureBlock({
        tenant: tenant!,
        projectKey: project!,
        diagramId: activeDiagramId,
        positionX: input.positionX,
        positionY: input.positionY,
        sizeWidth: input.sizeWidth,
        sizeHeight: input.sizeHeight,
        name: input.existingBlockId ? undefined : input.name,
        kind: input.existingBlockId ? undefined : input.kind,
        stereotype: input.stereotype,
        description: input.description,
        ports: input.ports,
        documentIds: input.documentIds,
        existingBlockId: input.existingBlockId
      });
    },
    onSuccess: () => {
      if (activeDiagramId) {
        queryClient.invalidateQueries({ queryKey: ["architecture-blocks", tenant, project, activeDiagramId] });
      }
      queryClient.invalidateQueries({ queryKey: ["architecture-block-library", tenant, project] });
    }
  });

  const updateBlockMutation = useMutation({
    mutationFn: ({ blockId, updates }: { blockId: string; updates: UpdateArchitectureBlockRequest }) =>
      api.updateArchitectureBlock(tenant!, project!, blockId, updates),
    onSuccess: () => {
      if (activeDiagramId) {
        queryClient.invalidateQueries({ queryKey: ["architecture-blocks", tenant, project, activeDiagramId] });
      }
      queryClient.invalidateQueries({ queryKey: ["architecture-block-library", tenant, project] });
    }
  });

  const deleteBlockMutation = useMutation({
    mutationFn: (blockId: string) => {
      if (!activeDiagramId) {
        throw new Error("Cannot delete block without an active diagram");
      }
      return api.deleteArchitectureBlock(tenant!, project!, activeDiagramId, blockId);
    },
    onSuccess: () => {
      if (activeDiagramId) {
        queryClient.invalidateQueries({ queryKey: ["architecture-blocks", tenant, project, activeDiagramId] });
      }
      queryClient.invalidateQueries({ queryKey: ["architecture-block-library", tenant, project] });
    }
  });

  const createConnectorMutation = useMutation({
    mutationFn: (connector: {
      source: string;
      target: string;
      kind: ConnectorKind;
      label?: string;
      sourcePortId?: string;
      targetPortId?: string;
    }) => {
      if (!activeDiagramId) {
        throw new Error("Cannot create connector without an active diagram");
      }

      return api.createArchitectureConnector({
        tenant: tenant!,
        projectKey: project!,
        diagramId: activeDiagramId,
        ...connector
      });
    },
    onSuccess: () => {
      if (activeDiagramId) {
        queryClient.invalidateQueries({ queryKey: ["architecture-connectors", tenant, project, activeDiagramId] });
      }
    }
  });

  const deleteConnectorMutation = useMutation({
    mutationFn: (connectorId: string) => {
      console.log("[ArchitectureAPI] deleteConnectorMutation mutationFn called with:", connectorId);
      if (!activeDiagramId) {
        console.error("[ArchitectureAPI] No active diagram ID!");
        throw new Error("Cannot delete connector without an active diagram");
      }
      console.log("[ArchitectureAPI] Calling API deleteArchitectureConnector with:", {
        tenant, project, activeDiagramId, connectorId
      });
      return api.deleteArchitectureConnector(tenant!, project!, activeDiagramId, connectorId);
    },
    onSuccess: () => {
      console.log("[ArchitectureAPI] deleteConnectorMutation onSuccess called");
      if (activeDiagramId) {
        queryClient.invalidateQueries({ queryKey: ["architecture-connectors", tenant, project, activeDiagramId] });
      }
    },
    onError: (error) => {
      console.error("[ArchitectureAPI] deleteConnectorMutation onError:", error);
    }
  });

  const updateConnectorMutation = useMutation({
    mutationFn: ({ connectorId, updates }: { 
      connectorId: string; 
      updates: Partial<Pick<
        CreateArchitectureConnectorRequest,
        "kind" | "label" | "sourcePortId" | "targetPortId" | "lineStyle" | "markerStart" | "markerEnd" | "linePattern" | "color" | "strokeWidth"
      >>
    }) => {
      if (!activeDiagramId) {
        throw new Error("Cannot update connector without an active diagram");
      }
      return api.updateArchitectureConnector(tenant!, project!, connectorId, {
        diagramId: activeDiagramId,
        ...updates
      });
    },
    onSuccess: () => {
      if (activeDiagramId) {
        queryClient.invalidateQueries({ queryKey: ["architecture-connectors", tenant, project, activeDiagramId] });
      }
    }
  });

  const blocks = useMemo(() =>
    (blocksQuery.data?.blocks ?? []).map(mapBlockFromApi),
    [blocksQuery.data?.blocks]
  );

  const connectors = useMemo(() =>
    (connectorsQuery.data?.connectors ?? []).map(mapConnectorFromApi),
    [connectorsQuery.data?.connectors]
  );

  const architecture: ArchitectureState = useMemo(() => ({
    blocks,
    connectors,
    lastModified: new Date(
      blocksQuery.dataUpdatedAt || connectorsQuery.dataUpdatedAt || diagramsQuery.dataUpdatedAt || Date.now()
    ).toISOString()
  }), [blocks, connectors, blocksQuery.dataUpdatedAt, connectorsQuery.dataUpdatedAt, diagramsQuery.dataUpdatedAt]);

  const addBlock = useCallback((input: {
    name?: string;
    kind?: BlockKind;
    stereotype?: string;
    description?: string;
    x?: number;
    y?: number;
    size?: { width: number; height: number };
  } | { x: number; y: number }) => {
    if (!activeDiagramId) return null;

    const name = 'name' in input ? input.name : `Block ${blocks.length + 1}`;
    const kind = 'kind' in input ? input.kind : 'component';
    const x = input.x ?? 100;
    const y = input.y ?? 100;
    const sizeWidth = 'size' in input ? input.size?.width ?? 220 : 220;
    const sizeHeight = 'size' in input ? input.size?.height ?? 140 : 140;

    const blockData = {
      name: name || `Block ${blocks.length + 1}`,
      kind: kind || 'component' as BlockKind,
      stereotype: 'stereotype' in input ? input.stereotype : undefined,
      description: 'description' in input ? input.description : undefined,
      positionX: x,
      positionY: y,
      sizeWidth,
      sizeHeight,
      ports: [],
      documentIds: [] as string[]
    };

    createBlockMutation.mutate(blockData);

    return `temp-${Date.now()}`;
  }, [activeDiagramId, blocks.length, createBlockMutation]);

  const updateBlock = useCallback((blockId: string, updates: Partial<Pick<SysmlBlock, "name" | "kind" | "stereotype" | "description" | "backgroundColor" | "borderColor" | "borderWidth" | "borderStyle" | "textColor" | "fontSize" | "fontWeight" | "borderRadius">>) => {
    if (!activeDiagramId) return;
    updateBlockMutation.mutate({ blockId, updates: { diagramId: activeDiagramId, ...updates } });
  }, [activeDiagramId, updateBlockMutation]);

  const updateBlockPosition = useCallback((blockId: string, position: { x: number; y: number }) => {
    if (!activeDiagramId) return;
    updateBlockMutation.mutate({
      blockId,
      updates: { diagramId: activeDiagramId, positionX: position.x, positionY: position.y }
    });
  }, [activeDiagramId, updateBlockMutation]);

  const updateBlockSize = useCallback((blockId: string, size: { width: number; height: number }) => {
    if (!activeDiagramId) return;
    updateBlockMutation.mutate({
      blockId,
      updates: { diagramId: activeDiagramId, sizeWidth: size.width, sizeHeight: size.height }
    });
  }, [activeDiagramId, updateBlockMutation]);

  const removeBlock = useCallback((blockId: string) => {
    deleteBlockMutation.mutate(blockId);
  }, [deleteBlockMutation]);

  const reuseBlock = useCallback((blockId: string, position: { x: number; y: number }, size?: { width: number; height: number }) => {
    if (!activeDiagramId) return null;

    createBlockMutation.mutate({
      existingBlockId: blockId,
      positionX: position.x,
      positionY: position.y,
      sizeWidth: size?.width,
      sizeHeight: size?.height
    });

    return `temp-${Date.now()}`;
  }, [activeDiagramId, createBlockMutation]);

  const addPort = useCallback((blockId: string, port: { name: string; direction: PortDirection }) => {
    const block = blocks.find(b => b.id === blockId);
    if (!block) return;

    const newPort = {
      id: `port-${Date.now()}`,
      name: port.name,
      direction: port.direction
    };

    const updatedPorts = [...block.ports, newPort];
    if (!activeDiagramId) return;
    updateBlockMutation.mutate({
      blockId,
      updates: { diagramId: activeDiagramId, ports: updatedPorts }
    });
  }, [activeDiagramId, blocks, updateBlockMutation]);

  const updatePort = useCallback((blockId: string, portId: string, updates: { name?: string; direction?: PortDirection }) => {
    const block = blocks.find(b => b.id === blockId);
    if (!block) return;

    const updatedPorts = block.ports.map(port =>
      port.id === portId ? { ...port, ...updates } : port
    );

    if (!activeDiagramId) return;
    updateBlockMutation.mutate({
      blockId,
      updates: { diagramId: activeDiagramId, ports: updatedPorts }
    });
  }, [activeDiagramId, blocks, updateBlockMutation]);

  const removePort = useCallback((blockId: string, portId: string) => {
    const block = blocks.find(b => b.id === blockId);
    if (!block) return;

    const updatedPorts = block.ports.filter(port => port.id !== portId);
    if (!activeDiagramId) return;
    updateBlockMutation.mutate({
      blockId,
      updates: { diagramId: activeDiagramId, ports: updatedPorts }
    });
  }, [activeDiagramId, blocks, updateBlockMutation]);

  const addConnector = useCallback((input: {
    source: string;
    target: string;
    sourcePortId?: string | null;
    targetPortId?: string | null;
    kind?: ConnectorKind;
    label?: string;
  }) => {
    if (!activeDiagramId) return null;

    const connectorData = {
      source: input.source,
      target: input.target,
      kind: input.kind ?? 'association' as ConnectorKind,
      label: input.label,
      sourcePortId: input.sourcePortId ?? undefined,
      targetPortId: input.targetPortId ?? undefined
    };

    createConnectorMutation.mutate(connectorData);

    return `temp-connector-${Date.now()}`;
  }, [activeDiagramId, createConnectorMutation]);

  const updateConnector = useCallback((connectorId: string, updates: Partial<Pick<SysmlConnector, "kind" | "label" | "sourcePortId" | "targetPortId" | "lineStyle" | "markerStart" | "markerEnd" | "linePattern" | "color" | "strokeWidth">>) => {
    const sanitizedUpdates: Partial<Pick<
      CreateArchitectureConnectorRequest,
      "kind" | "label" | "sourcePortId" | "targetPortId" | "lineStyle" | "markerStart" | "markerEnd" | "linePattern" | "color" | "strokeWidth"
    >> = {};

    if (updates.kind !== undefined) sanitizedUpdates.kind = updates.kind;
    if (updates.label !== undefined) sanitizedUpdates.label = updates.label;
    if (updates.lineStyle !== undefined) sanitizedUpdates.lineStyle = updates.lineStyle as CreateArchitectureConnectorRequest["lineStyle"]; 
    if (updates.markerStart !== undefined) sanitizedUpdates.markerStart = updates.markerStart as CreateArchitectureConnectorRequest["markerStart"];
    if (updates.markerEnd !== undefined) sanitizedUpdates.markerEnd = updates.markerEnd as CreateArchitectureConnectorRequest["markerEnd"];
    if (updates.linePattern !== undefined) sanitizedUpdates.linePattern = updates.linePattern as CreateArchitectureConnectorRequest["linePattern"];
    if (updates.color !== undefined) sanitizedUpdates.color = updates.color;
    if (updates.strokeWidth !== undefined) sanitizedUpdates.strokeWidth = updates.strokeWidth;
    if (updates.sourcePortId !== undefined) sanitizedUpdates.sourcePortId = updates.sourcePortId ?? undefined;
    if (updates.targetPortId !== undefined) sanitizedUpdates.targetPortId = updates.targetPortId ?? undefined;

    updateConnectorMutation.mutate({ connectorId, updates: sanitizedUpdates });
  }, [updateConnectorMutation]);

  const removeConnector = useCallback((connectorId: string) => {
    console.log("[ArchitectureAPI] removeConnector called with ID:", connectorId);
    console.log("[ArchitectureAPI] activeDiagramId:", activeDiagramId);
    console.log("[ArchitectureAPI] tenant:", tenant, "project:", project);
    deleteConnectorMutation.mutate(connectorId);
    console.log("[ArchitectureAPI] deleteConnectorMutation.mutate called");
  }, [deleteConnectorMutation, activeDiagramId, tenant, project]);

  const clearArchitecture = useCallback(() => {
    if (!activeDiagramId) return;
    blocks.forEach(block => deleteBlockMutation.mutate(block.id));
    connectors.forEach(connector => deleteConnectorMutation.mutate(connector.id));
  }, [activeDiagramId, blocks, connectors, deleteBlockMutation, deleteConnectorMutation]);

  const addDocumentToBlock = useCallback((blockId: string, documentId: string) => {
    const block = blocks.find(b => b.id === blockId);
    if (!block) return;

    const currentDocIds = block.documentIds || [];
    if (currentDocIds.includes(documentId)) return;

    const updatedDocIds = [...currentDocIds, documentId];
    if (!activeDiagramId) return;
    updateBlockMutation.mutate({
      blockId,
      updates: { diagramId: activeDiagramId, documentIds: updatedDocIds }
    });
  }, [activeDiagramId, blocks, updateBlockMutation]);

  const removeDocumentFromBlock = useCallback((blockId: string, documentId: string) => {
    const block = blocks.find(b => b.id === blockId);
    if (!block) return;

    const updatedDocIds = (block.documentIds || []).filter(id => id !== documentId);
    if (!activeDiagramId) return;
    updateBlockMutation.mutate({
      blockId,
      updates: { diagramId: activeDiagramId, documentIds: updatedDocIds }
    });
  }, [activeDiagramId, blocks, updateBlockMutation]);

  const setBlockDocuments = useCallback((blockId: string, documentIds: string[]) => {
    if (!activeDiagramId) return;
    updateBlockMutation.mutate({
      blockId,
      updates: { diagramId: activeDiagramId, documentIds }
    });
  }, [activeDiagramId, updateBlockMutation]);

  const createDiagram = useCallback((input: { name: string; description?: string; view?: ArchitectureDiagramRecord["view"] }) => {
    if (!tenant || !project) return Promise.reject(new Error("Missing tenant or project"));
    return createDiagramMutation.mutateAsync(input);
  }, [createDiagramMutation, tenant, project]);

  const renameDiagram = useCallback((diagramId: string, updates: { name?: string; description?: string; view?: ArchitectureDiagramRecord["view"] }) => {
    return updateDiagramMutation.mutateAsync({ diagramId, updates });
  }, [updateDiagramMutation]);

  const deleteDiagram = useCallback((diagramId: string) => {
    if (!diagramId) return Promise.resolve();
    if (diagrams.length <= 1) {
      return Promise.reject(new Error("At least one diagram must remain"));
    }
    if (diagramId === activeDiagramId) {
      setActiveDiagramId(null);
    }
    return deleteDiagramMutation.mutateAsync(diagramId);
  }, [activeDiagramId, deleteDiagramMutation, diagrams.length]);

  return {
    architecture,
    diagrams,
    activeDiagram,
    activeDiagramId,
    setActiveDiagramId,
    createDiagram,
    renameDiagram,
    deleteDiagram,
    addBlock,
    reuseBlock,
    updateBlock,
    updateBlockPosition,
    updateBlockSize,
    removeBlock,
    addPort,
    updatePort,
    removePort,
    addConnector,
    updateConnector,
    removeConnector,
    clearArchitecture,
    addDocumentToBlock,
    removeDocumentFromBlock,
    setBlockDocuments,
    blocksLibrary,
    hasChanges: blocks.length > 0 || connectors.length > 0,
    isLoading:
      diagramsQuery.isLoading ||
      (Boolean(activeDiagramId) && (blocksQuery.isLoading || connectorsQuery.isLoading)),
    isLibraryLoading: blockLibraryQuery.isLoading,
    error: diagramsQuery.error || blocksQuery.error || connectorsQuery.error,
    libraryError: blockLibraryQuery.error
  };
}
