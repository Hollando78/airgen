import type { SysmlBlock } from "../../hooks/useArchitectureApi";

interface MultiBlockPanelProps {
  blocks: SysmlBlock[];
  onUpdateBlockPosition: (blockId: string, position: { x: number; y: number }) => void;
  onUpdateBlockSize: (blockId: string, size: { width: number; height: number }) => void;
  onUpdateBlock: (blockId: string, updates: Partial<SysmlBlock>) => void;
}

export function MultiBlockPanel({
  blocks,
  onUpdateBlockPosition,
  onUpdateBlockSize,
  onUpdateBlock
}: MultiBlockPanelProps) {
  const count = blocks.length;

  // Alignment functions
  const alignLeft = () => {
    const minX = Math.min(...blocks.map(b => b.position.x));
    blocks.forEach(block => {
      onUpdateBlockPosition(block.id, { x: minX, y: block.position.y });
    });
  };

  const alignRight = () => {
    const maxRight = Math.max(...blocks.map(b => b.position.x + b.size.width));
    blocks.forEach(block => {
      onUpdateBlockPosition(block.id, { x: maxRight - block.size.width, y: block.position.y });
    });
  };

  const alignTop = () => {
    const minY = Math.min(...blocks.map(b => b.position.y));
    blocks.forEach(block => {
      onUpdateBlockPosition(block.id, { x: block.position.x, y: minY });
    });
  };

  const alignBottom = () => {
    const maxBottom = Math.max(...blocks.map(b => b.position.y + b.size.height));
    blocks.forEach(block => {
      onUpdateBlockPosition(block.id, { x: block.position.x, y: maxBottom - block.size.height });
    });
  };

  const alignCenterHorizontal = () => {
    // Calculate the bounding box of all blocks
    const minY = Math.min(...blocks.map(b => b.position.y));
    const maxBottom = Math.max(...blocks.map(b => b.position.y + b.size.height));
    const centerY = (minY + maxBottom) / 2;

    blocks.forEach(block => {
      const newY = centerY - block.size.height / 2;
      onUpdateBlockPosition(block.id, { x: block.position.x, y: newY });
    });
  };

  const alignCenterVertical = () => {
    // Calculate the bounding box of all blocks
    const minX = Math.min(...blocks.map(b => b.position.x));
    const maxRight = Math.max(...blocks.map(b => b.position.x + b.size.width));
    const centerX = (minX + maxRight) / 2;

    blocks.forEach(block => {
      const newX = centerX - block.size.width / 2;
      onUpdateBlockPosition(block.id, { x: newX, y: block.position.y });
    });
  };

  // Resize functions
  const resizeToLargestWidth = () => {
    const maxWidth = Math.max(...blocks.map(b => b.size.width));
    blocks.forEach(block => {
      onUpdateBlockSize(block.id, { width: maxWidth, height: block.size.height });
    });
  };

  const resizeToLargestHeight = () => {
    const maxHeight = Math.max(...blocks.map(b => b.size.height));
    blocks.forEach(block => {
      onUpdateBlockSize(block.id, { width: block.size.width, height: maxHeight });
    });
  };

  const resizeToLargest = () => {
    const maxWidth = Math.max(...blocks.map(b => b.size.width));
    const maxHeight = Math.max(...blocks.map(b => b.size.height));
    blocks.forEach(block => {
      onUpdateBlockSize(block.id, { width: maxWidth, height: maxHeight });
    });
  };

  // Common property editing
  const commonKind = blocks.every(b => b.kind === blocks[0].kind) ? blocks[0].kind : undefined;
  const commonStereotype = blocks.every(b => b.stereotype === blocks[0].stereotype) ? blocks[0].stereotype : undefined;

  const updateCommonProperty = (updates: Partial<SysmlBlock>) => {
    blocks.forEach(block => {
      onUpdateBlock(block.id, updates);
    });
  };

  return (
    <aside className="panel" style={{ minWidth: "280px" }}>
      <div className="panel-header">
        <div>
          <h2>Multiple Blocks ({count})</h2>
          <p style={{ fontSize: "12px", color: "#64748b" }}>Edit selected blocks together</p>
        </div>
      </div>

      <div className="panel" style={{ background: "#f8fafc", border: "1px solid #dbeafe" }}>
        <h3 style={{ marginTop: 0, fontSize: "14px" }}>Alignment</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "6px" }}>
          <button
            className="ghost-button"
            onClick={alignLeft}
            title="Align left edges"
            style={{ padding: "8px", fontSize: "11px" }}
          >
            ← Left
          </button>
          <button
            className="ghost-button"
            onClick={alignCenterVertical}
            title="Align centers vertically"
            style={{ padding: "8px", fontSize: "11px" }}
          >
            ↔ Center
          </button>
          <button
            className="ghost-button"
            onClick={alignRight}
            title="Align right edges"
            style={{ padding: "8px", fontSize: "11px" }}
          >
            Right →
          </button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "6px", marginTop: "6px" }}>
          <button
            className="ghost-button"
            onClick={alignTop}
            title="Align top edges"
            style={{ padding: "8px", fontSize: "11px" }}
          >
            ↑ Top
          </button>
          <button
            className="ghost-button"
            onClick={alignCenterHorizontal}
            title="Align centers horizontally"
            style={{ padding: "8px", fontSize: "11px" }}
          >
            ↕ Middle
          </button>
          <button
            className="ghost-button"
            onClick={alignBottom}
            title="Align bottom edges"
            style={{ padding: "8px", fontSize: "11px" }}
          >
            Bottom ↓
          </button>
        </div>
      </div>

      <div className="panel" style={{ background: "#f8fafc", border: "1px solid #dbeafe" }}>
        <h3 style={{ marginTop: 0, fontSize: "14px" }}>Resize</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <button
            className="ghost-button"
            onClick={resizeToLargestWidth}
            title="Match width to largest block"
            style={{ padding: "8px", fontSize: "12px", textAlign: "left" }}
          >
            ↔ Match Largest Width
          </button>
          <button
            className="ghost-button"
            onClick={resizeToLargestHeight}
            title="Match height to largest block"
            style={{ padding: "8px", fontSize: "12px", textAlign: "left" }}
          >
            ↕ Match Largest Height
          </button>
          <button
            className="ghost-button"
            onClick={resizeToLargest}
            title="Match both dimensions to largest block"
            style={{ padding: "8px", fontSize: "12px", textAlign: "left" }}
          >
            ⛶ Match Largest (Both)
          </button>
        </div>
      </div>

      <div className="panel" style={{ background: "#f1f5f9", border: "1px solid #cbd5e1" }}>
        <h3 style={{ marginTop: 0, fontSize: "14px" }}>Common Properties</h3>

        <div className="field">
          <label>Kind</label>
          <select
            value={commonKind ?? ""}
            onChange={event => {
              if (event.target.value) {
                updateCommonProperty({ kind: event.target.value as SysmlBlock["kind"] });
              }
            }}
          >
            <option value="" disabled>
              {commonKind ? `${commonKind} (shared)` : "Mixed values..."}
            </option>
            <option value="system">System</option>
            <option value="subsystem">Subsystem</option>
            <option value="component">Component</option>
            <option value="actor">Actor</option>
            <option value="external">External</option>
            <option value="interface">Interface</option>
          </select>
          {!commonKind && (
            <p style={{ fontSize: "11px", color: "#64748b", margin: "4px 0 0 0" }}>
              Select a value to apply to all blocks
            </p>
          )}
        </div>

        <div className="field">
          <label>Stereotype</label>
          <input
            value={commonStereotype ?? ""}
            onChange={event => updateCommonProperty({ stereotype: event.target.value })}
            placeholder={commonStereotype ? commonStereotype : "Mixed values..."}
          />
          {!commonStereotype && (
            <p style={{ fontSize: "11px", color: "#64748b", margin: "4px 0 0 0" }}>
              Enter a value to apply to all blocks
            </p>
          )}
        </div>
      </div>

      <div style={{ marginTop: "12px", padding: "12px", background: "#fef3c7", border: "1px solid #fcd34d", borderRadius: "6px" }}>
        <p style={{ fontSize: "12px", color: "#92400e", margin: 0 }}>
          <strong>Tip:</strong> Use Shift+Click to add/remove blocks from selection,
          or drag to select multiple blocks.
        </p>
      </div>
    </aside>
  );
}
