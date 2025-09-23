import { useState } from "react";
import type { RequirementPattern, VerificationMethod } from "../types";

interface AddRequirementModalProps {
  isOpen: boolean;
  sectionName: string;
  onClose: () => void;
  onAdd: (requirement: {
    title: string;
    text: string;
    pattern?: RequirementPattern;
    verification?: VerificationMethod;
  }) => void;
}

export function AddRequirementModal({
  isOpen,
  sectionName,
  onClose,
  onAdd
}: AddRequirementModalProps): JSX.Element | null {
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [pattern, setPattern] = useState<RequirementPattern | "">("");
  const [verification, setVerification] = useState<VerificationMethod | "">("");

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (title.trim() && text.trim()) {
      onAdd({
        title: title.trim(),
        text: text.trim(),
        pattern: pattern as RequirementPattern || undefined,
        verification: verification as VerificationMethod || undefined
      });
      setTitle("");
      setText("");
      setPattern("");
      setVerification("");
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
        width: "600px",
        maxWidth: "90vw",
        maxHeight: "80vh",
        overflow: "auto",
        backgroundColor: "white",
        borderRadius: "8px",
        boxShadow: "0 10px 25px rgba(0, 0, 0, 0.1)"
      }}>
        <div className="modal-header">
          <h2>Add Requirement to {sectionName}</h2>
          <button type="button" onClick={onClose} className="ghost-button">×</button>
        </div>
        
        <form onSubmit={handleSubmit} className="modal-body">
          <div className="form-field">
            <label htmlFor="req-title">Title *</label>
            <input
              id="req-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., User authentication system"
              required
              autoFocus
            />
          </div>

          <div className="form-field">
            <label htmlFor="req-text">Requirement Text *</label>
            <textarea
              id="req-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="The system shall..."
              rows={4}
              required
            />
          </div>

          <div className="form-field">
            <label htmlFor="req-pattern">Pattern</label>
            <select
              id="req-pattern"
              value={pattern}
              onChange={(e) => setPattern(e.target.value as RequirementPattern)}
            >
              <option value="">Select pattern (optional)</option>
              <option value="ubiquitous">Ubiquitous</option>
              <option value="event">Event</option>
              <option value="state">State</option>
              <option value="unwanted">Unwanted</option>
              <option value="optional">Optional</option>
            </select>
          </div>

          <div className="form-field">
            <label htmlFor="req-verification">Verification Method</label>
            <select
              id="req-verification"
              value={verification}
              onChange={(e) => setVerification(e.target.value as VerificationMethod)}
            >
              <option value="">Select method (optional)</option>
              <option value="Test">Test</option>
              <option value="Analysis">Analysis</option>
              <option value="Inspection">Inspection</option>
              <option value="Demonstration">Demonstration</option>
            </select>
          </div>
          
          <div className="form-actions">
            <button type="button" onClick={onClose} className="ghost-button">
              Cancel
            </button>
            <button 
              type="submit" 
              disabled={!title.trim() || !text.trim()}
              className="primary-button"
            >
              Add Requirement
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}