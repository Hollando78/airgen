/**
 * Graph Operations
 *
 * Layout manipulation and graph view operations
 */

import type { Core } from "cytoscape";

/**
 * Get layout configuration based on layout name
 */
export function getLayoutConfig(
  layoutName: string,
  hasInitialLayout: boolean,
  autoFitEnabled: boolean
) {
  const baseConfig = {
    fit: hasInitialLayout ? autoFitEnabled : true, // Auto-fit on initial layout, then respect user preference
    padding: 20, // Reduced from 30 for more compact view
    animate: true,
    animationDuration: 500
  };

  switch (layoutName) {
    case 'cose':
      return {
        ...baseConfig,
        name: 'cose',
        idealEdgeLength: 80, // Reduced from 100 for more compact layout
        nodeOverlap: 20,
        refresh: 20,
        randomize: false,
        componentSpacing: 60, // Reduced from 100 for tighter grouping
        nodeRepulsion: 200000, // Reduced from 400000 to bring nodes closer
        edgeElasticity: 100,
        nestingFactor: 5,
        gravity: 120, // Increased from 80 for stronger pull to center
        numIter: 1000,
        initialTemp: 200,
        coolingFactor: 0.95,
        minTemp: 1.0
      };
    case 'dagre':
      return {
        ...baseConfig,
        name: 'dagre',
        rankDir: 'TB', // Top to bottom
        ranker: 'tight-tree', // Better for hierarchies than network-simplex
        nodeSep: 50, // Horizontal spacing between nodes at same level
        edgeSep: 10, // Minimum spacing between edges
        rankSep: 80, // Vertical spacing between levels (reduced from 100 for compactness)
        // NEW: Use edge weights for ranking - hierarchical edges will be prioritized
        edgeWeight: (edge: any) => {
          return edge.data('weight') || 1;
        }
      };
    case 'fcose':
      return {
        ...baseConfig,
        name: 'fcose',
        quality: 'default',
        randomize: false,
        animate: 'end',
        nodeSeparation: 75,
        // NEW: Variable edge length - hierarchical edges are shorter (pulls parents/children closer)
        idealEdgeLength: (edge: any) => {
          const isHier = edge.data('isHierarchical');
          return isHier ? 80 : 150;
        },
        // NEW: Variable elasticity - hierarchical edges are stiffer (stronger pull)
        edgeElasticity: (edge: any) => {
          const isHier = edge.data('isHierarchical');
          return isHier ? 0.8 : 0.45;
        },
        nestingFactor: 0.1,
        gravity: 0.25,
        numIter: 2500,
        initialTemp: 200,
        coolingFactor: 0.95,
        minTemp: 1.0
      };
    case 'circle':
      return {
        ...baseConfig,
        name: 'circle',
        radius: 200, // Reduced from 300 for more compact layout
        startAngle: 0,
        sweep: undefined,
        clockwise: true,
        spacingFactor: 1.5 // Reduced from 1.75 for tighter spacing
      };
    case 'grid':
      return {
        ...baseConfig,
        name: 'grid',
        rows: undefined,
        cols: undefined,
        position: (node: any) => ({ row: 0, col: 0 }),
        condense: false,
        avoidOverlap: true,
        avoidOverlapPadding: 10
      };
    case 'breadthfirst':
      return {
        ...baseConfig,
        name: 'breadthfirst',
        directed: true,
        spacingFactor: 1.2, // Reduced from 1.5 for more compact layout
        avoidOverlap: true,
        nodeDimensionsIncludeLabels: true
      };
    case 'concentric':
      return {
        ...baseConfig,
        name: 'concentric',
        minNodeSpacing: 40, // Reduced from 50 for more compact layout
        levelWidth: (nodes: any) => nodes.maxDegree() / 4,
        concentric: (node: any) => node.degree(),
        equidistant: false,
        startAngle: 0,
        clockwise: true,
        spacingFactor: 1.2 // Added to control spacing
      };
    default:
      return {
        ...baseConfig,
        name: 'cose'
      };
  }
}

/**
 * Apply a layout to the graph
 */
export function applyLayout(
  cyInstance: Core | null,
  layoutName: string,
  hasInitialLayout: boolean,
  autoFitEnabled: boolean,
  setSelectedLayout: (layout: string) => void,
  setHasInitialLayout: (value: boolean) => void
) {
  if (!cyInstance) return;

  try {
    // Check if cyInstance is valid
    const container = cyInstance.container();
    if (!container) return;

    setSelectedLayout(layoutName);
    const layoutConfig = getLayoutConfig(layoutName, hasInitialLayout, autoFitEnabled);

    // Apply layout only to visible nodes
    const allNodes = cyInstance.nodes();
    if (!allNodes || allNodes.length === 0) return;

    const visibleNodes = allNodes.filter((node: any) => {
      return node.style('display') !== 'none';
    });

    if (visibleNodes.length > 0) {
      visibleNodes.layout(layoutConfig).run();
      setHasInitialLayout(true);
    }
  } catch (error) {
    console.warn('Error applying layout:', error);
  }
}

/**
 * Reset the current layout
 */
export function resetLayout(
  cyInstance: Core | null,
  layout: any,
  setHasInitialLayout: (value: boolean) => void
) {
  if (!cyInstance) return;

  try {
    const container = cyInstance.container();
    if (!container) return;

    cyInstance.layout(layout as any).run();
    setHasInitialLayout(true);
  } catch (error) {
    console.warn('Error resetting layout:', error);
  }
}

/**
 * Fit the view to show all visible nodes
 */
export function fitView(cyInstance: Core | null) {
  if (!cyInstance) return;

  try {
    const container = cyInstance.container();
    if (!container) return;

    cyInstance.fit();
  } catch (error) {
    console.warn('Error fitting view:', error);
  }
}

/**
 * Zoom in the graph view
 */
export function zoomIn(cyInstance: Core | null) {
  if (!cyInstance) return;

  try {
    const container = cyInstance.container();
    if (!container) return;

    cyInstance.zoom(cyInstance.zoom() * 1.2);
    cyInstance.center();
  } catch (error) {
    console.warn('Error zooming in:', error);
  }
}

/**
 * Zoom out the graph view
 */
export function zoomOut(cyInstance: Core | null) {
  if (!cyInstance) return;

  try {
    const container = cyInstance.container();
    if (!container) return;

    cyInstance.zoom(cyInstance.zoom() * 0.8);
    cyInstance.center();
  } catch (error) {
    console.warn('Error zooming out:', error);
  }
}

/**
 * Center a specific node in the view
 */
export function centerNode(cyInstance: Core | null, nodeId: string) {
  if (!cyInstance) return;
  const node = cyInstance.$id(nodeId);
  cyInstance.center(node);
}

/**
 * Reset a node's position by re-running the layout
 */
export function resetNodePosition(cyInstance: Core | null, layout: any) {
  if (!cyInstance) return;

  try {
    const container = cyInstance.container();
    if (!container) return;

    // Re-run the layout algorithm
    cyInstance.layout(layout as any).run();
  } catch (error) {
    console.warn('Error resetting node position:', error);
  }
}
