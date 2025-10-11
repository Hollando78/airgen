/**
 * GraphLegendRelationships Component
 *
 * Legend showing relationship types and custom edge styles.
 * Positioned at bottom-right of the graph canvas.
 */

import type { EdgeStyle } from "../hooks/useEdgeStyles";

interface GraphLegendRelationshipsProps {
  edgeStyles: Map<string, EdgeStyle>;
  onResetAllEdgeStyles: () => void;
  sidebarOpen: boolean;
}

export function GraphLegendRelationships({ edgeStyles, onResetAllEdgeStyles, sidebarOpen }: GraphLegendRelationshipsProps) {
  const rightPosition = sidebarOpen ? '340px' : '1rem';

  return (
    <div className="graph-legend graph-legend-right" style={{ right: rightPosition }}>
      <h4>Relationships</h4>
      <div className="legend-items">
        <div className="legend-item">
          <span className="legend-edge" style={{
            display: "inline-block",
            width: "20px",
            height: "4px",
            background: "#1e40af",
            marginRight: "8px",
            verticalAlign: "middle"
          }}></span>
          <span style={{ fontSize: "11px", fontWeight: "600" }}>Strong Hierarchy</span>
        </div>
        <div className="legend-item">
          <span className="legend-edge" style={{
            display: "inline-block",
            width: "20px",
            height: "3px",
            background: "#4b5563",
            marginRight: "8px",
            verticalAlign: "middle"
          }}></span>
          <span style={{ fontSize: "11px", fontWeight: "600" }}>Medium Hierarchy</span>
        </div>
        <div className="legend-item">
          <span className="legend-edge" style={{
            display: "inline-block",
            width: "20px",
            height: "2px",
            background: "#94a3b8",
            backgroundImage: "linear-gradient(to right, #94a3b8 50%, transparent 50%)",
            backgroundSize: "10px 100%",
            marginRight: "8px",
            verticalAlign: "middle"
          }}></span>
          <span style={{ fontSize: "11px", fontWeight: "600" }}>Peer Relationships</span>
        </div>

        {edgeStyles.size > 0 && (
          <div className="legend-item" style={{ borderTop: "1px solid #e5e7eb", marginTop: "8px", paddingTop: "8px" }}>
            <span style={{ fontSize: "12px", fontWeight: "700", display: "block", marginBottom: "8px" }}>Custom Styles</span>
          </div>
        )}

        {Array.from(edgeStyles.entries()).map(([edgeType, style]) => {
          const linePattern =
            style.lineStyle === 'dashed'
              ? `linear-gradient(to right, ${style.color} 50%, transparent 50%)`
              : style.lineStyle === 'dotted'
              ? `repeating-linear-gradient(to right, ${style.color} 0px, ${style.color} 2px, transparent 2px, transparent 4px)`
              : style.color;

          const backgroundSize = style.lineStyle === 'dashed' ? '10px 100%' : undefined;

          return (
            <div key={edgeType} className="legend-item">
              <span className="legend-edge" style={{
                display: "inline-block",
                width: "20px",
                height: `${style.width}px`,
                background: linePattern,
                backgroundSize,
                marginRight: "8px",
                verticalAlign: "middle"
              }}></span>
              <span style={{ fontSize: "11px", fontWeight: "600" }}>{edgeType}</span>
            </div>
          );
        })}

        {edgeStyles.size > 0 && (
          <div className="legend-item" style={{ marginTop: "8px" }}>
            <button
              onClick={() => {
                if (confirm('Reset all edge styles?')) {
                  onResetAllEdgeStyles();
                }
              }}
              style={{
                padding: '4px 8px',
                fontSize: '11px',
                cursor: 'pointer',
                backgroundColor: '#ef4444',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                fontWeight: '500',
                width: '100%'
              }}
            >
              Reset All Edge Styles
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
