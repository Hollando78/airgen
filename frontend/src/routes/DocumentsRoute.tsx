import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTenantProjectDocument } from "../components/TenantProjectDocumentSelector";
import { CreateDocumentModal } from "../components/CreateDocumentModal";
import { CreateFolderModal } from "../components/CreateFolderModal";
import { DocumentTree } from "../components/DocumentTree";
import { DocumentView } from "../components/DocumentView";
import { useApiClient } from "../lib/client";
import { Spinner } from "../components/Spinner";
import { ErrorState } from "../components/ErrorState";

export function DocumentsRoute(): JSX.Element {
  const api = useApiClient();
  const { tenant, project } = useTenantProjectDocument();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showCreateFolderModal, setShowCreateFolderModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState<string | null>(null);
  const [openedDocument, setOpenedDocument] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const documentsQuery = useQuery({
    queryKey: ["documents", tenant, project],
    queryFn: () => api.listDocuments(tenant!, project!),
    enabled: Boolean(tenant && project)
  });

  const foldersQuery = useQuery({
    queryKey: ["folders", tenant, project],
    queryFn: () => api.listFolders(tenant!, project!),
    enabled: Boolean(tenant && project)
  });

  if (!tenant || !project) {
    return (
      <div className="panel">
        <div className="panel-header">
          <h1>Documents</h1>
          <p>Select a tenant and project to view documents.</p>
        </div>
      </div>
    );
  }

  if (documentsQuery.isLoading || foldersQuery.isLoading) {
    return <Spinner />;
  }

  if (documentsQuery.isError) {
    return <ErrorState message={(documentsQuery.error as Error).message} />;
  }

  if (foldersQuery.isError) {
    return <ErrorState message={(foldersQuery.error as Error).message} />;
  }

  const documents = documentsQuery.data?.documents ?? [];
  const folders = foldersQuery.data?.folders ?? [];

  return (
    <>
      <div className="panel">
        <div className="panel-header">
          <div>
            <h1>Documents</h1>
            <p>Organize requirements into structured documents for {project}.</p>
          </div>
        </div>

        <DocumentTree
          tenant={tenant}
          project={project}
          folders={folders}
          documents={documents}
          selectedItem={selectedItem}
          onSelectItem={(type, slug) => setSelectedItem(slug)}
          onOpenDocument={(documentSlug) => setOpenedDocument(documentSlug)}
          onCreateFolder={() => setShowCreateFolderModal(true)}
          onCreateDocument={() => setShowCreateModal(true)}
        />
      </div>

      {showCreateModal && (
        <CreateDocumentModal
          tenant={tenant}
          project={project}
          onClose={() => setShowCreateModal(false)}
          onCreated={() => {
            queryClient.invalidateQueries({ queryKey: ["documents", tenant, project] });
          }}
        />
      )}

      {showCreateFolderModal && (
        <CreateFolderModal
          tenant={tenant}
          project={project}
          onClose={() => setShowCreateFolderModal(false)}
          onCreated={() => {
            queryClient.invalidateQueries({ queryKey: ["folders", tenant, project] });
          }}
        />
      )}

      {openedDocument && tenant && project && (
        <DocumentView
          tenant={tenant}
          project={project}
          documentSlug={openedDocument}
          onClose={() => setOpenedDocument(null)}
        />
      )}
    </>
  );
}