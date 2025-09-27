import { useEffect } from "react";

export interface ContextMenuItem {
  label: string;
  onSelect: () => void;
  disabled?: boolean;
  shortcut?: string;
}

interface DiagramContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

export function DiagramContextMenu({ x, y, items, onClose }: DiagramContextMenuProps) {
  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (event.button !== 2) {
        onClose();
      }
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("mousedown", handleClick);
    window.addEventListener("scroll", onClose, true);
    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("mousedown", handleClick);
      window.removeEventListener("scroll", onClose, true);
      window.removeEventListener("keydown", handleKey);
    };
  }, [onClose]);

  return (
    <div className="architecture-context-menu" style={{ left: x, top: y }}>
      {items.map(item => (
        <button
          key={item.label}
          className="context-action"
          onClick={() => {
            if (!item.disabled) {
              item.onSelect();
              onClose();
            }
          }}
          disabled={item.disabled}
        >
          <span>{item.label}</span>
          {item.shortcut && <span className="context-shortcut">{item.shortcut}</span>}
        </button>
      ))}
    </div>
  );
}
