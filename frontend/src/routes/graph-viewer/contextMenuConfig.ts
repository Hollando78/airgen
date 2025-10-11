import type { ContextMenuItem } from "./hooks/useContextMenus";
import type { EdgeStyle } from "./hooks/useEdgeStyles";

/**
 * Context menu configuration for graph nodes and edges
 *
 * This module provides pure functions for generating context menu items
 * based on node type, edge type, and current graph state.
 */

// ============================================================================
// Edge Context Menu Generation
// ============================================================================

export interface EdgeMenuParams {
  edgeLabel: string;
  sourceLabel: string;
  targetLabel: string;
  currentStyle: EdgeStyle | undefined;
  onApplyStyle: (edgeLabel: string, style: EdgeStyle) => void;
  onResetStyle: (edgeLabel: string) => void;
}

/**
 * Generate context menu items for edges
 * Provides styling options (color, line style, width) and reset functionality
 */
export function generateEdgeContextMenuItems(params: EdgeMenuParams): ContextMenuItem[] {
  const { edgeLabel, sourceLabel, targetLabel, currentStyle, onApplyStyle, onResetStyle } = params;
  const items: ContextMenuItem[] = [];

  items.push({
    label: `🎨 Style "${edgeLabel}" Edges`,
    submenu: [
      {
        label: 'Color',
        submenu: [
          { label: '🔴 Red', action: () => onApplyStyle(edgeLabel, { color: '#ef4444', width: currentStyle?.width || 3, lineStyle: currentStyle?.lineStyle || 'solid' }) },
          { label: '🟠 Orange', action: () => onApplyStyle(edgeLabel, { color: '#f97316', width: currentStyle?.width || 3, lineStyle: currentStyle?.lineStyle || 'solid' }) },
          { label: '🟡 Yellow', action: () => onApplyStyle(edgeLabel, { color: '#eab308', width: currentStyle?.width || 3, lineStyle: currentStyle?.lineStyle || 'solid' }) },
          { label: '🟢 Green', action: () => onApplyStyle(edgeLabel, { color: '#22c55e', width: currentStyle?.width || 3, lineStyle: currentStyle?.lineStyle || 'solid' }) },
          { label: '🔵 Blue', action: () => onApplyStyle(edgeLabel, { color: '#3b82f6', width: currentStyle?.width || 3, lineStyle: currentStyle?.lineStyle || 'solid' }) },
          { label: '🟣 Purple', action: () => onApplyStyle(edgeLabel, { color: '#a855f7', width: currentStyle?.width || 3, lineStyle: currentStyle?.lineStyle || 'solid' }) },
          { label: '🩷 Pink', action: () => onApplyStyle(edgeLabel, { color: '#ec4899', width: currentStyle?.width || 3, lineStyle: currentStyle?.lineStyle || 'solid' }) },
          { label: '🩵 Teal', action: () => onApplyStyle(edgeLabel, { color: '#14b8a6', width: currentStyle?.width || 3, lineStyle: currentStyle?.lineStyle || 'solid' }) }
        ]
      },
      {
        label: 'Line Style',
        submenu: [
          { label: '━ Solid', action: () => onApplyStyle(edgeLabel, { color: currentStyle?.color || '#94a3b8', width: currentStyle?.width || 3, lineStyle: 'solid' }) },
          { label: '╌ Dashed', action: () => onApplyStyle(edgeLabel, { color: currentStyle?.color || '#94a3b8', width: currentStyle?.width || 3, lineStyle: 'dashed' }) },
          { label: '┈ Dotted', action: () => onApplyStyle(edgeLabel, { color: currentStyle?.color || '#94a3b8', width: currentStyle?.width || 3, lineStyle: 'dotted' }) }
        ]
      },
      {
        label: 'Width',
        submenu: [
          { label: 'Thin (2px)', action: () => onApplyStyle(edgeLabel, { color: currentStyle?.color || '#94a3b8', width: 2, lineStyle: currentStyle?.lineStyle || 'solid' }) },
          { label: 'Normal (3px)', action: () => onApplyStyle(edgeLabel, { color: currentStyle?.color || '#94a3b8', width: 3, lineStyle: currentStyle?.lineStyle || 'solid' }) },
          { label: 'Thick (4px)', action: () => onApplyStyle(edgeLabel, { color: currentStyle?.color || '#94a3b8', width: 4, lineStyle: currentStyle?.lineStyle || 'solid' }) },
          { label: 'Extra Thick (5px)', action: () => onApplyStyle(edgeLabel, { color: currentStyle?.color || '#94a3b8', width: 5, lineStyle: currentStyle?.lineStyle || 'solid' }) }
        ]
      },
      { separator: true },
      { label: '🔄 Reset Style', action: () => onResetStyle(edgeLabel), disabled: !currentStyle }
    ]
  });

  items.push({ separator: true });

  items.push({
    label: `📍 ${sourceLabel} → ${targetLabel}`,
    disabled: true
  });

  return items;
}

