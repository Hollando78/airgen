import type { UseMutationResult } from "@tanstack/react-query";

type Requirement = {
  id: string;
  ref: string;
  tenant: string;
  projectKey: string;
  title: string;
  text: string;
  deleted?: boolean;
  archived?: boolean;
  deletedAt?: string;
  deletedBy?: string;
  restoredAt?: string;
  contentHash?: string;
  createdAt: string;
  updatedAt: string;
  brokenLinkIds?: string[];
  brokenLinkCount?: number;
  brokenLinksMetadata?: Array<{ linkId: string; type: 'broken' | 'duplicate' | 'missing_linkset' }>;
};

type Tab = "deleted" | "archived" | "drift" | "badlinks" | "candidates";

interface RequirementsAdminTableProps {
  requirements: Requirement[];
  showActions: "restore" | "sync" | "viewlinks";
  activeTab: Tab;
  selectedRequirements: Set<string>;
  formatDate: (timestamp?: string) => string;
  handleToggleSelect: (requirementId: string) => void;
  handleSelectAll: (requirements: Requirement[]) => void;
  restoreMutation: UseMutationResult<any, any, string, unknown>;
  syncMutation: UseMutationResult<any, any, string, unknown>;
  deleteBrokenLinksMutation: UseMutationResult<any, any, string[], unknown>;
}

