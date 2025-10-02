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
  isRejectPending,
  isReturnPending
}: RequirementCandidateListProps): JSX.Element {
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

          return (
            <div key={group.sessionId} className="candidate-group">
              <div className="group-header" onClick={() => onToggleGroupCollapse(group.sessionId)}>
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
    </>
  );
}
