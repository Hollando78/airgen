import { useMemo } from "react";
import {
  ReactFlow,
  Background,
  type Edge,
  type Node
} from "@xyflow/react";
import { SysmlBlockNode } from "./architecture/SysmlBlockNode";
import type { DiagramCandidate } from "../types";

interface DiagramCandidatePreviewProps {
  candidate: DiagramCandidate;
  height?: number;
}

const nodeTypes = {
  sysmlBlock: SysmlBlockNode
};

export function DiagramCandidatePreview({ 
  candidate, 
  height = 300 
}: DiagramCandidatePreviewProps): JSX.Element {
  const { nodes, edges } = useMemo(() => {
    // Convert diagram candidate blocks to ReactFlow nodes
    const nodes: Node[] = candidate.blocks.map((block) => ({
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
        isPreview: true // Flag to indicate this is a preview mode
      },
      draggable: false, // Disable dragging in preview
      selectable: false // Disable selection in preview
    }));

    // Convert diagram candidate connectors to ReactFlow edges
    const edges: Edge[] = candidate.connectors.map((connector, index) => ({
      id: `connector-${index}`,
      source: connector.source,
      target: connector.target,
      type: "default",
      label: connector.label,
      data: {
        kind: connector.kind,
        isPreview: true
      },
      selectable: false
    }));

    return { nodes, edges };
  }, [candidate]);

  return (
    <div className="diagram-candidate-preview" style={{ height }}>
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
        <Background />
      </ReactFlow>
      
      <style>{`
        .diagram-candidate-preview {
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          overflow: hidden;
          background: #fafbfc;
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