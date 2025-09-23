import { useState, useEffect, useCallback, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "../lib/client";
import type {
  ArchitectureBlockRecord,
  ArchitectureConnectorRecord,
  BlockKind,
  PortDirection,
  BlockPortRecord,
  ConnectorKind
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
    documentIds: block.documentIds
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
    targetPortId: connector.targetPortId
  };
}

export function useArchitecture(tenant: string | null, project: string | null) {
  const api = useApiClient();
  const queryClient = useQueryClient();

  // Queries for blocks and connectors
  const blocksQuery = useQuery({
    queryKey: ["architecture-blocks", tenant, project],
    queryFn: () => api.listArchitectureBlocks(tenant!, project!),
    enabled: Boolean(tenant && project)
  });

  const connectorsQuery = useQuery({
    queryKey: ["architecture-connectors", tenant, project],
    queryFn: () => api.listArchitectureConnectors(tenant!, project!),
    enabled: Boolean(tenant && project)
  });

  // Mutations
  const createBlockMutation = useMutation({
    mutationFn: (block: {
      name: string;
      kind: BlockKind;
      stereotype?: string;
      description?: string;
      positionX: number;
      positionY: number;
      sizeWidth?: number;
      sizeHeight?: number;
      ports?: BlockPortRecord[];
    }) => api.createArchitectureBlock({
      tenant: tenant!,
      projectKey: project!,
      ...block
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["architecture-blocks", tenant, project] });
    }
  });

  const updateBlockMutation = useMutation({
    mutationFn: ({ blockId, updates }: { blockId: string; updates: any }) =>
      api.updateArchitectureBlock(tenant!, project!, blockId, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["architecture-blocks", tenant, project] });
    }
  });

  const deleteBlockMutation = useMutation({
    mutationFn: (blockId: string) => api.deleteArchitectureBlock(tenant!, project!, blockId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["architecture-blocks", tenant, project] });
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
    }) => api.createArchitectureConnector({
      tenant: tenant!,
      projectKey: project!,
      ...connector
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["architecture-connectors", tenant, project] });
    }
  });

  const deleteConnectorMutation = useMutation({
    mutationFn: (connectorId: string) => api.deleteArchitectureConnector(tenant!, project!, connectorId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["architecture-connectors", tenant, project] });
    }
  });

  // Transform API data with memoization to prevent infinite re-renders
  const blocks = useMemo(() => 
    blocksQuery.data?.blocks.map(mapBlockFromApi) ?? [], 
    [blocksQuery.data?.blocks]
  );
  
  const connectors = useMemo(() => 
    connectorsQuery.data?.connectors.map(mapConnectorFromApi) ?? [], 
    [connectorsQuery.data?.connectors]
  );

  const architecture: ArchitectureState = useMemo(() => ({
    blocks,
    connectors,
    lastModified: new Date(blocksQuery.dataUpdatedAt || connectorsQuery.dataUpdatedAt || Date.now()).toISOString()
  }), [blocks, connectors, blocksQuery.dataUpdatedAt, connectorsQuery.dataUpdatedAt]);

  // API wrapper functions
  const addBlock = useCallback((input: {
    name?: string;
    kind?: BlockKind;
    stereotype?: string;
    description?: string;
    x?: number;
    y?: number;
    size?: { width: number; height: number };
  } | { x: number; y: number }) => {
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
      ports: []
    };

    createBlockMutation.mutate(blockData);
    
    // Return a temporary ID for immediate feedback
    return `temp-${Date.now()}`;
  }, [createBlockMutation, blocks.length]);

  const updateBlock = useCallback((blockId: string, updates: Partial<Pick<SysmlBlock, "name" | "kind" | "stereotype" | "description">>) => {
    updateBlockMutation.mutate({ blockId, updates });
  }, [updateBlockMutation]);

  const updateBlockPosition = useCallback((blockId: string, position: { x: number; y: number }) => {
    updateBlockMutation.mutate({ 
      blockId, 
      updates: { positionX: position.x, positionY: position.y } 
    });
  }, [updateBlockMutation]);

  const updateBlockSize = useCallback((blockId: string, size: { width: number; height: number }) => {
    updateBlockMutation.mutate({ 
      blockId, 
      updates: { sizeWidth: size.width, sizeHeight: size.height } 
    });
  }, [updateBlockMutation]);

  const removeBlock = useCallback((blockId: string) => {
    deleteBlockMutation.mutate(blockId);
  }, [deleteBlockMutation]);

  const addPort = useCallback((blockId: string, port: { name: string; direction: PortDirection }) => {
    const block = blocks.find(b => b.id === blockId);
    if (!block) return;

    const newPort = {
      id: `port-${Date.now()}`,
      name: port.name,
      direction: port.direction
    };

    const updatedPorts = [...block.ports, newPort];
    updateBlockMutation.mutate({ 
      blockId, 
      updates: { ports: updatedPorts } 
    });
  }, [blocks, updateBlockMutation]);

  const updatePort = useCallback((blockId: string, portId: string, updates: { name?: string; direction?: PortDirection }) => {
    const block = blocks.find(b => b.id === blockId);
    if (!block) return;

    const updatedPorts = block.ports.map(port => 
      port.id === portId ? { ...port, ...updates } : port
    );

    updateBlockMutation.mutate({ 
      blockId, 
      updates: { ports: updatedPorts } 
    });
  }, [blocks, updateBlockMutation]);

  const removePort = useCallback((blockId: string, portId: string) => {
    const block = blocks.find(b => b.id === blockId);
    if (!block) return;

    const updatedPorts = block.ports.filter(port => port.id !== portId);
    updateBlockMutation.mutate({ 
      blockId, 
      updates: { ports: updatedPorts } 
    });
  }, [blocks, updateBlockMutation]);

  const addConnector = useCallback((input: {
    source: string;
    target: string;
    sourcePortId?: string | null;
    targetPortId?: string | null;
    kind?: ConnectorKind;
    label?: string;
  }) => {
    const connectorData = {
      source: input.source,
      target: input.target,
      kind: input.kind ?? 'association' as ConnectorKind,
      label: input.label,
      sourcePortId: input.sourcePortId || undefined,
      targetPortId: input.targetPortId || undefined
    };

    createConnectorMutation.mutate(connectorData);
    
    // Return a temporary ID for immediate feedback
    return `temp-connector-${Date.now()}`;
  }, [createConnectorMutation]);

  const updateConnector = useCallback((connectorId: string, updates: Partial<Pick<SysmlConnector, "kind" | "label">>) => {
    // Note: The backend doesn't have an update connector endpoint yet
    // For now, we'll need to delete and recreate
    console.warn("Connector updates not implemented in backend");
  }, []);

  const removeConnector = useCallback((connectorId: string) => {
    deleteConnectorMutation.mutate(connectorId);
  }, [deleteConnectorMutation]);

  const clearArchitecture = useCallback(() => {
    // Delete all blocks and connectors
    blocks.forEach(block => deleteBlockMutation.mutate(block.id));
    connectors.forEach(connector => deleteConnectorMutation.mutate(connector.id));
  }, [blocks, connectors, deleteBlockMutation, deleteConnectorMutation]);

  const addDocumentToBlock = useCallback((blockId: string, documentId: string) => {
    const block = blocks.find(b => b.id === blockId);
    if (!block) return;

    const currentDocIds = block.documentIds || [];
    if (currentDocIds.includes(documentId)) return;

    const updatedDocIds = [...currentDocIds, documentId];
    updateBlockMutation.mutate({ 
      blockId, 
      updates: { documentIds: updatedDocIds } 
    });
  }, [blocks, updateBlockMutation]);

  const removeDocumentFromBlock = useCallback((blockId: string, documentId: string) => {
    const block = blocks.find(b => b.id === blockId);
    if (!block) return;

    const updatedDocIds = (block.documentIds || []).filter(id => id !== documentId);
    updateBlockMutation.mutate({ 
      blockId, 
      updates: { documentIds: updatedDocIds } 
    });
  }, [blocks, updateBlockMutation]);

  const setBlockDocuments = useCallback((blockId: string, documentIds: string[]) => {
    updateBlockMutation.mutate({ 
      blockId, 
      updates: { documentIds } 
    });
  }, [updateBlockMutation]);

  return {
    architecture,
    addBlock,
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
    hasChanges: blocks.length > 0 || connectors.length > 0,
    isLoading: blocksQuery.isLoading || connectorsQuery.isLoading,
    error: blocksQuery.error || connectorsQuery.error
  };
}