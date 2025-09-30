import { useEffect, useRef, useState } from "react";
import type { RequirementRecord, TraceLink } from "../types";
import { useFloatingDocuments } from "../contexts/FloatingDocumentsContext";
import { Button } from "./ui/button";

interface RequirementContextMenuProps {
  x: number;
  y: number;
  requirement: RequirementRecord;
  tenant: string;
  project: string;
  onClose: () => void;
  onStartLink?: (requirement: RequirementRecord) => void;
  onEndLink?: (requirement: RequirementRecord) => void;
  linkingRequirement?: RequirementRecord | null;
  traceLinks?: TraceLink[];
}

export function RequirementContextMenu({
  x,
  y,
  requirement,
  tenant,
  project,
  onClose,
  onStartLink,
  onEndLink,
  linkingRequirement,
  traceLinks = []
}: RequirementContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const { openFloatingDocument } = useFloatingDocuments();
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [onClose]);

  // Adjust position if menu would go off screen
  useEffect(() => {
    if (menuRef.current) {
      const rect = menuRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      let adjustedX = x;
      let adjustedY = y;

      if (x + rect.width > viewportWidth) {
        adjustedX = viewportWidth - rect.width - 10;
      }

      if (y + rect.height > viewportHeight) {
        adjustedY = viewportHeight - rect.height - 10;
      }

      menuRef.current.style.left = `${Math.max(10, adjustedX)}px`;
      menuRef.current.style.top = `${Math.max(10, adjustedY)}px`;
    }
  }, [x, y]);

  const handleViewDetails = () => {
    setShowDetails(true);
  };

  const handleOpenInFloatingWindow = () => {
    const documentSlug = requirement.documentSlug || requirement.path;
    
    if (documentSlug) {
      openFloatingDocument({
        documentSlug,
        documentName: documentSlug,
        tenant,
        project,
        kind: "structured",
        focusRequirementId: requirement.id
      });
    }
    onClose();
  };

  const handleStartLink = () => {
    if (onStartLink) {
      onStartLink(requirement);
    }
    onClose();
  };

  const handleEndLink = () => {
    if (onEndLink) {
      onEndLink(requirement);
    }
    onClose();
  };

  const handleCopyRef = () => {
    navigator.clipboard.writeText(requirement.ref);
    onClose();
  };

  const handleCopyText = () => {
    navigator.clipboard.writeText(requirement.text);
    onClose();
  };

  // Count existing links
  const outgoingLinks = traceLinks.filter(link => link.sourceRequirementId === requirement.id);
  const incomingLinks = traceLinks.filter(link => link.targetRequirementId === requirement.id);

  const isLinkingActive = !!linkingRequirement;
  const isCurrentRequirementLinking = linkingRequirement?.id === requirement.id;

  return (
    <>
      <div 
        ref={menuRef}
        className="context-menu"
        style={{ 
          left: x, 
          top: y,
          position: "fixed",
          backgroundColor: "white",
          border: "1px solid #e5e7eb",
          borderRadius: "6px",
          boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1)",
          zIndex: 1000,
          minWidth: "220px",
          fontSize: "14px"
        }}
      >
        {/* Header with requirement ref */}
        <div style={{
          padding: "8px 12px",
          borderBottom: "1px solid #e5e7eb",
          fontWeight: "600",
          color: "#374151",
          fontSize: "12px",
          backgroundColor: "#f9fafb"
        }}>
          {requirement.ref}
        </div>

        {/* View Details */}
        <div className="context-menu-item" onClick={handleViewDetails}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
            <circle cx="12" cy="12" r="3"/>
          </svg>
          View Details
        </div>

        <div className="context-menu-item" onClick={handleOpenInFloatingWindow}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M13 3h8v8"/>
            <path d="M21 3l-7 7"/>
            <path d="M3 12v7a2 2 0 0 0 2 2h7"/>
          </svg>
          Open in Floating Window
        </div>

        <div className="context-menu-separator" />

        {/* Link Management */}
        {onStartLink && !isLinkingActive && (
          <div className="context-menu-item" onClick={handleStartLink}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
            </svg>
            Start Link From Here
            {outgoingLinks.length > 0 && (
              <span style={{ 
                marginLeft: "auto", 
                fontSize: "11px", 
                color: "#6b7280",
                backgroundColor: "#f3f4f6",
                padding: "2px 6px",
                borderRadius: "3px"
              }}>
                {outgoingLinks.length} →
              </span>
            )}
          </div>
        )}

        {onEndLink && isLinkingActive && !isCurrentRequirementLinking && (
          <div className="context-menu-item" onClick={handleEndLink}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
            </svg>
            End Link Here
            {linkingRequirement && (
              <span style={{ 
                marginLeft: "8px", 
                fontSize: "11px", 
                color: "#059669",
                fontWeight: "500"
              }}>
                from {linkingRequirement.ref}
              </span>
            )}
          </div>
        )}

        {isCurrentRequirementLinking && (
          <div style={{
            padding: "8px 12px",
            backgroundColor: "#ecfdf5",
            color: "#059669",
            fontSize: "12px",
            fontStyle: "italic"
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ display: "inline", marginRight: "6px", verticalAlign: "middle" }}>
              <path d="M12 2v20M2 12h20"/>
            </svg>
            Link started from this requirement
          </div>
        )}

        {incomingLinks.length > 0 && (
          <div style={{
            padding: "6px 12px",
            backgroundColor: "#f9fafb",
            color: "#6b7280",
            fontSize: "11px",
            borderTop: "1px solid #e5e7eb"
          }}>
            ← {incomingLinks.length} incoming link{incomingLinks.length > 1 ? 's' : ''}
          </div>
        )}

        <div className="context-menu-separator" />

        {/* Copy Actions */}
        <div className="context-menu-item" onClick={handleCopyRef}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
          </svg>
          Copy Reference ID
        </div>

        <div className="context-menu-item" onClick={handleCopyText}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
          </svg>
          Copy Requirement Text
        </div>

        <div className="context-menu-separator" />

        {/* Info Section */}
        <div className="context-menu-info" style={{ maxHeight: "120px", overflowY: "auto" }}>
          <div className="info-row">
            <span className="info-label">Pattern:</span>
            <span className="info-value">{requirement.pattern || "—"}</span>
          </div>
          <div className="info-row">
            <span className="info-label">Verification:</span>
            <span className="info-value">{requirement.verification || "—"}</span>
          </div>
          {requirement.qaScore && (
            <div className="info-row">
              <span className="info-label">QA Score:</span>
              <span className="info-value" style={{
                color: requirement.qaScore >= 80 ? "#059669" : requirement.qaScore >= 60 ? "#d97706" : "#dc2626"
              }}>
                {requirement.qaScore}%
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Details Modal */}
      {showDetails && (
        <div className="modal-overlay" onClick={() => setShowDetails(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "600px" }}>
            <div className="modal-header">
              <h3>Requirement Details</h3>
              <Button variant="ghost" size="sm" onClick={() => setShowDetails(false)}>×</Button>
            </div>
            <div className="modal-content">
              <div style={{ marginBottom: "16px" }}>
                <label style={{ fontWeight: "600", color: "#374151", display: "block", marginBottom: "4px" }}>
                  Reference ID
                </label>
                <div style={{ 
                  padding: "8px 12px", 
                  backgroundColor: "#f9fafb", 
                  borderRadius: "4px",
                  fontFamily: "monospace",
                  fontSize: "14px"
                }}>
                  {requirement.ref}
                </div>
              </div>

              <div style={{ marginBottom: "16px" }}>
                <label style={{ fontWeight: "600", color: "#374151", display: "block", marginBottom: "4px" }}>
                  Requirement Text
                </label>
                <div style={{ 
                  padding: "12px", 
                  backgroundColor: "#f9fafb", 
                  borderRadius: "4px",
                  lineHeight: "1.6"
                }}>
                  {requirement.text}
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "16px" }}>
                <div>
                  <label style={{ fontWeight: "600", color: "#374151", display: "block", marginBottom: "4px" }}>
                    Pattern
                  </label>
                  <div style={{ 
                    padding: "8px 12px", 
                    backgroundColor: "#f9fafb", 
                    borderRadius: "4px"
                  }}>
                    {requirement.pattern || "Not specified"}
                  </div>
                </div>

                <div>
                  <label style={{ fontWeight: "600", color: "#374151", display: "block", marginBottom: "4px" }}>
                    Verification Method
                  </label>
                  <div style={{ 
                    padding: "8px 12px", 
                    backgroundColor: "#f9fafb", 
                    borderRadius: "4px"
                  }}>
                    {requirement.verification || "Not specified"}
                  </div>
                </div>
              </div>

              {requirement.qaScore && (
                <div style={{ marginBottom: "16px" }}>
                  <label style={{ fontWeight: "600", color: "#374151", display: "block", marginBottom: "4px" }}>
                    QA Score
                  </label>
                  <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <div style={{ 
                      flex: 1, 
                      height: "8px", 
                      backgroundColor: "#e5e7eb", 
                      borderRadius: "4px",
                      overflow: "hidden"
                    }}>
                      <div style={{
                        width: `${requirement.qaScore}%`,
                        height: "100%",
                        backgroundColor: requirement.qaScore >= 80 ? "#10b981" : requirement.qaScore >= 60 ? "#f59e0b" : "#ef4444",
                        transition: "width 0.3s ease"
                      }} />
                    </div>
                    <span style={{ 
                      fontWeight: "600",
                      color: requirement.qaScore >= 80 ? "#059669" : requirement.qaScore >= 60 ? "#d97706" : "#dc2626"
                    }}>
                      {requirement.qaScore}%
                    </span>
                  </div>
                </div>
              )}

              {(outgoingLinks.length > 0 || incomingLinks.length > 0) && (
                <div style={{ marginBottom: "16px" }}>
                  <label style={{ fontWeight: "600", color: "#374151", display: "block", marginBottom: "8px" }}>
                    Trace Links
                  </label>
                  <div style={{ display: "flex", gap: "16px" }}>
                    {outgoingLinks.length > 0 && (
                      <div style={{ 
                        flex: 1,
                        padding: "12px", 
                        backgroundColor: "#f0f9ff", 
                        borderRadius: "4px",
                        border: "1px solid #bfdbfe"
                      }}>
                        <div style={{ fontWeight: "500", marginBottom: "6px", color: "#1e40af" }}>
                          Outgoing ({outgoingLinks.length})
                        </div>
                        <div style={{ fontSize: "12px", color: "#64748b" }}>
                          This requirement links to {outgoingLinks.length} other requirement{outgoingLinks.length > 1 ? 's' : ''}
                        </div>
                      </div>
                    )}
                    {incomingLinks.length > 0 && (
                      <div style={{ 
                        flex: 1,
                        padding: "12px", 
                        backgroundColor: "#f0fdf4", 
                        borderRadius: "4px",
                        border: "1px solid #bbf7d0"
                      }}>
                        <div style={{ fontWeight: "500", marginBottom: "6px", color: "#166534" }}>
                          Incoming ({incomingLinks.length})
                        </div>
                        <div style={{ fontSize: "12px", color: "#64748b" }}>
                          {incomingLinks.length} requirement{incomingLinks.length > 1 ? 's' : ''} link to this
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {requirement.tags && requirement.tags.length > 0 && (
                <div style={{ marginBottom: "16px" }}>
                  <label style={{ fontWeight: "600", color: "#374151", display: "block", marginBottom: "4px" }}>
                    Tags
                  </label>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                    {requirement.tags.map((tag, index) => (
                      <span key={index} style={{
                        padding: "4px 8px",
                        backgroundColor: "#e0e7ff",
                        color: "#3730a3",
                        borderRadius: "4px",
                        fontSize: "12px"
                      }}>
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <Button variant="outline" onClick={() => setShowDetails(false)}>
                Close
              </Button>
              <Button onClick={handleOpenInFloatingWindow}>
                Open in Document
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}