// ============================================================================
// Node Context Menu Generation
// ============================================================================

export interface NodeMenuParams {
  nodeId: string;
  nodeType: string;
  nodeLabel: string;
  selectedNodeInfo: { id: string; label: string; type: string } | null;
  pinnedNodes: Set<string>;
  highlightedNodes: Set<string>;
  // Action callbacks
  onShowNeighbors: (nodeId: string) => void;
  onHideNeighbors: (nodeId: string) => void;
  onExpandNeighborhood: (nodeId: string, hops: number) => void;
  onIsolateNode: (nodeId: string) => void;
  onHighlightShortestPath: (nodeId: string) => void;
  onShowConnectedComponent: (nodeId: string) => void;
  onTogglePin: (nodeId: string) => void;
  onToggleHighlight: (nodeId: string) => void;
  onChangeNodeColor: (nodeId: string, color: string) => void;
  onCopyNodeInfo: (nodeId: string) => void;
  onExportSubgraph: (nodeId: string) => void;
  onCenterNode: (nodeId: string) => void;
  onResetNodePosition: (nodeId: string) => void;
  onHideNode: (nodeId: string) => void;
  onViewDetails: (nodeId: string, nodeLabel: string, nodeType: string) => void;
}

/**
 * Generate context menu items for nodes based on node type
 * Provides exploration, path finding, visual, and export options
 */
