/**
 * GraphLegendNodes Component
 *
 * Legend showing node types with their colors.
 * Positioned at bottom-left of the graph canvas.
 */

interface GraphLegendNodesProps {
  inspectorOpen: boolean;
}

export function GraphLegendNodes({ inspectorOpen }: GraphLegendNodesProps) {
  const leftPosition = inspectorOpen ? '370px' : '1rem';

  return (
    <div className="graph-legend graph-legend-left" style={{ left: leftPosition }}>
      <h4>Node Types</h4>
      <div className="legend-items">
        <div className="legend-item">
          <span className="legend-color" style={{ background: "#8b5cf6" }}></span>
          <span>Tenant</span>
        </div>
        <div className="legend-item">
          <span className="legend-color" style={{ background: "#06b6d4" }}></span>
          <span>Project</span>
        </div>
        <div className="legend-item">
          <span className="legend-color" style={{ background: "#10b981" }}></span>
          <span>Document</span>
        </div>
        <div className="legend-item">
          <span className="legend-color" style={{ background: "#f59e0b" }}></span>
          <span>Section</span>
        </div>
        <div className="legend-item">
          <span className="legend-color" style={{ background: "#3b82f6" }}></span>
          <span>Requirement</span>
        </div>
        <div className="legend-item">
          <span className="legend-color" style={{ background: "#ec4899" }}></span>
          <span>LinkSet</span>
        </div>
        <div className="legend-item">
          <span className="legend-color" style={{ background: "#a855f7" }}></span>
          <span>TraceLink</span>
        </div>
        <div className="legend-item">
          <span className="legend-color" style={{ background: "#14b8a6" }}></span>
          <span>Arch Diagram</span>
        </div>
        <div className="legend-item">
          <span className="legend-color" style={{ background: "#6366f1" }}></span>
          <span>Arch Block</span>
        </div>
        <div className="legend-item">
          <span className="legend-color" style={{ background: "#84cc16" }}></span>
          <span>Connector</span>
        </div>
      </div>
    </div>
  );
}
