/**
 * SaveViewDialog Component
 *
 * Modal dialog for saving the current graph view configuration.
 */

interface SaveViewDialogProps {
  show: boolean;
  viewName: string;
  onViewNameChange: (name: string) => void;
  onSave: () => void;
  onCancel: () => void;
}

export function SaveViewDialog({
  show,
  viewName,
  onViewNameChange,
  onSave,
  onCancel,
}: SaveViewDialogProps) {
  if (!show) return null;

  return (
    <div className="save-dialog-overlay" onClick={onCancel}>
      <div className="save-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="save-dialog-header">
          <h3>Save Current View</h3>
          <button
            onClick={onCancel}
            className="save-dialog-close"
          >
            ×
          </button>
        </div>
        <div className="save-dialog-content">
          <label htmlFor="view-name">View Name:</label>
          <input
            id="view-name"
            type="text"
            value={viewName}
            onChange={(e) => onViewNameChange(e.target.value)}
            placeholder="Enter view name..."
            className="save-dialog-input"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                onSave();
              } else if (e.key === 'Escape') {
                onCancel();
              }
            }}
            autoFocus
          />
        </div>
        <div className="save-dialog-footer">
          <button
            onClick={onCancel}
            className="save-dialog-btn save-dialog-btn-cancel"
          >
            Cancel
          </button>
          <button
            onClick={onSave}
            className="save-dialog-btn save-dialog-btn-save"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
