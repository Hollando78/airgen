import { CONNECTOR_PRESETS } from "../../routes/ArchitectureRoute/constants";
import { getDefaultColorByKind } from "../../routes/ArchitectureRoute/utils/diagram";
import type { SysmlConnector } from "../../hooks/useArchitectureApi";

interface ConnectorStylingToolbarProps {
  connector: SysmlConnector;
  onUpdate: (updates: Partial<SysmlConnector>) => void;
}

export function ConnectorStylingToolbar({ connector, onUpdate }: ConnectorStylingToolbarProps) {
  return (
    <div
      className="connector-styling-toolbar"
      style={{
        position: "absolute",
        top: "10px",
        right: "10px",
        background: "#ffffff",
        border: "1px solid #e2e8f0",
        borderRadius: "8px",
        padding: "12px",
        boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
        display: "flex",
        gap: "8px",
        alignItems: "center",
        fontSize: "12px",
        zIndex: 1000,
        minWidth: "360px",
        flexWrap: "wrap"
      }}
    >
      <span style={{ fontWeight: "500", color: "#374151", minWidth: "100%" }}>
        Connector Style
      </span>

      <select
        onChange={event => {
          const preset = CONNECTOR_PRESETS.find(p => p.label === event.target.value);
          if (preset) {
            onUpdate({
              lineStyle: preset.lineStyle,
              linePattern: preset.linePattern,
              markerEnd: preset.markerEnd,
              markerStart: preset.markerStart,
              ...(preset.color && { color: preset.color })
            });
          }
        }}
        style={{ fontSize: "11px", padding: "2px 4px", width: "80px" }}
        value=""
      >
        <option value="">Presets</option>
        {CONNECTOR_PRESETS.map(preset => (
          <option key={preset.label} value={preset.label}>
            {preset.label}
          </option>
        ))}
      </select>

      <select
        value={connector.lineStyle ?? "straight"}
        onChange={event => onUpdate({ lineStyle: event.target.value })}
        style={{ fontSize: "11px", padding: "2px 4px" }}
      >
        <option value="straight">Straight</option>
        <option value="smoothstep">Curved</option>
        <option value="step">Rectilinear</option>
        <option value="bezier">Bezier</option>
      </select>

      <select
        value={connector.linePattern ?? "solid"}
        onChange={event => onUpdate({ linePattern: event.target.value })}
        style={{ fontSize: "11px", padding: "2px 4px" }}
      >
        <option value="solid">Solid</option>
        <option value="dashed">Dashed</option>
        <option value="dotted">Dotted</option>
      </select>

      <input
        type="color"
        value={connector.color ?? getDefaultColorByKind(connector.kind)}
        onChange={event => onUpdate({ color: event.target.value })}
        style={{ width: "24px", height: "24px", padding: "1px", border: "1px solid #d1d5db", borderRadius: "3px" }}
        title="Color"
      />

      <input
        type="range"
        min="1"
        max="6"
        value={connector.strokeWidth ?? 2}
        onChange={event => onUpdate({ strokeWidth: Number(event.target.value) })}
        style={{ width: "60px" }}
        title="Line Width"
      />

      <select
        value={connector.markerEnd ?? "arrowclosed"}
        onChange={event => onUpdate({ markerEnd: event.target.value })}
        style={{ fontSize: "11px", padding: "2px 4px" }}
      >
        <option value="none">No End</option>
        <option value="arrow">Arrow</option>
        <option value="arrowclosed">Arrow ●</option>
      </select>
    </div>
  );
}
