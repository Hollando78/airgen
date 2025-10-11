/**
 * useContextMenus Hook
 *
 * Manages context menu state for both node and edge context menus,
 * including positioning and menu item data.
 */

import { useState, useEffect } from "react";

export interface ContextMenuItem {
  label: string;
  action?: () => void;
  submenu?: ContextMenuItem[];
  separator?: boolean;
  icon?: string;
  disabled?: boolean;
}

export interface NodeContextMenu {
  x: number;
  y: number;
  nodeId: string;
  nodeLabel: string;
  nodeType: string;
  menuItems: ContextMenuItem[];
}

export interface EdgeContextMenu {
  x: number;
  y: number;
  edgeId: string;
  edgeLabel: string;
  sourceLabel: string;
  targetLabel: string;
}

export interface ContextMenusState {
  contextMenu: NodeContextMenu | null;
  edgeContextMenu: EdgeContextMenu | null;
}

export interface ContextMenusActions {
  setContextMenu: React.Dispatch<React.SetStateAction<NodeContextMenu | null>>;
  setEdgeContextMenu: React.Dispatch<React.SetStateAction<EdgeContextMenu | null>>;
  closeMenus: () => void;
}

export function useContextMenus() {
  const [contextMenu, setContextMenu] = useState<NodeContextMenu | null>(null);
  const [edgeContextMenu, setEdgeContextMenu] = useState<EdgeContextMenu | null>(null);

  const closeMenus = () => {
    setContextMenu(null);
    setEdgeContextMenu(null);
  };

  // Close context menu when clicking anywhere
  useEffect(() => {
    const handleClick = () => {
      closeMenus();
    };
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, []);

  const state: ContextMenusState = {
    contextMenu,
    edgeContextMenu,
  };

  const actions: ContextMenusActions = {
    setContextMenu,
    setEdgeContextMenu,
    closeMenus,
  };

  return { ...state, ...actions };
}
