/**
 * useSavedViews Hook
 *
 * Manages saved view state including view persistence to localStorage,
 * loading, saving, and deleting views with node positions.
 */

import { useState } from "react";
import { toast } from "sonner";
import type { Core } from "cytoscape";

export interface SavedView {
  name: string;
  visibleNodeTypes: string[];
  searchTerm: string;
  hiddenNodeIds: string[];
  layout?: {
    positions: Array<{
      id: string;
      position: { x: number; y: number };
    }>;
  };
}

export interface SavedViewsState {
  savedViews: SavedView[];
  showSaveDialog: boolean;
  newViewName: string;
}

export interface SavedViewsActions {
  setSavedViews: React.Dispatch<React.SetStateAction<SavedView[]>>;
  setShowSaveDialog: React.Dispatch<React.SetStateAction<boolean>>;
  setNewViewName: React.Dispatch<React.SetStateAction<string>>;
  saveCurrentView: (
    tenant: string,
    project: string,
    visibleNodeTypes: Set<string>,
    searchTerm: string,
    hiddenNodeIds: Set<string>,
    cyInstance: Core | null,
    newViewName: string
  ) => void;
  loadView: (
    viewName: string,
    setVisibleNodeTypes: (types: Set<string>) => void,
    setSearchTerm: (term: string) => void,
    setHiddenNodeIds: (ids: Set<string>) => void,
    cyInstance: Core | null
  ) => void;
  deleteView: (tenant: string, project: string, viewName: string) => void;
}

export function useSavedViews(tenant: string | null, project: string | null) {
  const [savedViews, setSavedViews] = useState<SavedView[]>(() => {
    // Load saved views from localStorage
    if (tenant && project) {
      const saved = localStorage.getItem(`graph-views-${tenant}-${project}`);
      return saved ? JSON.parse(saved) : [];
    }
    return [];
  });
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [newViewName, setNewViewName] = useState('');

  const saveCurrentView = (
    tenant: string,
    project: string,
    visibleNodeTypes: Set<string>,
    searchTerm: string,
    hiddenNodeIds: Set<string>,
    cyInstance: Core | null,
    viewName: string
  ) => {
    if (!viewName.trim()) {
      toast.warning("Please enter a view name");
      return;
    }

    const newView: SavedView = {
      name: viewName.trim(),
      visibleNodeTypes: Array.from(visibleNodeTypes),
      searchTerm,
      hiddenNodeIds: Array.from(hiddenNodeIds),
      layout: cyInstance ? {
        positions: cyInstance.nodes().map((node: any) => {
          const pos = node.position();
          return {
            id: node.id(),
            position: { x: pos.x, y: pos.y }
          };
        })
      } : undefined
    };

    const updatedViews = [...savedViews.filter(v => v.name !== newView.name), newView];
    setSavedViews(updatedViews);
    localStorage.setItem(`graph-views-${tenant}-${project}`, JSON.stringify(updatedViews));
    setNewViewName('');
    setShowSaveDialog(false);
  };

  const loadView = (
    viewName: string,
    setVisibleNodeTypes: (types: Set<string>) => void,
    setSearchTerm: (term: string) => void,
    setHiddenNodeIds: (ids: Set<string>) => void,
    cyInstance: Core | null
  ) => {
    const view = savedViews.find(v => v.name === viewName);
    if (!view) return;

    setVisibleNodeTypes(new Set(view.visibleNodeTypes));
    setSearchTerm(view.searchTerm);
    setHiddenNodeIds(new Set(view.hiddenNodeIds || []));

    // Restore node positions if saved
    if (view.layout?.positions && cyInstance && Array.isArray(view.layout.positions)) {
      setTimeout(() => {
        try {
          // Stop any running layouts/animations to prevent conflicts
          cyInstance.stop();

          const validPositions = view.layout!.positions.filter((pos: any) => {
            return pos && pos.id && pos.position &&
                   typeof pos.position.x === 'number' &&
                   typeof pos.position.y === 'number';
          });

          if (validPositions.length > 0) {
            cyInstance.startBatch();

            validPositions.forEach((pos: any) => {
              const node = cyInstance.$id(pos.id);
              if (node && node.length > 0) {
                node.position({ x: pos.position.x, y: pos.position.y });
              }
            });

            cyInstance.endBatch();
            cyInstance.fit();
          }
        } catch (error) {
          console.error('Error restoring node positions:', error);
          // Just fit the view if position restoration fails
          cyInstance.fit();
        }
      }, 300);
    }
  };

  const deleteView = (tenant: string, project: string, viewName: string) => {
    if (!confirm(`Delete view "${viewName}"?`)) return;
    const updatedViews = savedViews.filter(v => v.name !== viewName);
    setSavedViews(updatedViews);
    localStorage.setItem(`graph-views-${tenant}-${project}`, JSON.stringify(updatedViews));
  };

  const state: SavedViewsState = {
    savedViews,
    showSaveDialog,
    newViewName,
  };

  const actions: SavedViewsActions = {
    setSavedViews,
    setShowSaveDialog,
    setNewViewName,
    saveCurrentView,
    loadView,
    deleteView,
  };

  return { ...state, ...actions };
}
