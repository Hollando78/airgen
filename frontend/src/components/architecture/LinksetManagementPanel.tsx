import { useState, useEffect, useRef } from "react";
import type { DocumentLinkset, DocumentRecord } from "../../types";

interface LinksetManagementPanelProps {
  linksets: DocumentLinkset[];
  documents: DocumentRecord[];
  onCreateLinkset: (sourceDocSlug: string, targetDocSlug: string, defaultLinkType?: string) => Promise<void>;
  onUpdateLinkset: (linksetId: string, defaultLinkType: string) => Promise<void>;
  onDeleteLinkset: (linksetId: string) => Promise<void>;
  isAdmin: boolean;
}

interface ContextMenuState {
  isOpen: boolean;
  x: number;
  y: number;
  linkset: DocumentLinkset | null;
}

interface DeleteConfirmState {
  isOpen: boolean;
  linkset: DocumentLinkset | null;
}

interface EditDialogState {
  isOpen: boolean;
  linkset: DocumentLinkset | null;
  linkType: string;
}

const LINK_TYPES = [
  { value: "satisfies", label: "Satisfies", description: "Target satisfies source" },
  { value: "derives", label: "Derives From", description: "Target derives from source" },
  { value: "verifies", label: "Verifies", description: "Target verifies source" },
  { value: "implements", label: "Implements", description: "Target implements source" },
  { value: "refines", label: "Refines", description: "Target refines source" },
  { value: "conflicts", label: "Conflicts With", description: "Target conflicts with source" }
] as const;