export function RequirementsAdminTable({
  requirements,
  showActions,
  activeTab,
  selectedRequirements,
  formatDate,
  handleToggleSelect,
  handleSelectAll,
  restoreMutation,
  syncMutation,
  deleteBrokenLinksMutation
}: RequirementsAdminTableProps): JSX.Element {
  if (!requirements || requirements.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '3rem 0', color: '#6b7280' }}>
        No requirements found
      </div>
    );
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ minWidth: '100%', borderCollapse: 'collapse' }}>
        <thead style={{ backgroundColor: '#f9fafb' }}>
          <tr>
            {showActions === "restore" && (
              <th style={{
                padding: '0.75rem 1.5rem',
                textAlign: 'left',
                borderBottom: '1px solid #e5e7eb'
              }}>
                <input
                  type="checkbox"
                  checked={selectedRequirements.size === requirements.length}
                  onChange={() => handleSelectAll(requirements)}
                  style={{ cursor: 'pointer' }}
                />
              </th>
            )}
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
              Ref
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
              Title
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
              {activeTab === "deleted" ? "Deleted" : activeTab === "badlinks" ? "Issues" : "Updated"}
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
              Actions
            </th>
          </tr>
        </thead>
        <tbody style={{ backgroundColor: 'white' }}>
          {requirements.map((req) => (
            <tr key={req.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
              {showActions === "restore" && (
                <td style={{ padding: '1rem 1.5rem', whiteSpace: 'nowrap' }}>
                  <input
                    type="checkbox"
                    checked={selectedRequirements.has(req.id)}
                    onChange={() => handleToggleSelect(req.id)}
                    style={{ cursor: 'pointer' }}
                  />
                </td>
              )}
              <td style={{
                padding: '1rem 1.5rem',
                whiteSpace: 'nowrap',
                fontSize: '0.875rem',
                fontWeight: '500',
                color: '#111827'
              }}>
                {req.ref}
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
                {req.title}
              </td>
              <td style={{
                padding: '1rem 1.5rem',
                whiteSpace: 'nowrap',
                fontSize: '0.875rem',
                color: '#6b7280'
              }}>
                {activeTab === "badlinks" && req.brokenLinksMetadata ? (
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    {(() => {
                      const brokenCount = req.brokenLinksMetadata.filter(m => m.type === 'broken').length;
                      const duplicateCount = req.brokenLinksMetadata.filter(m => m.type === 'duplicate').length;
                      const missingLinksetCount = req.brokenLinksMetadata.filter(m => m.type === 'missing_linkset').length;
                      return (
                        <>
                          {brokenCount > 0 && (
                            <span style={{
                              fontSize: '0.75rem',
                              padding: '0.25rem 0.5rem',
                              borderRadius: '0.25rem',
                              backgroundColor: '#fee2e2',
                              color: '#991b1b',
                              fontWeight: '500'
                            }}>
                              {brokenCount} Broken
                            </span>
                          )}
                          {duplicateCount > 0 && (
                            <span style={{
                              fontSize: '0.75rem',
                              padding: '0.25rem 0.5rem',
                              borderRadius: '0.25rem',
                              backgroundColor: '#fef3c7',
                              color: '#92400e',
                              fontWeight: '500'
                            }}>
                              {duplicateCount} Duplicate
                            </span>
                          )}
                          {missingLinksetCount > 0 && (
                            <span style={{
                              fontSize: '0.75rem',
                              padding: '0.25rem 0.5rem',
                              borderRadius: '0.25rem',
                              backgroundColor: '#dbeafe',
                              color: '#1e40af',
                              fontWeight: '500'
                            }}>
                              {missingLinksetCount} Missing Linkset
                            </span>
                          )}
                        </>
                      );
                    })()}
                  </div>
                ) : (
                  <>
                    <div>{formatDate(activeTab === "deleted" ? req.deletedAt : req.updatedAt)}</div>
                    {req.deletedBy && (
                      <div style={{ fontSize: '0.75rem', color: '#9ca3af' }}>by {req.deletedBy}</div>
                    )}
                  </>
                )}
              </td>
              <td style={{
                padding: '1rem 1.5rem',
                whiteSpace: 'nowrap',
                fontSize: '0.875rem'
              }}>
                {showActions === "restore" && (
                  <button
                    onClick={() => restoreMutation.mutate(req.id)}
                    disabled={restoreMutation.isPending}
                    style={{
                      color: '#6366f1',
                      backgroundColor: 'transparent',
                      border: 'none',
                      cursor: restoreMutation.isPending ? 'not-allowed' : 'pointer',
                      opacity: restoreMutation.isPending ? 0.5 : 1,
                      textDecoration: 'none'
                    }}
                    onMouseEnter={(e) => {
                      if (!restoreMutation.isPending) {
                        e.currentTarget.style.color = '#4338ca';
                        e.currentTarget.style.textDecoration = 'underline';
                      }
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.color = '#6366f1';
                      e.currentTarget.style.textDecoration = 'none';
                    }}
                  >
                    Restore
                  </button>
                )}
                {showActions === "sync" && (
                  <button
                    onClick={() => syncMutation.mutate(req.id)}
                    disabled={syncMutation.isPending}
                    style={{
                      color: '#6366f1',
                      backgroundColor: 'transparent',
                      border: 'none',
                      cursor: syncMutation.isPending ? 'not-allowed' : 'pointer',
                      opacity: syncMutation.isPending ? 0.5 : 1,
                      textDecoration: 'none'
                    }}
                    onMouseEnter={(e) => {
                      if (!syncMutation.isPending) {
                        e.currentTarget.style.color = '#4338ca';
                        e.currentTarget.style.textDecoration = 'underline';
                      }
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.color = '#6366f1';
                      e.currentTarget.style.textDecoration = 'none';
                    }}
                  >
                    Sync to Markdown
                  </button>
                )}
                {showActions === "viewlinks" && req.brokenLinkIds && (
                  <button
                    onClick={() => deleteBrokenLinksMutation.mutate(req.brokenLinkIds!)}
                    disabled={deleteBrokenLinksMutation.isPending}
                    style={{
                      color: '#dc2626',
                      backgroundColor: 'transparent',
                      border: 'none',
                      cursor: deleteBrokenLinksMutation.isPending ? 'not-allowed' : 'pointer',
                      opacity: deleteBrokenLinksMutation.isPending ? 0.5 : 1,
                      textDecoration: 'none'
                    }}
                    onMouseEnter={(e) => {
                      if (!deleteBrokenLinksMutation.isPending) {
                        e.currentTarget.style.color = '#b91c1c';
                        e.currentTarget.style.textDecoration = 'underline';
                      }
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.color = '#dc2626';
                      e.currentTarget.style.textDecoration = 'none';
                    }}
                  >
                    Remove Link{req.brokenLinkCount && req.brokenLinkCount > 1 ? 's' : ''}
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
