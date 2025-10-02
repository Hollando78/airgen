import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { useApiClient } from "../lib/client";
import { Spinner } from "./Spinner";

interface FloatingSurrogateDocumentWindowProps {
  tenant: string;
  project: string;
  documentSlug: string;
  documentName: string;
  downloadUrl?: string;
  mimeType?: string | null;
  originalFileName?: string | null;
  previewDownloadUrl?: string | null;
  previewMimeType?: string | null;
  initialPosition?: { x: number; y: number };
  onClose: () => void;
}

function canPreviewInline(mimeType?: string | null): boolean {
  if (!mimeType) {return false;}
  const normalized = mimeType.toLowerCase();
  if (normalized.startsWith("image/")) {return true;}
  if (["application/pdf", "text/plain", "text/markdown", "text/csv", "text/html"].includes(normalized)) {
    return true;
  }
  if (normalized.startsWith("text/")) {return true;}
  // PowerPoint files are converted to PDF previews by the backend
  if ([
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/vnd.ms-powerpoint.presentation.macroEnabled.12"  // .pptm
  ].includes(normalized)) {
    return true;
  }
  // Word and Excel files are also converted to PDF previews
  if ([
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-word.document.macroEnabled.12"  // .docm
  ].includes(normalized)) {
    return true;
  }
  if ([
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-excel.sheet.macroEnabled.12"  // .xlsm
  ].includes(normalized)) {
    return true;
  }
  return false;
}

function isConvertedPreview(originalMimeType?: string | null, previewMimeType?: string | null): boolean {
  if (!originalMimeType || !previewMimeType) {return false;}
  const original = originalMimeType.toLowerCase();
  const preview = previewMimeType.toLowerCase();

  // Check if preview is PDF but original is an Office format
  if (preview === "application/pdf") {
    const officeFormats = [
      "application/vnd.ms-powerpoint",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    ];
    return officeFormats.includes(original);
  }
  return false;
}

