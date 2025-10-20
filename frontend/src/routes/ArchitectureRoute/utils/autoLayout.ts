/**
 * Auto-layout utilities for AI-generated diagrams using Dagre
 *
 * This module provides automatic graph layout functionality to prevent
 * block overlaps and create clean hierarchical diagram layouts.
 *
 * Uses the Dagre directed graph layout algorithm which is ideal for
 * hierarchical architecture diagrams (systems → subsystems → components).
 */

import dagre from 'dagre';
import type { Node, Edge } from '@xyflow/react';
import type { SysmlBlock } from '../../../hooks/useArchitectureApi';
import type { DocumentRecord } from '../../../types';

/**
 * Layout configuration options for Dagre algorithm
 */
export interface AutoLayoutOptions {
  /**
   * Direction of graph layout
   * - TB: Top to bottom (default for architecture)
   * - BT: Bottom to top
   * - LR: Left to right
   * - RL: Right to left
   */
  rankdir?: 'TB' | 'BT' | 'LR' | 'RL';

  /**
   * Separation between ranks (levels) in pixels
   * @default 120
   */
  ranksep?: number;

  /**
   * Separation between nodes at same level in pixels
   * @default 100
   */
  nodesep?: number;

  /**
   * Alignment of nodes within their rank
   * - UL: Upper left
   * - UR: Upper right
   * - DL: Down left
   * - DR: Down right
   * @default 'UL'
   */
  align?: 'UL' | 'UR' | 'DL' | 'DR';

  /**
   * Margin around the graph in pixels
   * @default 50
   */
  margin?: number;
}

/**
 * Block type from AI diagram generation
 * (Simplified version - matches DiagramGenerationBlock from types)
 */
export interface LayoutBlock {
  name: string;
  positionX: number;
  positionY: number;
  sizeWidth?: number;
  sizeHeight?: number;
}

/**
 * Connector type from AI diagram generation
 * (Simplified version - matches DiagramGenerationConnector from types)
 */
export interface LayoutConnector {
  source: string;
  target: string;
}

/**
 * Apply Dagre automatic layout to AI-generated diagram blocks
 *
 * This function takes AI-generated blocks (which may have overlapping positions)
 * and applies a hierarchical layout algorithm to ensure proper spacing and
 * prevent any visual overlaps.
 *
 * @param blocks - Array of blocks with potentially naive positioning
 * @param connectors - Array of connectors defining relationships
 * @param options - Layout configuration options
 * @returns Array of blocks with optimized positions
 *
 * @example
 * ```typescript
 * const layoutedBlocks = applyAutoLayout(
 *   candidate.blocks,
 *   candidate.connectors,
 *   { rankdir: 'TB', ranksep: 120, nodesep: 100 }
 * );
 * ```
 */
export function applyAutoLayout<T extends LayoutBlock>(
  blocks: T[],
  connectors: LayoutConnector[],
  options: AutoLayoutOptions = {}
): T[] {
  if (blocks.length === 0) {
    return blocks;
  }

  const {
    rankdir = 'TB',   // Top-to-bottom by default (systems at top, components at bottom)
    ranksep = 120,    // Vertical spacing between levels
    nodesep = 100,    // Horizontal spacing between nodes
    align = 'UL',     // Upper-left alignment
    margin = 50       // Margin around graph
  } = options;

  // Create new dagre graph
  const g = new dagre.graphlib.Graph();

  // Set graph configuration
  g.setGraph({
    rankdir,
    ranksep,
    nodesep,
    align,
    marginx: margin,
    marginy: margin
  });

  // Default edge label (no labels needed for layout)
  g.setDefaultEdgeLabel(() => ({}));

  // Add nodes to graph with their dimensions
  blocks.forEach(block => {
    const width = block.sizeWidth || 150;
    const height = block.sizeHeight || 100;

    g.setNode(block.name, {
      width,
      height,
      label: block.name
    });
  });

  // Add edges (connectors) to graph to define hierarchy and relationships
  connectors.forEach(connector => {
    try {
      g.setEdge(connector.source, connector.target);
    } catch (error) {
      // Ignore edges with non-existent nodes
      console.warn(`Skipping edge from ${connector.source} to ${connector.target}: node not found`);
    }
  });

  // Run dagre layout algorithm
  dagre.layout(g);

  // Update block positions with dagre-calculated coordinates
  const layoutedBlocks = blocks.map(block => {
    const node = g.node(block.name);

    if (!node) {
      // Fallback if node not found (shouldn't happen)
      console.warn(`Node ${block.name} not found in graph after layout`);
      return block;
    }

    // Dagre returns center coordinates, so we need to adjust for top-left positioning
    const width = block.sizeWidth || 150;
    const height = block.sizeHeight || 100;

    return {
      ...block,
      positionX: node.x - width / 2,
      positionY: node.y - height / 2
    };
  });

  return layoutedBlocks;
}

