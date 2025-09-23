import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  MarkerType,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type OnSelectionChangeParams,
  useNodesState,
  useEdgesState
} from "@xyflow/react";
import { useTenantProjectDocument } from "../components/TenantProjectDocumentSelector";
import {
  useArchitecture,
  type SysmlBlock,
  type SysmlConnector,
  type BlockKind
} from "../hooks/useArchitecture";
import { SysmlBlockNode } from "../components/architecture/SysmlBlockNode";
import { BlockDetailsPanel } from "../components/architecture/BlockDetailsPanel";
import { ConnectorDetailsPanel } from "../components/architecture/ConnectorDetailsPanel";

type BlockPreset = {
  label: string;
  kind: BlockKind;
  stereotype: string;
  description?: string;
};

const BLOCK_PRESETS: BlockPreset[] = [
  { label: "System Block", kind: "system", stereotype: "block", description: "Top-level system context" },
  { label: "Subsystem", kind: "subsystem", stereotype: "subsystem", description: "Logical subsystem" },
  { label: "Software Component", kind: "component", stereotype: "component", description: "Software or service component" },
  { label: "Actor", kind: "actor", stereotype: "actor", description: "External actor or user" },
  { label: "External System", kind: "external", stereotype: "external", description: "Outside system boundary" }
];

const nodeTypes = { sysmlBlock: SysmlBlockNode };

const DEBUG_ARCHITECTURE = false;

function mapConnectorToEdge(connector: SysmlConnector): Edge {
  const kind = connector.kind;
  const isFlow = kind === "flow";
  const isDependency = kind === "dependency";
  const isAssociation = kind === "association";
  const strokeColor = isFlow ? "#2563eb" : isDependency ? "#0f172a" : "#334155";

  return {
    id: connector.id,
    source: connector.source,
    target: connector.target,
    sourceHandle: connector.sourcePortId ?? undefined,
    targetHandle: connector.targetPortId ?? undefined,
    label: connector.label,
    type: isFlow ? "smoothstep" : "straight",
    animated: isFlow,
    style: {
      strokeWidth: 2,
      strokeDasharray: isDependency ? "6 4" : isAssociation ? "4 3" : undefined,
      stroke: strokeColor
    },
    labelStyle: { fontSize: 12, fill: "#0f172a", fontWeight: 500 },
    labelBgPadding: [6, 4],
    labelBgBorderRadius: 4,
    labelBgStyle: { fill: "#ffffff", stroke: "#e2e8f0", strokeWidth: 1 },
    markerEnd: {
      type: MarkerType.ArrowClosed,
      color: strokeColor,
      width: 22,
      height: 22
    },
    markerStart: kind === "composition"
      ? { type: MarkerType.ArrowClosed, color: strokeColor, width: 18, height: 18 }
      : undefined
  } satisfies Edge;
}

