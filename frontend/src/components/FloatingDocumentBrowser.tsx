import { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { DocumentManager } from "./FileManager/DocumentManager";
import { CreateDocumentModal } from "./CreateDocumentModal";
import { CreateFolderModal } from "./CreateFolderModal";
import { UploadSurrogateModal } from "./UploadSurrogateModal";
import { useApiClient } from "../lib/client";
import { useFloatingDocuments } from "../contexts/FloatingDocumentsContext";
import { Spinner } from "./Spinner";

interface FloatingDocumentBrowserProps {
  tenant: string;
  project: string;
  zIndex: number;
  onClose: () => void;
  onBringToFront: () => void;
  onSendToBack: () => void;
  initialPosition?: { x: number; y: number };
}

export function FloatingDocumentBrowser({
  tenant,
  project,
  zIndex,
  onClose,
  onBringToFront,
  onSendToBack,
  initialPosition = { x: 100, y: 100 }
}: FloatingDocumentBrowserProps) {
  const api = useApiClient();
  const { openFloatingDocument } = useFloatingDocuments();

  const [position, setPosition] = useState(initialPosition);
  const [size, setSize] = useState({ width: 1200, height: 800 });
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [resizeStart, setResizeStart] = useState({ x: 0, y: 0, width: 0, height: 0 });
  const windowRef = useRef<HTMLDivElement>(null);

  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showCreateFolderModal, setShowCreateFolderModal] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [createFolderParent, setCreateFolderParent] = useState<string | undefined>(undefined);
  const [createDocumentParent, setCreateDocumentParent] = useState<string | undefined>(undefined);
  const [uploadParentFolder, setUploadParentFolder] = useState<string | undefined>(undefined);

  const documentsQuery = useQuery({
    queryKey: ["documents", tenant, project],
    queryFn: () => api.listDocuments(tenant, project),
    enabled: Boolean(tenant && project),
    refetchInterval: 5000,
    refetchOnWindowFocus: true
  });

  const foldersQuery = useQuery({
    queryKey: ["folders", tenant, project],
    queryFn: () => api.listFolders(tenant, project),
    enabled: Boolean(tenant && project),
    refetchInterval: 5000,
    refetchOnWindowFocus: true
  });

  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest(".floating-browser-header")) {
      setIsDragging(true);
      setDragOffset({
        x: e.clientX - position.x,
        y: e.clientY - position.y
      });
    }
  };

  const handleResizeMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
    setResizeStart({
      x: e.clientX,
      y: e.clientY,
      width: size.width,
      height: size.height
    });
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        setPosition({
          x: e.clientX - dragOffset.x,
          y: e.clientY - dragOffset.y
        });
      } else if (isResizing) {
        const deltaX = e.clientX - resizeStart.x;
        const deltaY = e.clientY - resizeStart.y;
        setSize({
          width: Math.max(800, resizeStart.width + deltaX),
          height: Math.max(600, resizeStart.height + deltaY)
        });
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      setIsResizing(false);
    };

    if (isDragging || isResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, isResizing, dragOffset, resizeStart]);

  // Persist window position and size
  useEffect(() => {
    const key = `airgen:document-browser:${tenant}:${project}:window`;
    if (typeof window !== "undefined") {
      try {
        const saved = window.localStorage.getItem(key);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed.position) {
            setPosition(parsed.position);
          }
          if (parsed.size) {
            setSize(parsed.size);
          }
        }
      } catch (error) {
        console.warn("Failed to load document browser window state", error);
      }
    }
  }, [tenant, project]);

  useEffect(() => {
    const key = `airgen:document-browser:${tenant}:${project}:window`;
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(key, JSON.stringify({ position, size }));
      } catch (error) {
        console.warn("Failed to persist document browser window state", error);
      }
    }
  }, [position, size, tenant, project]);

  const documents = documentsQuery.data?.documents ?? [];
  const folders = foldersQuery.data?.folders ?? [];

  return (
    <>
      <div
        ref={windowRef}
        className="floating-document-window floating-browser-window"
        style={{
          position: "fixed",
          left: position.x,
          top: position.y,
          width: `${size.width}px`,
          height: `${size.height}px`,
          background: "white",
          border: "1px solid #cbd5e1",
          borderRadius: "8px",
          boxShadow: "0 10px 40px rgba(0, 0, 0, 0.2)",
          zIndex,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden"
        }}
        onMouseDown={handleMouseDown}
      >
        <div
          className="floating-browser-header"
          style={{
            padding: "12px 16px",
            borderBottom: "1px solid #e2e8f0",
            background: "#f8fafc",
            cursor: isDragging ? "grabbing" : "grab",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            userSelect: "none"
          }}
        >
          <div>
            <div style={{ fontWeight: 600, color: "#1f2937" }}>Documents Browser</div>
            <div style={{ fontSize: "12px", color: "#64748b" }}>
              {project}
            </div>
          </div>

          <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
            <button
              onClick={(e) => { e.stopPropagation(); onBringToFront(); }}
              title="Bring to front"
              style={{
                border: "none",
                background: "transparent",
                cursor: "pointer",
                padding: "4px",
                color: "#64748b",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: "4px",
                transition: "background 0.2s"
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "#e2e8f0";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <rect x="7" y="7" width="10" height="10" rx="1" fill="white" stroke="currentColor" />
              </svg>
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onSendToBack(); }}
              title="Send to back"
              style={{
                border: "none",
                background: "transparent",
                cursor: "pointer",
                padding: "4px",
                color: "#64748b",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: "4px",
                transition: "background 0.2s"
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "#e2e8f0";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="7" y="7" width="10" height="10" rx="1" fill="white" stroke="currentColor" />
                <rect x="3" y="3" width="18" height="18" rx="2" />
              </svg>
            </button>
            <button
              onClick={onClose}
              style={{
                border: "none",
                background: "transparent",
                cursor: "pointer",
                padding: "4px",
                color: "#64748b",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: "4px",
                transition: "background 0.2s"
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "#e2e8f0";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
        </div>

        <div style={{ flex: 1, overflow: "auto", position: "relative" }}>
          {documentsQuery.isLoading || foldersQuery.isLoading ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
              <Spinner />
            </div>
          ) : (
            <DocumentManager
              tenant={tenant}
              project={project}
              folders={folders}
              documents={documents}
              onOpenDocument={(documentSlug) => {
                const doc = documents.find(d => d.slug === documentSlug);
                if (doc) {
                  openFloatingDocument({
                    tenant,
                    project,
                    documentSlug,
                    documentName: doc.name,
                    kind: doc.kind === "surrogate" ? "surrogate" : "structured",
                    downloadUrl: doc.downloadUrl,
                    mimeType: doc.mimeType,
                    originalFileName: doc.originalFileName,
                    previewDownloadUrl: doc.previewDownloadUrl,
                    previewMimeType: doc.previewMimeType
                  });
                }
              }}
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
                // Could open markdown editor in another floating window
                console.log("Edit markdown:", documentSlug, documentName);
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
          )}
        </div>

        <div
          style={{
            position: "absolute",
            right: 0,
            bottom: 0,
            width: "16px",
            height: "16px",
            cursor: "nwse-resize",
            background: "#cbd5e1",
            borderTopLeftRadius: "4px",
            borderBottomRightRadius: "7px"
          }}
          onMouseDown={handleResizeMouseDown}
        />
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
          documentsQuery.refetch();
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
          foldersQuery.refetch();
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
    </>
  );
}
