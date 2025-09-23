import { useState } from "react";
import type { FileItem } from "./DocumentManager";

interface FileManagerGridProps {
  items: FileItem[];
  selectedItems: Set<string>;
  onSelectionChange: (selectedItems: Set<string>) => void;
  onItemDoubleClick: (item: FileItem) => void;
  onContextMenu: (e: React.MouseEvent, item: FileItem) => void;
  onDrop: (targetFolder: string | null) => void;
}

export function FileManagerGrid({
  items,
  selectedItems,
  onSelectionChange,
  onItemDoubleClick,
  onContextMenu,
  onDrop
}: FileManagerGridProps) {
  const [dragOver, setDragOver] = useState<string | null>(null);

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
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return "Today";
    } else if (diffDays === 1) {
      return "Yesterday";
    } else if (diffDays < 7) {
      return `${diffDays} days ago`;
    } else {
      return date.toLocaleDateString();
    }
  };

  const getFileIcon = (item: FileItem) => {
    if (item.type === "folder") {
      return (
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="file-icon folder-icon">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
        </svg>
      );
    } else {
      return (
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="file-icon document-icon">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14,2 14,8 20,8"/>
        </svg>
      );
    }
  };

  return (
    <div className="file-manager-grid">
      {items.map((item) => (
        <div
          key={item.id}
          className={`grid-item ${selectedItems.has(item.id) ? "selected" : ""} ${dragOver === item.id ? "drag-over" : ""}`}
          draggable={item.type === "document"}
          onClick={(e) => handleItemClick(item, e)}
          onDoubleClick={() => onItemDoubleClick(item)}
          onContextMenu={(e) => onContextMenu(e, item)}
          onDragStart={(e) => handleDragStart(e, item)}
          onDragOver={(e) => handleDragOver(e, item)}
          onDragLeave={handleDragLeave}
          onDrop={(e) => handleDrop(e, item)}
        >
          <div className="grid-item-icon">
            {getFileIcon(item)}
          </div>
          
          <div className="grid-item-content">
            <div className="grid-item-name" title={item.name}>
              {item.name}
            </div>
            
            <div className="grid-item-meta">
              {item.shortCode && (
                <div className="meta-line">
                  <span className="short-code" style={{ 
                    fontSize: "10px", 
                    backgroundColor: "#e0f2fe", 
                    color: "#0369a1", 
                    padding: "2px 6px", 
                    borderRadius: "4px",
                    fontWeight: "600",
                    textTransform: "uppercase"
                  }}>
                    {item.shortCode}
                  </span>
                </div>
              )}
              <div className="meta-line">
                {item.type === "folder" ? (
                  <span className="item-count">
                    {item.itemCount || 0} {item.itemCount === 1 ? "item" : "items"}
                  </span>
                ) : (
                  <span className="item-count">
                    {item.itemCount || 0} {item.itemCount === 1 ? "req" : "reqs"}
                  </span>
                )}
              </div>
              <div className="meta-line">
                <span className="date-modified">
                  {formatDate(item.updatedAt)}
                </span>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}