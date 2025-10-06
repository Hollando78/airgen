import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

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
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState({ x, y });

  useEffect(() => {
    setPosition({ x, y });
  }, [x, y]);

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      const menu = containerRef.current;
      if (!menu) {
        onClose();
        return;
      }
      if (event.target instanceof Element && menu.contains(event.target)) {
        return;
      }
      onClose();
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

  useLayoutEffect(() => {
    const menu = containerRef.current;
    if (!menu) {return;}

    const rect = menu.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let nextX = position.x;
    let nextY = position.y;

    if (nextX + rect.width > viewportWidth - 8) {
      nextX = Math.max(8, viewportWidth - rect.width - 8);
    }
    if (nextY + rect.height > viewportHeight - 8) {
      nextY = Math.max(8, viewportHeight - rect.height - 8);
    }

    if (nextX !== position.x || nextY !== position.y) {
      setPosition({ x: nextX, y: nextY });
    }
  }, [position.x, position.y]);

  const menu = (
    <div
      ref={containerRef}
      className="architecture-context-menu"
      style={{ left: position.x, top: position.y }}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
    >
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

  if (typeof document === "undefined") {
    return menu;
  }

  return createPortal(menu, document.body);
}
