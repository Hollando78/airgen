/**
 * Sections Sidebar Component
 *
 * Displays sections list with drag-and-drop reordering and action buttons
 */

import type { DocumentSectionRecord } from "../../types";

export interface SectionsSidebarProps {
  sections: DocumentSectionRecord[];
  selectedSection: string | null;
  draggedSection: string | null;
  onSectionSelect: (id: string) => void;
  onSectionEdit: (section: DocumentSectionRecord) => void;
  onDraggedSectionChange: (id: string | null) => void;
  onSectionReorder: (draggedId: string, targetId: string) => void;
  onAddSectionClick: () => void;
  onImportClick: () => void;
  onExportClick: () => void;
}

export function SectionsSidebar({
  sections,
  selectedSection,
  draggedSection,
  onSectionSelect,
  onSectionEdit,
  onDraggedSectionChange,
  onSectionReorder,
  onAddSectionClick,
  onImportClick,
  onExportClick
}: SectionsSidebarProps): JSX.Element {
  return (
    <div style={{
      width: "300px",
      borderRight: "1px solid #e2e8f0",
      backgroundColor: "#fafafa",
      padding: "16px",
      overflowY: "auto"
    }}>
      <h3 style={{ margin: "0 0 16px 0", fontSize: "16px" }}>Document Sections</h3>
      {[...sections]
        .sort((a, b) => a.order - b.order)
        .map(section => (
        <div
          key={section.id}
          draggable={true}
          onDragStart={(e) => {
            onDraggedSectionChange(section.id);
            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.setData("text/plain", section.id);
          }}
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
          }}
          onDrop={(e) => {
            e.preventDefault();
            const draggedId = e.dataTransfer.getData("text/plain");
            if (draggedId && draggedId !== section.id) {
              onSectionReorder(draggedId, section.id);
            }
            onDraggedSectionChange(null);
          }}
          onDragEnd={() => {
            onDraggedSectionChange(null);
          }}
          onClick={() => onSectionSelect(section.id)}
          style={{
            padding: "12px",
            marginBottom: "8px",
            borderRadius: "6px",
            cursor: draggedSection === section.id ? "grabbing" : "grab",
            backgroundColor: selectedSection === section.id ? "#e2e8f0" : "white",
            border: `1px solid ${draggedSection === section.id ? "#3b82f6" : "#e2e8f0"}`,
            opacity: draggedSection === section.id ? 0.5 : 1,
            transition: "all 0.2s ease"
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{
              color: "#64748b",
              fontSize: "12px",
              cursor: "grab",
              userSelect: "none"
            }}>
              ⋮⋮
            </span>
            <div style={{ fontWeight: "bold", fontSize: "14px", flex: 1 }}>
              {section.name}
              {section.shortCode && (
                <span style={{
                  fontSize: "10px",
                  backgroundColor: "#e0f2fe",
                  color: "#0369a1",
                  padding: "2px 6px",
                  borderRadius: "4px",
                  fontWeight: "600",
                  textTransform: "uppercase",
                  marginLeft: "8px"
                }}>
                  {section.shortCode}
                </span>
              )}
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onSectionEdit(section);
              }}
              style={{
                background: "none",
                border: "1px solid #d1d5db",
                borderRadius: "4px",
                padding: "4px 6px",
                fontSize: "10px",
                color: "#6b7280",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "2px"
              }}
              title="Edit section"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
              Edit
            </button>
          </div>
          <div style={{ fontSize: "12px", color: "#64748b", marginTop: "4px" }}>
            {((section as any).requirements || []).length} requirements, {((section as any).infos || []).length} infos
          </div>
          {section.description && (
            <div style={{ fontSize: "12px", color: "#64748b", marginTop: "4px" }}>
              {section.description}
            </div>
          )}
        </div>
      ))}

      <button
        onClick={onAddSectionClick}
        style={{
          width: "100%",
          padding: "12px",
          backgroundColor: "#3b82f6",
          color: "white",
          border: "none",
          borderRadius: "6px",
          cursor: "pointer",
          marginTop: "16px"
        }}
      >
        + Add Section
      </button>

      <button
        onClick={onImportClick}
        style={{
          width: "100%",
          padding: "12px",
          backgroundColor: "#dc2626",
          color: "white",
          border: "none",
          borderRadius: "6px",
          cursor: "pointer",
          marginTop: "8px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "8px"
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M3 15v4a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-4"/>
          <polyline points="17,8 12,3 7,8"/>
          <line x1="12" y1="3" x2="12" y2="15"/>
        </svg>
        Import Document
      </button>

      <button
        onClick={onExportClick}
        style={{
          width: "100%",
          padding: "12px",
          backgroundColor: "#059669",
          color: "white",
          border: "none",
          borderRadius: "6px",
          cursor: "pointer",
          marginTop: "8px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "8px"
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="7,10 12,15 17,10"/>
          <line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
        Export Document
      </button>
    </div>
  );
}
