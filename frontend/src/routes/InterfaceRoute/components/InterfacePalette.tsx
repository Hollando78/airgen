import type { BlockPreset } from "../types";

interface PaletteProps {
  presets: BlockPreset[];
  onAddPreset: (preset: BlockPreset) => void;
  disabled?: boolean;
}

export function InterfacePalette({ presets, onAddPreset, disabled = false }: PaletteProps) {
  return (
    <div className="architecture-palette">
      <div className="palette-header">
        <h3>Interface Palette</h3>
        <p>Drag interface elements to canvas</p>
      </div>
      <div className="palette-items">
        {presets.map(preset => (
          <button
            key={preset.stereotype}
            className={`palette-item ${disabled ? "disabled" : ""}`}
            onClick={() => {
              if (!disabled) {
                onAddPreset(preset);
              }
            }}
            title={preset.description}
            disabled={disabled}
          >
            <span className="palette-item-label">{preset.label}</span>
            <span className="palette-item-tag">{preset.stereotype}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
