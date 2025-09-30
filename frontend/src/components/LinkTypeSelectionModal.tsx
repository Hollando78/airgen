import { useState } from "react";
import type { TraceLinkType, RequirementRecord } from "../types";

interface LinkTypeSelectionModalProps {
  isOpen: boolean;
  sourceRequirement: RequirementRecord;
  targetRequirement: RequirementRecord;
  onConfirm: (linkType: TraceLinkType, description?: string) => void;
  onCancel: () => void;
}

const LINK_TYPES: Array<{ value: TraceLinkType; label: string; description: string; icon: string }> = [
  { 
    value: "satisfies", 
    label: "Satisfies", 
    description: "Target requirement satisfies source requirement",
    icon: "✓"
  },
  { 
    value: "derives", 
    label: "Derives From", 
    description: "Target requirement is derived from source requirement",
    icon: "↘"
  },
  { 
    value: "verifies", 
    label: "Verifies", 
    description: "Target requirement verifies source requirement",
    icon: "🔍"
  },
  { 
    value: "implements", 
    label: "Implements", 
    description: "Target requirement implements source requirement",
    icon: "⚙"
  },
  { 
    value: "refines", 
    label: "Refines", 
    description: "Target requirement refines source requirement",
    icon: "◆"
  },
  { 
    value: "conflicts", 
    label: "Conflicts With", 
    description: "Target requirement conflicts with source requirement",
    icon: "⚠"
  }
];

export function LinkTypeSelectionModal({
  isOpen,
  sourceRequirement,
  targetRequirement,
  onConfirm,
  onCancel
}: LinkTypeSelectionModalProps) {
  const [selectedType, setSelectedType] = useState<TraceLinkType>("satisfies");
  const [description, setDescription] = useState("");

  const handleConfirm = () => {
    onConfirm(selectedType, description.trim() || undefined);
    setDescription("");
    setSelectedType("satisfies");
  };

  const handleCancel = () => {
    onCancel();
    setDescription("");
    setSelectedType("satisfies");
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={handleCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "600px" }}>
        <div className="modal-header">
          <h3>Create Trace Link</h3>
          <button className="modal-close" onClick={handleCancel}>×</button>
        </div>
        
        <div className="modal-content">
          {/* Requirements Summary */}
          <div style={{ 
            backgroundColor: "#f9fafb", 
            borderRadius: "6px", 
            padding: "12px",
            marginBottom: "20px"
          }}>
            <div style={{ marginBottom: "12px" }}>
              <div style={{ fontSize: "11px", color: "#6b7280", marginBottom: "4px" }}>FROM (Source)</div>
              <div style={{ fontWeight: "600", color: "#111827" }}>{sourceRequirement.ref}</div>
              <div style={{ fontSize: "13px", color: "#374151", marginTop: "2px" }}>
                {sourceRequirement.text.substring(0, 100)}{sourceRequirement.text.length > 100 ? '...' : ''}
              </div>
            </div>
            
            <div style={{ 
              display: "flex", 
              alignItems: "center", 
              justifyContent: "center",
              margin: "12px 0",
              color: "#9ca3af"
            }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 5v14M5 12h14"/>
              </svg>
            </div>
            
            <div>
              <div style={{ fontSize: "11px", color: "#6b7280", marginBottom: "4px" }}>TO (Target)</div>
              <div style={{ fontWeight: "600", color: "#111827" }}>{targetRequirement.ref}</div>
              <div style={{ fontSize: "13px", color: "#374151", marginTop: "2px" }}>
                {targetRequirement.text.substring(0, 100)}{targetRequirement.text.length > 100 ? '...' : ''}
              </div>
            </div>
          </div>

          {/* Link Type Selection */}
          <div style={{ marginBottom: "20px" }}>
            <label style={{ 
              display: "block", 
              marginBottom: "8px", 
              fontWeight: "600",
              fontSize: "14px",
              color: "#374151"
            }}>
              Select Link Type
            </label>
            
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
              {LINK_TYPES.map(linkType => (
                <button
                  key={linkType.value}
                  onClick={() => setSelectedType(linkType.value)}
                  style={{
                    padding: "12px",
                    border: selectedType === linkType.value ? "2px solid #3b82f6" : "1px solid #e5e7eb",
                    borderRadius: "6px",
                    backgroundColor: selectedType === linkType.value ? "#eff6ff" : "white",
                    textAlign: "left",
                    cursor: "pointer",
                    transition: "all 0.2s"
                  }}
                  onMouseEnter={(e) => {
                    if (selectedType !== linkType.value) {
                      e.currentTarget.style.backgroundColor = "#f9fafb";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (selectedType !== linkType.value) {
                      e.currentTarget.style.backgroundColor = "white";
                    }
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                    <span style={{ fontSize: "16px" }}>{linkType.icon}</span>
                    <span style={{ 
                      fontWeight: selectedType === linkType.value ? "600" : "500",
                      color: selectedType === linkType.value ? "#1e40af" : "#374151"
                    }}>
                      {linkType.label}
                    </span>
                  </div>
                  <div style={{ 
                    fontSize: "11px", 
                    color: "#6b7280",
                    lineHeight: "1.3"
                  }}>
                    {linkType.description}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Optional Description */}
          <div>
            <label style={{ 
              display: "block", 
              marginBottom: "6px", 
              fontWeight: "600",
              fontSize: "14px",
              color: "#374151"
            }}>
              Description (Optional)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add any additional context or rationale for this link..."
              style={{
                width: "100%",
                padding: "8px 12px",
                border: "1px solid #d1d5db",
                borderRadius: "6px",
                fontSize: "14px",
                resize: "vertical",
                minHeight: "80px"
              }}
            />
          </div>
        </div>
        
        <div className="modal-footer">
          <button className="button" onClick={handleCancel}>
            Cancel
          </button>
          <button className="button button-primary" onClick={handleConfirm}>
            Create Link
          </button>
        </div>
      </div>
    </div>
  );
}