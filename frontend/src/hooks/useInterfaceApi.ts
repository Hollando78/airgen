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
  UpdateArchitectureBlockRequest
} from "../types";

// Reuse the same types from architecture but with interface context
export interface InterfaceBlock {
  id: string;
  name: string;
  kind: BlockKind;
  stereotype?: string;
  description?: string;
  position: { x: number; y: number };
  size: { width: number; height: number };
  ports: InterfacePort[];
  documentIds?: string[];
}

export interface InterfacePort {
  id: string;
  name: string;
  direction: PortDirection;
}

export interface InterfaceConnector {
  id: string;
  source: string;
  target: string;
  kind: ConnectorKind;
  label?: string;
  sourcePortId?: string | null;
  targetPortId?: string | null;
}

export { BlockKind, ConnectorKind, PortDirection };

export interface InterfaceState {
  blocks: InterfaceBlock[];
  connectors: InterfaceConnector[];
  lastModified: string;
}

function mapBlockFromApi(block: ArchitectureBlockRecord): InterfaceBlock {
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

function mapConnectorFromApi(connector: ArchitectureConnectorRecord): InterfaceConnector {
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

export function useInterface(tenant: string | null, project: string | null) {
  const api = useApiClient();
  const queryClient = useQueryClient();

  const [activeDiagramId, setActiveDiagramId] = useState<string | null>(null);

  useEffect(() => {
    setActiveDiagramId(null);
  }, [tenant, project]);

  // Use separate query keys for interface diagrams
  const diagramsQuery = useQuery({
    queryKey: ["interface-diagrams", tenant, project],
    queryFn: () => api.listArchitectureDiagrams(tenant!, project!),
    enabled: Boolean(tenant && project)
  });

  // Filter to only interface diagrams (could be based on naming convention or metadata)
  const diagrams = useMemo<ArchitectureDiagramRecord[]>(() => {
    const allDiagrams = diagramsQuery.data?.diagrams ?? [];
    // For now, filter diagrams that have "interface" in the name or use a separate view type
    return allDiagrams.filter(diagram => 
      diagram.name.toLowerCase().includes('interface') || 
      diagram.view === 'interface' ||
      diagram.description?.toLowerCase().includes('interface')
    );
  }, [diagramsQuery.data?.diagrams]);

  useEffect(() => {
    if (diagrams.length > 0 && !activeDiagramId) {
      setActiveDiagramId(diagrams[0].id);
    }
  }, [diagrams, activeDiagramId]);

  const blocksQuery = useQuery({
    queryKey: ["interface-blocks", tenant, project, activeDiagramId],
    queryFn: () => api.listArchitectureBlocks(tenant!, project!, activeDiagramId!),
    enabled: Boolean(tenant && project && activeDiagramId)
  });

  const connectorsQuery = useQuery({
    queryKey: ["interface-connectors", tenant, project, activeDiagramId],
    queryFn: () => api.listArchitectureConnectors(tenant!, project!, activeDiagramId!),
    enabled: Boolean(tenant && project && activeDiagramId)
  });

  // Use separate query key for interface block library
  const blockLibraryQuery = useQuery({
    queryKey: ["interface-block-library", tenant, project],
    queryFn: () => api.listArchitectureBlockLibrary(tenant!, project!),
    enabled: Boolean(tenant && project)
  });

  const blocks = useMemo<InterfaceBlock[]>(
    () => (blocksQuery.data?.blocks ?? []).map(mapBlockFromApi),
    [blocksQuery.data?.blocks]
  );

  const connectors = useMemo<InterfaceConnector[]>(
    () => (connectorsQuery.data?.connectors ?? []).map(mapConnectorFromApi),
    [connectorsQuery.data?.connectors]
  );

  const blocksLibrary = useMemo<ArchitectureBlockLibraryRecord[]>(
    () => blockLibraryQuery.data?.blocks ?? [],
    [blockLibraryQuery.data?.blocks]
  );

  const architecture = useMemo<InterfaceState>(
    () => ({
      blocks,
      connectors,
      lastModified: Math.max(
        new Date(blocksQuery.dataUpdatedAt || 0).getTime(),
        new Date(connectorsQuery.dataUpdatedAt || 0).getTime()
      ).toString()
    }),
    [blocks, connectors, blocksQuery.dataUpdatedAt, connectorsQuery.dataUpdatedAt]
  );

  // Mutations for interface operations
  const createDiagramMutation = useMutation({
    mutationFn: (data: { name: string; description?: string }) =>
      api.createArchitectureDiagram({
        tenant: tenant!,
        projectKey: project!,
        name: data.name,
        description: data.description,
        view: "interface" // Use interface view type
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["interface-diagrams", tenant, project] });
    }
  });

  const updateDiagramMutation = useMutation({
    mutationFn: (data: { diagramId: string; name?: string; description?: string }) =>
      api.updateArchitectureDiagram(tenant!, project!, data.diagramId, {
        name: data.name,
        description: data.description,
        view: "interface"
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["interface-diagrams", tenant, project] });
    }
  });

  const deleteDiagramMutation = useMutation({
    mutationFn: (diagramId: string) => api.deleteArchitectureDiagram(tenant!, project!, diagramId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["interface-diagrams", tenant, project] });
      if (activeDiagramId && diagrams.length <= 1) {
        setActiveDiagramId(null);
      }
    }
  });

  const createBlockMutation = useMutation({
    mutationFn: (data: any) => api.createArchitectureBlock(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["interface-blocks", tenant, project, activeDiagramId] });
      queryClient.invalidateQueries({ queryKey: ["interface-block-library", tenant, project] });
    }
  });

  const updateBlockMutation = useMutation({
    mutationFn: ({ blockId, ...data }: { blockId: string } & UpdateArchitectureBlockRequest) =>
      api.updateArchitectureBlock(tenant!, project!, activeDiagramId!, blockId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["interface-blocks", tenant, project, activeDiagramId] });
      queryClient.invalidateQueries({ queryKey: ["interface-block-library", tenant, project] });
    }
  });

  const deleteBlockMutation = useMutation({
    mutationFn: (blockId: string) => api.deleteArchitectureBlock(tenant!, project!, activeDiagramId!, blockId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["interface-blocks", tenant, project, activeDiagramId] });
      queryClient.invalidateQueries({ queryKey: ["interface-block-library", tenant, project] });
    }
  });

  const createConnectorMutation = useMutation({
    mutationFn: (data: any) => api.createArchitectureConnector(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["interface-connectors", tenant, project, activeDiagramId] });
    }
  });

  const deleteConnectorMutation = useMutation({
    mutationFn: (connectorId: string) => api.deleteArchitectureConnector(tenant!, project!, activeDiagramId!, connectorId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["interface-connectors", tenant, project, activeDiagramId] });
    }
  });

  // Helper functions
  const createDiagram = useCallback((name: string, description?: string) => {
    return createDiagramMutation.mutateAsync({ name, description });
  }, [createDiagramMutation]);

  const updateDiagram = useCallback((diagramId: string, name?: string, description?: string) => {
    return updateDiagramMutation.mutateAsync({ diagramId, name, description });
  }, [updateDiagramMutation]);

  const deleteDiagram = useCallback((diagramId: string) => {
    return deleteDiagramMutation.mutateAsync(diagramId);
  }, [deleteDiagramMutation]);

  return {
    // State
    architecture,
    diagrams,
    activeDiagramId,
    blocksLibrary,
    
    // Loading states
    isLoading: blocksQuery.isLoading || connectorsQuery.isLoading,
    isDiagramsLoading: diagramsQuery.isLoading,
    isLibraryLoading: blockLibraryQuery.isLoading,
    
    // Error states
    error: blocksQuery.error || connectorsQuery.error,
    diagramsError: diagramsQuery.error,
    libraryError: blockLibraryQuery.error,
    
    // Actions
    setActiveDiagramId,
    createDiagram,
    updateDiagram,
    deleteDiagram,
    
    // Block operations
    createBlock: createBlockMutation.mutateAsync,
    updateBlock: updateBlockMutation.mutateAsync,
    deleteBlock: deleteBlockMutation.mutateAsync,
    
    // Connector operations
    createConnector: createConnectorMutation.mutateAsync,
    deleteConnector: deleteConnectorMutation.mutateAsync,
    
    // Mutation states
    isCreatingDiagram: createDiagramMutation.isPending,
    isUpdatingDiagram: updateDiagramMutation.isPending,
    isDeletingDiagram: deleteDiagramMutation.isPending,
  };
}