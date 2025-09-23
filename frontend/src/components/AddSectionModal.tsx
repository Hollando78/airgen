import { useState } from "react";

interface AddSectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (section: { name: string; description: string }) => void;
}

export function AddSectionModal({
  isOpen,
  onClose,
  onAdd
}: AddSectionModalProps): JSX.Element | null {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) {
      onAdd({
        name: name.trim(),
        description: description.trim()
      });
      setName("");
      setDescription("");
      onClose();
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose} style={{
      position: "fixed",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: "rgba(0, 0, 0, 0.5)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 1100
    }}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{
        width: "500px",
        maxWidth: "90vw",
        maxHeight: "80vh",
        overflow: "auto",
        backgroundColor: "white",
        borderRadius: "8px",
        boxShadow: "0 10px 25px rgba(0, 0, 0, 0.1)"
      }}>
        <div className="modal-header">
          <h2>Add New Section</h2>
          <button type="button" onClick={onClose} className="ghost-button">×</button>
        </div>
        
        <form onSubmit={handleSubmit} className="modal-body">
          <div className="form-field">
            <label htmlFor="section-name">Section Name *</label>
            <input
              id="section-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Security Requirements, Performance Criteria"
              required
              autoFocus
            />
          </div>

          <div className="form-field">
            <label htmlFor="section-description">Description</label>
            <textarea
              id="section-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of what this section contains..."
              rows={3}
            />
          </div>
          
          <div className="form-actions">
            <button type="button" onClick={onClose} className="ghost-button">
              Cancel
            </button>
            <button 
              type="submit" 
              disabled={!name.trim()}
              className="primary-button"
            >
              Add Section
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}