import { useEffect, useRef, useState, useCallback } from "react";
import type { RequirementRecord, TraceLink } from "../types";
import { useFloatingDocuments } from "../contexts/FloatingDocumentsContext";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogOverlay } from "./ui/dialog";
import { Badge } from "./ui/badge";

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
    console.log('[RequirementContextMenu] showDetails state changed to:', showDetails);
  }, [showDetails]);

  const handleViewDetails = useCallback(() => {
    console.log('[RequirementContextMenu] handleViewDetails called');
    console.log('[RequirementContextMenu] Current showDetails state:', showDetails);
    console.log('[RequirementContextMenu] Setting showDetails to true');
    setShowDetails(true);
    console.log('[RequirementContextMenu] After setState call (may not be updated yet)');
  }, [showDetails]);

  const handleCloseDetails = useCallback(() => {
    console.log('[RequirementContextMenu] handleCloseDetails called');
    setShowDetails(false);
    onClose();
  }, [onClose]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      // Don't close if dialog is open
      if (showDetails) {
        console.log('[RequirementContextMenu] Click outside ignored - dialog is open');
        return;
      }
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        console.log('[RequirementContextMenu] Click outside detected - closing context menu');
        onClose();
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (showDetails) {
          console.log('[RequirementContextMenu] Escape pressed - closing dialog');
          handleCloseDetails();
        } else {
          console.log('[RequirementContextMenu] Escape pressed - closing context menu');
          onClose();
        }
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [onClose, showDetails, handleCloseDetails]);

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

  const handleOpenInFloatingWindow = () => {
    let documentSlug = requirement.documentSlug;

    // If documentSlug is not available, try to extract it from path
    if (!documentSlug && requirement.path) {
      // Path format is typically: "tenant/project/requirements/REQ-001.md"
      // or for documents: "tenant/project/documents/doc-slug"
      const pathParts = requirement.path.split('/');
      if (pathParts.length >= 4 && pathParts[2] === 'documents') {
        documentSlug = pathParts[3];
      }
    }

    if (documentSlug) {
      // Remove .md extension if present
      documentSlug = documentSlug.replace(/\.md$/, '');

      console.log('[RequirementContextMenu] Opening floating document:', documentSlug);
      openFloatingDocument({
        documentSlug,
        documentName: documentSlug,
        tenant,
        project,
        kind: "structured",
        focusRequirementId: requirement.id
      });
    } else {
      console.warn('[RequirementContextMenu] No document slug found for requirement:', requirement);
    }

    handleCloseDetails();
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
        style={{ left: x, top: y, display: showDetails ? 'none' : 'block' }}
      >
        <div className="context-menu-info">
          <div className="info-row">
            <span className="info-value" style={{ fontWeight: 600 }}>{requirement.ref}</span>
          </div>
        </div>
        <div className="context-menu-separator" />

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

        {onStartLink && !isLinkingActive && (
          <div className="context-menu-item" onClick={handleStartLink}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
            </svg>
            <span style={{ flex: 1 }}>Start Link From Here</span>
            {outgoingLinks.length > 0 && (
              <span style={{ marginLeft: 'auto', fontSize: '11px', background: '#f3f4f6', padding: '2px 6px', borderRadius: '3px' }}>
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
            <span style={{ flex: 1 }}>End Link Here</span>
            {linkingRequirement && (
              <span style={{ marginLeft: '8px', fontSize: '11px', color: '#059669', fontWeight: 500 }}>
                from {linkingRequirement.ref}
              </span>
            )}
          </div>
        )}

        {isCurrentRequirementLinking && (
          <div className="context-menu-info" style={{ background: '#ecfdf5', color: '#059669', fontStyle: 'italic' }}>
            <div className="info-row">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ display: 'inline', marginRight: '6px' }}>
                <path d="M12 2v20M2 12h20"/>
              </svg>
              Link started from this requirement
            </div>
          </div>
        )}

        {incomingLinks.length > 0 && (
          <div className="context-menu-info" style={{ background: '#f9fafb', fontSize: '11px' }}>
            <div className="info-row">
              ← {incomingLinks.length} incoming link{incomingLinks.length > 1 ? 's' : ''}
            </div>
          </div>
        )}

        <div className="context-menu-separator" />

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

        <div className="context-menu-info" style={{ maxHeight: '120px', overflowY: 'auto' }}>
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
                color: requirement.qaScore >= 80 ? "#059669" : requirement.qaScore >= 60 ? "#d97706" : "#dc2626",
                fontWeight: 600
              }}>
                {requirement.qaScore}%
              </span>
            </div>
          )}
        </div>
      </div>

      {showDetails && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, pointerEvents: 'none' }}>
          <Dialog open={true} modal={false} onOpenChange={(open) => {
            console.log('[RequirementContextMenu] Dialog onOpenChange called with:', open);
            if (!open) handleCloseDetails();
          }}>
            <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0, 0, 0, 0.8)', pointerEvents: 'auto' }} onClick={() => handleCloseDetails()} />
            <DialogContent
              className="max-w-2xl"
              style={{ position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', zIndex: 10000, pointerEvents: 'auto' }}
              onOpenAutoFocus={(e) => {
                console.log('[RequirementContextMenu] Dialog content mounted and focused');
              }}
              onEscapeKeyDown={() => handleCloseDetails()}
              onPointerDownOutside={(e) => {
                e.preventDefault();
                handleCloseDetails();
              }}
              onInteractOutside={(e) => {
                e.preventDefault();
                handleCloseDetails();
              }}
            >
          <DialogHeader>
            <DialogTitle>Requirement Details</DialogTitle>
            <DialogDescription>
              View detailed information about this requirement
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-semibold text-gray-700 block mb-1">
                Reference ID
              </label>
              <div className="p-3 bg-gray-50 rounded-md font-mono text-sm border">
                {requirement.ref}
              </div>
            </div>

            <div>
              <label className="text-sm font-semibold text-gray-700 block mb-1">
                Requirement Text
              </label>
              <div className="p-3 bg-gray-50 rounded-md leading-relaxed border">
                {requirement.text}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-semibold text-gray-700 block mb-1">
                  Pattern
                </label>
                <div className="p-3 bg-gray-50 rounded-md border">
                  {requirement.pattern || "Not specified"}
                </div>
              </div>

              <div>
                <label className="text-sm font-semibold text-gray-700 block mb-1">
                  Verification Method
                </label>
                <div className="p-3 bg-gray-50 rounded-md border">
                  {requirement.verification || "Not specified"}
                </div>
              </div>
            </div>

            {requirement.qaScore && (
              <div>
                <label className="text-sm font-semibold text-gray-700 block mb-2">
                  QA Score
                </label>
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-300 ${
                        requirement.qaScore >= 80 ? "bg-green-500" :
                        requirement.qaScore >= 60 ? "bg-yellow-500" : "bg-red-500"
                      }`}
                      style={{ width: `${requirement.qaScore}%` }}
                    />
                  </div>
                  <span className={`font-semibold text-sm ${
                    requirement.qaScore >= 80 ? "text-green-600" :
                    requirement.qaScore >= 60 ? "text-yellow-600" : "text-red-600"
                  }`}>
                    {requirement.qaScore}%
                  </span>
                </div>
              </div>
            )}

            {(outgoingLinks.length > 0 || incomingLinks.length > 0) && (
              <div>
                <label className="text-sm font-semibold text-gray-700 block mb-2">
                  Trace Links
                </label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {outgoingLinks.length > 0 && (
                    <div className="p-3 bg-blue-50 border border-blue-200 rounded-md">
                      <div className="font-medium text-blue-900 mb-1">
                        Outgoing ({outgoingLinks.length})
                      </div>
                      <div className="text-xs text-gray-600">
                        Links to {outgoingLinks.length} requirement{outgoingLinks.length > 1 ? 's' : ''}
                      </div>
                    </div>
                  )}
                  {incomingLinks.length > 0 && (
                    <div className="p-3 bg-green-50 border border-green-200 rounded-md">
                      <div className="font-medium text-green-900 mb-1">
                        Incoming ({incomingLinks.length})
                      </div>
                      <div className="text-xs text-gray-600">
                        {incomingLinks.length} requirement{incomingLinks.length > 1 ? 's' : ''} link here
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {requirement.tags && requirement.tags.length > 0 && (
              <div>
                <label className="text-sm font-semibold text-gray-700 block mb-2">
                  Tags
                </label>
                <div className="flex flex-wrap gap-2">
                  {requirement.tags.map((tag, index) => (
                    <Badge key={index} variant="secondary">
                      {tag}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={handleCloseDetails}>
              Close
            </Button>
            <Button onClick={handleOpenInFloatingWindow}>
              Open in Document
            </Button>
          </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      )}
    </>
  );
}