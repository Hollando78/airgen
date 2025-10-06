import { useState, useEffect } from "react";
import type { BlockPort } from "../../hooks/useArchitectureApi";
import { useDebounce } from "../../hooks/useDebounce";

interface PortDetailsPanelProps {
  port: BlockPort;
  blockName: string;
  onUpdate: (updates: Partial<BlockPort>) => void;
  onRemove: () => void;
}

const directionOptions = [
  { value: "in", label: "Input" },
  { value: "out", label: "Output" },
  { value: "inout", label: "Bidirectional" },
  { value: "none", label: "None" }
] as const;

const shapeOptions = [
  { value: "circle", label: "Circle" },
  { value: "square", label: "Square" },
  { value: "diamond", label: "Diamond" }
] as const;

export function PortDetailsPanel({
  port,
  blockName,
  onUpdate,
  onRemove
}: PortDetailsPanelProps) {
  // Local state with debouncing
  const [localName, setLocalName] = useState(port.name);
  const [localSize, setLocalSize] = useState(port.size?.toString() ?? "24");
  const [localBackgroundColor, setLocalBackgroundColor] = useState(port.backgroundColor ?? "#ffffff");
  const [localBorderColor, setLocalBorderColor] = useState(port.borderColor ?? "#64748b");
  const [localBorderWidth, setLocalBorderWidth] = useState(port.borderWidth?.toString() ?? "2");
  const [localIconColor, setLocalIconColor] = useState(port.iconColor ?? "#64748b");

  // Create debounced update function
  const [debouncedUpdate] = useDebounce((updates: Partial<BlockPort>) => {
    onUpdate(updates);
  }, 500);

  // Update local state when port changes
  useEffect(() => {
    setLocalName(port.name);
    setLocalSize(port.size?.toString() ?? "24");
    setLocalBackgroundColor(port.backgroundColor ?? "#ffffff");
    setLocalBorderColor(port.borderColor ?? "#64748b");
    setLocalBorderWidth(port.borderWidth?.toString() ?? "2");
    setLocalIconColor(port.iconColor ?? "#64748b");
  }, [port.id]);

  const handleNameChange = (value: string) => {
    setLocalName(value);
    if (value.trim()) {
      debouncedUpdate({ name: value.trim() });
    }
  };

  const handleSizeChange = (value: string) => {
    setLocalSize(value);
    const num = parseInt(value);
    if (!isNaN(num) && num > 0 && num <= 100) {
      debouncedUpdate({ size: num });
    }
  };

  const handleBackgroundColorChange = (value: string) => {
    setLocalBackgroundColor(value);
    debouncedUpdate({ backgroundColor: value });
  };

  const handleBorderColorChange = (value: string) => {
    setLocalBorderColor(value);
    debouncedUpdate({ borderColor: value });
  };

  const handleBorderWidthChange = (value: string) => {
    setLocalBorderWidth(value);
    const num = parseInt(value);
    if (!isNaN(num) && num >= 0 && num <= 10) {
      debouncedUpdate({ borderWidth: num });
    }
  };

  const handleIconColorChange = (value: string) => {
    setLocalIconColor(value);
    debouncedUpdate({ iconColor: value });
  };

  return (
    <aside className="panel" style={{ minWidth: "260px" }}>
      <div className="panel-header">
        <div>
          <h2>Port</h2>
          <p style={{ fontSize: "12px", color: "#64748b" }}>{blockName}</p>
        </div>
        <button className="ghost-button" onClick={onRemove}>
          Remove
        </button>
      </div>

      <div className="field">
        <label>Name</label>
        <input
          type="text"
          value={localName}
          onChange={(e) => handleNameChange(e.target.value)}
          placeholder="Port name"
        />
      </div>

      <div className="field">
        <label>Direction</label>
        <select
          value={port.direction}
          onChange={(e) => onUpdate({ direction: e.target.value as "in" | "out" | "inout" | "none" })}
        >
          {directionOptions.map(opt => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <input
            type="checkbox"
            checked={!port.hidden}
            onChange={(e) => onUpdate({ hidden: !e.target.checked })}
          />
          <span>Show on diagram</span>
        </label>
      </div>

      <div className="field-group" style={{ marginTop: "16px" }}>
        <label style={{ fontSize: "13px", fontWeight: "500", color: "#374151", marginBottom: "8px", display: "block" }}>
          Styling
        </label>

        <div className="field">
          <label>Shape</label>
          <select
            value={port.shape ?? "circle"}
            onChange={(e) => onUpdate({ shape: e.target.value as "circle" | "square" | "diamond" })}
          >
            {shapeOptions.map(opt => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label>Size (px)</label>
          <input
            type="number"
            value={localSize}
            onChange={(e) => handleSizeChange(e.target.value)}
            min="12"
            max="100"
            step="2"
          />
        </div>

        <div className="field">
          <label>Background</label>
          <div style={{ display: "flex", gap: "8px" }}>
            <input
              type="color"
              value={localBackgroundColor}
              onChange={(e) => handleBackgroundColorChange(e.target.value)}
              style={{ width: "48px", height: "32px", cursor: "pointer" }}
            />
            <input
              type="text"
              value={localBackgroundColor}
              onChange={(e) => handleBackgroundColorChange(e.target.value)}
              placeholder="#ffffff"
            />
          </div>
        </div>

        <div className="field">
          <label>Border Color</label>
          <div style={{ display: "flex", gap: "8px" }}>
            <input
              type="color"
              value={localBorderColor}
              onChange={(e) => handleBorderColorChange(e.target.value)}
              style={{ width: "48px", height: "32px", cursor: "pointer" }}
            />
            <input
              type="text"
              value={localBorderColor}
              onChange={(e) => handleBorderColorChange(e.target.value)}
              placeholder="#64748b"
            />
          </div>
        </div>

        <div className="field">
          <label>Border Width (px)</label>
          <input
            type="number"
            value={localBorderWidth}
            onChange={(e) => handleBorderWidthChange(e.target.value)}
            min="0"
            max="10"
            step="1"
          />
        </div>

        <div className="field">
          <label>Icon Color</label>
          <div style={{ display: "flex", gap: "8px" }}>
            <input
              type="color"
              value={localIconColor}
              onChange={(e) => handleIconColorChange(e.target.value)}
              style={{ width: "48px", height: "32px", cursor: "pointer" }}
            />
            <input
              type="text"
              value={localIconColor}
              onChange={(e) => handleIconColorChange(e.target.value)}
              placeholder="#64748b"
            />
          </div>
        </div>
      </div>

      <div className="field-group" style={{ marginTop: "16px", paddingTop: "16px", borderTop: "1px solid #e2e8f0" }}>
        <label style={{ fontSize: "13px", fontWeight: "500", color: "#374151", marginBottom: "8px", display: "block" }}>
          Label
        </label>

        <div className="field">
          <label style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <input
              type="checkbox"
              checked={port.showLabel !== false}
              onChange={(e) => onUpdate({ showLabel: e.target.checked })}
            />
            <span>Show label on diagram</span>
          </label>
        </div>

        <div className="field" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
          <div>
            <label>Offset X (px)</label>
            <input
              type="number"
              value={port.labelOffsetX ?? 0}
              onChange={(e) => onUpdate({ labelOffsetX: Number(e.target.value) })}
              placeholder="0"
            />
          </div>
          <div>
            <label>Offset Y (px)</label>
            <input
              type="number"
              value={port.labelOffsetY ?? 0}
              onChange={(e) => onUpdate({ labelOffsetY: Number(e.target.value) })}
              placeholder="0"
            />
          </div>
        </div>
        <button
          className="ghost-button"
          style={{ width: "100%", marginTop: "4px" }}
          onClick={() => onUpdate({ labelOffsetX: 0, labelOffsetY: 0 })}
        >
          Reset Label Position
        </button>
      </div>

      <div className="field-group" style={{ marginTop: "16px", paddingTop: "16px", borderTop: "1px solid #e2e8f0" }}>
        <label style={{ fontSize: "13px", fontWeight: "500", color: "#374151", marginBottom: "8px", display: "block" }}>
          Port Info
        </label>
        <div style={{ fontSize: "12px", color: "#64748b", display: "flex", flexDirection: "column", gap: "4px" }}>
          <div><strong>ID:</strong> {port.id}</div>
          <div><strong>Edge:</strong> {port.edge ?? "auto"}</div>
          <div><strong>Offset:</strong> {port.offset != null ? `${port.offset.toFixed(1)}%` : "auto"}</div>
        </div>
      </div>
    </aside>
  );
}
