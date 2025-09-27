import { useState } from "react";
import type { FileItem } from "./DocumentManager";

interface FileManagerListProps {
  items: FileItem[];
  selectedItems: Set<string>;
  onSelectionChange: (selectedItems: Set<string>) => void;
  onItemDoubleClick: (item: FileItem) => void;
  onContextMenu: (e: React.MouseEvent, item: FileItem) => void;
  onDrop: (targetFolder: string | null) => void;
}

export function FileManagerList({
  items,
  selectedItems,
  onSelectionChange,
  onItemDoubleClick,
  onContextMenu,
  onDrop
}: FileManagerListProps) {
  const [dragOver, setDragOver] = useState<string | null>(null);

  const formatFileSize = (bytes?: number | null) => {
    if (!bytes || bytes <= 0) {
      return "—";
    }

    if (bytes < 1024) {
      return `${bytes} B`;
    }

    const kb = bytes / 1024;
    if (kb < 1024) {
      return `${kb.toFixed(1)} KB`;
    }

    const mb = kb / 1024;
    if (mb < 1024) {
      return `${mb.toFixed(1)} MB`;
    }

    const gb = mb / 1024;
    return `${gb.toFixed(1)} GB`;
  };

  const getSurrogateLabel = (item: FileItem) => {
    if (item.originalFileName) {
      const ext = item.originalFileName.split(".").pop();
      if (ext && ext.length <= 5) {
        return ext.toUpperCase();
      }
    }
    return item.mimeType || "Uploaded file";
  };

  const handleItemClick = (item: FileItem, event: React.MouseEvent) => {
    const newSelection = new Set(selectedItems);
    
    if (event.ctrlKey || event.metaKey) {
      // Multi-select with Ctrl/Cmd
      if (newSelection.has(item.id)) {
        newSelection.delete(item.id);
      } else {
        newSelection.add(item.id);
      }
    } else {
      // Single select
      newSelection.clear();
      newSelection.add(item.id);
    }
    
    onSelectionChange(newSelection);
  };

  const handleDragStart = (e: React.DragEvent, item: FileItem) => {
    e.dataTransfer.setData("text/plain", item.id);
    e.dataTransfer.effectAllowed = "move";
    
    // If dragging an unselected item, select only that item
    if (!selectedItems.has(item.id)) {
      onSelectionChange(new Set([item.id]));
    }
  };

  const handleDragOver = (e: React.DragEvent, item: FileItem) => {
    if (item.type === "folder") {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      setDragOver(item.id);
    }
  };

  const handleDragLeave = () => {
    setDragOver(null);
  };

  const handleDrop = (e: React.DragEvent, item: FileItem) => {
    e.preventDefault();
    setDragOver(null);
    
    if (item.type === "folder") {
      onDrop(item.slug);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString() + " " + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const getFileIcon = (item: FileItem) => {
    if (item.type === "folder") {
      return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="file-icon folder-icon">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
        </svg>
      );
    } else {
      return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="file-icon document-icon">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14,2 14,8 20,8"/>
        </svg>
      );
    }
  };

  return (
    <div className="file-manager-list">
      <div className="list-header">
        <div className="header-cell name-header">Name</div>
        <div className="header-cell type-header">Type</div>
        <div className="header-cell size-header">Items / Size</div>
        <div className="header-cell date-header">Modified</div>
      </div>
      
      <div className="list-body">
        {items.map((item) => (
          <div
            key={item.id}
            className={`list-item ${selectedItems.has(item.id) ? "selected" : ""} ${dragOver === item.id ? "drag-over" : ""}`}
            draggable={item.type === "document"}
            onClick={(e) => handleItemClick(item, e)}
            onDoubleClick={() => onItemDoubleClick(item)}
            onContextMenu={(e) => onContextMenu(e, item)}
            onDragStart={(e) => handleDragStart(e, item)}
            onDragOver={(e) => handleDragOver(e, item)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, item)}
          >
            <div className="list-cell name-cell">
              <div className="name-content">
                {getFileIcon(item)}
                <div className="name-text">
                  <div className="item-name" title={item.name}>
                    {item.name}
                    {item.shortCode && (
                      <span className="short-code" style={{ 
                        fontSize: "10px", 
                        backgroundColor: "#e0f2fe", 
                        color: "#0369a1", 
                        padding: "2px 6px", 
                        borderRadius: "4px",
                        fontWeight: "600",
                        textTransform: "uppercase",
                        marginLeft: "8px"
                      }}>
                        {item.shortCode}
                      </span>
                    )}
                  </div>
                  {item.description && (
                    <div className="item-description" title={item.description}>
                      {item.description}
                    </div>
                  )}
                </div>
              </div>
            </div>
            
            <div className="list-cell type-cell">
              <span className="item-type">
                {item.type === "folder"
                  ? "Folder"
                  : item.documentKind === "surrogate"
                    ? getSurrogateLabel(item)
                    : "Document"}
              </span>
            </div>
            
            <div className="list-cell size-cell">
              {item.type === "folder" ? (
                <span className="item-count">{item.itemCount || 0}</span>
              ) : item.documentKind === "surrogate" ? (
                <span className="item-count">{formatFileSize(item.fileSize)}</span>
              ) : (
                <span className="item-count">{item.itemCount || 0}</span>
              )}
            </div>
            
            <div className="list-cell date-cell">
              <span className="date-modified">
                {formatDate(item.updatedAt)}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
