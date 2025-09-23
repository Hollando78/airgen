import { useState } from "react";
import type { SysmlBlock, PortDirection } from "../../hooks/useArchitecture";

interface BlockDetailsPanelProps {
  block: SysmlBlock;
  onUpdate: (updates: Partial<Omit<SysmlBlock, "id" | "ports" | "position" | "size">>) => void;
  onUpdatePosition: (position: { x: number; y: number }) => void;
  onUpdateSize: (size: { width: number; height: number }) => void;
  onRemove: () => void;
  onAddPort: (port: { name: string; direction: PortDirection }) => void;
  onUpdatePort: (portId: string, updates: { name?: string; direction?: PortDirection }) => void;
  onRemovePort: (portId: string) => void;
}

const kindOptions = [
  { value: "system", label: "System" },
  { value: "subsystem", label: "Subsystem" },
  { value: "component", label: "Component" },
  { value: "actor", label: "Actor" },
  { value: "external", label: "External" },
  { value: "interface", label: "Interface" }
] as const;

const directionOptions: { value: PortDirection; label: string }[] = [
  { value: "in", label: "Input" },
  { value: "out", label: "Output" },
  { value: "inout", label: "Bidirectional" }
];

export function BlockDetailsPanel({
  block,
  onUpdate,
  onUpdatePosition,
  onUpdateSize,
  onRemove,
  onAddPort,
  onUpdatePort,
  onRemovePort
}: BlockDetailsPanelProps) {
  const [portDraft, setPortDraft] = useState({ name: "", direction: "in" as PortDirection });

  const handleAddPort = () => {
    if (!portDraft.name.trim()) return;
    onAddPort({ name: portDraft.name.trim(), direction: portDraft.direction });
    setPortDraft({ name: "", direction: "in" });
  };

  return (
    <aside className="panel" style={{ minWidth: "280px" }}>
      <div className="panel-header">
        <div>
          <h2>Block Details</h2>
          <p style={{ fontSize: "12px", color: "#64748b" }}>Edit SysML block properties</p>
        </div>
        <button className="ghost-button" onClick={onRemove}>
          Remove
        </button>
      </div>

      <div className="field">
        <label>Name</label>
        <input
          value={block.name}
          onChange={event => onUpdate({ name: event.target.value })}
          placeholder="Block name"
        />
      </div>

      <div className="field">
        <label>Stereotype</label>
        <input
          value={block.stereotype ?? ""}
          onChange={event => onUpdate({ stereotype: event.target.value })}
          placeholder="e.g. block, interface, subsystem"
        />
      </div>

      <div className="field">
        <label>Kind</label>
        <select
          value={block.kind}
          onChange={event => onUpdate({ kind: event.target.value as SysmlBlock["kind"] })}
        >
          {kindOptions.map(option => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label>Description</label>
        <textarea
          value={block.description ?? ""}
          onChange={event => onUpdate({ description: event.target.value })}
          rows={3}
          placeholder="Optional block description"
        />
      </div>

      <div className="field" style={{ display: "flex", gap: "8px" }}>
        <div style={{ flex: 1 }}>
          <label>Position X</label>
          <input
            type="number"
            value={Math.round(block.position.x)}
            onChange={event => onUpdatePosition({ x: Number(event.target.value), y: block.position.y })}
          />
        </div>
        <div style={{ flex: 1 }}>
          <label>Position Y</label>
          <input
            type="number"
            value={Math.round(block.position.y)}
            onChange={event => onUpdatePosition({ x: block.position.x, y: Number(event.target.value) })}
          />
        </div>
      </div>

      <div className="field" style={{ display: "flex", gap: "8px" }}>
        <div style={{ flex: 1 }}>
          <label>Width</label>
          <input
            type="number"
            min={120}
            value={Math.round(block.size.width)}
            onChange={event => onUpdateSize({ width: Number(event.target.value), height: block.size.height })}
          />
        </div>
        <div style={{ flex: 1 }}>
          <label>Height</label>
          <input
            type="number"
            min={120}
            value={Math.round(block.size.height)}
            onChange={event => onUpdateSize({ width: block.size.width, height: Number(event.target.value) })}
          />
        </div>
      </div>

      <div className="panel" style={{ background: "#f8fafc", border: "1px solid #dbeafe" }}>
        <h3 style={{ marginTop: 0 }}>Ports</h3>
        {block.ports.length === 0 ? (
          <p style={{ fontSize: "12px", color: "#64748b" }}>No ports defined yet.</p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: "8px" }}>
            {block.ports.map(port => (
              <li key={port.id} style={{
                padding: "8px",
                borderRadius: "6px",
                background: "#fff",
                border: "1px solid #e2e8f0",
                display: "flex",
                flexDirection: "column",
                gap: "6px"
              }}>
                <div className="field" style={{ margin: 0 }}>
                  <label>Name</label>
                  <input
                    value={port.name}
                    onChange={event => onUpdatePort(port.id, { name: event.target.value })}
                  />
                </div>
                <div className="field" style={{ margin: 0 }}>
                  <label>Direction</label>
                  <select
                    value={port.direction}
                    onChange={event => onUpdatePort(port.id, { direction: event.target.value as PortDirection })}
                  >
                    {directionOptions.map(option => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                <button className="ghost-button" onClick={() => onRemovePort(port.id)}>
                  Remove port
                </button>
              </li>
            ))}
          </ul>
        )}

        <div style={{ marginTop: "12px", display: "flex", flexDirection: "column", gap: "8px" }}>
          <div className="field" style={{ margin: 0 }}>
            <label>New port name</label>
            <input
              value={portDraft.name}
              onChange={event => setPortDraft(prev => ({ ...prev, name: event.target.value }))}
              placeholder="e.g. HTTP API"
            />
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label>Direction</label>
            <select
              value={portDraft.direction}
              onChange={event => setPortDraft(prev => ({ ...prev, direction: event.target.value as PortDirection }))}
            >
              {directionOptions.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <button className="primary-button" onClick={handleAddPort} disabled={!portDraft.name.trim()}>
            Add port
          </button>
        </div>
      </div>
    </aside>
  );
}
