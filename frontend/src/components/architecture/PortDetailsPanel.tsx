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
  { value: "inout", label: "Bidirectional" }
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
    <aside className="panel" style={{ minWidth: "280px" }}>
      <div className="panel-header">
        <div>
          <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 600 }}>Port Details</h3>
          <p style={{ margin: "4px 0 0", fontSize: "12px", color: "#64748b" }}>
            {blockName}
          </p>
        </div>
        <button
          className="ghost-button"
          onClick={onRemove}
          style={{ color: "#ef4444", padding: "6px 12px" }}
        >
          Delete
        </button>
      </div>

      <div className="panel-section">
        <label className="field-label">Name</label>
        <input
          type="text"
          value={localName}
          onChange={(e) => handleNameChange(e.target.value)}
          className="text-input"
          placeholder="Port name"
        />
      </div>

      <div className="panel-section">
        <label className="field-label">Direction</label>
        <select
          value={port.direction}
          onChange={(e) => onUpdate({ direction: e.target.value as "in" | "out" | "inout" })}
          className="select-input"
        >
          {directionOptions.map(opt => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <div className="panel-section">
        <label className="field-label">Shape</label>
        <select
          value={port.shape ?? "circle"}
          onChange={(e) => onUpdate({ shape: e.target.value as "circle" | "square" | "diamond" })}
          className="select-input"
        >
          {shapeOptions.map(opt => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <div className="panel-section">
        <label className="field-label">Size (px)</label>
        <input
          type="number"
          value={localSize}
          onChange={(e) => handleSizeChange(e.target.value)}
          className="text-input"
          min="12"
          max="100"
          step="2"
        />
      </div>

      <div className="panel-section">
        <label className="field-label">Background Color</label>
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
            className="text-input"
            placeholder="#ffffff"
          />
        </div>
      </div>

      <div className="panel-section">
        <label className="field-label">Border Color</label>
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
            className="text-input"
            placeholder="#64748b"
          />
        </div>
      </div>

      <div className="panel-section">
        <label className="field-label">Border Width (px)</label>
        <input
          type="number"
          value={localBorderWidth}
          onChange={(e) => handleBorderWidthChange(e.target.value)}
          className="text-input"
          min="0"
          max="10"
          step="1"
        />
      </div>

      <div className="panel-section">
        <label className="field-label">Icon Color</label>
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
            className="text-input"
            placeholder="#64748b"
          />
        </div>
      </div>

      <div className="panel-section" style={{ marginTop: "16px", paddingTop: "16px", borderTop: "1px solid #e2e8f0" }}>
        <h4 style={{ margin: "0 0 8px", fontSize: "14px", fontWeight: 600 }}>Port Info</h4>
        <div style={{ fontSize: "12px", color: "#64748b", display: "flex", flexDirection: "column", gap: "4px" }}>
          <div><strong>ID:</strong> {port.id}</div>
          <div><strong>Edge:</strong> {port.edge ?? "auto"}</div>
          <div><strong>Offset:</strong> {port.offset != null ? `${port.offset.toFixed(1)}%` : "auto"}</div>
        </div>
      </div>
    </aside>
  );
}
