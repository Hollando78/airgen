/**
 * Create Diagram Dialog Component
 *
 * Modal for creating new requirements schema diagrams
 */

export interface CreateDiagramDialogProps {
  isOpen: boolean;
  name: string;
  description: string;
  onNameChange: (name: string) => void;
  onDescriptionChange: (description: string) => void;
  onCreate: () => void;
  onClose: () => void;
  isLoading?: boolean;
}

export function CreateDiagramDialog({
  isOpen,
  name,
  description,
  onNameChange,
  onDescriptionChange,
  onCreate,
  onClose,
  isLoading
}: CreateDiagramDialogProps): JSX.Element | null {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "500px" }}>
        <div className="modal-header">
          <h2>Create Requirements Schema Diagram</h2>
          <p>Create a new requirements schema diagram to map document relationships</p>
        </div>
        <div className="modal-content">
          <div className="field">
            <label htmlFor="name">Diagram Name</label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              placeholder="e.g., Project Requirements Schema"
            />
          </div>
          <div className="field">
            <label htmlFor="description">Description</label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => onDescriptionChange(e.target.value)}
              placeholder="Describe the purpose of this diagram..."
              rows={3}
            />
          </div>
        </div>
        <div className="modal-footer">
          <button type="button" className="ghost-button" onClick={onClose} disabled={isLoading}>
            Cancel
          </button>
          <button type="button" onClick={onCreate} disabled={isLoading}>
            {isLoading ? "Creating..." : "Create Diagram"}
          </button>
        </div>
      </div>
    </div>
  );
}
