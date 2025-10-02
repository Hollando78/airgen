import { useRef, useState, useEffect } from "react";
import type {
  RequirementCandidate,
  RequirementCandidateGroup,
  RequirementCandidateStatus
} from "../../types";

const statusLabels: Record<RequirementCandidateStatus, { label: string; className: string }> = {
  pending: { label: "Pending", className: "status-pending" },
  accepted: { label: "Accepted", className: "status-accepted" },
  rejected: { label: "Rejected", className: "status-rejected" }
};

const unknownStatus = { label: "Unknown", className: "status-unknown" };

/**
 * Props for the RequirementCandidateList component
 */
export interface RequirementCandidateListProps {
  /** Grouped candidate requirements */
  candidateGroups: RequirementCandidateGroup[];
  /** Set of collapsed group IDs */
  collapsedGroups: Set<string>;
  /** Text filter value (for display) */
  textFilter: string;
  /** Whether the form is disabled */
  disabled: boolean;
  /** Handler for toggling group collapse */
  onToggleGroupCollapse: (sessionId: string) => void;
  /** Handler for accepting a candidate */
  onAcceptClick: (candidate: RequirementCandidate) => void;
  /** Handler for rejecting a candidate */
  onRejectClick: (candidate: RequirementCandidate) => void;
  /** Handler for returning a rejected candidate */
  onReturnClick: (candidate: RequirementCandidate) => void;
  /** Handler for archiving accepted requirements in a group */
  onArchiveGroup?: (requirementIds: string[]) => void;
  /** Whether reject mutation is pending */
  isRejectPending: boolean;
  /** Whether return mutation is pending */
  isReturnPending: boolean;
}

/**
 * Displays a list of requirement candidate groups with collapsible sections,
 * showing candidate details, QA scores, and action buttons
 */