/**
 * Apply auto-layout to ReactFlow nodes and edges
 *
 * This is a convenience function for applying layout to existing diagram nodes
 * (not AI-generated). Useful for "Auto-Layout" button in diagram toolbar.
 *
 * @param nodes - ReactFlow nodes
 * @param edges - ReactFlow edges
 * @param options - Layout configuration options
 * @returns Array of nodes with updated positions
 *
 * @example
 * ```typescript
 * const layoutedNodes = applyAutoLayoutToNodes(
 *   reactFlowInstance.getNodes(),
 *   reactFlowInstance.getEdges(),
 *   { rankdir: 'LR' }
 * );
 * reactFlowInstance.setNodes(layoutedNodes);
 * ```
 */
export function applyAutoLayoutToNodes(
  nodes: Node[],
  edges: Edge[],
  options: AutoLayoutOptions = {}
): Node[] {
  if (nodes.length === 0) {
    return nodes;
  }

  const {
    rankdir = 'TB',
    ranksep = 120,
    nodesep = 100,
    align = 'UL',
    margin = 50
  } = options;

  const g = new dagre.graphlib.Graph();

  g.setGraph({
    rankdir,
    ranksep,
    nodesep,
    align,
    marginx: margin,
    marginy: margin
  });

  g.setDefaultEdgeLabel(() => ({}));

  // Add nodes with their current dimensions
  nodes.forEach(node => {
    const width = node.width || 150;
    const height = node.height || 100;

    g.setNode(node.id, {
      width,
      height,
      label: node.id
    });
  });

  // Add edges
  edges.forEach(edge => {
    try {
      g.setEdge(edge.source, edge.target);
    } catch (error) {
      console.warn(`Skipping edge from ${edge.source} to ${edge.target}: node not found`);
    }
  });

  // Run layout
  dagre.layout(g);

  // Map back to nodes with updated positions
  return nodes.map(node => {
    const dagNode = g.node(node.id);

    if (!dagNode) {
      console.warn(`Node ${node.id} not found in graph after layout`);
      return node;
    }

    const width = node.width || 150;
    const height = node.height || 100;

    return {
      ...node,
      position: {
        x: dagNode.x - width / 2,
        y: dagNode.y - height / 2
      }
    };
  });
}

/**
 * Detect if blocks have any overlapping positions
 *
 * Uses AABB (Axis-Aligned Bounding Box) collision detection to check
 * if any two blocks occupy the same visual space.
 *
 * @param blocks - Array of blocks to check
 * @returns true if any overlaps detected, false otherwise
 *
 * @example
 * ```typescript
 * if (detectOverlaps(candidate.blocks)) {
 *   console.log("Overlaps detected, applying auto-layout");
 *   const fixed = applyAutoLayout(candidate.blocks, candidate.connectors);
 * }
 * ```
 */
export function detectOverlaps(blocks: LayoutBlock[]): boolean {
  // Need at least 2 blocks to have an overlap
  if (blocks.length < 2) {
    return false;
  }

  // Check every pair of blocks
  for (let i = 0; i < blocks.length; i++) {
    for (let j = i + 1; j < blocks.length; j++) {
      const a = blocks[i];
      const b = blocks[j];

      const aWidth = a.sizeWidth || 150;
      const aHeight = a.sizeHeight || 100;
      const bWidth = b.sizeWidth || 150;
      const bHeight = b.sizeHeight || 100;

      // AABB collision detection
      // Two rectangles overlap if they overlap on both X and Y axes
      const overlapX = (a.positionX < b.positionX + bWidth) && (a.positionX + aWidth > b.positionX);
      const overlapY = (a.positionY < b.positionY + bHeight) && (a.positionY + aHeight > b.positionY);

      if (overlapX && overlapY) {
        return true;  // Overlap detected
      }
    }
  }

  return false;  // No overlaps found
}

/**
 * Get bounding box of all blocks (min/max coordinates)
 *
 * Useful for centering diagrams or calculating zoom levels.
 *
 * @param blocks - Array of blocks
 * @returns Bounding box { minX, minY, maxX, maxY, width, height }
 */
export function getBoundingBox(blocks: LayoutBlock[]) {
  if (blocks.length === 0) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  blocks.forEach(block => {
    const width = block.sizeWidth || 150;
    const height = block.sizeHeight || 100;

    minX = Math.min(minX, block.positionX);
    minY = Math.min(minY, block.positionY);
    maxX = Math.max(maxX, block.positionX + width);
    maxY = Math.max(maxY, block.positionY + height);
  });

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY
  };
}

