import { useEffect, useRef } from "react";
import type { FileItem } from "./DocumentManager";

interface ContextMenuProps {
  x: number;
  y: number;
  item: FileItem;
  onClose: () => void;
  onOpen: () => void;
  onDownload?: () => void;
  onRename: () => void;
  onDelete: () => void;
}

export function ContextMenu({ x, y, item, onClose, onOpen, onRename, onDelete, onDownload }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [onClose]);

  // Adjust position if menu would go off screen
  useEffect(() => {
    if (menuRef.current) {
      const rect = menuRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      let adjustedX = x;
      let adjustedY = y;

      if (x + rect.width > viewportWidth) {
        adjustedX = viewportWidth - rect.width - 10;
      }

      if (y + rect.height > viewportHeight) {
        adjustedY = viewportHeight - rect.height - 10;
      }

      menuRef.current.style.left = `${Math.max(10, adjustedX)}px`;
      menuRef.current.style.top = `${Math.max(10, adjustedY)}px`;
    }
  }, [x, y]);

  const isSurrogate = item.type === "document" && item.documentKind === "surrogate";

  const primaryAction = () => {
    if (isSurrogate && onDownload) {
      onDownload();
    } else {
      onOpen();
    }
  };

  return (
    <div 
      ref={menuRef}
      className="context-menu"
      style={{ left: x, top: y }}
    >
      <div className="context-menu-item" onClick={primaryAction}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          {item.type === "folder" ? (
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
          ) : (
            <>
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14,2 14,8 20,8"/>
            </>
          )}
        </svg>
        {item.type === "folder"
          ? "Open Folder"
          : isSurrogate
            ? "Download File"
            : "Open Document"}
      </div>

      <div className="context-menu-separator" />

      {isSurrogate && onDownload && (
        <>
          <div className="context-menu-item" onClick={() => onDownload()}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            Download File
          </div>
          <div className="context-menu-separator" />
        </>
      )}

      <div className="context-menu-item" onClick={onRename}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
        </svg>
        Rename {item.type === "folder" ? "Folder" : "Document"}
      </div>

      <div className="context-menu-item" onClick={() => {
        navigator.clipboard.writeText(item.name);
        onClose();
      }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
        </svg>
        Copy Name
      </div>

      <div className="context-menu-separator" />

      <div className="context-menu-item context-menu-item-danger" onClick={onDelete}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="3,6 5,6 21,6"/>
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
          <line x1="10" y1="11" x2="10" y2="17"/>
          <line x1="14" y1="11" x2="14" y2="17"/>
        </svg>
        Delete {item.type === "folder" ? "Folder" : "Document"}
      </div>

      <div className="context-menu-separator" />

      <div className="context-menu-info">
        <div className="info-row">
          <span className="info-label">Name:</span>
          <span className="info-value">{item.name}</span>
        </div>
        {item.description && (
          <div className="info-row">
            <span className="info-label">Description:</span>
            <span className="info-value">{item.description}</span>
          </div>
        )}
        <div className="info-row">
          <span className="info-label">Modified:</span>
          <span className="info-value">{new Date(item.updatedAt).toLocaleDateString()}</span>
        </div>
        <div className="info-row">
          <span className="info-label">{isSurrogate ? "Size:" : "Items:"}</span>
          <span className="info-value">
            {isSurrogate
              ? (() => {
                  if (!item.fileSize) {return "—";}
                  if (item.fileSize < 1024) {return `${item.fileSize} B`;}
                  const kb = item.fileSize / 1024;
                  if (kb < 1024) {return `${kb.toFixed(1)} KB`;}
                  const mb = kb / 1024;
                  if (mb < 1024) {return `${mb.toFixed(1)} MB`;}
                  const gb = mb / 1024;
                  return `${gb.toFixed(1)} GB`;
                })()
              : item.itemCount || 0}
          </span>
        </div>
      </div>
    </div>
  );
}
