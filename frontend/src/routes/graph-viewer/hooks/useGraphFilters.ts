/**
 * useGraphFilters Hook
 *
 * Manages graph filtering state including node type visibility,
 * search terms, hidden nodes, hierarchy filtering, and sidebar state.
 */

import { useState } from "react";
import { DEFAULT_VISIBLE_NODE_TYPES } from "../graphConfig";

export interface GraphFilters {
  visibleNodeTypes: Set<string>;
  searchTerm: string;
  hiddenNodeIds: Set<string>;
  showOnlyHierarchy: boolean;
  collapsedCategories: Set<string>;
  sidebarOpen: boolean;
}

export interface GraphFiltersActions {
  setVisibleNodeTypes: React.Dispatch<React.SetStateAction<Set<string>>>;
  setSearchTerm: React.Dispatch<React.SetStateAction<string>>;
  setHiddenNodeIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  setShowOnlyHierarchy: React.Dispatch<React.SetStateAction<boolean>>;
  setCollapsedCategories: React.Dispatch<React.SetStateAction<Set<string>>>;
  setSidebarOpen: React.Dispatch<React.SetStateAction<boolean>>;
  toggleNodeType: (type: string) => void;
  selectAllInCategory: (types: string[]) => void;
  deselectAllInCategory: (types: string[]) => void;
  toggleCategory: (category: string) => void;
  hideNode: (nodeId: string) => void;
}

export function useGraphFilters() {
  const [visibleNodeTypes, setVisibleNodeTypes] = useState<Set<string>>(DEFAULT_VISIBLE_NODE_TYPES);
  const [searchTerm, setSearchTerm] = useState('');
  const [hiddenNodeIds, setHiddenNodeIds] = useState<Set<string>>(new Set());
  const [showOnlyHierarchy, setShowOnlyHierarchy] = useState(false);
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const toggleNodeType = (type: string) => {
    const newVisible = new Set(visibleNodeTypes);
    if (newVisible.has(type)) {
      newVisible.delete(type);
    } else {
      newVisible.add(type);
    }
    setVisibleNodeTypes(newVisible);
  };

  const selectAllInCategory = (types: string[]) => {
    const newVisible = new Set(visibleNodeTypes);
    types.forEach(type => newVisible.add(type));
    setVisibleNodeTypes(newVisible);
  };

  const deselectAllInCategory = (types: string[]) => {
    const newVisible = new Set(visibleNodeTypes);
    types.forEach(type => newVisible.delete(type));
    setVisibleNodeTypes(newVisible);
  };

  const toggleCategory = (category: string) => {
    const newCollapsed = new Set(collapsedCategories);
    if (newCollapsed.has(category)) {
      newCollapsed.delete(category);
    } else {
      newCollapsed.add(category);
    }
    setCollapsedCategories(newCollapsed);
  };

  const hideNode = (nodeId: string) => {
    setHiddenNodeIds(prev => new Set([...prev, nodeId]));
  };

  const filters: GraphFilters = {
    visibleNodeTypes,
    searchTerm,
    hiddenNodeIds,
    showOnlyHierarchy,
    collapsedCategories,
    sidebarOpen,
  };

  const actions: GraphFiltersActions = {
    setVisibleNodeTypes,
    setSearchTerm,
    setHiddenNodeIds,
    setShowOnlyHierarchy,
    setCollapsedCategories,
    setSidebarOpen,
    toggleNodeType,
    selectAllInCategory,
    deselectAllInCategory,
    toggleCategory,
    hideNode,
  };

  return { ...filters, ...actions };
}
