import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTenantProjectDocument } from "../components/TenantProjectDocumentSelector";
import { CreateDocumentModal } from "../components/CreateDocumentModal";
import { CreateFolderModal } from "../components/CreateFolderModal";
import { DocumentManager } from "../components/FileManager/DocumentManager";
import { DocumentView } from "../components/DocumentView";
import { MarkdownEditorView } from "../components/MarkdownEditor/MarkdownEditorView";
import { useApiClient } from "../lib/client";
import { Spinner } from "../components/Spinner";
import { ErrorState } from "../components/ErrorState";
import "../components/FileManager/FileManager.css";
import { UploadSurrogateModal } from "../components/UploadSurrogateModal";
import { useFloatingDocuments } from "../contexts/FloatingDocumentsContext";

export function DocumentsRoute(): JSX.Element {
  const api = useApiClient();
  const { openFloatingDocument } = useFloatingDocuments();
  const { tenant, project } = useTenantProjectDocument();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showCreateFolderModal, setShowCreateFolderModal] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [openedDocument, setOpenedDocument] = useState<string | null>(null);
  const [markdownEditor, setMarkdownEditor] = useState<{ slug: string; name: string } | null>(null);
  const [createFolderParent, setCreateFolderParent] = useState<string | undefined>(undefined);
  const [createDocumentParent, setCreateDocumentParent] = useState<string | undefined>(undefined);
  const [uploadParentFolder, setUploadParentFolder] = useState<string | undefined>(undefined);
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
      <div className="panel-stack">
        <div className="panel">
          <div className="panel-header">
            <div>
              <h1>Documents</h1>
              <p>Organize requirements into structured documents for {project}.</p>
            </div>
          </div>

          <DocumentManager
            tenant={tenant}
            project={project}
            folders={folders}
            documents={documents}
            onOpenDocument={(documentSlug) => setOpenedDocument(documentSlug)}
            onCreateFolder={(parentFolder) => {
              setCreateFolderParent(parentFolder);
              setShowCreateFolderModal(true);
            }}
            onCreateDocument={(parentFolder) => {
              setCreateDocumentParent(parentFolder);
              setShowCreateModal(true);
            }}
            onUploadSurrogate={(parentFolder) => {
              setUploadParentFolder(parentFolder);
              setShowUploadModal(true);
            }}
            onEditMarkdown={(documentSlug, documentName) => {
              setMarkdownEditor({ slug: documentSlug, name: documentName });
            }}
            onOpenSurrogate={(doc) => {
              const match = documents.find(d => d.slug === doc.slug);
              openFloatingDocument({
                tenant,
                project,
                documentSlug: doc.slug,
                documentName: doc.name,
                kind: "surrogate",
                downloadUrl: match?.downloadUrl ?? doc.downloadUrl ?? null,
                mimeType: match?.mimeType ?? doc.mimeType ?? null,
                originalFileName: match?.originalFileName ?? doc.originalFileName ?? null,
                previewDownloadUrl: match?.previewDownloadUrl ?? doc.previewDownloadUrl ?? null,
                previewMimeType: match?.previewMimeType ?? doc.previewMimeType ?? null
              });
            }}
          />
        </div>
      </div>

      <CreateDocumentModal
        isOpen={showCreateModal}
        tenant={tenant}
        project={project}
        parentFolder={createDocumentParent}
        onClose={() => {
          setShowCreateModal(false);
          setCreateDocumentParent(undefined);
        }}
        onCreated={() => {
          queryClient.invalidateQueries({ queryKey: ["documents", tenant, project] });
          setShowCreateModal(false);
          setCreateDocumentParent(undefined);
        }}
      />

      <CreateFolderModal
        isOpen={showCreateFolderModal}
        tenant={tenant}
        project={project}
        parentFolder={createFolderParent}
        onClose={() => {
          setShowCreateFolderModal(false);
          setCreateFolderParent(undefined);
        }}
        onCreated={() => {
          queryClient.invalidateQueries({ queryKey: ["folders", tenant, project] });
          setShowCreateFolderModal(false);
          setCreateFolderParent(undefined);
        }}
      />

      <UploadSurrogateModal
        isOpen={showUploadModal}
        tenant={tenant}
        project={project}
        parentFolder={uploadParentFolder}
        onClose={() => {
          setShowUploadModal(false);
          setUploadParentFolder(undefined);
        }}
      />

      {openedDocument && tenant && project && (
        <DocumentView
          tenant={tenant}
          project={project}
          documentSlug={openedDocument}
          onClose={() => setOpenedDocument(null)}
        />
      )}

      {markdownEditor && tenant && project && (
        <MarkdownEditorView
          tenant={tenant}
          project={project}
          documentSlug={markdownEditor.slug}
          documentName={markdownEditor.name}
          onClose={() => setMarkdownEditor(null)}
        />
      )}
    </>
  );
}
