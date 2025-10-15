import { useMemo } from "react";
import {
  ReactFlow,
  Background,
  type Edge,
  type Node
} from "@xyflow/react";
import { SysmlBlockNode } from "./architecture/SysmlBlockNode";
import type { DiagramCandidate } from "../types";
import { applyAutoLayout, detectOverlaps } from "../routes/ArchitectureRoute/utils/autoLayout";

interface DiagramCandidatePreviewProps {
  candidate: DiagramCandidate;
  height?: number;
  useAutoLayout?: boolean; // Enable auto-layout (default: true)
}

const nodeTypes = {
  sysmlBlock: SysmlBlockNode
};

export function DiagramCandidatePreview({
  candidate,
  height = 300,
  useAutoLayout = true // Default to true for AI diagrams
}: DiagramCandidatePreviewProps): JSX.Element {
  const { nodes, edges, hasOverlaps } = useMemo(() => {
    let blocks = candidate.blocks;

    // Auto-layout if enabled or if overlaps detected
    const overlapsDetected = detectOverlaps(blocks);

    if (useAutoLayout || overlapsDetected) {
      // Apply Dagre layout to fix overlaps
      blocks = applyAutoLayout(
        candidate.blocks,
        candidate.connectors,
        {
          rankdir: 'TB',  // Top-to-bottom (systems → subsystems → components)
          ranksep: 120,   // Vertical spacing between levels
          nodesep: 100    // Horizontal spacing between nodes
        }
      );
    }

    // Convert diagram candidate blocks to ReactFlow nodes
    const nodes: Node[] = blocks.map((block) => ({
      id: block.name, // Use name as ID since we don't have stable IDs yet
      type: "sysmlBlock",
      position: { x: block.positionX, y: block.positionY },
      data: {
        block: {
          id: block.name,
          name: block.name,
          kind: block.kind,
          stereotype: block.stereotype,
          description: block.description,
          position: { x: block.positionX, y: block.positionY },
          size: {
            width: block.sizeWidth || 150,
            height: block.sizeHeight || 100
          },
          ports: block.ports || [],
          documentIds: []
        },
        documents: [],
        isPreview: true, // Flag to indicate this is a preview mode
        useVanillaStyle: true // Use clean vanilla styling for AI diagrams
      },
      draggable: false, // Disable dragging in preview
      selectable: false // Disable selection in preview
    }));

    // Convert diagram candidate connectors to ReactFlow edges
    const edges: Edge[] = candidate.connectors.map((connector, index) => ({
      id: `connector-${index}`,
      source: connector.source,
      target: connector.target,
      type: connector.kind === "composition" ? "step" : "default",
      label: connector.label,
      data: {
        kind: connector.kind,
        isPreview: true
      },
      style: {
        stroke: connector.kind === "composition" ? "#16a34a" : "#64748b",
        strokeWidth: 2
      },
      selectable: false
    }));

    return { nodes, edges, hasOverlaps: overlapsDetected };
  }, [candidate, useAutoLayout]);

  return (
    <div className="diagram-candidate-preview" style={{ height, position: 'relative' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        attributionPosition="bottom-left"
        proOptions={{ hideAttribution: true }}
        panOnDrag={false}
        zoomOnScroll={false}
        zoomOnPinch={false}
        zoomOnDoubleClick={false}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
      >
        <Background color="#e5e7eb" gap={16} size={1} />
      </ReactFlow>

      {hasOverlaps && (
        <div style={{
          position: "absolute",
          top: 8,
          right: 8,
          background: "rgba(245, 158, 11, 0.9)",
          color: "#fff",
          padding: "4px 10px",
          borderRadius: "6px",
          fontSize: "12px",
          fontWeight: 600,
          zIndex: 10
        }}>
          ⚠ Auto-layout applied
        </div>
      )}
      
      <style>{`
        .diagram-candidate-preview {
          border: 1px solid var(--border);
          border-radius: var(--radius-sm);
          overflow: hidden;
          background: #f9fafb;
        }
        
        .diagram-candidate-preview .react-flow__attribution {
          display: none;
        }
        
        .diagram-candidate-preview .react-flow__controls {
          display: none;
        }
        
        .diagram-candidate-preview .react-flow__minimap {
          display: none;
        }
      `}</style>
    </div>
  );
}