import type { UseMutationResult } from "@tanstack/react-query";

type Tab = "deleted" | "archived" | "drift" | "badlinks" | "candidates";

interface BulkActionBarProps {
  activeTab: Tab;
  selectedRequirementsSize: number;
  selectedCandidatesSize: number;
  bulkRestoreMutation: UseMutationResult<any, any, any, unknown>;
  bulkResetCandidatesMutation: UseMutationResult<any, any, any, unknown>;
  bulkDeleteCandidatesMutation: UseMutationResult<any, any, any, unknown>;
  handleBulkRestore: () => void;
  handleBulkResetCandidates: () => void;
  handleBulkDeleteCandidates: () => void;
}

export function BulkActionBar({
  activeTab,
  selectedRequirementsSize,
  selectedCandidatesSize,
  bulkRestoreMutation,
  bulkResetCandidatesMutation,
  bulkDeleteCandidatesMutation,
  handleBulkRestore,
  handleBulkResetCandidates,
  handleBulkDeleteCandidates
}: BulkActionBarProps): JSX.Element | null {
  if (activeTab === "deleted" && selectedRequirementsSize > 0) {
    return (
      <div style={{
        padding: '1rem',
        backgroundColor: '#eef2ff',
        borderBottom: '1px solid #c7d2fe'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: '0.875rem', color: '#4338ca' }}>
            {selectedRequirementsSize} requirement(s) selected
          </span>
          <button
            onClick={handleBulkRestore}
            disabled={bulkRestoreMutation.isPending}
            style={{
              padding: '0.5rem 1rem',
              backgroundColor: '#6366f1',
              color: 'white',
              borderRadius: '0.375rem',
              border: 'none',
              fontSize: '0.875rem',
              fontWeight: '500',
              cursor: bulkRestoreMutation.isPending ? 'not-allowed' : 'pointer',
              opacity: bulkRestoreMutation.isPending ? 0.5 : 1
            }}
          >
            {bulkRestoreMutation.isPending ? "Restoring..." : "Restore Selected"}
          </button>
        </div>
      </div>
    );
  }

  if (activeTab === "candidates" && selectedCandidatesSize > 0) {
    return (
      <div style={{
        padding: '1rem',
        backgroundColor: '#eef2ff',
        borderBottom: '1px solid #c7d2fe'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: '0.875rem', color: '#4338ca' }}>
            {selectedCandidatesSize} candidate(s) selected
          </span>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              onClick={handleBulkResetCandidates}
              disabled={bulkResetCandidatesMutation.isPending}
              style={{
                padding: '0.5rem 1rem',
                backgroundColor: '#f59e0b',
                color: 'white',
                borderRadius: '0.375rem',
                border: 'none',
                fontSize: '0.875rem',
                fontWeight: '500',
                cursor: bulkResetCandidatesMutation.isPending ? 'not-allowed' : 'pointer',
                opacity: bulkResetCandidatesMutation.isPending ? 0.5 : 1
              }}
            >
              {bulkResetCandidatesMutation.isPending ? "Resetting..." : "Reset to Pending"}
            </button>
            <button
              onClick={handleBulkDeleteCandidates}
              disabled={bulkDeleteCandidatesMutation.isPending}
              style={{
                padding: '0.5rem 1rem',
                backgroundColor: '#dc2626',
                color: 'white',
                borderRadius: '0.375rem',
                border: 'none',
                fontSize: '0.875rem',
                fontWeight: '500',
                cursor: bulkDeleteCandidatesMutation.isPending ? 'not-allowed' : 'pointer',
                opacity: bulkDeleteCandidatesMutation.isPending ? 0.5 : 1
              }}
            >
              {bulkDeleteCandidatesMutation.isPending ? "Deleting..." : "Delete Selected"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
