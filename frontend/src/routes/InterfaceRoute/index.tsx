import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTenantProjectDocument } from "../../components/TenantProjectDocumentSelector";
import { useApiClient } from "../../lib/client";
import { useInterface } from "../../hooks/useInterfaceApi";
import { InterfaceWorkspace } from "./InterfaceWorkspace";

export function InterfaceRoute(): JSX.Element {
  const { tenant, project } = useTenantProjectDocument();
  const api = useApiClient();
  const interfaceState = useInterface(tenant, project);

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
        <h1>Interfaces</h1>
        <p>Select a tenant and project to manage interface diagrams.</p>
      </div>
    );
  }

  return (
    <InterfaceWorkspace
      tenant={tenant}
      project={project}
      architecture={interfaceState.architecture}
      diagrams={interfaceState.diagrams}
      activeDiagram={interfaceState.activeDiagram}
      activeDiagramId={interfaceState.activeDiagramId}
      setActiveDiagramId={interfaceState.setActiveDiagramId}
      createDiagram={interfaceState.createDiagram}
      renameDiagram={interfaceState.renameDiagram}
      deleteDiagram={interfaceState.deleteDiagram}
      addBlock={interfaceState.addBlock}
      reuseBlock={interfaceState.reuseBlock}
      updateBlock={interfaceState.updateBlock}
      updateBlockPosition={interfaceState.updateBlockPosition}
      updateBlockSize={interfaceState.updateBlockSize}
      removeBlock={interfaceState.removeBlock}
      addPort={interfaceState.addPort}
      updatePort={interfaceState.updatePort}
      removePort={interfaceState.removePort}
      addConnector={interfaceState.addConnector}
      updateConnector={interfaceState.updateConnector}
      removeConnector={interfaceState.removeConnector}
      clearArchitecture={interfaceState.clearArchitecture}
      addDocumentToBlock={interfaceState.addDocumentToBlock}
      removeDocumentFromBlock={interfaceState.removeDocumentFromBlock}
      blocksLibrary={interfaceState.blocksLibrary}
      isLibraryLoading={interfaceState.isLibraryLoading}
      libraryError={interfaceState.libraryError}
      hasChanges={interfaceState.hasChanges}
      isLoading={interfaceState.isLoading || documentsQuery.isLoading}
      documents={documents}
    />
  );
}
