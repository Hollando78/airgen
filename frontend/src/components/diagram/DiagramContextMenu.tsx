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
      // Don't close if clicking on the context menu itself
      if (event.button !== 2 && event.target instanceof Element) {
        const menu = document.querySelector('.architecture-context-menu');
        if (!menu?.contains(event.target)) {
          onClose();
        }
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
            console.log("[ContextMenu] Button clicked:", item.label, "disabled:", item.disabled);
            if (!item.disabled) {
              console.log("[ContextMenu] Calling onSelect for:", item.label);
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
