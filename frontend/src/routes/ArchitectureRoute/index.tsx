import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTenantProjectDocument } from "../../components/TenantProjectDocumentSelector";
import { useApiClient } from "../../lib/client";
import { useArchitecture } from "../../hooks/useArchitectureApi";
import { ArchitectureWorkspace } from "./ArchitectureWorkspace";

export function ArchitectureRoute(): JSX.Element {
  const { tenant, project } = useTenantProjectDocument();
  const api = useApiClient();
  const architecture = useArchitecture(tenant, project);

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
      architecture={architecture.architecture}
      diagrams={architecture.diagrams}
      activeDiagram={architecture.activeDiagram}
      activeDiagramId={architecture.activeDiagramId}
      setActiveDiagramId={architecture.setActiveDiagramId}
      createDiagram={architecture.createDiagram}
      renameDiagram={architecture.renameDiagram}
      deleteDiagram={architecture.deleteDiagram}
      addBlock={architecture.addBlock}
      reuseBlock={architecture.reuseBlock}
      updateBlock={architecture.updateBlock}
      updateBlockPosition={architecture.updateBlockPosition}
      updateBlockSize={architecture.updateBlockSize}
      removeBlock={architecture.removeBlock}
      addPort={architecture.addPort}
      updatePort={architecture.updatePort}
      removePort={architecture.removePort}
      addConnector={architecture.addConnector}
      updateConnector={architecture.updateConnector}
      removeConnector={architecture.removeConnector}
      clearArchitecture={architecture.clearArchitecture}
      addDocumentToBlock={architecture.addDocumentToBlock}
      removeDocumentFromBlock={architecture.removeDocumentFromBlock}
      blocksLibrary={architecture.blocksLibrary}
      isLibraryLoading={architecture.isLibraryLoading}
      libraryError={architecture.libraryError}
      hasChanges={architecture.hasChanges}
      isLoading={architecture.isLoading || documentsQuery.isLoading}
      documents={documents}
    />
  );
}
