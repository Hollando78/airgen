import { useState } from "react";
import type { SysmlConnector } from "../../hooks/useArchitectureApi";
import type { DocumentRecord } from "../../types";

interface ConnectorDetailsPanelProps {
  connector: SysmlConnector;
  onUpdate: (updates: Partial<Omit<SysmlConnector, "id">>) => void;
  onRemove: () => void;
  documents: DocumentRecord[];
  onAddDocument: (documentId: string) => void;
  onRemoveDocument: (documentId: string) => void;
}

const connectorKinds: Array<{ value: SysmlConnector["kind"]; label: string }> = [
  { value: "flow", label: "Flow" },
  { value: "association", label: "Association" },
  { value: "dependency", label: "Dependency" },
  { value: "composition", label: "Composition" }
];

export function ConnectorDetailsPanel({ connector, onUpdate, onRemove, documents, onAddDocument, onRemoveDocument }: ConnectorDetailsPanelProps) {
  const [selectedDocumentId, setSelectedDocumentId] = useState("");

  const linkedDocuments = documents.filter(doc => connector.documentIds?.includes(doc.id));
  const availableDocuments = documents.filter(doc => !connector.documentIds?.includes(doc.id));

  const handleAddDocument = () => {
    if (!selectedDocumentId) {return;}
    onAddDocument(selectedDocumentId);
    setSelectedDocumentId("");
  };

  return (
    <aside className="panel" style={{ minWidth: "260px" }}>
      <div className="panel-header">
        <div>
          <h2>Connector</h2>
          <p style={{ fontSize: "12px", color: "#64748b" }}>Configure relationship</p>
        </div>
        <button className="ghost-button" onClick={onRemove}>
          Remove
        </button>
      </div>

      <div className="field">
        <label>Label</label>
        <input
          value={connector.label ?? ""}
          onChange={event => onUpdate({ label: event.target.value })}
          placeholder="e.g. publishes, calls"
        />
      </div>

      <div className="field">
        <label>Kind</label>
        <select
          value={connector.kind}
          onChange={event => onUpdate({ kind: event.target.value as SysmlConnector["kind"] })}
        >
          {connectorKinds.map(option => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="field-group" style={{ marginTop: "16px" }}>
        <label style={{ fontSize: "13px", fontWeight: "500", color: "#374151", marginBottom: "8px", display: "block" }}>
          Styling
        </label>
        
        <div className="field">
          <label>Line Style</label>
          <select
            value={connector.lineStyle ?? "straight"}
            onChange={event => onUpdate({ lineStyle: event.target.value })}
          >
            <option value="straight">Straight</option>
            <option value="smoothstep">Curved</option>
            <option value="step">Rectilinear</option>
            <option value="bezier">Bezier</option>
          </select>
        </div>

        <div className="field">
          <label>Line Pattern</label>
          <select
            value={connector.linePattern ?? "solid"}
            onChange={event => onUpdate({ linePattern: event.target.value })}
          >
            <option value="solid">Solid</option>
            <option value="dashed">Dashed</option>
            <option value="dotted">Dotted</option>
          </select>
        </div>

        <div className="field-grid" style={{ gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
          <div className="field">
            <label>Start Marker</label>
            <select
              value={connector.markerStart ?? "none"}
              onChange={event => onUpdate({ markerStart: event.target.value })}
            >
              <option value="none">None</option>
              <option value="arrow">Arrow</option>
              <option value="arrowclosed">Arrow (Filled)</option>
            </select>
          </div>

          <div className="field">
            <label>End Marker</label>
            <select
              value={connector.markerEnd ?? "arrowclosed"}
              onChange={event => onUpdate({ markerEnd: event.target.value })}
            >
              <option value="none">None</option>
              <option value="arrow">Arrow</option>
              <option value="arrowclosed">Arrow (Filled)</option>
            </select>
          </div>
        </div>

        <div className="field-grid" style={{ gridTemplateColumns: "1fr auto", gap: "8px", alignItems: "end" }}>
          <div className="field">
            <label>Color</label>
            <input
              type="color"
              value={connector.color ?? "#334155"}
              onChange={event => onUpdate({ color: event.target.value })}
              style={{ width: "100%", height: "32px", padding: "2px", border: "1px solid #d1d5db", borderRadius: "4px" }}
            />
          </div>

          <div className="field" style={{ width: "80px" }}>
            <label>Width</label>
            <input
              type="number"
              min="1"
              max="10"
              value={connector.strokeWidth ?? 2}
              onChange={event => onUpdate({ strokeWidth: Number(event.target.value) })}
              style={{ width: "100%" }}
            />
          </div>
        </div>
      </div>

      <div className="panel" style={{ background: "#f1f5f9", border: "1px solid #cbd5e1" }}>
        <h3 style={{ marginTop: 0 }}>Associated Documents (ICD)</h3>
        {linkedDocuments.length === 0 ? (
          <p style={{ fontSize: "12px", color: "#64748b" }}>No ICD documents linked yet.</p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: "6px" }}>
            {linkedDocuments.map(doc => (
              <li key={doc.id} style={{
                padding: "8px",
                borderRadius: "6px",
                background: "#fff",
                border: "1px solid #e2e8f0",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center"
              }}>
                <div>
                  <div style={{ fontWeight: 500, fontSize: "14px" }}>{doc.name}</div>
                  {doc.description && (
                    <div style={{ fontSize: "12px", color: "#64748b" }}>{doc.description}</div>
                  )}
                </div>
                <button
                  className="ghost-button"
                  onClick={() => onRemoveDocument(doc.id)}
                  style={{ fontSize: "12px", padding: "4px 8px" }}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}

        {availableDocuments.length > 0 && (
          <div style={{ marginTop: "12px", display: "flex", flexDirection: "column", gap: "8px" }}>
            <div className="field" style={{ margin: 0 }}>
              <label>Link ICD document</label>
              <select
                value={selectedDocumentId}
                onChange={event => setSelectedDocumentId(event.target.value)}
              >
                <option value="">Select a document...</option>
                {availableDocuments.map(doc => (
                  <option key={doc.id} value={doc.id}>
                    {doc.name}
                  </option>
                ))}
              </select>
            </div>
            <button
              className="primary-button"
              onClick={handleAddDocument}
              disabled={!selectedDocumentId}
            >
              Link document
            </button>
          </div>
        )}
      </div>

      <p style={{ fontSize: "12px", color: "#64748b", lineHeight: 1.5 }}>
        Drag connection handles between blocks or ports to create SysML-style diagrams.
        Use the controls above to label the connector and set its semantic type and appearance.
      </p>
    </aside>
  );
}