export function generateNodeContextMenuItems(params: NodeMenuParams): ContextMenuItem[] {
  const {
    nodeId,
    nodeType,
    nodeLabel,
    selectedNodeInfo,
    pinnedNodes,
    highlightedNodes,
    onShowNeighbors,
    onHideNeighbors,
    onExpandNeighborhood,
    onIsolateNode,
    onHighlightShortestPath,
    onShowConnectedComponent,
    onTogglePin,
    onToggleHighlight,
    onChangeNodeColor,
    onCopyNodeInfo,
    onExportSubgraph,
    onCenterNode,
    onResetNodePosition,
    onHideNode,
    onViewDetails,
  } = params;

  const items: ContextMenuItem[] = [];

  // Neighborhood exploration
  items.push({
    label: '🔍 Explore',
    submenu: [
      { label: 'Show Neighbors', action: () => onShowNeighbors(nodeId) },
      { label: 'Hide Neighbors', action: () => onHideNeighbors(nodeId) },
      { label: 'Expand 2 Hops', action: () => onExpandNeighborhood(nodeId, 2) },
      { label: 'Expand 3 Hops', action: () => onExpandNeighborhood(nodeId, 3) },
      { label: 'Isolate Node & Neighbors', action: () => onIsolateNode(nodeId) }
    ]
  });

  // Path finding (only if another node is selected)
  if (selectedNodeInfo && selectedNodeInfo.id !== nodeId) {
    items.push({
      label: '🛤️ Paths',
      submenu: [
        { label: `Find Path to "${selectedNodeInfo.label}"`, action: () => onHighlightShortestPath(nodeId) },
        { label: 'Show Connected Component', action: () => onShowConnectedComponent(nodeId) }
      ]
    });
  }

  items.push({ separator: true });

  // Node type-specific actions
  if (nodeType === 'Requirement') {
    items.push({
      label: '📋 Requirement Actions',
      submenu: [
        { label: 'View Details', action: () => onViewDetails(nodeId, nodeLabel, nodeType) },
        { label: 'Show Traceability', action: () => onShowNeighbors(nodeId) }
      ]
    });
  } else if (nodeType === 'Document') {
    items.push({
      label: '📄 Document Actions',
      submenu: [
        { label: 'Show All Sections', action: () => onShowNeighbors(nodeId) },
        { label: 'Show Full Tree', action: () => onExpandNeighborhood(nodeId, 3) }
      ]
    });
  } else if (nodeType === 'DocumentSection') {
    items.push({
      label: '📑 Section Actions',
      submenu: [
        { label: 'Show Contents', action: () => onShowNeighbors(nodeId) },
        { label: 'Show Parent Document', action: () => onShowNeighbors(nodeId) }
      ]
    });
  } else if (nodeType === 'ArchitectureDiagram') {
    items.push({
      label: '🏗️ Diagram Actions',
      submenu: [
        { label: 'Show All Blocks', action: () => onShowNeighbors(nodeId) },
        { label: 'Show Connectors', action: () => onShowNeighbors(nodeId) },
        { label: 'Show Full Diagram', action: () => onExpandNeighborhood(nodeId, 2) }
      ]
    });
  } else if (nodeType === 'ArchitectureBlock') {
    items.push({
      label: '🧱 Block Actions',
      submenu: [
        { label: 'Show Diagrams Using This Block', action: () => onShowNeighbors(nodeId) },
        { label: 'Show Connected Blocks', action: () => onExpandNeighborhood(nodeId, 2) }
      ]
    });
  } else if (nodeType === 'ArchitectureConnector') {
    items.push({
      label: '🔗 Connector Actions',
      submenu: [
        { label: 'Show Source & Target', action: () => onShowNeighbors(nodeId) },
        { label: 'Show Parent Diagram', action: () => onShowNeighbors(nodeId) }
      ]
    });
  }

  items.push({ separator: true });

  // Visual operations
  items.push({
    label: '🎨 Visual',
    submenu: [
      { label: pinnedNodes.has(nodeId) ? '📌 Unpin' : '📍 Pin', action: () => onTogglePin(nodeId) },
      { label: highlightedNodes.has(nodeId) ? '💡 Unhighlight' : '✨ Highlight', action: () => onToggleHighlight(nodeId) },
      { label: 'Change Color', submenu: [
        { label: '🔴 Red', action: () => onChangeNodeColor(nodeId, '#ef4444') },
        { label: '🟢 Green', action: () => onChangeNodeColor(nodeId, '#22c55e') },
        { label: '🔵 Blue', action: () => onChangeNodeColor(nodeId, '#3b82f6') },
        { label: '🟡 Yellow', action: () => onChangeNodeColor(nodeId, '#eab308') },
        { label: '🟣 Purple', action: () => onChangeNodeColor(nodeId, '#a855f7') }
      ]}
    ]
  });

  items.push({ separator: true });

  // Information & Export
  items.push({
    label: '📤 Export',
    submenu: [
      { label: 'Copy Node Info', action: () => onCopyNodeInfo(nodeId) },
      { label: 'Export Subgraph (JSON)', action: () => onExportSubgraph(nodeId) }
    ]
  });

  items.push({ separator: true });

  // Layout operations
  items.push({
    label: '⚙️ Layout',
    submenu: [
      { label: 'Center Node', action: () => onCenterNode(nodeId) },
      { label: 'Reset Position', action: () => onResetNodePosition(nodeId) }
    ]
  });

  items.push({ separator: true });

  // Basic actions
  items.push({ label: '👁️ Hide Node', action: () => onHideNode(nodeId) });

  return items;
}