export function FloatingSurrogateDocumentWindow({
  tenant,
  project,
  documentSlug,
  documentName,
  downloadUrl,
  mimeType,
  originalFileName,
  previewDownloadUrl,
  previewMimeType,
  initialPosition = { x: 150, y: 150 },
  onClose
}: FloatingSurrogateDocumentWindowProps) {
  const api = useApiClient();
  const windowRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);

  const [position, setPosition] = useState(initialPosition);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [isMinimized, setIsMinimized] = useState(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [downloadName, setDownloadName] = useState<string>(originalFileName || documentName);
  const [previewMime, setPreviewMime] = useState<string | undefined>(previewMimeType ?? mimeType ?? undefined);
  const [size, setSize] = useState<{ width: number; height: number }>({ width: 640, height: 520 });
  const [isResizing, setIsResizing] = useState(false);
  const resizeStartRef = useRef<{ x: number; y: number; width: number; height: number } | null>(null);

  useEffect(() => {
    let abort = false;
    let currentUrl: string | null = null;

    async function fetchFile() {
      const previewSourceUrl = previewDownloadUrl ?? downloadUrl;
      if (!previewSourceUrl) {
        setError("Preview is not available for this document.");
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const { blob, fileName } = await api.downloadDocumentFile(
          previewSourceUrl,
          `${documentSlug}-preview`
        );
        if (abort) {return;}
        currentUrl = URL.createObjectURL(blob);
        setObjectUrl(currentUrl);
        setDownloadName(fileName);
        if (!previewMime && blob.type) {
          setPreviewMime(blob.type);
        }
      } catch (err) {
        if (!abort) {
          setError((err as Error).message || "Failed to load document");
        }
      } finally {
        if (!abort) {
          setLoading(false);
        }
      }
    }

    fetchFile();

    return () => {
      abort = true;
      if (currentUrl) {
        URL.revokeObjectURL(currentUrl);
      }
    };
  }, [api, previewDownloadUrl, downloadUrl, documentSlug, originalFileName]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) {return;}

      const deltaX = e.clientX - dragStart.x;
      const deltaY = e.clientY - dragStart.y;

      setPosition(prev => ({
        x: prev.x + deltaX,
        y: prev.y + deltaY
      }));

      setDragStart({ x: e.clientX, y: e.clientY });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.userSelect = "none";
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.userSelect = "";
    };
  }, [isDragging, dragStart]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest(".window-controls")) {return;}
    setIsDragging(true);
    setDragStart({ x: e.clientX, y: e.clientY });
  };

  const handleDownload = async () => {
    const sourceUrl = downloadUrl ?? previewDownloadUrl;
    if (!sourceUrl) {return;}
    try {
      const { blob, fileName } = await api.downloadDocumentFile(sourceUrl, downloadName);
      const link = document.createElement("a");
      const url = URL.createObjectURL(blob);
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError((err as Error).message || "Failed to download document");
    }
  };

  const previewSupported = useMemo(() => canPreviewInline(previewMime), [previewMime]);

  const handleResizeMouseDown = (event: React.MouseEvent) => {
    event.stopPropagation();
    resizeStartRef.current = {
      x: event.clientX,
      y: event.clientY,
      width: size.width,
      height: size.height
    };
    setIsResizing(true);
  };

  useEffect(() => {
    const handleResizeMove = (event: MouseEvent) => {
      if (!isResizing || !resizeStartRef.current) {return;}

      const deltaX = event.clientX - resizeStartRef.current.x;
      const deltaY = event.clientY - resizeStartRef.current.y;
      const minWidth = 360;
      const minHeight = 240;
      const maxWidth = window.innerWidth - position.x - 40;
      const maxHeight = window.innerHeight - position.y - 40;

      const newWidth = Math.min(Math.max(resizeStartRef.current.width + deltaX, minWidth), maxWidth);
      const newHeight = Math.min(Math.max(resizeStartRef.current.height + deltaY, minHeight), maxHeight);

      setSize({ width: newWidth, height: newHeight });
    };

    const handleResizeUp = () => {
      setIsResizing(false);
      resizeStartRef.current = null;
    };

    if (isResizing) {
      document.addEventListener("mousemove", handleResizeMove);
      document.addEventListener("mouseup", handleResizeUp);
      document.body.style.userSelect = "none";
    }

    return () => {
      document.removeEventListener("mousemove", handleResizeMove);
      document.removeEventListener("mouseup", handleResizeUp);
      document.body.style.userSelect = "";
    };
  }, [isResizing, position.x, position.y, size.width, size.height]);

  const controlButtonStyle: CSSProperties = {
    color: "#ffffff",
    borderColor: "rgba(255,255,255,0.4)",
    width: "28px",
    height: "28px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 0
  };

  return (
    <div
      ref={windowRef}
      className="floating-document-window"
      style={{
        position: "fixed",
        left: `${position.x}px`,
        top: `${position.y}px`,
        width: isMinimized ? "560px" : `${size.width}px`,
        height: isMinimized ? "52px" : `${Math.min(size.height, window.innerHeight - position.y - 20)}px`,
        background: "#ffffff",
        border: "1px solid #cbd5e1",
        borderRadius: "8px",
        boxShadow: "0 10px 25px rgba(0, 0, 0, 0.2), 0 4px 10px rgba(0, 0, 0, 0.1)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        zIndex: 1100,
        transition: isMinimized ? "all 0.25s ease" : undefined
      }}
    >
      <div
        ref={headerRef}
        className="window-header"
        onMouseDown={handleMouseDown}
        style={{
          padding: isMinimized ? "8px 12px" : "12px 16px",
          background: "linear-gradient(to right, #3b82f6, #2563eb)",
          color: "#ffffff",
          cursor: isDragging ? "grabbing" : "grab",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          userSelect: "none",
          borderBottom: isMinimized ? "none" : "1px solid #2563eb",
          minHeight: isMinimized ? "28px" : "auto"
        }}
      >
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          flex: 1,
          overflow: "hidden",
          minWidth: 0
        }}>
          <svg
            width={isMinimized ? "14" : "16"}
            height={isMinimized ? "14" : "16"}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            style={{ flexShrink: 0 }}
          >
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14,2 14,8 20,8"/>
          </svg>
          <div style={{ display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>
            <span
              style={{
                fontWeight: 600,
                fontSize: isMinimized ? "13px" : "14px",
                whiteSpace: "nowrap",
                textOverflow: "ellipsis",
                overflow: "hidden"
              }}
            >
              {documentName}
            </span>
            {(originalFileName || downloadName) && !isMinimized && (
              <span style={{ fontSize: "12px", opacity: 0.9, whiteSpace: "nowrap", textOverflow: "ellipsis", overflow: "hidden" }}>
                {originalFileName || downloadName}
              </span>
            )}
          </div>
        </div>

        <div className="window-controls" style={{ display: "flex", gap: "6px" }}>
          <button
            onClick={handleDownload}
            className="ghost-button"
            title="Download"
            style={controlButtonStyle}
            disabled={loading || !downloadUrl}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
          </button>
          <button
            onClick={() => setIsMinimized(prev => !prev)}
            className="ghost-button"
            style={controlButtonStyle}
          >
            {isMinimized ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="5" y="5" width="14" height="14" rx="2" ry="2"/>
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
            )}
          </button>
          <button
            onClick={onClose}
            className="ghost-button"
            style={controlButtonStyle}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
      </div>

      {!isMinimized && (
        <div style={{ padding: "16px", overflow: "auto", flex: 1, background: "#f8fafc", position: "relative" }}>
          {isConvertedPreview(mimeType, previewMimeType) && !loading && !error && (
            <div style={{
              marginBottom: "12px",
              padding: "8px 12px",
              background: "#dbeafe",
              border: "1px solid #93c5fd",
              borderRadius: "6px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "12px"
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", color: "#1e40af" }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="12" y1="16" x2="12" y2="12"/>
                  <line x1="12" y1="8" x2="12.01" y2="8"/>
                </svg>
                <span>Viewing PDF preview of {originalFileName || downloadName}</span>
              </div>
              {downloadUrl && (
                <button
                  onClick={handleDownload}
                  style={{
                    padding: "4px 10px",
                    fontSize: "12px",
                    background: "#3b82f6",
                    color: "white",
                    border: "none",
                    borderRadius: "4px",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "4px",
                    fontWeight: 500,
                    whiteSpace: "nowrap"
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = "#2563eb"}
                  onMouseLeave={(e) => e.currentTarget.style.background = "#3b82f6"}
                  title="Download original file"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="7 10 12 15 17 10"/>
                    <line x1="12" y1="15" x2="12" y2="3"/>
                  </svg>
                  Download Original
                </button>
              )}
            </div>
          )}

          {loading && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
              <Spinner />
            </div>
          )}

          {!loading && error && (
            <div style={{
              padding: "16px",
              backgroundColor: "#fef2f2",
              border: "1px solid #fecaca",
              borderRadius: "8px",
              color: "#b91c1c"
            }}>
              <strong>Unable to display document.</strong>
              <div style={{ marginTop: "8px" }}>{error}</div>
            </div>
          )}

          {!loading && !error && previewSupported && objectUrl && (
            <div style={{ height: "100%", display: "flex", flexDirection: "column", gap: "12px" }}>
              {previewMime?.startsWith("image/") ? (
                <img
                  src={objectUrl}
                  alt={documentName}
                  style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", borderRadius: "8px", boxShadow: "0 1px 4px rgba(15, 23, 42, 0.15)" }}
                />
              ) : (
                <iframe
                  src={objectUrl}
                  title={documentName}
                  style={{ flex: 1, border: "1px solid #cbd5e1", borderRadius: "8px", backgroundColor: "#fff" }}
                />
              )}
            </div>
          )}

          {!loading && !error && (!previewSupported || !objectUrl) && (
            <div style={{
              padding: "16px",
              backgroundColor: "#eef2ff",
              border: "1px solid #c7d2fe",
              borderRadius: "8px",
              color: "#3730a3"
            }}>
              <p style={{ marginTop: 0 }}>Preview is not available for this file type.</p>
              <p style={{ fontSize: "14px" }}>
                Use the <strong>Download</strong> button to view <em>{originalFileName || downloadName}</em> in a native application.
              </p>
            </div>
          )}

          <div
            onMouseDown={handleResizeMouseDown}
            style={{
              position: "absolute",
              right: "4px",
              bottom: "4px",
              width: "16px",
              height: "16px",
              cursor: "se-resize",
              background: "linear-gradient(135deg, transparent 50%, rgba(59, 130, 246, 0.6) 50%)",
              borderRadius: "2px"
            }}
          />
        </div>
      )}
    </div>
  );
}
