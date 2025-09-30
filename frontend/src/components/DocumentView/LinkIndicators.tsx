import { useState, useRef, useEffect } from "react";
import type { TraceLink, RequirementRecord } from "../../types";
import { useFloatingDocuments } from "../../contexts/FloatingDocumentsContext";

interface LinkIndicatorsProps {
  requirementId: string;
  traceLinks: TraceLink[];
  tenant: string;
  project: string;
}

interface LinkTooltipData {
  type: "outgoing" | "incoming";
  links: TraceLink[];
  position: { x: number; y: number };
}

export function LinkIndicators({ requirementId, traceLinks, tenant, project }: LinkIndicatorsProps) {
  const [tooltip, setTooltip] = useState<LinkTooltipData | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    type: "outgoing" | "incoming";
    links: TraceLink[];
    position: { x: number; y: number };
  } | null>(null);
  const { openFloatingDocument } = useFloatingDocuments();

  // Close context menu when clicking outside
  useEffect(() => {
    const handleClickOutside = () => setContextMenu(null);
    
    if (contextMenu) {
      document.addEventListener('click', handleClickOutside);
    }
    
    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  }, [contextMenu]);

  // Filter links for this requirement
  const outgoingLinks = traceLinks.filter(link => link.sourceRequirementId === requirementId);
  const incomingLinks = traceLinks.filter(link => link.targetRequirementId === requirementId);

  // Don't render anything if no links
  if (outgoingLinks.length === 0 && incomingLinks.length === 0) {
    return null;
  }

  const handleMouseEnter = (type: "outgoing" | "incoming", event: React.MouseEvent) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const links = type === "outgoing" ? outgoingLinks : incomingLinks;
    setTooltip({
      type,
      links,
      position: { x: rect.right + 8, y: rect.top }
    });
  };

  const handleMouseLeave = () => {
    setTooltip(null);
  };

  const handleRightClick = (type: "outgoing" | "incoming", event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const links = type === "outgoing" ? outgoingLinks : incomingLinks;
    setContextMenu({
      type,
      links,
      position: { x: event.clientX, y: event.clientY }
    });
  };

  const handleOpenDocument = (requirement: RequirementRecord) => {
    if (!requirement) {
      return;
    }
    
    // Use the documentSlug property if available, otherwise fall back to path
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
    setContextMenu(null);
  };

  const arrowStyle = {
    display: "inline-block",
    width: "12px",
    height: "12px",
    marginLeft: "4px",
    cursor: "pointer",
    fontSize: "10px",
    color: "#6b7280",
    userSelect: "none" as const
  };

  return (
    <span style={{ whiteSpace: "nowrap" }}>
      {outgoingLinks.length > 0 && (
        <span
          style={arrowStyle}
          onMouseEnter={(e) => handleMouseEnter("outgoing", e)}
          onMouseLeave={handleMouseLeave}
          onContextMenu={(e) => handleRightClick("outgoing", e)}
          title={`${outgoingLinks.length} outgoing link${outgoingLinks.length > 1 ? 's' : ''}`}
        >
          →{outgoingLinks.length > 1 ? outgoingLinks.length : ''}
        </span>
      )}
      {incomingLinks.length > 0 && (
        <span
          style={arrowStyle}
          onMouseEnter={(e) => handleMouseEnter("incoming", e)}
          onMouseLeave={handleMouseLeave}
          onContextMenu={(e) => handleRightClick("incoming", e)}
          title={`${incomingLinks.length} incoming link${incomingLinks.length > 1 ? 's' : ''}`}
        >
          ←{incomingLinks.length > 1 ? incomingLinks.length : ''}
        </span>
      )}

      {/* Tooltip */}
      {tooltip && (
        <div
          style={{
            position: "fixed",
            left: tooltip.position.x,
            top: tooltip.position.y,
            backgroundColor: "#1f2937",
            color: "white",
            padding: "8px 12px",
            borderRadius: "6px",
            fontSize: "12px",
            zIndex: 1000,
            boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
            maxWidth: "300px",
            pointerEvents: "none"
          }}
        >
          <div style={{ fontWeight: "600", marginBottom: "4px" }}>
            {tooltip.type === "outgoing" ? "Outgoing Links" : "Incoming Links"}
          </div>
          {tooltip.links.slice(0, 5).map((link, index) => {
            const targetReq = tooltip.type === "outgoing" ? link.targetRequirement : link.sourceRequirement;
            if (!targetReq) return null;
            return (
              <div key={link.id} style={{ marginBottom: index < Math.min(tooltip.links.length, 5) - 1 ? "2px" : "0" }}>
                <span style={{ color: "#9ca3af" }}>{link.linkType}:</span> {targetReq.ref || 'Unknown'} - {(targetReq.text || 'No description').substring(0, 50)}...
              </div>
            );
          }).filter(Boolean)}
          {tooltip.links.length > 5 && (
            <div style={{ color: "#9ca3af", fontStyle: "italic" }}>
              +{tooltip.links.length - 5} more...
            </div>
          )}
        </div>
      )}

      {/* Context Menu */}
      {contextMenu && (
        <div
          style={{
            position: "fixed",
            left: contextMenu.position.x,
            top: contextMenu.position.y,
            backgroundColor: "white",
            border: "1px solid #e5e7eb",
            borderRadius: "6px",
            boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1)",
            zIndex: 1001,
            minWidth: "200px",
            maxHeight: "300px",
            overflowY: "auto"
          }}
        >
          <div style={{
            padding: "8px 12px",
            fontSize: "12px",
            fontWeight: "600",
            color: "#374151",
            borderBottom: "1px solid #e5e7eb"
          }}>
            {contextMenu.type === "outgoing" ? "Go to Target" : "Go to Source"}
          </div>
          {contextMenu.links.map((link) => {
            const targetReq = contextMenu.type === "outgoing" ? link.targetRequirement : link.sourceRequirement;
            if (!targetReq) return null;
            return (
              <button
                key={link.id}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  console.log("[LinkIndicators] Context menu item clicked, opening document for:", targetReq);
                  handleOpenDocument(targetReq);
                }}
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  border: "none",
                  backgroundColor: "transparent",
                  textAlign: "left",
                  cursor: "pointer",
                  fontSize: "12px",
                  borderBottom: "1px solid #f3f4f6"
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = "#f9fafb";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "transparent";
                }}
              >
                <div style={{ fontWeight: "500", color: "#374151" }}>
                  {targetReq.ref || 'Unknown'}
                </div>
                <div style={{ color: "#6b7280", fontSize: "11px" }}>
                  {link.linkType} • {(targetReq.text || 'No description').substring(0, 60)}...
                </div>
              </button>
            );
          }).filter(Boolean)}
        </div>
      )}
    </span>
  );
}