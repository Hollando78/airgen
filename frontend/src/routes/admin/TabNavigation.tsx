type Tab = "deleted" | "archived" | "drift" | "badlinks" | "candidates";

interface TabNavigationProps {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
  deletedCount?: number;
  archivedCount?: number;
  driftCount?: number;
  badLinksCount?: number;
  candidatesCount?: number;
}

export function TabNavigation({
  activeTab,
  onTabChange,
  deletedCount,
  archivedCount,
  driftCount,
  badLinksCount,
  candidatesCount
}: TabNavigationProps): JSX.Element {
  return (
    <div style={{ borderBottom: '1px solid #e5e7eb' }}>
      <nav style={{ display: 'flex', marginBottom: '-1px' }}>
        <button
          onClick={() => onTabChange("deleted")}
          style={{
            padding: '0.75rem 1.5rem',
            fontSize: '0.875rem',
            fontWeight: '500',
            borderTop: 'none',
            borderLeft: 'none',
            borderRight: 'none',
            borderBottom: activeTab === "deleted" ? '2px solid #6366f1' : '2px solid transparent',
            color: activeTab === "deleted" ? '#6366f1' : '#6b7280',
            backgroundColor: 'transparent',
            cursor: 'pointer'
          }}
        >
          Deleted Requirements
          {deletedCount !== undefined && (
            <span style={{
              marginLeft: '0.5rem',
              fontSize: '0.75rem',
              backgroundColor: '#f3f4f6',
              padding: '0.25rem 0.5rem',
              borderRadius: '9999px'
            }}>
              {deletedCount}
            </span>
          )}
        </button>
        <button
          onClick={() => onTabChange("archived")}
          style={{
            padding: '0.75rem 1.5rem',
            fontSize: '0.875rem',
            fontWeight: '500',
            borderTop: 'none',
            borderLeft: 'none',
            borderRight: 'none',
            borderBottom: activeTab === "archived" ? '2px solid #6366f1' : '2px solid transparent',
            color: activeTab === "archived" ? '#6366f1' : '#6b7280',
            backgroundColor: 'transparent',
            cursor: 'pointer'
          }}
        >
          Archived Requirements
          {archivedCount !== undefined && (
            <span style={{
              marginLeft: '0.5rem',
              fontSize: '0.75rem',
              backgroundColor: '#f3f4f6',
              padding: '0.25rem 0.5rem',
              borderRadius: '9999px'
            }}>
              {archivedCount}
            </span>
          )}
        </button>
        <button
          onClick={() => onTabChange("drift")}
          style={{
            padding: '0.75rem 1.5rem',
            fontSize: '0.875rem',
            fontWeight: '500',
            borderTop: 'none',
            borderLeft: 'none',
            borderRight: 'none',
            borderBottom: activeTab === "drift" ? '2px solid #6366f1' : '2px solid transparent',
            color: activeTab === "drift" ? '#6366f1' : '#6b7280',
            backgroundColor: 'transparent',
            cursor: 'pointer'
          }}
        >
          Drift Detection
          {driftCount !== undefined && driftCount > 0 && (
            <span style={{
              marginLeft: '0.5rem',
              fontSize: '0.75rem',
              backgroundColor: '#fee2e2',
              color: '#991b1b',
              padding: '0.25rem 0.5rem',
              borderRadius: '9999px'
            }}>
              {driftCount}
            </span>
          )}
        </button>
        <button
          onClick={() => onTabChange("badlinks")}
          style={{
            padding: '0.75rem 1.5rem',
            fontSize: '0.875rem',
            fontWeight: '500',
            borderTop: 'none',
            borderLeft: 'none',
            borderRight: 'none',
            borderBottom: activeTab === "badlinks" ? '2px solid #6366f1' : '2px solid transparent',
            color: activeTab === "badlinks" ? '#6366f1' : '#6b7280',
            backgroundColor: 'transparent',
            cursor: 'pointer'
          }}
        >
          Bad Links
          {badLinksCount !== undefined && badLinksCount > 0 && (
            <span style={{
              marginLeft: '0.5rem',
              fontSize: '0.75rem',
              backgroundColor: '#fef3c7',
              color: '#92400e',
              padding: '0.25rem 0.5rem',
              borderRadius: '9999px'
            }}>
              {badLinksCount}
            </span>
          )}
        </button>
        <button
          onClick={() => onTabChange("candidates")}
          style={{
            padding: '0.75rem 1.5rem',
            fontSize: '0.875rem',
            fontWeight: '500',
            borderTop: 'none',
            borderLeft: 'none',
            borderRight: 'none',
            borderBottom: activeTab === "candidates" ? '2px solid #6366f1' : '2px solid transparent',
            color: activeTab === "candidates" ? '#6366f1' : '#6b7280',
            backgroundColor: 'transparent',
            cursor: 'pointer'
          }}
        >
          Candidates
          {candidatesCount !== undefined && (
            <span style={{
              marginLeft: '0.5rem',
              fontSize: '0.75rem',
              backgroundColor: '#f3f4f6',
              padding: '0.25rem 0.5rem',
              borderRadius: '9999px'
            }}>
              {candidatesCount}
            </span>
          )}
        </button>
      </nav>
    </div>
  );
}
