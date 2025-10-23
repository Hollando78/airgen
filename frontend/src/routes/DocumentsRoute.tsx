import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTenantProjectDocument } from "../components/TenantProjectDocumentSelector";
import { CreateDocumentModal } from "../components/CreateDocumentModal";
import { CreateFolderModal } from "../components/CreateFolderModal";
import { DocumentManager } from "../components/FileManager/DocumentManager";
import { DocumentView } from "../components/DocumentView";
import { FloatingMarkdownEditor } from "../components/FloatingMarkdownEditor";
import { useApiClient } from "../lib/client";
import { Spinner } from "../components/Spinner";
import { ErrorState } from "../components/ErrorState";
import "../components/FileManager/FileManager.css";
import { UploadSurrogateModal } from "../components/UploadSurrogateModal";
import { useFloatingDocuments } from "../contexts/FloatingDocumentsContext";
import { PageLayout } from "../components/layout/PageLayout";
import { EmptyState } from "../components/ui/empty-state";
import { FileText } from "lucide-react";

export function DocumentsRoute(): JSX.Element {
  const api = useApiClient();
  const { openFloatingDocument } = useFloatingDocuments();
  const { tenant, project } = useTenantProjectDocument();

  // Early return BEFORE other hooks to avoid React error #185
  if (!tenant || !project) {
    return (
      <PageLayout
        title="Documents"
        description="Organize requirements into structured documents"
      >
        <EmptyState
          icon={FileText}
          title="No Project Selected"
          description="Select a tenant and project to view and manage documents."
        />
      </PageLayout>
    );
  }

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
    enabled: Boolean(tenant && project),
    refetchInterval: 5000, // Auto-refresh every 5 seconds
    refetchOnWindowFocus: true // Refresh when tab gains focus
  });

  const foldersQuery = useQuery({
    queryKey: ["folders", tenant, project],
    queryFn: () => api.listFolders(tenant!, project!),
    enabled: Boolean(tenant && project),
    refetchInterval: 5000, // Auto-refresh every 5 seconds
    refetchOnWindowFocus: true // Refresh when tab gains focus
  });

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

  const handlePopOutBrowser = () => {
    openFloatingDocument({
      tenant: tenant!,
      project: project!,
      documentName: "Documents Browser",
      kind: "browser"
    });
  };

  return (
    <>
      <PageLayout
        title="Documents"
        description={`Organize requirements into structured documents for ${project}`}
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Documents' }
        ]}
        actions={
          <button
            onClick={handlePopOutBrowser}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "8px 16px",
              fontSize: "14px",
              fontWeight: 500,
              color: "#1f2937",
              background: "white",
              border: "1px solid #d1d5db",
              borderRadius: "6px",
              cursor: "pointer",
              transition: "all 0.2s"
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "#f9fafb";
              e.currentTarget.style.borderColor = "#9ca3af";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "white";
              e.currentTarget.style.borderColor = "#d1d5db";
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
              <polyline points="15 3 21 3 21 9"/>
              <line x1="10" y1="14" x2="21" y2="3"/>
            </svg>
            Pop Out Browser
          </button>
        }
      >
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
      </PageLayout>

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
        <FloatingMarkdownEditor
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
