import {
  forwardRef,
  useImperativeHandle,
  useState,
  useCallback,
  type ForwardRefRenderFunction,
  type MouseEvent as ReactMouseEvent
} from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  type Connection,
  type Edge,
  type Node,
  type ReactFlowInstance,
  type XYPosition
} from "@xyflow/react";
import { SysmlBlockNode } from "../architecture/SysmlBlockNode";
import { BlockStylingPopup } from "../architecture/BlockStylingPopup";
import { ConnectorStylingPopup } from "../architecture/ConnectorStylingPopup";
import { DiagramContextMenu } from "./DiagramContextMenu";
import { ConnectorStylingToolbar } from "./ConnectorStylingToolbar";
import { DiagramToolbar } from "./DiagramToolbar";
import { Spinner } from "../Spinner";
import { StraightEdge, SmoothStepEdge, StepEdge, BezierEdge } from "./CustomEdge";
import type { ArchitectureDiagramRecord, DocumentRecord } from "../../types";
import type {
  ArchitectureState,
  BlockKind,
  ConnectorKind,
  PortDirection,
  SysmlBlock,
  SysmlConnector
} from "../../hooks/useArchitectureApi";
import { useDiagramCanvasInteractions } from "../../hooks/useDiagramCanvasInteractions";

const nodeTypes = { sysmlBlock: SysmlBlockNode };
const edgeTypes = {
  straight: StraightEdge,
  smoothstep: SmoothStepEdge,
  step: StepEdge,
  default: BezierEdge
};

type DiagramBlockPreset = {
  label: string;
  kind: BlockKind;
  stereotype: string;
  description?: string;
};

export interface DiagramCanvasHandle {
  addBlockFromPreset: (preset: DiagramBlockPreset) => void;
  addBlockAtPosition: (preset: DiagramBlockPreset, position: XYPosition) => void;
  reuseExistingBlock: (blockId: string) => void;
}

interface DiagramCanvasProps {
  tenant: string;
  project: string;
  architecture: ArchitectureState;
  activeDiagram: ArchitectureDiagramRecord | null;
  activeDiagramId: string | null;
  documents: DocumentRecord[];
  selectedBlockId: string | null;
  selectedConnectorId: string | null;
  selectedPortId?: string | null;
  onSelectBlock: (blockId: string | null) => void;
  onSelectConnector: (connectorId: string | null) => void;
  onSelectPort?: (blockId: string, portId: string | null) => void;
  blockPresets: DiagramBlockPreset[];
  computePlacement: (blockCount: number) => XYPosition;
  addBlock: (
    input:
      | {
          name?: string;
          kind?: BlockKind;
          stereotype?: string;
          description?: string;
          x?: number;
          y?: number;
          size?: { width: number; height: number };
        }
      | { x: number; y: number }
  ) => string | null;
  reuseBlock: (blockId: string, position: { x: number; y: number }, size?: { width: number; height: number }) => string | null;
  updateBlock: (blockId: string, updates: Partial<SysmlBlock>) => void;
  updateBlockPosition: (blockId: string, position: { x: number; y: number }) => void;
  updateBlockSize: (blockId: string, size: { width: number; height: number }) => void;
  removeBlock: (blockId: string) => void;
  addPort: (blockId: string, port: { name: string; direction: PortDirection }) => void;
  updatePort: (blockId: string, portId: string, updates: { name?: string; direction?: PortDirection }) => void;
  removePort: (blockId: string, portId: string) => void;
  addConnector: (input: {
    source: string;
    target: string;
    sourcePortId?: string | null;
    targetPortId?: string | null;
    kind?: ConnectorKind;
    label?: string;
  }) => string | null;
  updateConnector: (connectorId: string, updates: Partial<SysmlConnector>) => void;
  removeConnector: (connectorId: string) => void;
  onOpenDocument: (documentSlug: string) => void;
  isLoading: boolean;
  mapConnectorToEdge: (connector: SysmlConnector, blocks?: SysmlBlock[]) => Edge;
  hideDefaultHandles?: boolean;
  onDropDocument?: (documentId: string, position: XYPosition) => void;
}

const DiagramCanvasComponent: ForwardRefRenderFunction<
  DiagramCanvasHandle,
  DiagramCanvasProps
