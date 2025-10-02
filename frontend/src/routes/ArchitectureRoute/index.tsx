import { useCallback, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTenantProjectDocument } from "../../components/TenantProjectDocumentSelector";
import { useApiClient } from "../../lib/client";
import { useArchitecture } from "../../hooks/useArchitectureApi";
import { ArchitectureWorkspace } from "./ArchitectureWorkspace";
import { isArchitectureDiagram } from "../../lib/architectureDiagrams";
import type { ArchitectureDiagramRecord } from "../../types";

export function ArchitectureRoute(): JSX.Element {
  const { tenant, project } = useTenantProjectDocument();
  const api = useApiClient();
  const {
    architecture: architectureState,
    diagrams: allDiagrams,
    activeDiagramId: baseActiveDiagramId,
    setActiveDiagramId: baseSetActiveDiagramId,
    createDiagram: baseCreateDiagram,
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
    addDocumentToConnector,
    removeDocumentFromConnector,
    blocksLibrary,
    isLibraryLoading,
    libraryError,
    hasChanges,
    isLoading
  } = useArchitecture(tenant, project);

  const diagrams = useMemo(() => allDiagrams.filter(isArchitectureDiagram), [allDiagrams]);

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
    return diagrams.find(diagram => diagram.id === activeDiagramId) ?? null;
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

  const createDiagram = useCallback((input: { name: string; description?: string; view?: ArchitectureDiagramRecord["view"] }) => {
    const payload: { name: string; description?: string; view?: ArchitectureDiagramRecord["view"] } = {
      ...input,
      view: input.view ?? "block"
    };
    return baseCreateDiagram(payload);
  }, [baseCreateDiagram]);

  const documentsQuery = useQuery({
    queryKey: ["documents", tenant, project],
    queryFn: () => api.listDocuments(tenant!, project!),
    enabled: Boolean(tenant && project)
  });

  const documents = useMemo(
    () => documentsQuery.data?.documents ?? [],
    [documentsQuery.data?.documents]
  );

  if (!tenant || !project) {
    return (
      <div className="architecture-empty-state">
        <h1>Architecture</h1>
        <p>Select a tenant and project to work on architectural diagrams.</p>
      </div>
    );
  }

  return (
    <ArchitectureWorkspace
      tenant={tenant}
      project={project}
      architecture={architectureState}
      diagrams={diagrams}
      activeDiagram={activeDiagram}
      activeDiagramId={activeDiagramId}
      setActiveDiagramId={setActiveDiagramId}
      createDiagram={createDiagram}
      renameDiagram={renameDiagram}
      deleteDiagram={deleteDiagram}
      addBlock={addBlock}
      reuseBlock={reuseBlock}
      updateBlock={updateBlock}
      updateBlockPosition={updateBlockPosition}
      updateBlockSize={updateBlockSize}
      removeBlock={removeBlock}
      addPort={addPort}
      updatePort={updatePort}
      removePort={removePort}
      addConnector={addConnector}
      updateConnector={updateConnector}
      removeConnector={removeConnector}
      clearArchitecture={clearArchitecture}
      addDocumentToBlock={addDocumentToBlock}
      removeDocumentFromBlock={removeDocumentFromBlock}
      addDocumentToConnector={addDocumentToConnector}
      removeDocumentFromConnector={removeDocumentFromConnector}
      blocksLibrary={blocksLibrary}
      isLibraryLoading={isLibraryLoading}
      libraryError={libraryError}
      hasChanges={hasChanges}
      isLoading={isLoading || documentsQuery.isLoading}
      documents={documents}
    />
  );
}
