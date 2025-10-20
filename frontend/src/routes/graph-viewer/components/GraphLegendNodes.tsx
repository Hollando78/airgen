/**
 * GraphLegendNodes Component
 *
 * Legend showing node types with their colors and shapes.
 * Positioned at bottom-left of the graph canvas.
 * Updated with semantic shapes for better visual understanding.
 */

interface GraphLegendNodesProps {
  inspectorOpen: boolean;
}

interface LegendEntry {
  color: string;
  borderColor: string;
  label: string;
  shape: 'octagon' | 'hexagon' | 'round-rect' | 'rect' | 'ellipse' | 'diamond' | 'star' | 'tag' | 'vee';
}

const LEGEND_ITEMS: LegendEntry[] = [
  { color: "#7c3aed", borderColor: "#5b21b6", label: "Tenant", shape: "octagon" },
  { color: "#8b5cf6", borderColor: "#6d28d9", label: "Project", shape: "hexagon" },
  { color: "#10b981", borderColor: "#047857", label: "Document", shape: "round-rect" },
  { color: "#34d399", borderColor: "#059669", label: "Section", shape: "round-rect" },
  { color: "#fbbf24", borderColor: "#d97706", label: "Info", shape: "ellipse" },
  { color: "#3b82f6", borderColor: "#1e40af", label: "Requirement", shape: "rect" },
  { color: "#93c5fd", borderColor: "#3b82f6", label: "Req Candidate", shape: "vee" },
  { color: "#ec4899", borderColor: "#be185d", label: "LinkSet", shape: "diamond" },
  { color: "#a855f7", borderColor: "#7e22ce", label: "TraceLink", shape: "star" },
  { color: "#14b8a6", borderColor: "#0f766e", label: "Arch Diagram", shape: "round-rect" },
  { color: "#6366f1", borderColor: "#3730a3", label: "Arch Block", shape: "rect" },
  { color: "#84cc16", borderColor: "#4d7c0f", label: "Connector", shape: "diamond" },
  { color: "#d946ef", borderColor: "#a21caf", label: "Port Def", shape: "hexagon" },
  { color: "#f0abfc", borderColor: "#d946ef", label: "Port Inst", shape: "ellipse" }
];

function ShapeIcon({ shape, color, borderColor }: { shape: string; color: string; borderColor: string }) {
  const baseStyle = {
    display: 'inline-block',
    width: '18px',
    height: '18px',
    backgroundColor: color,
    border: `2px solid ${borderColor}`,
    marginRight: '6px',
    verticalAlign: 'middle',
    flexShrink: 0
  };

  switch (shape) {
    case 'octagon':
      return <span style={{ ...baseStyle, clipPath: 'polygon(30% 0%, 70% 0%, 100% 30%, 100% 70%, 70% 100%, 30% 100%, 0% 70%, 0% 30%)' }} />;
    case 'hexagon':
      return <span style={{ ...baseStyle, clipPath: 'polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)' }} />;
    case 'round-rect':
      return <span style={{ ...baseStyle, borderRadius: '4px' }} />;
    case 'rect':
      return <span style={{ ...baseStyle }} />;
    case 'ellipse':
      return <span style={{ ...baseStyle, borderRadius: '50%' }} />;
    case 'diamond':
      return <span style={{ ...baseStyle, transform: 'rotate(45deg)' }} />;
    case 'star':
      return <span style={{ ...baseStyle, clipPath: 'polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)' }} />;
    case 'tag':
      return <span style={{ ...baseStyle, clipPath: 'polygon(0% 0%, 75% 0%, 100% 50%, 75% 100%, 0% 100%)' }} />;
    case 'vee':
      return <span style={{ ...baseStyle, clipPath: 'polygon(50% 100%, 0% 0%, 100% 0%)' }} />;
    default:
      return <span style={{ ...baseStyle }} />;
  }
}

export function GraphLegendNodes({ inspectorOpen }: GraphLegendNodesProps) {
  const leftPosition = inspectorOpen ? '370px' : '1rem';

  return (
    <div className="graph-legend graph-legend-left" style={{ left: leftPosition }}>
      <h4>Node Types</h4>
      <div className="legend-items">
        {LEGEND_ITEMS.map((item, idx) => (
          <div key={idx} className="legend-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '4px' }}>
            <ShapeIcon shape={item.shape} color={item.color} borderColor={item.borderColor} />
            <span style={{ fontSize: '12px' }}>{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
