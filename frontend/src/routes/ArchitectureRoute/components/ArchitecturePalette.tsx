import { Box, Boxes, Wrench, User, Globe, Plug } from "lucide-react";
import type { BlockPreset } from "../types";

interface PaletteProps {
  presets: BlockPreset[];
  onAddPreset: (preset: BlockPreset) => void;
  disabled?: boolean;
}

// Helper function to get icon for block kind
function getBlockIcon(kind: string) {
  const iconProps = { className: "w-4 h-4", strokeWidth: 2 };
  switch (kind) {
    case 'system': return <Box {...iconProps} />;
    case 'subsystem': return <Boxes {...iconProps} />;
    case 'component': return <Wrench {...iconProps} />;
    case 'actor': return <User {...iconProps} />;
    case 'external': return <Globe {...iconProps} />;
    case 'interface': return <Plug {...iconProps} />;
    default: return <Box {...iconProps} />;
  }
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
            <div className="palette-item-content">
              <span className="palette-item-icon">{getBlockIcon(preset.kind)}</span>
              <span className="palette-item-label">{preset.label}</span>
            </div>
            <span className="palette-item-tag">{preset.stereotype}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