export function ArchitectureRoute(): JSX.Element {
  const { tenant, project } = useTenantProjectDocument();
  const {
    architecture,
    addBlock,
    updateBlock,
    updateBlockPosition,
    updateBlockSize,
    removeBlock,
    addPort,
    updatePort,
    removePort,
    addConnector,
    updateConnector,
    removeConnector,
    clearArchitecture,
    hasChanges
  } = useArchitecture(tenant, project);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [selectedConnectorId, setSelectedConnectorId] = useState<string | null>(null);

  const [nodes, setNodes, onNodesStateChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesStateChange] = useEdgesState<Edge>([]);


  useEffect(() => {
    if (selectedBlockId && !architecture.blocks.some(block => block.id === selectedBlockId)) {
      setSelectedBlockId(null);
    }
  }, [architecture.blocks, selectedBlockId]);

  useEffect(() => {
    if (selectedConnectorId && !architecture.connectors.some(connector => connector.id === selectedConnectorId)) {
      setSelectedConnectorId(null);
    }
  }, [architecture.connectors, selectedConnectorId]);

  useLayoutEffect(() => {
    setNodes(prevNodes => {
      const prevLookup = new Map(prevNodes.map(node => [node.id, node]));

      return architecture.blocks.map(block => {
        const prev = prevLookup.get(block.id);

        return {
          ...prev,
          id: block.id,
          type: "sysmlBlock",
          position: block.position,
          data: {
            block
          },
          style: {
            width: block.size.width,
            height: block.size.height,
            padding: 0,
            border: "none",
            background: "transparent"
          },
          width: prev?.width,
          height: prev?.height,
          selected: block.id === selectedBlockId
        } satisfies Node;
      });
    });
  }, [architecture.blocks, selectedBlockId, setNodes]);

  useEffect(() => {
    setEdges(prevEdges => {
      const prevLookup = new Map(prevEdges.map(edge => [edge.id, edge]));

      return architecture.connectors.map(connector => {
        const prev = prevLookup.get(connector.id);

        return {
          ...prev,
          ...mapConnectorToEdge(connector),
          selected: connector.id === selectedConnectorId
        } satisfies Edge;
      });
    });
  }, [architecture.connectors, selectedConnectorId, setEdges]);

  const handleSelectionChange = useCallback(
    ({ nodes: selectedNodes, edges: selectedEdges }: OnSelectionChangeParams) => {
      const firstNodeId = selectedNodes[0]?.id ?? null;
      const firstEdgeId = selectedEdges[0]?.id ?? null;

      if (DEBUG_ARCHITECTURE) {
        console.debug("[Architecture] selection change", {
          nodeIds: selectedNodes.map(node => node.id),
          edgeIds: selectedEdges.map(edge => edge.id)
        });
      }

      if (firstNodeId) {
        setSelectedBlockId(firstNodeId);
        setSelectedConnectorId(null);
      } else if (firstEdgeId) {
        setSelectedConnectorId(firstEdgeId);
        setSelectedBlockId(null);
      } else {
        setSelectedBlockId(null);
        setSelectedConnectorId(null);
      }
    },
    [setEdges, setNodes]
  );

  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => {
      if (DEBUG_ARCHITECTURE) {
        console.debug("[Architecture] nodes change", changes);
      }
      onNodesStateChange(changes);

      changes.forEach(change => {
        if (change.type === "position") {
          const nextPosition = change.position ?? change.positionAbsolute;
          if (nextPosition && !change.dragging) {
            updateBlockPosition(change.id, nextPosition);
          }
        }
        if (change.type === "dimensions" && change.dimensions) {
          updateBlockSize(change.id, {
            width: change.dimensions.width,
            height: change.dimensions.height
          });
        }
      });
    },
    [onNodesStateChange, updateBlockPosition, updateBlockSize]
  );

  const handleEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      onEdgesStateChange(changes);

      changes.forEach(change => {
        if (change.type === "remove") {
          removeConnector(change.id);
        }
      });
    },
    [onEdgesStateChange, removeConnector]
  );

  const handleConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return;
      const newId = addConnector({
        source: connection.source,
        target: connection.target,
        sourcePortId: connection.sourceHandle ?? null,
        targetPortId: connection.targetHandle ?? null
      });
      setSelectedConnectorId(newId);
      setSelectedBlockId(null);
      setNodes(prevNodes => prevNodes.map(node => ({
        ...node,
        selected: false
      })));
      setEdges(prevEdges => prevEdges.map(edge => ({
        ...edge,
        selected: false
      })));
    },
    [addConnector, setEdges, setNodes]
  );

  const handleAddBlock = useCallback(
    (preset: BlockPreset) => {
      const offset = architecture.blocks.length;
      const id = addBlock({
        name: preset.label,
        kind: preset.kind,
        stereotype: preset.stereotype,
        description: preset.description,
        position: {
          x: 160 + offset * 60 + Math.random() * 40,
          y: 160 + offset * 40 + Math.random() * 40
        }
      });

      setSelectedBlockId(id);
      setSelectedConnectorId(null);
      setNodes(prevNodes => prevNodes.map(node => ({
        ...node,
        selected: node.id === id
      })));
      setEdges(prevEdges => prevEdges.map(edge => ({
        ...edge,
        selected: false
      })));
    },
    [addBlock, architecture.blocks.length, setEdges, setNodes]
  );

  const selectedBlock = useMemo(
    () => architecture.blocks.find(block => block.id === selectedBlockId) ?? null,
    [architecture.blocks, selectedBlockId]
  );

  const selectedConnector = useMemo(
    () => architecture.connectors.find(connector => connector.id === selectedConnectorId) ?? null,
    [architecture.connectors, selectedConnectorId]
  );

  if (!tenant || !project) {
    return (
      <div className="panel">
        <div className="panel-header">
          <h1>Architecture</h1>
          <p>Select a tenant and project to define system architecture.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="panel-stack">
      <div className="panel">
        <div className="panel-header">
          <div>
            <h1>SysML Architecture</h1>
            <p>Model the block definition diagram for {project}</p>
          </div>
          <div className="architecture-toolbar">
            {BLOCK_PRESETS.map(preset => (
              <button
                key={preset.kind}
                className="ghost-button"
                onClick={() => handleAddBlock(preset)}
                title={`Add ${preset.label}`}
              >
                {preset.label}
              </button>
            ))}
            <span style={{ width: "1px", height: "24px", background: "#dbeafe" }} />
            <button className="ghost-button" onClick={clearArchitecture} disabled={!hasChanges}>
              Clear All
            </button>
          </div>
        </div>

        <div className="architecture-workspace">
          <div className="architecture-canvas-shell">
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              onNodesChange={handleNodesChange}
              onEdgesChange={handleEdgesChange}
              onConnect={handleConnect}
              onPaneClick={() => {
                setSelectedBlockId(null);
                setSelectedConnectorId(null);
                setNodes(prevNodes => prevNodes.map(node => ({
                  ...node,
                  selected: false
                })));
                setEdges(prevEdges => prevEdges.map(edge => ({
                  ...edge,
                  selected: false
                })));
              }}
              onNodeClick={(event: ReactMouseEvent, node: Node) => {
                event.stopPropagation();
                if (DEBUG_ARCHITECTURE) {
                  console.debug("[Architecture] onNodeClick", node.id);
                }
                setSelectedBlockId(node.id);
                setSelectedConnectorId(null);
              }}
              onEdgeClick={(event: ReactMouseEvent, edge: Edge) => {
                event.stopPropagation();
                if (DEBUG_ARCHITECTURE) {
                  console.debug("[Architecture] onEdgeClick", edge.id);
                }
                setSelectedConnectorId(edge.id);
                setSelectedBlockId(null);
                setEdges(prevEdges => prevEdges.map(existing => ({
                  ...existing,
                  selected: existing.id === edge.id
                })));
                setNodes(prevNodes => prevNodes.map(existing => ({
                  ...existing,
                  selected: false
                })));
              }}
              onNodesDelete={(nodesToDelete: Node[]) =>
                nodesToDelete.forEach(node => removeBlock(node.id))
              }
              onEdgesDelete={(edgesToDelete: Edge[]) =>
                edgesToDelete.forEach(edge => removeConnector(edge.id))
              }
              onSelectionChange={handleSelectionChange}
              fitView
              proOptions={{ hideAttribution: true }}
            >
              <Background color="#e2e8f0" gap={20} size={1} />
              <MiniMap
                nodeColor={node => {
                  const block = architecture.blocks.find(b => b.id === node.id);
                  if (!block) return "#e2e8f0";
                  switch (block.kind) {
                    case "system":
                      return "#2563eb";
                    case "subsystem":
                      return "#7c3aed";
                    case "actor":
                      return "#f97316";
                    case "external":
                      return "#64748b";
                    default:
                      return "#16a34a";
                  }
                }}
              />
              <Controls position="bottom-right" showInteractive={false} />
            </ReactFlow>
          </div>

          <div className="architecture-sidebars">
            {selectedBlock && (
              <BlockDetailsPanel
                block={selectedBlock}
                onUpdate={updates => updateBlock(selectedBlock.id, updates)}
                onUpdatePosition={position => updateBlockPosition(selectedBlock.id, position)}
                onUpdateSize={size => updateBlockSize(selectedBlock.id, size)}
                onRemove={() => removeBlock(selectedBlock.id)}
                onAddPort={port => addPort(selectedBlock.id, port)}
                onUpdatePort={(portId, updates) => updatePort(selectedBlock.id, portId, updates)}
                onRemovePort={portId => removePort(selectedBlock.id, portId)}
              />
            )}

            {selectedConnector && (
              <ConnectorDetailsPanel
                connector={selectedConnector}
                onUpdate={updates => updateConnector(selectedConnector.id, updates)}
                onRemove={() => removeConnector(selectedConnector.id)}
              />
            )}

            {!selectedBlock && !selectedConnector && (
              <div className="architecture-hint">
                <h3>Workspace tips</h3>
                <ul>
                  <li>Use the palette to add SysML blocks.</li>
                  <li>Drag handles between blocks or ports to create connectors.</li>
                  <li>Select a block or connector to edit details here.</li>
                  <li>Drag blocks or resize them to express containment.</li>
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
