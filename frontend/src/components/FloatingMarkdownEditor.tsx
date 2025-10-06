import { useState, useRef, useEffect } from "react";
import { MarkdownEditorView } from "./MarkdownEditor/MarkdownEditorView";

interface FloatingMarkdownEditorProps {
  tenant: string;
  project: string;
  documentSlug: string;
  documentName: string;
  onClose: () => void;
  initialPosition?: { x: number; y: number };
}

export function FloatingMarkdownEditor({
  tenant,
  project,
  documentSlug,
  documentName,
  onClose,
  initialPosition = { x: 50, y: 50 }
}: FloatingMarkdownEditorProps) {
  const [position, setPosition] = useState(initialPosition);
  const [size, setSize] = useState({ width: 1400, height: 900 });
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [resizeStart, setResizeStart] = useState({ x: 0, y: 0, width: 0, height: 0 });
  const windowRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest(".floating-markdown-header")) {
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
    const key = `airgen:markdown-editor:${documentSlug}:window`;
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
        console.warn("Failed to load markdown editor window state", error);
      }
    }
  }, [documentSlug]);

  useEffect(() => {
    const key = `airgen:markdown-editor:${documentSlug}:window`;
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(key, JSON.stringify({ position, size }));
      } catch (error) {
        console.warn("Failed to persist markdown editor window state", error);
      }
    }
  }, [position, size, documentSlug]);

  return (
    <div
      ref={windowRef}
      className="floating-document-window floating-markdown-window"
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
        zIndex: 1000,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden"
      }}
      onMouseDown={handleMouseDown}
    >
      <div
        className="floating-markdown-header"
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
          <h3 style={{ margin: 0, fontSize: "14px", fontWeight: 600, color: "#1a1a1a" }}>
            Edit: {documentName}
          </h3>
        </div>
        <button
          onClick={onClose}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: "4px",
            borderRadius: "4px",
            color: "#64748b",
            display: "flex",
            alignItems: "center",
            justifyContent: "center"
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.background = "#e2e8f0";
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.background = "none";
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      <div style={{ flex: 1, overflow: "hidden", position: "relative" }}>
        <MarkdownEditorView
          tenant={tenant}
          project={project}
          documentSlug={documentSlug}
          documentName={documentName}
          onClose={onClose}
        />

        <div
          onMouseDown={handleResizeMouseDown}
          style={{
            position: "absolute",
            bottom: 0,
            right: 0,
            width: "20px",
            height: "20px",
            cursor: "nwse-resize",
            background: "linear-gradient(135deg, transparent 0%, transparent 50%, #94a3b8 50%, #94a3b8 100%)",
            borderBottomRightRadius: "8px",
            pointerEvents: "auto",
            zIndex: 10001
          }}
        />
      </div>
    </div>
  );
}