> = (
  {
      tenant,
      project,
      architecture,
      activeDiagram,
      activeDiagramId,
      documents,
      selectedBlockId,
      selectedConnectorId,
      selectedPortId,
      onSelectBlock,
      onSelectConnector,
      onSelectPort,
      addBlock,
      reuseBlock,
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
      onOpenDocument,
      isLoading,
      blockPresets,
      computePlacement,
      mapConnectorToEdge,
      hideDefaultHandles,
      onDropDocument
  },
  ref
) => {
    const [isConnectMode, setIsConnectMode] = useState(false);

    const {
      minimapOpen,
      setMinimapOpen,
      showCodeViewer,
      setShowCodeViewer,
      nodes,
      edges,
      nodesChangeHandler,
      edgesChangeHandler,
      handleConnect,
      handlePaneClick,
      handlePaneContextMenu,
      handleNodeContextMenu,
      handleEdgeContextMenu,
      handleSelectionChange,
      contextMenuState,
      contextMenuItems,
      showContextMenu,
      closeContextMenu,
      blockStylingPopup,
      setBlockStylingPopup,
      connectorStylingPopup,
      setConnectorStylingPopup,
      canvasWrapperRef,
      reactFlowInstanceRef,
      selectedConnector,
      addBlockFromPreset,
      reuseExistingBlock
    } = useDiagramCanvasInteractions({
      architecture,
      activeDiagram,
      activeDiagramId,
      documents,
      selectedBlockId,
      selectedConnectorId,
      selectedPortId,
      onSelectBlock,
      onSelectConnector,
      onSelectPort,
      blockPresets,
      computePlacement,
      mapConnectorToEdge,
      hideDefaultHandles,
      isConnectMode,
      addBlock,
      reuseBlock,
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
      onOpenDocument
    });

    useImperativeHandle(ref, () => ({
      addBlockFromPreset: (preset: DiagramBlockPreset) => addBlockFromPreset(preset),
      addBlockAtPosition: (preset: DiagramBlockPreset, position: XYPosition) => addBlockFromPreset(preset, position),
      reuseExistingBlock: (blockId: string) => reuseExistingBlock(blockId)
    }), [addBlockFromPreset, reuseExistingBlock]);

    const handleDrop = useCallback((event: React.DragEvent) => {
      event.preventDefault();

      if (!onDropDocument || !reactFlowInstanceRef.current) {
        return;
      }

      const documentId = event.dataTransfer.getData("documentId");
      if (!documentId) {
        return;
      }

      // Convert screen coordinates to flow coordinates
      const position = reactFlowInstanceRef.current.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY
      });

      onDropDocument(documentId, position);
    }, [onDropDocument]);

    const handleDragOver = useCallback((event: React.DragEvent) => {
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
    }, []);

    return (
      <div className="architecture-canvas-area">
        <div className="architecture-canvas-shell" ref={canvasWrapperRef}>
          {activeDiagramId ? (
            <>
              <ReactFlow
                nodes={nodes}
                edges={edges}
                nodeTypes={nodeTypes}
                edgeTypes={edgeTypes}
                onNodesChange={nodesChangeHandler}
                onEdgesChange={edgesChangeHandler}
                onConnect={handleConnect}
                onPaneClick={handlePaneClick}
                onPaneContextMenu={handlePaneContextMenu}
                onNodeContextMenu={handleNodeContextMenu}
                onEdgeContextMenu={handleEdgeContextMenu}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onNodeClick={(event: ReactMouseEvent, node: Node) => {
                  event.stopPropagation();
                  closeContextMenu();
                  onSelectBlock(node.id);
                  onSelectConnector(null);
                  setBlockStylingPopup(null);
                  setConnectorStylingPopup(null);
                }}
                onEdgeClick={(event: ReactMouseEvent, edge: Edge) => {
                  event.stopPropagation();
                  closeContextMenu();
                  onSelectConnector(edge.id);
                  onSelectBlock(null);
                  setBlockStylingPopup(null);
                  setConnectorStylingPopup(null);
                }}
                onNodesDelete={(nodesToDelete: Node[]) =>
                  nodesToDelete.forEach(node => removeBlock(node.id))
                }
                onEdgesDelete={(edgesToDelete: Edge[]) =>
                  edgesToDelete.forEach(edge => removeConnector(edge.id))
                }
                onSelectionChange={handleSelectionChange}
                onInit={(instance: ReactFlowInstance) => {
                  reactFlowInstanceRef.current = instance;
                }}
                fitView
                proOptions={{ hideAttribution: true }}
              >
                <Background color="#e2e8f0" gap={20} size={1} />
                {minimapOpen && (
                  <MiniMap
                    position="top-right"
                    style={{
                      top: 20,
                      right: 20,
                      width: 200,
                      height: 140,
                      backgroundColor: "#ffffff",
                      border: "1px solid #e2e8f0",
                      borderRadius: "8px",
                      boxShadow: "0 2px 8px rgba(0, 0, 0, 0.1)"
                    }}
                    nodeColor={node => {
                      const block = architecture.blocks.find((candidate: SysmlBlock) => candidate.id === node.id);
                      if (!block) {return "#e2e8f0";}
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
                )}
                <Controls position="bottom-right" showInteractive={false} />
              </ReactFlow>

              <DiagramToolbar
                isConnectMode={isConnectMode}
                onToggleConnectMode={() => setIsConnectMode(prev => !prev)}
              />

              <div className="architecture-canvas-toolbar">
                <button className="ghost-button" onClick={() => setMinimapOpen(prev => !prev)}>
                  {minimapOpen ? "Hide minimap" : "Show minimap"}
                </button>
                <button className="ghost-button" onClick={() => setShowCodeViewer(prev => !prev)}>
                  {showCodeViewer ? "Hide query" : "Show query"}
                </button>
              </div>

              {showCodeViewer && (
                <div
                  style={{
                    position: "absolute",
                    top: "80px",
                    left: "10px",
                    width: "500px",
                    maxHeight: "400px",
                    backgroundColor: "#1e293b",
                    border: "2px solid #334155",
                    borderRadius: "8px",
                    boxShadow: "0 10px 25px rgba(0, 0, 0, 0.3)",
                    zIndex: 1000,
                    display: "flex",
                    flexDirection: "column",
                    overflow: "hidden"
                  }}
                >
                  <div
                    style={{
                      padding: "12px 16px",
                      backgroundColor: "#0f172a",
                      borderBottom: "1px solid #334155",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center"
                    }}
                  >
                    <h3 style={{ margin: 0, fontSize: "14px", color: "#f1f5f9", fontFamily: "monospace" }}>
                      Diagram Query (Neo4j Cypher)
                    </h3>
                    <button
                      onClick={() => setShowCodeViewer(false)}
                      style={{
                        background: "none",
                        border: "none",
                        color: "#94a3b8",
                        cursor: "pointer",
                        fontSize: "18px",
                        padding: "0",
                        width: "24px",
                        height: "24px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center"
                      }}
                    >
                      ×
                    </button>
                  </div>
                  <div
                    style={{
                      flex: 1,
                      overflow: "auto",
                      padding: "16px",
                      fontFamily: "'Fira Code', 'Consolas', monospace",
                      fontSize: "12px",
                      lineHeight: "1.6",
                      color: "#cbd5e1"
                    }}
                  >
                    <pre style={{ margin: 0 }}>
                      <span style={{ color: "#c084fc" }}>// Fetch blocks for diagram: {activeDiagram?.name || "Unknown"}</span>
                      {'\n'}
                      <span style={{ color: "#60a5fa" }}>MATCH</span> (d:Diagram {'{'}id: <span style={{ color: "#86efac" }}>"{activeDiagramId}"</span>{'}'})
                      {'\n'}
                      <span style={{ color: "#60a5fa" }}>MATCH</span> (d)-[:CONTAINS]-&gt;(b:Block)
                      {'\n'}
                      <span style={{ color: "#60a5fa" }}>OPTIONAL MATCH</span> (b)-[:HAS_PORT]-&gt;(p:Port)
                      {'\n'}
                      <span style={{ color: "#60a5fa" }}>OPTIONAL MATCH</span> (b)-[:REFERENCES]-&gt;(doc:Document)
                      {'\n'}
                      <span style={{ color: "#60a5fa" }}>WHERE</span> d.tenant = <span style={{ color: "#86efac" }}>"{tenant}"</span>
                      {'\n'}
                      <span style={{ color: "#60a5fa" }}>  AND</span> d.projectKey = <span style={{ color: "#86efac" }}>"{project}"</span>
                      {'\n'}
                      <span style={{ color: "#60a5fa" }}>RETURN</span> b.id <span style={{ color: "#60a5fa" }}>AS</span> id,
                      {'\n'}       b.name <span style={{ color: "#60a5fa" }}>AS</span> name,
                      {'\n'}       b.kind <span style={{ color: "#60a5fa" }}>AS</span> kind,
                      {'\n'}       b.stereotype <span style={{ color: "#60a5fa" }}>AS</span> stereotype,
                      {'\n'}       b.position <span style={{ color: "#60a5fa" }}>AS</span> position,
                      {'\n'}       b.size <span style={{ color: "#60a5fa" }}>AS</span> size,
                      {'\n'}       <span style={{ color: "#60a5fa" }}>COLLECT</span>(<span style={{ color: "#60a5fa" }}>DISTINCT</span> p) <span style={{ color: "#60a5fa" }}>AS</span> ports,
                      {'\n'}       <span style={{ color: "#60a5fa" }}>COLLECT</span>(<span style={{ color: "#60a5fa" }}>DISTINCT</span> doc.id) <span style={{ color: "#60a5fa" }}>AS</span> documentIds
                      {'\n'}
                      {'\n'}
                      <span style={{ color: "#c084fc" }}>// Fetch connectors for diagram</span>
                      {'\n'}
                      <span style={{ color: "#60a5fa" }}>MATCH</span> (d:Diagram {'{'}id: <span style={{ color: "#86efac" }}>"{activeDiagramId}"</span>{'}'})
                      {'\n'}
                      <span style={{ color: "#60a5fa" }}>MATCH</span> (d)-[:CONTAINS]-&gt;(c:Connector)
                      {'\n'}
                      <span style={{ color: "#60a5fa" }}>MATCH</span> (c)-[:CONNECTS_FROM]-&gt;(source:Block)
                      {'\n'}
                      <span style={{ color: "#60a5fa" }}>MATCH</span> (c)-[:CONNECTS_TO]-&gt;(target:Block)
                      {'\n'}
                      <span style={{ color: "#60a5fa" }}>OPTIONAL MATCH</span> (c)-[:FROM_PORT]-&gt;(sp:Port)
                      {'\n'}
                      <span style={{ color: "#60a5fa" }}>OPTIONAL MATCH</span> (c)-[:TO_PORT]-&gt;(tp:Port)
                      {'\n'}
                      <span style={{ color: "#60a5fa" }}>WHERE</span> d.tenant = <span style={{ color: "#86efac" }}>"{tenant}"</span>
                      {'\n'}
                      <span style={{ color: "#60a5fa" }}>  AND</span> d.projectKey = <span style={{ color: "#86efac" }}>"{project}"</span>
                      {'\n'}
                      <span style={{ color: "#60a5fa" }}>RETURN</span> c.id <span style={{ color: "#60a5fa" }}>AS</span> id,
                      {'\n'}       source.id <span style={{ color: "#60a5fa" }}>AS</span> sourceId,
                      {'\n'}       target.id <span style={{ color: "#60a5fa" }}>AS</span> targetId,
                      {'\n'}       c.kind <span style={{ color: "#60a5fa" }}>AS</span> kind,
                      {'\n'}       c.label <span style={{ color: "#60a5fa" }}>AS</span> label,
                      {'\n'}       sp.id <span style={{ color: "#60a5fa" }}>AS</span> sourcePortId,
                      {'\n'}       tp.id <span style={{ color: "#60a5fa" }}>AS</span> targetPortId
                      {'\n'}
                      {'\n'}
                      <span style={{ color: "#c084fc" }}>// Total blocks: {architecture.blocks.length}</span>
                      {'\n'}
                      <span style={{ color: "#c084fc" }}>// Total connectors: {architecture.connectors.length}</span>
                    </pre>
                  </div>
                </div>
              )}

              {blockStylingPopup && (() => {
                const block = architecture.blocks.find((candidate: SysmlBlock) => candidate.id === blockStylingPopup.blockId);
                return block ? (
                  <BlockStylingPopup
          block={block}
                    position={blockStylingPopup.position}
                    onUpdate={updates => updateBlock(blockStylingPopup.blockId, updates)}
                    onClose={() => setBlockStylingPopup(null)}
                  />
                ) : null;
              })()}

              {connectorStylingPopup && (() => {
                const connector = architecture.connectors.find((candidate: SysmlConnector) => candidate.id === connectorStylingPopup.connectorId);
                return connector ? (
                  <ConnectorStylingPopup
                    connector={connector}
                    position={connectorStylingPopup.position}
                    onUpdate={updates => updateConnector(connectorStylingPopup.connectorId, updates)}
                    onClose={() => setConnectorStylingPopup(null)}
                  />
                ) : null;
              })()}

              {selectedConnector && (
                <ConnectorStylingToolbar
                  connector={selectedConnector}
                  onUpdate={updates => updateConnector(selectedConnector.id, updates)}
                />
              )}

              {isLoading && (
                <div className="architecture-loading-overlay">
                  <Spinner />
                </div>
              )}

              {showContextMenu && contextMenuState.type !== "closed" && (
                <DiagramContextMenu
                  x={contextMenuState.client.x}
                  y={contextMenuState.client.y}
                  items={contextMenuItems}
                  onClose={closeContextMenu}
                />
              )}
            </>
          ) : (
            <div className="architecture-canvas-placeholder">
              <p>Select a diagram tab or create a new view to begin modelling.</p>
            </div>
          )}
        </div>
      </div>
    );
  };

export const DiagramCanvas = forwardRef(DiagramCanvasComponent);
DiagramCanvas.displayName = "DiagramCanvas";
