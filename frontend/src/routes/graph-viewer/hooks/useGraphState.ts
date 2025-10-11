/**
 * useGraphState Hook
 *
 * Manages core graph visualization state including Cytoscape instance,
 * selected node information, pinned nodes, and highlighted nodes.
 */

import { useState } from "react";
import type { Core } from "cytoscape";

export interface NodeInfo {
  id: string;
  label: string;
  type: string;
  properties?: any;
}

export interface GraphState {
  cyInstance: Core | null;
  selectedNodeInfo: NodeInfo | null;
  pinnedNodes: Set<string>;
  highlightedNodes: Set<string>;
}

export interface GraphStateActions {
  setCyInstance: (instance: Core | null) => void;
  setSelectedNodeInfo: (info: NodeInfo | null) => void;
  setPinnedNodes: React.Dispatch<React.SetStateAction<Set<string>>>;
  setHighlightedNodes: React.Dispatch<React.SetStateAction<Set<string>>>;
  togglePin: (nodeId: string) => void;
  toggleHighlight: (nodeId: string) => void;
}

export function useGraphState() {
  const [cyInstance, setCyInstance] = useState<Core | null>(null);
  const [selectedNodeInfo, setSelectedNodeInfo] = useState<NodeInfo | null>(null);
  const [pinnedNodes, setPinnedNodes] = useState<Set<string>>(new Set());
  const [highlightedNodes, setHighlightedNodes] = useState<Set<string>>(new Set());

  const togglePin = (nodeId: string) => {
    setPinnedNodes(prev => {
      const newSet = new Set(prev);
      if (newSet.has(nodeId)) {
        newSet.delete(nodeId);
        if (cyInstance) {
          const node = cyInstance.$id(nodeId);
          node.unlock();
        }
      } else {
        newSet.add(nodeId);
        if (cyInstance) {
          const node = cyInstance.$id(nodeId);
          node.lock();
        }
      }
      return newSet;
    });
  };

  const toggleHighlight = (nodeId: string) => {
    setHighlightedNodes(prev => {
      const newSet = new Set(prev);
      if (newSet.has(nodeId)) {
        newSet.delete(nodeId);
      } else {
        newSet.add(nodeId);
      }
      return newSet;
    });
  };

  const state: GraphState = {
    cyInstance,
    selectedNodeInfo,
    pinnedNodes,
    highlightedNodes,
  };

  const actions: GraphStateActions = {
    setCyInstance,
    setSelectedNodeInfo,
    setPinnedNodes,
    setHighlightedNodes,
    togglePin,
    toggleHighlight,
  };

  return { ...state, ...actions };
}