export function LinksetManagementPanel({
  linksets,
  documents,
  onCreateLinkset,
  onUpdateLinkset,
  onDeleteLinkset,
  isAdmin
}: LinksetManagementPanelProps): JSX.Element {
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [sourceDocSlug, setSourceDocSlug] = useState("");
  const [targetDocSlug, setTargetDocSlug] = useState("");
  const [linkType, setLinkType] = useState("satisfies");
  const [isCreating, setIsCreating] = useState(false);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [isUpdating, setIsUpdating] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    isOpen: false,
    x: 0,
    y: 0,
    linkset: null
  });
  const [deleteConfirm, setDeleteConfirm] = useState<DeleteConfirmState>({
    isOpen: false,
    linkset: null
  });
  const [editDialog, setEditDialog] = useState<EditDialogState>({
    isOpen: false,
    linkset: null,
    linkType: "satisfies"
  });
  const contextMenuRef = useRef<HTMLDivElement>(null);

  // Debug: log isAdmin value
  console.log("[LinksetManagementPanel] isAdmin:", isAdmin);

  // Close context menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(event.target as Node)) {
        setContextMenu({ isOpen: false, x: 0, y: 0, linkset: null });
      }
    };

    if (contextMenu.isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [contextMenu.isOpen]);

  const handleCreate = async () => {
    if (!sourceDocSlug || !targetDocSlug) {
      return;
    }

    if (sourceDocSlug === targetDocSlug) {
      alert("Source and target documents must be different");
      return;
    }

    setIsCreating(true);
    try {
      await onCreateLinkset(sourceDocSlug, targetDocSlug, linkType);
      setSourceDocSlug("");
      setTargetDocSlug("");
      setLinkType("satisfies");
      setShowCreateDialog(false);
    } catch (error) {
      alert(`Failed to create linkset: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteConfirm.linkset) return;

    const linksetId = deleteConfirm.linkset.id;
    setIsDeleting(linksetId);
    setDeleteConfirm({ isOpen: false, linkset: null });

    try {
      await onDeleteLinkset(linksetId);
    } catch (error) {
      alert(`Failed to delete linkset: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsDeleting(null);
    }
  };

  const handleUpdateConfirm = async () => {
    if (!editDialog.linkset) return;

    const linksetId = editDialog.linkset.id;
    setIsUpdating(linksetId);

    try {
      await onUpdateLinkset(linksetId, editDialog.linkType);
      setEditDialog({ isOpen: false, linkset: null, linkType: "satisfies" });
    } catch (error) {
      alert(`Failed to update linkset: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsUpdating(null);
    }
  };

  return (
    <div className="architecture-hint">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <h3 style={{ margin: 0 }}>Link Sets</h3>
        {isAdmin && (
          <button
            type="button"
            className="ghost-button"
            onClick={() => setShowCreateDialog(true)}
            style={{ padding: "0.25rem 0.5rem", fontSize: "0.875rem" }}
          >
            + Create
          </button>
        )}
      </div>

      {linksets.length === 0 ? (
        <p style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>
          No linksets defined. {isAdmin && "Create a linkset to establish trace relationships between documents."}
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {linksets.map(linkset => (
            <div
              key={linkset.id}
              onContextMenu={(e) => {
                e.preventDefault();
                setContextMenu({
                  isOpen: true,
                  x: e.clientX,
                  y: e.clientY,
                  linkset
                });
              }}
              style={{
                padding: "0.75rem",
                backgroundColor: "var(--bg-secondary)",
                borderRadius: "0.375rem",
                border: "1px solid var(--border-color)",
                cursor: "context-menu"
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: "0.5rem" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: "0.875rem", fontWeight: 600, marginBottom: "0.25rem" }}>
                    {linkset.sourceDocument.name} → {linkset.targetDocument.name}
                  </div>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                    {linkset.linkCount} trace link{linkset.linkCount !== 1 ? "s" : ""}
                  </div>
                </div>
              </div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                <code style={{ backgroundColor: "var(--bg-tertiary)", padding: "0.125rem 0.25rem", borderRadius: "0.125rem" }}>
                  {linkset.sourceDocumentSlug}
                </code>
                {" → "}
                <code style={{ backgroundColor: "var(--bg-tertiary)", padding: "0.125rem 0.25rem", borderRadius: "0.125rem" }}>
                  {linkset.targetDocumentSlug}
                </code>
              </div>
            </div>
          ))}
        </div>
      )}

      {showCreateDialog && (
        <div className="modal-overlay" onClick={() => setShowCreateDialog(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "500px" }}>
            <div className="modal-header">
              <h2>Create Link Set</h2>
              <p>Define a directional link set between two documents</p>
            </div>
            <div className="modal-content">
              <div className="field">
                <label htmlFor="source-doc">Source Document</label>
                <select
                  id="source-doc"
                  value={sourceDocSlug}
                  onChange={(e) => setSourceDocSlug(e.target.value)}
                >
                  <option value="">Select source document...</option>
                  {documents.map(doc => (
                    <option key={doc.slug} value={doc.slug}>
                      {doc.name} ({doc.slug})
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="target-doc">Target Document</label>
                <select
                  id="target-doc"
                  value={targetDocSlug}
                  onChange={(e) => setTargetDocSlug(e.target.value)}
                >
                  <option value="">Select target document...</option>
                  {documents.map(doc => (
                    <option key={doc.slug} value={doc.slug}>
                      {doc.name} ({doc.slug})
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="link-type">Default Link Type</label>
                <select
                  id="link-type"
                  value={linkType}
                  onChange={(e) => setLinkType(e.target.value)}
                >
                  {LINK_TYPES.map(type => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
                <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.25rem" }}>
                  {LINK_TYPES.find(t => t.value === linkType)?.description}
                </div>
              </div>
              <div style={{ fontSize: "0.875rem", color: "var(--text-muted)", marginTop: "0.5rem" }}>
                <strong>Note:</strong> The linkset direction determines trace link flow. Requirements in the source document can trace to requirements in the target document.
              </div>
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="ghost-button"
                onClick={() => setShowCreateDialog(false)}
                disabled={isCreating}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreate}
                disabled={!sourceDocSlug || !targetDocSlug || isCreating}
              >
                {isCreating ? "Creating..." : "Create Link Set"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Context Menu */}
      {contextMenu.isOpen && contextMenu.linkset && (
        <div
          ref={contextMenuRef}
          style={{
            position: "fixed",
            top: contextMenu.y,
            left: contextMenu.x,
            backgroundColor: "#ffffff",
            border: "1px solid #d1d5db",
            borderRadius: "0.375rem",
            boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
            zIndex: 1000,
            minWidth: "180px",
            padding: "0.25rem"
          }}
        >
          <button
            type="button"
            onClick={() => {
              const linkset = contextMenu.linkset;
              if (linkset) {
                alert(`Linkset Details:\n\nSource: ${linkset.sourceDocument.name} (${linkset.sourceDocumentSlug})\nTarget: ${linkset.targetDocument.name} (${linkset.targetDocumentSlug})\nTrace Links: ${linkset.linkCount}\nCreated: ${new Date(linkset.createdAt).toLocaleString()}`);
              }
              setContextMenu({ isOpen: false, x: 0, y: 0, linkset: null });
            }}
            style={{
              width: "100%",
              padding: "0.5rem 0.75rem",
              textAlign: "left",
              backgroundColor: "transparent",
              border: "none",
              borderRadius: "0.25rem",
              cursor: "pointer",
              fontSize: "0.875rem",
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              color: "#374151"
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "#f3f4f6";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "transparent";
            }}
          >
            <span>ℹ️</span>
            <span>View Details</span>
          </button>

          {isAdmin ? (
            <button
              type="button"
              onClick={() => {
                const linkset = contextMenu.linkset;
                if (linkset) {
                  setEditDialog({
                    isOpen: true,
                    linkset,
                    linkType: linkset.defaultLinkType || "satisfies"
                  });
                }
                setContextMenu({ isOpen: false, x: 0, y: 0, linkset: null });
              }}
              style={{
                width: "100%",
                padding: "0.5rem 0.75rem",
                textAlign: "left",
                backgroundColor: "transparent",
                border: "none",
                borderRadius: "0.25rem",
                cursor: "pointer",
                fontSize: "0.875rem",
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                color: "#374151"
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "#f3f4f6";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "transparent";
              }}
            >
              <span>✏️</span>
              <span>Edit Link Type</span>
            </button>
          ) : null}

          {isAdmin ? (
            <button
              type="button"
              onClick={() => {
                const linkset = contextMenu.linkset;
                if (linkset) {
                  setDeleteConfirm({ isOpen: true, linkset });
                }
                setContextMenu({ isOpen: false, x: 0, y: 0, linkset: null });
              }}
              disabled={isDeleting === contextMenu.linkset?.id}
              style={{
                width: "100%",
                padding: "0.5rem 0.75rem",
                textAlign: "left",
                backgroundColor: "transparent",
                border: "none",
                borderRadius: "0.25rem",
                cursor: "pointer",
                fontSize: "0.875rem",
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                color: "#dc2626"
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "#fee2e2";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "transparent";
              }}
            >
              <span>🗑️</span>
              <span>{isDeleting === contextMenu.linkset?.id ? "Deleting..." : "Delete Linkset"}</span>
            </button>
          ) : (
            <div
              style={{
                width: "100%",
                padding: "0.5rem 0.75rem",
                textAlign: "left",
                fontSize: "0.875rem",
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                color: "#9ca3af",
                opacity: 0.5
              }}
            >
              <span>🗑️</span>
              <span>Delete Linkset (Admin only)</span>
            </div>
          )}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm.isOpen && deleteConfirm.linkset && (
        <div className="modal-overlay" onClick={() => setDeleteConfirm({ isOpen: false, linkset: null })}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "500px" }}>
            <div className="modal-header">
              <h2>Delete Link Set</h2>
              <p>Are you sure you want to delete this linkset?</p>
            </div>
            <div className="modal-content">
              <div style={{
                padding: "1rem",
                backgroundColor: "#fef3c7",
                borderRadius: "0.375rem",
                border: "1px solid #f59e0b",
                marginBottom: "1rem"
              }}>
                <div style={{ fontWeight: 600, marginBottom: "0.5rem", color: "#92400e" }}>
                  {deleteConfirm.linkset.sourceDocument.name} → {deleteConfirm.linkset.targetDocument.name}
                </div>
                <div style={{ fontSize: "0.875rem", color: "#78350f" }}>
                  <code style={{ backgroundColor: "#fde68a", padding: "0.125rem 0.25rem", borderRadius: "0.125rem" }}>
                    {deleteConfirm.linkset.sourceDocumentSlug}
                  </code>
                  {" → "}
                  <code style={{ backgroundColor: "#fde68a", padding: "0.125rem 0.25rem", borderRadius: "0.125rem" }}>
                    {deleteConfirm.linkset.targetDocumentSlug}
                  </code>
                </div>
                <div style={{ fontSize: "0.875rem", marginTop: "0.5rem", color: "#78350f" }}>
                  {deleteConfirm.linkset.linkCount} trace link{deleteConfirm.linkset.linkCount !== 1 ? "s" : ""}
                </div>
              </div>
              <div style={{ fontSize: "0.875rem", color: "#6b7280" }}>
                <strong>Note:</strong> This will remove the linkset container but will not delete the trace links from the database.
                The trace links will remain and can be accessed through other views.
              </div>
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="ghost-button"
                onClick={() => setDeleteConfirm({ isOpen: false, linkset: null })}
                disabled={isDeleting === deleteConfirm.linkset.id}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteConfirm}
                disabled={isDeleting === deleteConfirm.linkset.id}
                style={{
                  backgroundColor: "#dc2626",
                  color: "white",
                  border: "none",
                  padding: "0.5rem 1rem",
                  borderRadius: "0.375rem",
                  cursor: isDeleting === deleteConfirm.linkset.id ? "not-allowed" : "pointer",
                  opacity: isDeleting === deleteConfirm.linkset.id ? 0.6 : 1
                }}
              >
                {isDeleting === deleteConfirm.linkset.id ? "Deleting..." : "Delete Linkset"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Link Type Modal */}
      {editDialog.isOpen && editDialog.linkset && (
        <div className="modal-overlay" onClick={() => setEditDialog({ isOpen: false, linkset: null, linkType: "satisfies" })}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "500px" }}>
            <div className="modal-header">
              <h2>Edit Link Set</h2>
              <p>Change the default link type for this linkset</p>
            </div>
            <div className="modal-content">
              <div style={{
                padding: "0.75rem",
                backgroundColor: "var(--bg-secondary)",
                borderRadius: "0.375rem",
                border: "1px solid var(--border-color)",
                marginBottom: "1rem"
              }}>
                <div style={{ fontSize: "0.875rem", fontWeight: 600, marginBottom: "0.25rem" }}>
                  {editDialog.linkset.sourceDocument.name} → {editDialog.linkset.targetDocument.name}
                </div>
                <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                  {editDialog.linkset.linkCount} trace link{editDialog.linkset.linkCount !== 1 ? "s" : ""}
                </div>
              </div>
              <div className="field">
                <label htmlFor="edit-link-type">Default Link Type</label>
                <select
                  id="edit-link-type"
                  value={editDialog.linkType}
                  onChange={(e) => setEditDialog({ ...editDialog, linkType: e.target.value })}
                >
                  {LINK_TYPES.map(type => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
                <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.25rem" }}>
                  {LINK_TYPES.find(t => t.value === editDialog.linkType)?.description}
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="ghost-button"
                onClick={() => setEditDialog({ isOpen: false, linkset: null, linkType: "satisfies" })}
                disabled={isUpdating === editDialog.linkset.id}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleUpdateConfirm}
                disabled={isUpdating === editDialog.linkset.id}
              >
                {isUpdating === editDialog.linkset.id ? "Updating..." : "Update Link Type"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
