import type { BlockPreset } from "../types";

interface PaletteProps {
  presets: BlockPreset[];
  onAddPreset: (preset: BlockPreset) => void;
  disabled?: boolean;
}

export function ArchitecturePalette({ presets, onAddPreset, disabled = false }: PaletteProps) {
  return (
    <div className="architecture-palette">
      <div className="palette-header">
        <h3>Palette</h3>
        <p>Drag blocks to canvas</p>
      </div>
      <div className="palette-items">
        {presets.map(preset => (
          <button
            key={preset.kind}
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
