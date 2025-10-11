/**
 * GraphControls Component
 *
 * Header section with search input, layout selector, and control buttons
 * for the graph viewer.
 */

interface GraphControlsProps {
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  selectedLayout: string;
  onLayoutChange: (layout: string) => void;
  onResetLayout: () => void;
  onFitView: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onSaveView: () => void;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
}

export function GraphControls({
  searchTerm,
  setSearchTerm,
  selectedLayout,
  onLayoutChange,
  onResetLayout,
  onFitView,
  onZoomIn,
  onZoomOut,
  onSaveView,
  sidebarOpen,
  onToggleSidebar,
}: GraphControlsProps) {
  return (
    <div className="graph-viewer-header">
      <h1>Graph Database Viewer</h1>
      <div className="graph-viewer-controls">
        <input
          type="text"
          placeholder="Search nodes..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="graph-search-input"
        />
        <select
          value={selectedLayout}
          onChange={(e) => onLayoutChange(e.target.value)}
          className="graph-control-btn"
          style={{
            padding: '0.5rem 0.75rem',
            fontSize: '0.875rem',
            cursor: 'pointer',
            minWidth: '180px'
          }}
        >
          <option value="cose">CoSE (Force-Directed)</option>
          <option value="fcose">fCoSE (Fast)</option>
          <option value="dagre">Dagre (Hierarchical)</option>
          <option value="breadthfirst">Breadth-First</option>
          <option value="circle">Circle</option>
          <option value="concentric">Concentric</option>
          <option value="grid">Grid</option>
        </select>
        <button onClick={onResetLayout} className="graph-control-btn">
          Reset Layout
        </button>
        <button onClick={onFitView} className="graph-control-btn">
          Fit View
        </button>
        <button onClick={onZoomIn} className="graph-control-btn">
          Zoom In
        </button>
        <button onClick={onZoomOut} className="graph-control-btn">
          Zoom Out
        </button>
        <button onClick={onSaveView} className="graph-control-btn">
          Save View
        </button>
        <button onClick={onToggleSidebar} className="graph-control-btn">
          {sidebarOpen ? 'Hide Filters' : 'Show Filters'}
        </button>
      </div>
    </div>
  );
}
