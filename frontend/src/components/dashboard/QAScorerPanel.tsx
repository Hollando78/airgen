import { Spinner } from "../Spinner";
import { ErrorState } from "../ErrorState";
import type { UseQueryResult } from "@tanstack/react-query";

interface QAScorerStatus {
  isRunning: boolean;
  processedCount: number;
  totalCount: number;
  currentRequirement?: string;
  startedAt?: string;
  completedAt?: string;
  lastError?: string;
}

interface QAScorerPanelProps {
  qaScorerStatusQuery: UseQueryResult<QAScorerStatus, Error>;
  hasTenantAndProject: boolean;
}

function formatDate(value: string | null | undefined): string {
  if (!value) { return "—"; }
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short"
    }).format(new Date(value));
  } catch (error) {
    return value;
  }
}

/**
 * QA Scorer worker status panel
 */
export function QAScorerPanel({ qaScorerStatusQuery, hasTenantAndProject }: QAScorerPanelProps) {
  if (!hasTenantAndProject) {
    return <p className="hint">Select a tenant and project to use the QA scorer.</p>;
  }

  if (qaScorerStatusQuery.isLoading) {
    return <Spinner />;
  }

  if (qaScorerStatusQuery.isError) {
    return <ErrorState message={qaScorerStatusQuery.error.message} />;
  }

  if (!qaScorerStatusQuery.data) {
    return null;
  }

  const status = qaScorerStatusQuery.data;

  return (
    <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
        <div>
          <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
            STATUS
          </div>
          <div style={{
            fontWeight: 600,
            color: status.isRunning ? '#3b82f6' : '#6b7280'
          }}>
            {status.isRunning ? 'RUNNING' : 'IDLE'}
          </div>
        </div>
        <div>
          <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
            PROGRESS
          </div>
          <div>{status.processedCount} / {status.totalCount}</div>
        </div>
        {status.currentRequirement && (
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
              CURRENT
            </div>
            <div>{status.currentRequirement}</div>
          </div>
        )}
        {status.startedAt && (
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
              STARTED
            </div>
            <div>{formatDate(status.startedAt)}</div>
          </div>
        )}
        {status.completedAt && (
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
              COMPLETED
            </div>
            <div>{formatDate(status.completedAt)}</div>
          </div>
        )}
      </div>
      {status.lastError && (
        <div style={{
          padding: '0.75rem',
          backgroundColor: '#fef2f2',
          border: '1px solid #fecaca',
          borderRadius: '0.5rem',
          color: '#991b1b'
        }}>
          <strong>Error:</strong> {status.lastError}
        </div>
      )}
    </div>
  );
}
