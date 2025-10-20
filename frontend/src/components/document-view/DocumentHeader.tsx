/**
 * Document Header Component
 *
 * Displays document header with breadcrumb navigation and close button
 */

import type { DocumentRecord } from "../../types";

export interface DocumentHeaderProps {
  document: DocumentRecord | undefined;
  onClose: () => void;
}

export function DocumentHeader({ document, onClose }: DocumentHeaderProps): JSX.Element {
  return (
    <div style={{
      borderBottom: "1px solid #e2e8f0",
      padding: "16px 24px",
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      backgroundColor: "#f8f9fa"
    }}>
      <div>
        {/* Breadcrumb Navigation */}
        <div style={{
          display: "flex",
          alignItems: "center",
          fontSize: "14px",
          color: "#64748b",
          marginBottom: "8px"
        }}>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              color: "#3b82f6",
              cursor: "pointer",
              textDecoration: "underline",
              fontSize: "14px"
            }}
          >
            Documents
          </button>
          <span style={{ margin: "0 8px" }}>/</span>
          <span>{document?.name}</span>
        </div>

        <h1 style={{ margin: 0, fontSize: "24px" }}>
          {document?.name}
          {document?.shortCode && (
            <span style={{
              fontSize: "12px",
              backgroundColor: "#e0f2fe",
              color: "#0369a1",
              padding: "4px 8px",
              borderRadius: "6px",
              fontWeight: "600",
              textTransform: "uppercase",
              marginLeft: "12px"
            }}>
              {document.shortCode}
            </span>
          )}
        </h1>
        <p style={{ margin: "4px 0 0 0", color: "#64748b", fontSize: "14px" }}>
          {document?.description || "No description provided"}
        </p>
      </div>
      <button
        onClick={onClose}
        style={{
          background: "none",
          border: "1px solid #e2e8f0",
          borderRadius: "4px",
          padding: "8px 12px",
          cursor: "pointer",
          fontSize: "16px"
        }}
      >
        ✕ Close
      </button>
    </div>
  );
}