/**
 * Center blocks around origin (0, 0)
 *
 * Translates all blocks so their bounding box is centered at (0, 0).
 * Useful after applying auto-layout.
 *
 * @param blocks - Array of blocks to center
 * @returns Array of blocks with centered positions
 */
export function centerBlocks<T extends LayoutBlock>(blocks: T[]): T[] {
  if (blocks.length === 0) {
    return blocks;
  }

  const bbox = getBoundingBox(blocks);
  const centerX = bbox.minX + bbox.width / 2;
  const centerY = bbox.minY + bbox.height / 2;

  return blocks.map(block => ({
    ...block,
    positionX: block.positionX - centerX,
    positionY: block.positionY - centerY
  }));
}

/**
 * Get suggested layout direction based on diagram structure
 *
 * Analyzes the connector relationships to suggest the most appropriate
 * layout direction (top-to-bottom, left-to-right, etc.)
 *
 * @param blocks - Array of blocks
 * @param connectors - Array of connectors
 * @returns Suggested rankdir ('TB', 'LR', 'BT', 'RL')
 */
export function suggestLayoutDirection(
  blocks: LayoutBlock[],
  connectors: LayoutConnector[]
): 'TB' | 'LR' | 'BT' | 'RL' {
  // Default to top-to-bottom for architecture diagrams
  if (blocks.length === 0 || connectors.length === 0) {
    return 'TB';
  }

  // Calculate aspect ratio preference
  const totalWidth = blocks.reduce((sum, b) => sum + (b.sizeWidth || 150), 0);
  const totalHeight = blocks.reduce((sum, b) => sum + (b.sizeHeight || 100), 0);
  const avgWidth = totalWidth / blocks.length;
  const avgHeight = totalHeight / blocks.length;

  // If blocks are wider than tall, prefer horizontal layout
  if (avgWidth > avgHeight * 1.5) {
    return 'LR';
  }

  // Otherwise, use vertical layout (traditional for architecture)
  return 'TB';
}

/**
 * Calculate optimal block size based on content
 *
 * Analyzes block text content and linked documents to determine the minimum
 * size needed to display everything without truncation or overflow.
 *
 * @param block - The SysML block to size
 * @param documents - Array of all documents (to find linked ones)
 * @returns Optimal size { width, height } in pixels
 *
 * @example
 * ```typescript
 * const optimalSize = calculateBlockSize(block, documents);
 * updateBlockSize(block.id, optimalSize);
 * ```
 */
export function calculateBlockSize(
  block: SysmlBlock,
  documents?: DocumentRecord[]
): { width: number; height: number } {
  const MIN_WIDTH = 150;
  const MIN_HEIGHT = 100;
  const PADDING = 32; // 16px horizontal padding × 2
  const LINE_HEIGHT = 20;
  const CHAR_WIDTH = 8; // Approximate average character width

  let requiredWidth = MIN_WIDTH;
  let requiredHeight = MIN_HEIGHT;

  // 1. Calculate width based on text content
  // Name is rendered at 115% of base fontSize
  const baseFontSize = block.fontSize || 14;
  const nameWidth = block.name.length * CHAR_WIDTH * 1.15;
  const stereotypeWidth = (block.stereotype ? block.stereotype.length : 0) * CHAR_WIDTH * 0.85;

  requiredWidth = Math.max(requiredWidth, nameWidth + PADDING, stereotypeWidth + PADDING);

  // Description may wrap, so we calculate based on a max width
  let descriptionWidth = 0;
  if (block.description) {
    descriptionWidth = Math.min(block.description.length * CHAR_WIDTH * 0.85, 300);
    requiredWidth = Math.max(requiredWidth, descriptionWidth + PADDING);
  }

  // 2. Calculate height based on content rows
  let contentHeight = 56; // Base height (stereotype + name + padding)

  if (block.description) {
    // Multi-line descriptions (wrap at calculated width)
    const descCharWidth = CHAR_WIDTH * 0.85;
    const availableWidth = requiredWidth - PADDING;
    const lines = Math.ceil((block.description.length * descCharWidth) / availableWidth);
    contentHeight += lines * LINE_HEIGHT + 8; // 8px margin-top
  }

  // 3. Add height for linked documents section
  const linkedDocs = documents?.filter(doc => block.documentIds?.includes(doc.id)) || [];
  if (linkedDocs.length > 0) {
    contentHeight += 12; // border-top + padding-top
    contentHeight += 17; // "Documents (N)" label
    contentHeight += 6; // margin-bottom
    contentHeight += linkedDocs.length * 32; // Each doc button is ~32px (padding + text + gap)
  }

  requiredHeight = Math.max(MIN_HEIGHT, contentHeight + 24); // +24 for bottom padding

  // Round to nearest 10 for cleaner values
  return {
    width: Math.ceil(requiredWidth / 10) * 10,
    height: Math.ceil(requiredHeight / 10) * 10
  };
}
