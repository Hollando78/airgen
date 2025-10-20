import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTenantProjectDocument } from "../../components/TenantProjectDocumentSelector";
import { useApiClient } from "../../lib/client";
import { useInterface } from "../../hooks/useInterfaceApi";
import { InterfaceWorkspaceV2 } from "./InterfaceWorkspaceV2";
import { Card, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Network } from "lucide-react";

export function InterfaceRoute(): JSX.Element {
  const { tenant, project } = useTenantProjectDocument();

  if (!tenant || !project) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Network className="h-6 w-6" />
              Interfaces
            </CardTitle>
            <CardDescription>
              Select a tenant and project to manage interface diagrams.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return <InterfaceRouteContent tenant={tenant} project={project} />;
}

interface InterfaceRouteContentProps {
  tenant: string;
  project: string;
}

function InterfaceRouteContent({ tenant, project }: InterfaceRouteContentProps): JSX.Element {
  const api = useApiClient();
  const interfaceState = useInterface(tenant, project);

  const handleCreatePackage = useCallback(async (name: string, parentId?: string | null) => {
    await interfaceState.createPackage({ name, parentId });
  }, [interfaceState]);

  const handleUpdatePackage = useCallback(async (packageId: string, updates: { name: string }) => {
    await interfaceState.updatePackage(packageId, updates);
  }, [interfaceState]);

  const handleDeletePackage = useCallback(async (packageId: string, force?: boolean) => {
    await interfaceState.deletePackage(packageId, force);
  }, [interfaceState]);

  const handleMoveToPackage = useCallback(async (itemId: string, itemType: "package" | "block" | "diagram", targetPackageId: string | null) => {
    await interfaceState.moveToPackage(itemId, itemType, targetPackageId);
  }, [interfaceState]);

  const handleReorderInPackage = useCallback(async (packageId: string | null, itemIds: string[]) => {
    await interfaceState.reorderInPackage(packageId, itemIds);
  }, [interfaceState]);

  const documentsQuery = useQuery({
    queryKey: ["documents", tenant, project],
    queryFn: () => api.listDocuments(tenant, project),
    enabled: true
  });

  const documents = useMemo(
    () => documentsQuery.data?.documents ?? [],
    [documentsQuery.data?.documents]
  );

  return (
    <InterfaceWorkspaceV2
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
      addDocumentToConnector={interfaceState.addDocumentToConnector}
      removeDocumentFromConnector={interfaceState.removeDocumentFromConnector}
      blocksLibrary={interfaceState.blocksLibrary}
      packages={interfaceState.packages}
      connectors={interfaceState.connectors}
      connectorRecords={interfaceState.connectorRecords}
      createPackage={handleCreatePackage}
      updatePackage={handleUpdatePackage}
      deletePackage={handleDeletePackage}
      moveToPackage={handleMoveToPackage}
      reorderInPackage={handleReorderInPackage}
      isLibraryLoading={interfaceState.isLibraryLoading}
      isPackagesLoading={interfaceState.isPackagesLoading}
      libraryError={interfaceState.libraryError}
      packagesError={interfaceState.packagesError}
      hasChanges={interfaceState.hasChanges}
      isLoading={interfaceState.isLoading || documentsQuery.isLoading}
      documents={documents}
    />
  );
}
