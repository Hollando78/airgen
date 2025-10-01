import { DiagramCandidatePreview as DiagramPreview } from "../DiagramCandidatePreview";
import type { DiagramCandidate } from "../../types";

/**
 * Props for the DiagramCandidateList component
 */
export interface DiagramCandidateListProps {
  /** Array of diagram candidates */
  candidates: DiagramCandidate[];
  /** Whether the form is disabled */
  disabled: boolean;
  /** Handler for accepting a diagram candidate */
  onAcceptClick: (candidate: DiagramCandidate) => void;
  /** Handler for rejecting a diagram candidate */
  onRejectClick: (candidate: DiagramCandidate) => void;
  /** Handler for returning a rejected diagram candidate */
  onReturnClick: (candidate: DiagramCandidate) => void;
  /** Whether accept mutation is pending */
  isAcceptPending: boolean;
  /** Whether reject mutation is pending */
  isRejectPending: boolean;
  /** Whether return mutation is pending */
  isReturnPending: boolean;
}

/**
 * Displays a list of diagram candidates with previews,
 * metadata, design reasoning, and action buttons
 */
export function DiagramCandidateList({
  candidates,
  disabled,
  onAcceptClick,
  onRejectClick,
  onReturnClick,
  isAcceptPending,
  isRejectPending,
  isReturnPending
}: DiagramCandidateListProps): JSX.Element {
  if (!disabled && candidates.length === 0) {
    return <p className="hint">No diagram candidates yet. Generate diagrams to populate this list.</p>;
  }

  return (
    <div className="diagram-candidates">
      {candidates.map(candidate => {
        const statusInfo = {
          pending: { label: "Pending", className: "status-pending" },
          accepted: { label: "Accepted", className: "status-accepted" },
          rejected: { label: "Rejected", className: "status-rejected" }
        }[candidate.status] || { label: "Unknown", className: "" };

        return (
          <article key={candidate.id} className={`candidate-card ${statusInfo.className}`}>
            <header className="candidate-header">
              <span className="candidate-status">{statusInfo.label}</span>
              <span className="diagram-action">{candidate.action}</span>
            </header>

            <div className="diagram-info">
              <h3>{candidate.diagramName || 'Untitled Diagram'}</h3>
              {candidate.diagramDescription && (
                <p className="diagram-description">{candidate.diagramDescription}</p>
              )}
              <div className="diagram-meta">
                <span><strong>View:</strong> {candidate.diagramView}</span>
                <span><strong>Blocks:</strong> {candidate.blocks.length}</span>
                <span><strong>Connectors:</strong> {candidate.connectors.length}</span>
              </div>
            </div>

            <div className="diagram-preview">
              <DiagramPreview candidate={candidate} height={250} />
            </div>

            <div className="diagram-reasoning">
              <details>
                <summary>Design Reasoning</summary>
                <p>{candidate.reasoning}</p>
              </details>
            </div>

            {candidate.status === "pending" && (
              <div className="candidate-actions">
                <button
                  type="button"
                  onClick={() => onAcceptClick(candidate)}
                  disabled={isAcceptPending}
                >
                  {isAcceptPending ? "Accepting…" : "Accept"}
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

            {candidate.status === "accepted" && (
              <p className="candidate-note">Diagram has been accepted and created.</p>
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
  );
}
