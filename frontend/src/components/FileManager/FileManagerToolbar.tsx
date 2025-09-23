import { useState } from "react";
import type { ViewMode, SortField, SortOrder } from "./DocumentManager";

interface FileManagerToolbarProps {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  sortField: SortField;
  sortOrder: SortOrder;
  onSortChange: (field: SortField, order: SortOrder) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onCreateFolder: () => void;
  onCreateDocument: () => void;
  selectedCount: number;
}

export function FileManagerToolbar({
  viewMode,
  onViewModeChange,
  sortField,
  sortOrder,
  onSortChange,
  searchQuery,
  onSearchChange,
  onCreateFolder,
  onCreateDocument,
  selectedCount
}: FileManagerToolbarProps) {
  const [showSortMenu, setShowSortMenu] = useState(false);

  const handleSortFieldChange = (field: SortField) => {
    if (field === sortField) {
      // Toggle order if same field
      onSortChange(field, sortOrder === "asc" ? "desc" : "asc");
    } else {
      // New field, default to ascending
      onSortChange(field, "asc");
    }
    setShowSortMenu(false);
  };

  return (
    <div className="file-manager-toolbar">
      <div className="toolbar-section">
        <div className="toolbar-group">
          <button
            className="primary-button toolbar-button"
            onClick={onCreateDocument}
            title="Create Document"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14,2 14,8 20,8"/>
              <line x1="12" y1="18" x2="12" y2="12"/>
              <line x1="9" y1="15" x2="15" y2="15"/>
            </svg>
            New Document
          </button>
          
          <button
            className="ghost-button toolbar-button"
            onClick={onCreateFolder}
            title="Create Folder"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
              <line x1="12" y1="11" x2="12" y2="17"/>
              <line x1="9" y1="14" x2="15" y2="14"/>
            </svg>
            New Folder
          </button>
        </div>

        {selectedCount > 0 && (
          <div className="toolbar-selection">
            <span className="selection-count">{selectedCount} selected</span>
          </div>
        )}
      </div>

      <div className="toolbar-section">
        <div className="search-box">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8"/>
            <path d="M21 21l-4.35-4.35"/>
          </svg>
          <input
            type="text"
            placeholder="Search files and folders..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="search-input"
          />
          {searchQuery && (
            <button
              onClick={() => onSearchChange("")}
              className="search-clear"
              title="Clear search"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          )}
        </div>

        <div className="toolbar-group">
          <div className="sort-dropdown">
            <button
              className="ghost-button toolbar-button"
              onClick={() => setShowSortMenu(!showSortMenu)}
              title="Sort options"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 6h18M7 12h10m-7 6h4"/>
              </svg>
              Sort
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="6,9 12,15 18,9"/>
              </svg>
            </button>

            {showSortMenu && (
              <div className="sort-menu">
                <button
                  onClick={() => handleSortFieldChange("name")}
                  className={`sort-option ${sortField === "name" ? "active" : ""}`}
                >
                  Name
                  {sortField === "name" && (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      {sortOrder === "asc" ? (
                        <polyline points="8,18 12,14 16,18"/>
                      ) : (
                        <polyline points="8,6 12,10 16,6"/>
                      )}
                    </svg>
                  )}
                </button>
                <button
                  onClick={() => handleSortFieldChange("modified")}
                  className={`sort-option ${sortField === "modified" ? "active" : ""}`}
                >
                  Modified
                  {sortField === "modified" && (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      {sortOrder === "asc" ? (
                        <polyline points="8,18 12,14 16,18"/>
                      ) : (
                        <polyline points="8,6 12,10 16,6"/>
                      )}
                    </svg>
                  )}
                </button>
                <button
                  onClick={() => handleSortFieldChange("size")}
                  className={`sort-option ${sortField === "size" ? "active" : ""}`}
                >
                  Items
                  {sortField === "size" && (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      {sortOrder === "asc" ? (
                        <polyline points="8,18 12,14 16,18"/>
                      ) : (
                        <polyline points="8,6 12,10 16,6"/>
                      )}
                    </svg>
                  )}
                </button>
              </div>
            )}
          </div>

          <div className="view-toggle">
            <button
              className={`ghost-button toolbar-button ${viewMode === "grid" ? "active" : ""}`}
              onClick={() => onViewModeChange("grid")}
              title="Grid view"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="7" height="7"/>
                <rect x="14" y="3" width="7" height="7"/>
                <rect x="14" y="14" width="7" height="7"/>
                <rect x="3" y="14" width="7" height="7"/>
              </svg>
            </button>
            <button
              className={`ghost-button toolbar-button ${viewMode === "list" ? "active" : ""}`}
              onClick={() => onViewModeChange("list")}
              title="List view"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="8" y1="6" x2="21" y2="6"/>
                <line x1="8" y1="12" x2="21" y2="12"/>
                <line x1="8" y1="18" x2="21" y2="18"/>
                <line x1="3" y1="6" x2="3.01" y2="6"/>
                <line x1="3" y1="12" x2="3.01" y2="12"/>
                <line x1="3" y1="18" x2="3.01" y2="18"/>
              </svg>
            </button>
          </div>
        </div>
      </div>

      {showSortMenu && (
        <div
          className="sort-menu-overlay"
          onClick={() => setShowSortMenu(false)}
        />
      )}
    </div>
  );
}