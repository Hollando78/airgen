import type { RequirementCandidate } from "../../types";

interface CandidatesAdminTableProps {
  candidates: RequirementCandidate[];
  selectedCandidates: Set<string>;
  formatDate: (timestamp?: string) => string;
  handleToggleCandidateSelect: (candidateId: string) => void;
  handleSelectAllCandidates: (candidates: RequirementCandidate[]) => void;
}

export function CandidatesAdminTable({
  candidates,
  selectedCandidates,
  formatDate,
  handleToggleCandidateSelect,
  handleSelectAllCandidates
}: CandidatesAdminTableProps): JSX.Element {
  if (!candidates || candidates.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '3rem 0', color: '#6b7280' }}>
        No candidates found
      </div>
    );
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ minWidth: '100%', borderCollapse: 'collapse' }}>
        <thead style={{ backgroundColor: '#f9fafb' }}>
          <tr>
            <th style={{
              padding: '0.75rem 1.5rem',
              textAlign: 'left',
              borderBottom: '1px solid #e5e7eb'
            }}>
              <input
                type="checkbox"
                checked={selectedCandidates.size === candidates.length}
                onChange={() => handleSelectAllCandidates(candidates)}
                style={{ cursor: 'pointer' }}
              />
            </th>
            <th style={{
              padding: '0.75rem 1.5rem',
              textAlign: 'left',
              fontSize: '0.75rem',
              fontWeight: '500',
              color: '#6b7280',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              borderBottom: '1px solid #e5e7eb'
            }}>
              Text
            </th>
            <th style={{
              padding: '0.75rem 1.5rem',
              textAlign: 'left',
              fontSize: '0.75rem',
              fontWeight: '500',
              color: '#6b7280',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              borderBottom: '1px solid #e5e7eb'
            }}>
              Status
            </th>
            <th style={{
              padding: '0.75rem 1.5rem',
              textAlign: 'left',
              fontSize: '0.75rem',
              fontWeight: '500',
              color: '#6b7280',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              borderBottom: '1px solid #e5e7eb'
            }}>
              QA Score
            </th>
            <th style={{
              padding: '0.75rem 1.5rem',
              textAlign: 'left',
              fontSize: '0.75rem',
              fontWeight: '500',
              color: '#6b7280',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              borderBottom: '1px solid #e5e7eb'
            }}>
              Created
            </th>
          </tr>
        </thead>
        <tbody style={{ backgroundColor: 'white' }}>
          {candidates.map((cand) => (
            <tr key={cand.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
              <td style={{ padding: '1rem 1.5rem', whiteSpace: 'nowrap' }}>
                <input
                  type="checkbox"
                  checked={selectedCandidates.has(cand.id)}
                  onChange={() => handleToggleCandidateSelect(cand.id)}
                  style={{ cursor: 'pointer' }}
                />
              </td>
              <td style={{
                padding: '1rem 1.5rem',
                fontSize: '0.875rem',
                color: '#111827',
                maxWidth: '500px',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
              }}>
                {cand.text}
              </td>
              <td style={{ padding: '1rem 1.5rem', whiteSpace: 'nowrap', fontSize: '0.875rem' }}>
                <span style={{
                  fontSize: '0.75rem',
                  padding: '0.25rem 0.5rem',
                  borderRadius: '0.25rem',
                  backgroundColor: cand.status === 'pending' ? '#fef3c7' : cand.status === 'accepted' ? '#d1fae5' : '#fee2e2',
                  color: cand.status === 'pending' ? '#92400e' : cand.status === 'accepted' ? '#065f46' : '#991b1b',
                  fontWeight: '500'
                }}>
                  {cand.status}
                </span>
              </td>
              <td style={{
                padding: '1rem 1.5rem',
                whiteSpace: 'nowrap',
                fontSize: '0.875rem',
                color: '#6b7280'
              }}>
                {cand.qaScore != null ? cand.qaScore.toFixed(1) : 'N/A'}
              </td>
              <td style={{
                padding: '1rem 1.5rem',
                whiteSpace: 'nowrap',
                fontSize: '0.875rem',
                color: '#6b7280'
              }}>
                {formatDate(cand.createdAt)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
