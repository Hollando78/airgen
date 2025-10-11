/**
 * GraphContextMenu Component
 *
 * Renders context menus for nodes and edges with support for nested submenus.
 * Handles both node-specific and edge-specific context menu items.
 */

import { useState } from "react";
import type { ContextMenuItem } from "../hooks/useContextMenus";

interface GraphContextMenuProps {
  contextMenu: {
    x: number;
    y: number;
    nodeId: string;
    nodeLabel: string;
    nodeType: string;
  } | null;
  edgeContextMenu: {
    x: number;
    y: number;
    edgeId: string;
    edgeLabel: string;
    sourceLabel: string;
    targetLabel: string;
  } | null;
  generateNodeMenuItems: (nodeId: string, nodeType: string, nodeLabel: string) => ContextMenuItem[];
  generateEdgeMenuItems: (edgeLabel: string, sourceLabel: string, targetLabel: string) => ContextMenuItem[];
}

/**
 * Recursive context menu item renderer
 * Supports nested submenus with hover interactions
 */
function ContextMenuItemComponent({ item, depth = 0 }: { item: ContextMenuItem; depth?: number }) {
  const [showSubmenu, setShowSubmenu] = useState(false);

  if (item.separator) {
    return <div className="context-menu-separator" />;
  }

  if (item.submenu) {
    return (
      <div
        className="context-menu-item context-menu-item-with-submenu"
        onMouseEnter={() => setShowSubmenu(true)}
        onMouseLeave={() => setShowSubmenu(false)}
      >
        <span>{item.label}</span>
        <span className="context-menu-arrow">▶</span>
        {showSubmenu && (
          <div className="context-menu-submenu" style={{ left: '100%', top: 0, zIndex: 1001 + depth }}>
            {item.submenu.map((subitem, idx) => (
              <ContextMenuItemComponent key={idx} item={subitem} depth={depth + 1} />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className={`context-menu-item ${item.disabled ? 'context-menu-item-disabled' : ''}`}
      onClick={(e) => {
        if (!item.disabled && item.action) {
          e.preventDefault();
          e.stopPropagation();
          item.action();
        }
      }}
    >
      {item.icon && <span className="context-menu-icon">{item.icon}</span>}
      <span>{item.label}</span>
    </div>
  );
}

/**
 * Main context menu component
 * Renders either a node context menu or an edge context menu based on props
 */
export function GraphContextMenu({
  contextMenu,
  edgeContextMenu,
  generateNodeMenuItems,
  generateEdgeMenuItems,
}: GraphContextMenuProps) {
  // Node context menu
  if (contextMenu) {
    const menuItems = generateNodeMenuItems(contextMenu.nodeId, contextMenu.nodeType, contextMenu.nodeLabel);
    return (
      <div
        className="context-menu"
        style={{
          left: `${contextMenu.x}px`,
          top: `${contextMenu.y}px`
        }}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
      >
        {menuItems.map((item, idx) => (
          <ContextMenuItemComponent key={idx} item={item} />
        ))}
      </div>
    );
  }

  // Edge context menu
  if (edgeContextMenu) {
    const menuItems = generateEdgeMenuItems(
      edgeContextMenu.edgeLabel,
      edgeContextMenu.sourceLabel,
      edgeContextMenu.targetLabel
    );
    return (
      <div
        className="context-menu"
        style={{
          left: `${edgeContextMenu.x}px`,
          top: `${edgeContextMenu.y}px`
        }}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
      >
        {menuItems.map((item, idx) => (
          <ContextMenuItemComponent key={idx} item={item} />
        ))}
      </div>
    );
  }

  return null;
}