export function RequirementCandidateList({
  candidateGroups,
  collapsedGroups,
  textFilter,
  disabled,
  onToggleGroupCollapse,
  onAcceptClick,
  onRejectClick,
  onReturnClick,
  onArchiveGroup,
  isRejectPending,
  isReturnPending
}: RequirementCandidateListProps): JSX.Element {
  const [contextMenu, setContextMenu] = useState<{
    isOpen: boolean;
    x: number;
    y: number;
    group: RequirementCandidateGroup | null;
  }>({ isOpen: false, x: 0, y: 0, group: null });
  const contextMenuRef = useRef<HTMLDivElement>(null);

  // Close context menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(event.target as Node)) {
        setContextMenu({ isOpen: false, x: 0, y: 0, group: null });
      }
    };

    if (contextMenu.isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [contextMenu.isOpen]);
  if (!disabled && candidateGroups.length === 0 && !textFilter) {
    return <p className="hint">No candidates yet. Generate requirements to populate this list.</p>;
  }

  if (!disabled && candidateGroups.length === 0 && textFilter) {
    return <p className="hint">No groups match your filter. Try a different search term.</p>;
  }

  return (
    <>
      {!disabled && candidateGroups.length > 0 && textFilter && (
        <p className="filter-results">Showing {candidateGroups.length} group{candidateGroups.length !== 1 ? 's' : ''} matching "{textFilter}"</p>
      )}

      <div className="candidate-groups">
        {candidateGroups.map(group => {
          const isCollapsed = collapsedGroups.has(group.sessionId);
          const groupTitle = group.prompt || `Session ${group.sessionId}`;
          const displayTitle = group.sessionId === 'ungrouped' ? 'Previous Requirements' : groupTitle;

          const acceptedRequirementIds = group.candidates
            .filter(c => c.status === "accepted" && c.requirementId)
            .map(c => c.requirementId)
            .filter((id): id is string => Boolean(id));

          const rejectedRequirementIds = group.candidates
            .filter(c => c.status === "rejected" && c.requirementId)
            .map(c => c.requirementId)
            .filter((id): id is string => Boolean(id));

          return (
            <div key={group.sessionId} className="candidate-group">
              <div
                className="group-header"
                onClick={(e) => {
                  if (e.button === 0) onToggleGroupCollapse(group.sessionId);
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setContextMenu({
                    isOpen: true,
                    x: e.clientX,
                    y: e.clientY,
                    group
                  });
                }}
              >
                <h3 className="group-title">
                  {isCollapsed ? '▶' : '▼'} {displayTitle} ({group.count})
                </h3>
              </div>

              {!isCollapsed && (
                <div className="candidate-list">
                  {group.candidates.map((candidate, index) => {
                    const rawStatus = typeof candidate.status === "string"
                      ? candidate.status.toLowerCase()
                      : undefined;
                    const isKnownStatus = rawStatus === "pending" || rawStatus === "accepted" || rawStatus === "rejected";
                    const status = isKnownStatus
                      ? statusLabels[rawStatus as RequirementCandidateStatus]
                      : {
                          ...unknownStatus,
                          label: candidate.status ?? unknownStatus.label
                        };
                    const qa = candidate.qa ?? {
                      score: candidate.qaScore ?? null,
                      verdict: candidate.qaVerdict ?? null,
                      suggestions: candidate.suggestions ?? []
                    };
                    const candidateKey = candidate.id ?? `${group.sessionId}-${index}`;
                    const candidateText = candidate.text?.trim()
                      || candidate.prompt?.trim()
                      || "(No requirement text provided)";
                    return (
                      <article key={candidateKey} className={`candidate-card ${status.className}`}>
                        <header className="candidate-header">
                          <span className="candidate-status">{status.label}</span>
                          {candidate.requirementRef && (
                            <span className="candidate-ref">{candidate.requirementRef}</span>
                          )}
                        </header>
                        <p className="candidate-text">{candidateText}</p>
                        <div className="candidate-meta">
                          <span>
                            <strong>Score:</strong> {qa.score ?? "—"}
                          </span>
                          <span>
                            <strong>Verdict:</strong> {qa.verdict ?? "—"}
                          </span>
                        </div>
                        {qa.suggestions.length > 0 && (
                          <details>
                            <summary>Suggestions ({qa.suggestions.length})</summary>
                            <ul>
                              {qa.suggestions.map((suggestion, index) => (
                                <li key={index}>{suggestion}</li>
                              ))}
                            </ul>
                          </details>
                        )}
                        {candidate.status === "pending" && (
                          <div className="candidate-actions">
                            <button type="button" onClick={() => onAcceptClick(candidate)}>
                              Accept
                            </button>
                            <button
                              type="button"
                              className="candidate-reject"
                              onClick={() => onRejectClick(candidate)}
                              disabled={isRejectPending}
                            >
                              {isRejectPending ? "Rejecting…" : "Reject"}
                            </button>
                          </div>
                        )}
                        {candidate.status === "accepted" && candidate.requirementRef && (
                          <p className="candidate-note">Added to requirements as {candidate.requirementRef}.</p>
                        )}
                        {candidate.status === "rejected" && (
                          <div className="candidate-actions">
                            <button
                              type="button"
                              className="candidate-return"
                              onClick={() => onReturnClick(candidate)}
                              disabled={isReturnPending}
                            >
                              {isReturnPending ? "Returning…" : "Return to candidates"}
                            </button>
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Group Context Menu */}
      {contextMenu.isOpen && contextMenu.group && onArchiveGroup && (
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
            minWidth: "200px",
            padding: "0.25rem"
          }}
        >
          {(() => {
            const acceptedRequirementIds = contextMenu.group.candidates
              .filter(c => c.status === "accepted" && c.requirementId)
              .map(c => c.requirementId)
              .filter((id): id is string => Boolean(id));

            const rejectedRequirementIds = contextMenu.group.candidates
              .filter(c => c.status === "rejected" && c.requirementId)
              .map(c => c.requirementId)
              .filter((id): id is string => Boolean(id));

            const acceptedCount = acceptedRequirementIds.length;
            const rejectedCount = rejectedRequirementIds.length;
            const allRequirementIds = [...acceptedRequirementIds, ...rejectedRequirementIds];
            const totalCount = allRequirementIds.length;

            if (totalCount === 0) {
              return (
                <div
                  style={{
                    padding: "0.5rem 0.75rem",
                    fontSize: "0.875rem",
                    color: "#9ca3af"
                  }}
                >
                  No requirements to archive
                </div>
              );
            }

            return (
              <>
                {acceptedCount > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      onArchiveGroup(acceptedRequirementIds);
                      setContextMenu({ isOpen: false, x: 0, y: 0, group: null });
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
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 8v13H3V8"/>
                      <path d="M1 3h22v5H1z"/>
                      <path d="M10 12h4"/>
                    </svg>
                    <span>Archive Accepted Requirements ({acceptedCount})</span>
                  </button>
                )}

                {rejectedCount > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      onArchiveGroup(rejectedRequirementIds);
                      setContextMenu({ isOpen: false, x: 0, y: 0, group: null });
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
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 8v13H3V8"/>
                      <path d="M1 3h22v5H1z"/>
                      <path d="M10 12h4"/>
                    </svg>
                    <span>Archive Rejected Requirements ({rejectedCount})</span>
                  </button>
                )}

                {acceptedCount > 0 && rejectedCount > 0 && (
                  <>
                    <div style={{ height: "1px", backgroundColor: "#e5e7eb", margin: "0.25rem 0" }} />
                    <button
                      type="button"
                      onClick={() => {
                        onArchiveGroup(allRequirementIds);
                        setContextMenu({ isOpen: false, x: 0, y: 0, group: null });
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
                        color: "#374151",
                        fontWeight: 600
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = "#f3f4f6";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = "transparent";
                      }}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 8v13H3V8"/>
                        <path d="M1 3h22v5H1z"/>
                        <path d="M10 12h4"/>
                      </svg>
                      <span>Archive All Requirements ({totalCount})</span>
                    </button>
                  </>
                )}
              </>
            );
          })()}
        </div>
      )}
    </>
  );
}
