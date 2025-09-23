import type { SysmlConnector } from "../../hooks/useArchitecture";

interface ConnectorDetailsPanelProps {
  connector: SysmlConnector;
  onUpdate: (updates: Partial<Omit<SysmlConnector, "id">>) => void;
  onRemove: () => void;
}

const connectorKinds: Array<{ value: SysmlConnector["kind"]; label: string }> = [
  { value: "flow", label: "Flow" },
  { value: "association", label: "Association" },
  { value: "dependency", label: "Dependency" },
  { value: "composition", label: "Composition" }
];

export function ConnectorDetailsPanel({ connector, onUpdate, onRemove }: ConnectorDetailsPanelProps) {
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

      <p style={{ fontSize: "12px", color: "#64748b", lineHeight: 1.5 }}>
        Drag connection handles between blocks or ports to create SysML-style diagrams.
        Use the controls above to label the connector and set its semantic type.
      </p>
    </aside>
  );
}
