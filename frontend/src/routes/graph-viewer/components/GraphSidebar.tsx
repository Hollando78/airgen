/**
 * GraphSidebar Component
 *
 * Sliding sidebar containing filters, node type controls, hierarchy toggles,
 * and saved views management.
 */

interface SavedView {
  name: string;
}

interface GraphSidebarProps {
  sidebarOpen: boolean;
  onCloseSidebar: () => void;
  nodeTypes: string[];
  nodeTypeCategories: Record<string, string[]>;
  visibleNodeTypes: Set<string>;
  onSetVisibleNodeTypes: (types: Set<string>) => void;
  onToggleNodeType: (type: string) => void;
  onSelectAllInCategory: (types: string[]) => void;
  onDeselectAllInCategory: (types: string[]) => void;
  collapsedCategories: Set<string>;
  onToggleCategory: (category: string) => void;
  showOnlyHierarchy: boolean;
  onSetShowOnlyHierarchy: (show: boolean) => void;
  autoFitEnabled: boolean;
  onSetAutoFitEnabled: (enabled: boolean) => void;
  savedViews: SavedView[];
  onLoadView: (viewName: string) => void;
  onDeleteView: (viewName: string) => void;
}

export function GraphSidebar({
  sidebarOpen,
  onCloseSidebar,
  nodeTypes,
  nodeTypeCategories,
  visibleNodeTypes,
  onSetVisibleNodeTypes,
  onToggleNodeType,
  onSelectAllInCategory,
  onDeselectAllInCategory,
  collapsedCategories,
  onToggleCategory,
  showOnlyHierarchy,
  onSetShowOnlyHierarchy,
  autoFitEnabled,
  onSetAutoFitEnabled,
  savedViews,
  onLoadView,
  onDeleteView,
}: GraphSidebarProps) {
  return (
    <div style={{
      position: 'absolute',
      right: sidebarOpen ? 0 : '-320px',
      top: 0,
      bottom: 0,
      width: '320px',
      backgroundColor: 'white',
      boxShadow: '-2px 0 8px rgba(0,0,0,0.1)',
      transition: 'right 0.3s ease-in-out',
      zIndex: 100,
      display: 'flex',
      flexDirection: 'column',
      overflowY: 'auto'
    }}>
      {/* Header with global controls */}
      <div style={{
        padding: '16px',
        borderBottom: '2px solid #e5e7eb',
        backgroundColor: '#f9fafb',
        position: 'sticky',
        top: 0,
        zIndex: 10
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: '700', margin: 0 }}>Filters & Controls</h2>
          <button
            onClick={onCloseSidebar}
            style={{
              padding: '4px 8px',
              fontSize: '18px',
              cursor: 'pointer',
              backgroundColor: 'transparent',
              border: 'none',
              color: '#6b7280'
            }}
            title="Close sidebar"
          >
            ×
          </button>
        </div>

        {/* Global select all/clear buttons */}
        <div style={{ display: 'flex', gap: '6px' }}>
          <button
            onClick={() => onSetVisibleNodeTypes(new Set(nodeTypes))}
            style={{
              flex: 1,
              padding: '6px 12px',
              fontSize: '12px',
              cursor: 'pointer',
              backgroundColor: '#6366f1',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              fontWeight: '500'
            }}
          >
            Select All
          </button>
          <button
            onClick={() => onSetVisibleNodeTypes(new Set())}
            style={{
              flex: 1,
              padding: '6px 12px',
              fontSize: '12px',
              cursor: 'pointer',
              backgroundColor: '#6b7280',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              fontWeight: '500'
            }}
          >
            Clear All
          </button>
        </div>

        {/* Hierarchy filter toggle */}
        <div style={{ marginTop: '12px', padding: '8px', backgroundColor: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '6px' }}>
          <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', fontSize: '13px', fontWeight: '500' }}>
            <input
              type="checkbox"
              checked={showOnlyHierarchy}
              onChange={(e) => onSetShowOnlyHierarchy(e.target.checked)}
              style={{ marginRight: '8px', cursor: 'pointer', width: '16px', height: '16px' }}
            />
            <span>Show Only Hierarchical Relationships</span>
          </label>
          <p style={{ margin: '6px 0 0 24px', fontSize: '11px', color: '#1e40af', lineHeight: '1.4' }}>
            Hide peer relationships (SATISFIES, RELATED_TO, etc.) to see only the structural hierarchy.
          </p>
        </div>

        {/* Auto-fit toggle */}
        <div style={{ marginTop: '12px', padding: '8px', backgroundColor: '#fef3c7', border: '1px solid #fcd34d', borderRadius: '6px' }}>
          <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', fontSize: '13px', fontWeight: '500' }}>
            <input
              type="checkbox"
              checked={autoFitEnabled}
              onChange={(e) => onSetAutoFitEnabled(e.target.checked)}
              style={{ marginRight: '8px', cursor: 'pointer', width: '16px', height: '16px' }}
            />
            <span>Auto-Fit on Layout</span>
          </label>
          <p style={{ margin: '6px 0 0 24px', fontSize: '11px', color: '#92400e', lineHeight: '1.4' }}>
            Automatically zoom and pan to fit the graph when applying layouts. Disable to preserve your viewport position.
          </p>
        </div>
      </div>

      {/* Node type categories */}
      <div style={{ flex: 1, padding: '16px' }}>
        {Object.entries(nodeTypeCategories).map(([category, types]) => {
          const isCollapsed = collapsedCategories.has(category);
          const allSelected = types.every(t => visibleNodeTypes.has(t));
          const someSelected = types.some(t => visibleNodeTypes.has(t)) && !allSelected;

          return (
            <div key={category} style={{ marginBottom: '16px', paddingBottom: '12px', borderBottom: '1px solid #e5e7eb' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <button
                  onClick={() => onToggleCategory(category)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    fontSize: '14px',
                    fontWeight: '600',
                    color: '#111827',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: '4px 0'
                  }}
                >
                  <span style={{ fontSize: '12px' }}>{isCollapsed ? '▶' : '▼'}</span>
                  <span>{category}</span>
                  <span style={{
                    fontSize: '11px',
                    padding: '2px 6px',
                    borderRadius: '10px',
                    backgroundColor: allSelected ? '#dcfce7' : someSelected ? '#fef3c7' : '#f3f4f6',
                    color: allSelected ? '#166534' : someSelected ? '#92400e' : '#6b7280',
                    fontWeight: '600'
                  }}>
                    {types.filter(t => visibleNodeTypes.has(t)).length}/{types.length}
                  </span>
                </button>
                {!isCollapsed && (
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <button
                      onClick={() => onSelectAllInCategory(types)}
                      style={{
                        padding: '4px 8px',
                        fontSize: '11px',
                        cursor: 'pointer',
                        backgroundColor: '#10b981',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        fontWeight: '500'
                      }}
                      title={`Select all ${category}`}
                    >
                      All
                    </button>
                    <button
                      onClick={() => onDeselectAllInCategory(types)}
                      style={{
                        padding: '4px 8px',
                        fontSize: '11px',
                        cursor: 'pointer',
                        backgroundColor: '#ef4444',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        fontWeight: '500'
                      }}
                      title={`Deselect all ${category}`}
                    >
                      None
                    </button>
                  </div>
                )}
              </div>
              {!isCollapsed && (
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr',
                  gap: '6px',
                  marginTop: '8px'
                }}>
                  {types.map(type => (
                    <label key={type} style={{
                      display: 'flex',
                      alignItems: 'center',
                      cursor: 'pointer',
                      padding: '6px 8px',
                      backgroundColor: visibleNodeTypes.has(type) ? '#eff6ff' : '#f9fafb',
                      border: `1px solid ${visibleNodeTypes.has(type) ? '#3b82f6' : '#e5e7eb'}`,
                      borderRadius: '6px',
                      transition: 'all 0.15s'
                    }}>
                      <input
                        type="checkbox"
                        checked={visibleNodeTypes.has(type)}
                        onChange={() => onToggleNodeType(type)}
                        style={{ marginRight: '8px', cursor: 'pointer', width: '16px', height: '16px' }}
                      />
                      <span style={{ fontSize: '13px', fontWeight: visibleNodeTypes.has(type) ? '500' : '400' }}>{type}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Saved views section */}
      {savedViews.length > 0 && (
        <div style={{ padding: '16px', borderTop: '2px solid #e5e7eb', backgroundColor: '#f9fafb' }}>
          <h3 style={{ fontSize: '14px', margin: '0 0 12px 0', fontWeight: '600' }}>Saved Views</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {savedViews.map(view => (
              <div key={view.name} style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => onLoadView(view.name)}
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    fontSize: '13px',
                    cursor: 'pointer',
                    backgroundColor: 'white',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    textAlign: 'left',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    fontWeight: '500'
                  }}
                  title={view.name}
                >
                  {view.name}
                </button>
                <button
                  onClick={() => onDeleteView(view.name)}
                  style={{
                    padding: '8px 12px',
                    fontSize: '14px',
                    cursor: 'pointer',
                    backgroundColor: '#ef4444',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px'
                  }}
                  title="Delete view"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
