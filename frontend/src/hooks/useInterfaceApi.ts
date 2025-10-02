import { useCallback, useEffect, useMemo } from "react";
import type {
  BlockKind,
  ConnectorKind,
  PortDirection
} from "./useArchitectureApi";
import {
  useArchitecture,
  type SysmlBlock,
  type SysmlConnector
} from "./useArchitectureApi";
import { isInterfaceDiagram } from "../lib/architectureDiagrams";

export type InterfaceBlock = SysmlBlock;
export type InterfaceConnector = SysmlConnector;
export type { BlockKind, ConnectorKind, PortDirection };

function ensureInterfaceName(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    return "Interface View";
  }
  return trimmed.toLowerCase().includes("interface") ? trimmed : `${trimmed} Interface`;
}

export function useInterface(tenant: string | null, project: string | null) {
  const {
    architecture,
    diagrams: allDiagrams,
    activeDiagramId: baseActiveDiagramId,
    setActiveDiagramId: baseSetActiveDiagramId,
    createDiagram: baseCreateDiagram,
    renameDiagram: baseRenameDiagram,
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
    addDocumentToConnector,
    removeDocumentFromConnector,
    setConnectorDocuments,
    blocksLibrary,
    hasChanges,
    isLoading,
    isLibraryLoading,
    error,
    libraryError
  } = useArchitecture(tenant, project);

  const diagrams = useMemo(() => allDiagrams.filter(isInterfaceDiagram), [allDiagrams]);

  // Auto-create interface diagram if none exist
  useEffect(() => {
    if (tenant && project && allDiagrams.length > 0 && diagrams.length === 0) {
      baseCreateDiagram({
        name: "Interface View 1",
        view: "block"
      }).catch(err => {
        console.error("Failed to auto-create interface diagram:", err);
      });
    }
  }, [tenant, project, allDiagrams.length, diagrams.length, baseCreateDiagram]);

  const activeDiagramId = useMemo(() => {
    if (baseActiveDiagramId && diagrams.some(diagram => diagram.id === baseActiveDiagramId)) {
      return baseActiveDiagramId;
    }
    return diagrams[0]?.id ?? null;
  }, [baseActiveDiagramId, diagrams]);

  useEffect(() => {
    if (activeDiagramId !== baseActiveDiagramId) {
      baseSetActiveDiagramId(activeDiagramId);
    }
  }, [activeDiagramId, baseActiveDiagramId, baseSetActiveDiagramId]);

  const activeDiagram = useMemo(() => {
    if (!activeDiagramId) {
      return null;
    }
    const match = diagrams.find(diagram => diagram.id === activeDiagramId);
    return match ?? null;
  }, [diagrams, activeDiagramId]);

  const setActiveDiagramId = useCallback((diagramId: string | null) => {
    if (!diagramId) {
      baseSetActiveDiagramId(null);
      return;
    }
    if (diagrams.some(diagram => diagram.id === diagramId)) {
      baseSetActiveDiagramId(diagramId);
    }
  }, [diagrams, baseSetActiveDiagramId]);

  const createDiagram = useCallback((input: { name: string; description?: string }) => {
    return baseCreateDiagram({
      ...input,
      name: ensureInterfaceName(input.name),
      view: "block"
    });
  }, [baseCreateDiagram]);

  const renameDiagram = useCallback((diagramId: string, updates: { name?: string; description?: string }) => {
    return baseRenameDiagram(diagramId, {
      ...updates,
      name: updates.name ? ensureInterfaceName(updates.name) : updates.name
    });
  }, [baseRenameDiagram]);

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
    addDocumentToConnector,
    removeDocumentFromConnector,
    setConnectorDocuments,
    hasChanges,
    blocksLibrary,
    isLoading,
    isLibraryLoading,
    error,
    libraryError
  };
}
