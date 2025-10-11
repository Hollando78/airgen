/**
 * GraphInspector Component
 *
 * Displays detailed information about a selected node,
 * including ID, label, type, and properties.
 */

import type { NodeInfo } from "../hooks/useGraphState";

interface GraphInspectorProps {
  selectedNodeInfo: NodeInfo | null;
  onClose: () => void;
}

export function GraphInspector({ selectedNodeInfo, onClose }: GraphInspectorProps) {
  if (!selectedNodeInfo) return null;

  return (
    <div className="graph-inspector-panel">
      <div className="inspector-header">
        <h3>Node Details</h3>
        <button
          onClick={onClose}
          className="inspector-close"
        >
          ×
        </button>
      </div>
      <div className="inspector-content">
        <div className="inspector-field">
          <label>ID:</label>
          <span>{selectedNodeInfo.id}</span>
        </div>
        <div className="inspector-field">
          <label>Label:</label>
          <span>{selectedNodeInfo.label}</span>
        </div>
        <div className="inspector-field">
          <label>Type:</label>
          <span className="node-type-badge">{selectedNodeInfo.type}</span>
        </div>
        {selectedNodeInfo.properties && (
          <div className="inspector-field">
            <label>Properties:</label>
            <pre className="properties-json">
              {JSON.stringify(selectedNodeInfo.properties, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
