/**
 * Context Menu Actions
 *
 * All action handlers for graph context menu operations
 */

import type { Core } from "cytoscape";

/**
 * Show all neighbors of a node
 */
export function showNeighbors(
  cyInstance: Core | null,
  nodeId: string,
  setHiddenNodeIds: React.Dispatch<React.SetStateAction<Set<string>>>
) {
  if (!cyInstance) return;
  const node = cyInstance.$id(nodeId);
  const neighbors = node.neighborhood();

  neighbors.forEach((ele: any) => {
    if (ele.isNode()) {
      const id = ele.data('id');
      setHiddenNodeIds(prev => {
        const newSet = new Set(prev);
        newSet.delete(id);
        return newSet;
      });
    }
  });
}

/**
 * Hide all neighbors of a node
 */
export function hideNeighbors(
  cyInstance: Core | null,
  nodeId: string,
  setHiddenNodeIds: React.Dispatch<React.SetStateAction<Set<string>>>
) {
  if (!cyInstance) return;
  const node = cyInstance.$id(nodeId);
  const neighbors = node.neighborhood().nodes();

  neighbors.forEach((neighbor: any) => {
    const id = neighbor.data('id');
    setHiddenNodeIds(prev => new Set([...prev, id]));
  });
}

/**
 * Expand the neighborhood by a number of hops
 */
export function expandNeighborhood(
  cyInstance: Core | null,
  nodeId: string,
  hops: number,
  setHiddenNodeIds: React.Dispatch<React.SetStateAction<Set<string>>>
) {
  if (!cyInstance) return;
  const node = cyInstance.$id(nodeId);
  let currentLevel = node;

  for (let i = 0; i < hops; i++) {
    currentLevel = currentLevel.neighborhood();
  }

  currentLevel.nodes().forEach((n: any) => {
    const id = n.data('id');
    setHiddenNodeIds(prev => {
      const newSet = new Set(prev);
      newSet.delete(id);
      return newSet;
    });
  });
}

/**
 * Isolate a node - show only it and its neighbors, hide everything else
 */
export function isolateNode(
  cyInstance: Core | null,
  nodeId: string,
  setHiddenNodeIds: React.Dispatch<React.SetStateAction<Set<string>>>
) {
  if (!cyInstance) return;
  const node = cyInstance.$id(nodeId);
  const neighborhood = node.neighborhood().nodes();
  const toShow = new Set([nodeId, ...neighborhood.map((n: any) => n.data('id'))]);

  cyInstance.nodes().forEach((n: any) => {
    const id = n.data('id');
    if (!toShow.has(id)) {
      setHiddenNodeIds(prev => new Set([...prev, id]));
    }
  });
}

/**
 * Highlight the shortest path between two nodes
 */
export function highlightShortestPath(
  cyInstance: Core | null,
  sourceId: string,
  targetId: string
) {
  if (!cyInstance) return;

  const source = cyInstance.$id(sourceId);
  const target = cyInstance.$id(targetId);

  if (source.id() === target.id()) return;

  const dijkstra = cyInstance.elements().dijkstra({
    root: source,
    weight: () => 1
  });

  const path = dijkstra.pathTo(target);

  if (path && path.length > 0) {
    // Reset previous highlights
    cyInstance.elements().removeClass('path-highlight');

    // Highlight path
    path.addClass('path-highlight');
  }
}

/**
 * Show only the connected component containing a node
 */
export function showConnectedComponent(
  cyInstance: Core | null,
  nodeId: string,
  setHiddenNodeIds: React.Dispatch<React.SetStateAction<Set<string>>>
) {
  if (!cyInstance) return;
  const node = cyInstance.$id(nodeId);
  const component = node.component();
  const componentIds = new Set(component.nodes().map((n: any) => n.data('id')));

  cyInstance.nodes().forEach((n: any) => {
    const id = n.data('id');
    if (!componentIds.has(id)) {
      setHiddenNodeIds(prev => new Set([...prev, id]));
    }
  });
}

/**
 * Change a node's color
 */
export function changeNodeColor(cyInstance: Core | null, nodeId: string, color: string) {
  if (!cyInstance) return;
  const node = cyInstance.$id(nodeId);
  node.style('background-color', color);
}

/**
 * Copy node information to clipboard
 */
export function copyNodeInfo(cyInstance: Core | null, nodeId: string) {
  if (!cyInstance) return;
  const node = cyInstance.$id(nodeId);
  const info = {
    id: node.data('id'),
    label: node.data('label'),
    type: node.data('type'),
    properties: node.data('properties')
  };
  navigator.clipboard.writeText(JSON.stringify(info, null, 2));
}

/**
 * Export a subgraph (node and its neighborhood) to JSON
 */
export function exportSubgraph(cyInstance: Core | null, nodeId: string) {
  if (!cyInstance) return;
  const node = cyInstance.$id(nodeId);
  const subgraph = node.neighborhood();
  const data = {
    nodes: subgraph.nodes().map((n: any) => ({
      id: n.data('id'),
      label: n.data('label'),
      type: n.data('type'),
      properties: n.data('properties')
    })),
    edges: subgraph.edges().map((e: any) => ({
      source: e.data('source'),
      target: e.data('target'),
      type: e.data('label')
    }))
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `subgraph-${nodeId}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
