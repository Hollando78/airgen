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
  type ReactFlowInstance,
  type XYPosition,
  useNodesState,
  useEdgesState
} from "@xyflow/react";
import { useTenantProjectDocument } from "../components/TenantProjectDocumentSelector";
import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "../lib/client";
import {
  useInterface,
  type InterfaceBlock,
  type InterfaceConnector,
  type BlockKind
} from "../hooks/useInterfaceApi";
import { SysmlBlockNode } from "../components/architecture/SysmlBlockNode";
import { BlockDetailsPanel } from "../components/architecture/BlockDetailsPanel";
import { ConnectorDetailsPanel } from "../components/architecture/ConnectorDetailsPanel";
import { ArchitectureTreeBrowser } from "../components/architecture/ArchitectureTreeBrowser";
import { FloatingDocumentWindow } from "../components/FloatingDocumentWindow";
import { Spinner } from "../components/Spinner";

type BlockPreset = {
  label: string;
  kind: BlockKind;
  stereotype: string;
  description?: string;
};

const INTERFACE_PRESETS: BlockPreset[] = [
  { label: "Interface", kind: "component", stereotype: "interface" },
  { label: "API", kind: "component", stereotype: "api" },
  { label: "Service", kind: "component", stereotype: "service" },
  { label: "Protocol", kind: "component", stereotype: "protocol" },
  { label: "Port", kind: "component", stereotype: "port" }
];

const nodeTypes = { sysmlBlock: SysmlBlockNode };

const DEBUG_ARCHITECTURE = false;

type ContextMenuState =
  | { type: "closed" }
  | { type: "canvas"; client: { x: number; y: number }; flowPosition: XYPosition }
  | { type: "node"; nodeId: string; client: { x: number; y: number } }
  | { type: "edge"; edgeId: string; client: { x: number; y: number } };

interface PaletteProps {
  presets: BlockPreset[];
  onAddPreset: (preset: BlockPreset) => void;
  disabled?: boolean;
}

function ArchitecturePalette({ presets, onAddPreset, disabled = false }: PaletteProps) {
  return (
    <div className="architecture-palette">
      <div className="palette-header">
        <h3>Palette</h3>
        <p>Drag interfaces to canvas</p>
      </div>
      <div className="palette-items">
        {presets.map(preset => (
          <button
            key={preset.kind}
            className={`palette-item ${disabled ? "disabled" : ""}`}
            onClick={() => {
              if (!disabled) {
                onAddPreset(preset);
              }
            }}
            title={preset.description}
            disabled={disabled}
          >
            <span className="palette-item-label">{preset.label}</span>
            <span className="palette-item-tag">{preset.stereotype}</span>
          </button>
        ))}
      </div>
    </div>
  );
}


interface ContextMenuItem {
  label: string;
  onSelect: () => void;
  disabled?: boolean;
  shortcut?: string;
}

interface ArchitectureContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

function ArchitectureContextMenu({ x, y, items, onClose }: ArchitectureContextMenuProps) {
  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (event.button !== 2) {
        onClose();
      }
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("mousedown", handleClick);
    window.addEventListener("scroll", onClose, true);
    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("mousedown", handleClick);
      window.removeEventListener("scroll", onClose, true);
      window.removeEventListener("keydown", handleKey);
    };
  }, [onClose]);

  return (
    <div className="architecture-context-menu" style={{ left: x, top: y }}>
      {items.map(item => (
        <button
          key={item.label}
          className="context-action"
          onClick={() => {
            if (!item.disabled) {
              item.onSelect();
              onClose();
            }
          }}
          disabled={item.disabled}
        >
          <span>{item.label}</span>
          {item.shortcut && <span className="context-shortcut">{item.shortcut}</span>}
        </button>
      ))}
    </div>
  );
}

interface DiagramTabsProps {
  diagrams: Array<{ id: string; name: string }>;
  activeDiagramId: string | null;
  onSelect: (diagramId: string) => void;
  onRename: (diagramId: string) => void;
  onDelete: (diagramId: string) => void;
}

function DiagramTabs({ diagrams, activeDiagramId, onSelect, onRename, onDelete }: DiagramTabsProps) {
  if (diagrams.length === 0) {
    return <div className="architecture-tabs empty">Create a diagram to start modelling</div>;
  }

  return (
    <div className="architecture-tabs">
      {diagrams.map(diagram => (
        <div
          key={diagram.id}
          className={`diagram-tab ${diagram.id === activeDiagramId ? "active" : ""}`}
        >
          <button
            className="diagram-tab-button"
            onClick={() => onSelect(diagram.id)}
            onDoubleClick={() => onRename(diagram.id)}
            title="Double-click to rename"
          >
            {diagram.name}
          </button>
          <button
            className="diagram-tab-close"
            onClick={() => onDelete(diagram.id)}
            title="Delete diagram"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

function mapConnectorToEdge(connector: InterfaceConnector): Edge {
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

export function InterfaceRoute(): JSX.Element {
  const { tenant, project } = useTenantProjectDocument();
  const api = useApiClient();
  const {
    architecture: interfaceData,
    diagrams,
    activeDiagram,
    activeDiagramId,
    setActiveDiagramId,
    createDiagram,
    renameDiagram,
    deleteDiagram,
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
    clearArchitecture,
    addDocumentToBlock,
    removeDocumentFromBlock,
    hasChanges,
    isLoading,
    blocksLibrary,
    isLibraryLoading,
    libraryError
  } = useInterface(tenant, project);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [selectedConnectorId, setSelectedConnectorId] = useState<string | null>(null);
  const [minimapOpen, setMinimapOpen] = useState(true);
  const [openedDocumentFromArchitecture, setOpenedDocumentFromArchitecture] = useState<string | null>(null);
  const [contextMenuState, setContextMenuState] = useState<ContextMenuState>({ type: "closed" });
  const [floatingDocuments, setFloatingDocuments] = useState<Array<{
    id: string;
    documentSlug: string;
    documentName: string;
    position: { x: number; y: number };
  }>>([]);
  const canvasWrapperRef = useRef<HTMLDivElement>(null);
  const reactFlowInstanceRef = useRef<ReactFlowInstance | null>(null);

  // Debounced update refs
  const positionUpdateTimeouts = useRef<Map<string, number>>(new Map());
  const sizeUpdateTimeouts = useRef<Map<string, number>>(new Map());

  const [nodes, setNodes, onNodesStateChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesStateChange] = useEdgesState<Edge>([]);

  const documentsQuery = useQuery({
    queryKey: ["documents", tenant, project],
    queryFn: () => api.listDocuments(tenant!, project!),
    enabled: Boolean(tenant && project)
  });

  const documents = useMemo(() => 
    documentsQuery.data?.documents ?? [], 
    [documentsQuery.data?.documents]
  );

  const blockCount = interfaceData.blocks.length;
  const blocksInDiagram = useMemo(() => new Set(interfaceData.blocks.map(block => block.id)), [interfaceData.blocks]);

  const computeNextPlacement = useCallback(() => {
    const offset = blockCount;
    return {
      x: 160 + offset * 60 + Math.random() * 40,
      y: 160 + offset * 40 + Math.random() * 40
    };
  }, [blockCount]);

  const handleOpenDocumentFromArchitecture = useCallback((documentSlug: string) => {
    // Check if document is already open
    if (floatingDocuments.some(doc => doc.documentSlug === documentSlug)) {
      return;
    }
    
    // Find the document name
    const document = documents.find(doc => doc.slug === documentSlug);
    if (!document) return;
    
    // Calculate position for new window (cascade them)
    const basePosition = { x: 150, y: 150 };
    const offset = floatingDocuments.length * 30;
    const newPosition = {
      x: basePosition.x + offset,
      y: basePosition.y + offset
    };
    
    // Add new floating document
    setFloatingDocuments(prev => [
      ...prev,
      {
        id: `${documentSlug}-${Date.now()}`,
        documentSlug,
        documentName: document.name,
        position: newPosition
      }
    ]);
  }, [documents, floatingDocuments]);

  const closeFloatingDocument = useCallback((documentId: string) => {
    setFloatingDocuments(prev => prev.filter(doc => doc.id !== documentId));
  }, []);

  const closeContextMenu = useCallback(() => {
    setContextMenuState({ type: "closed" });
  }, []);

  useEffect(() => {
    closeContextMenu();
  }, [activeDiagramId, closeContextMenu]);

  useEffect(() => {
    setSelectedBlockId(null);
    setSelectedConnectorId(null);
  }, [activeDiagramId]);

  const handleCreateDiagram = useCallback(async () => {
    const baseName = `View ${diagrams.length + 1}`;
    const name = window.prompt("Name for the new diagram", baseName);
    if (!name || !name.trim()) return;

    try {
      await createDiagram({ name: name.trim() });
    } catch (error) {
      window.alert((error as Error).message);
    }
  }, [createDiagram, diagrams.length]);

  const handleRenameDiagram = useCallback((diagramId: string) => {
    const diagram = diagrams.find(item => item.id === diagramId);
    if (!diagram) return;

    const nextName = window.prompt("Rename diagram", diagram.name);
    if (!nextName || !nextName.trim() || nextName.trim() === diagram.name) return;

    renameDiagram(diagramId, { name: nextName.trim() }).catch(error => {
      window.alert((error as Error).message);
    });
  }, [diagrams, renameDiagram]);

  const handleDeleteDiagram = useCallback((diagramId: string) => {
    const diagram = diagrams.find(item => item.id === diagramId);
    if (!diagram) return;
    const confirmed = window.confirm(`Delete diagram "${diagram.name}"? This removes its blocks and connectors.`);
    if (!confirmed) return;
    deleteDiagram(diagramId).catch(error => {
      window.alert((error as Error).message);
    });
  }, [deleteDiagram, diagrams]);

  const handleClearDiagram = useCallback(() => {
    if (!activeDiagramId || !hasChanges) return;
    if (!window.confirm("Remove all blocks and connectors from this diagram?")) return;
    clearArchitecture();
  }, [activeDiagramId, clearArchitecture, hasChanges]);

  const handlePaneContextMenu = useCallback((event: ReactMouseEvent | MouseEvent) => {
    event.preventDefault();
    setSelectedBlockId(null);
    setSelectedConnectorId(null);

    if (!canvasWrapperRef.current || !reactFlowInstanceRef.current) return;
    const bounds = canvasWrapperRef.current.getBoundingClientRect();
    const nativeEvent = 'nativeEvent' in event ? event.nativeEvent : event;
    const relative = {
      x: nativeEvent.clientX - bounds.left,
      y: nativeEvent.clientY - bounds.top
    };
    const position = reactFlowInstanceRef.current.screenToFlowPosition(relative);

    setContextMenuState({
      type: "canvas",
      client: { x: event.clientX, y: event.clientY },
      flowPosition: position
    });
  }, []);

  const handleNodeContextMenu = useCallback((event: ReactMouseEvent, node: Node) => {
    event.preventDefault();
    setContextMenuState({
      type: "node",
      nodeId: node.id,
      client: { x: event.clientX, y: event.clientY }
    });
  }, []);

  const handleEdgeContextMenu = useCallback((event: ReactMouseEvent, edge: Edge) => {
    event.preventDefault();
    setContextMenuState({
      type: "edge",
      edgeId: edge.id,
      client: { x: event.clientX, y: event.clientY }
    });
  }, []);

  // Debounced update functions to prevent API flooding
  const debouncedUpdateBlockPosition = useCallback((blockId: string, position: { x: number; y: number }) => {
    const timeouts = positionUpdateTimeouts.current;
    
    // Clear existing timeout for this block
    if (timeouts.has(blockId)) {
      clearTimeout(timeouts.get(blockId)!);
    }
    
    // Set new timeout
    const timeout = setTimeout(() => {
      updateBlockPosition(blockId, position);
      timeouts.delete(blockId);
    }, 300); // 300ms debounce
    
    timeouts.set(blockId, timeout);
  }, [updateBlockPosition]);

  const debouncedUpdateBlockSize = useCallback((blockId: string, size: { width: number; height: number }) => {
    const timeouts = sizeUpdateTimeouts.current;
    
    // Clear existing timeout for this block
    if (timeouts.has(blockId)) {
      clearTimeout(timeouts.get(blockId)!);
    }
    
    // Set new timeout
    const timeout = setTimeout(() => {
      updateBlockSize(blockId, size);
      timeouts.delete(blockId);
    }, 300); // 300ms debounce
    
    timeouts.set(blockId, timeout);
  }, [updateBlockSize]);

  useEffect(() => {
    if (selectedBlockId && !interfaceData.blocks.some(block => block.id === selectedBlockId)) {
      setSelectedBlockId(null);
    }
  }, [interfaceData.blocks, selectedBlockId]);

  useEffect(() => {
    if (selectedConnectorId && !interfaceData.connectors.some(connector => connector.id === selectedConnectorId)) {
      setSelectedConnectorId(null);
    }
  }, [interfaceData.connectors, selectedConnectorId]);

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      // Clear all position update timeouts
      positionUpdateTimeouts.current.forEach(timeout => clearTimeout(timeout));
      positionUpdateTimeouts.current.clear();
      
      // Clear all size update timeouts
      sizeUpdateTimeouts.current.forEach(timeout => clearTimeout(timeout));
      sizeUpdateTimeouts.current.clear();
    };
  }, []);

  useLayoutEffect(() => {
    setNodes(prevNodes => {
      const prevLookup = new Map(prevNodes.map(node => [node.id, node]));

      return interfaceData.blocks.map(block => {
        const prev = prevLookup.get(block.id);

        return {
          ...prev,
          id: block.id,
          type: "sysmlBlock",
          position: block.position,
          data: {
            block,
            documents,
            onOpenDocument: handleOpenDocumentFromArchitecture
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
  }, [interfaceData.blocks, selectedBlockId, documents, handleOpenDocumentFromArchitecture]);

  useEffect(() => {
    setEdges(prevEdges => {
      const prevLookup = new Map(prevEdges.map(edge => [edge.id, edge]));

      return interfaceData.connectors.map(connector => {
        const prev = prevLookup.get(connector.id);

        return {
          ...prev,
          ...mapConnectorToEdge(connector),
          selected: connector.id === selectedConnectorId
        } satisfies Edge;
      });
    });
  }, [interfaceData.connectors, selectedConnectorId]);

  const handleSelectionChange = useCallback(
    ({ nodes: selectedNodes, edges: selectedEdges }: OnSelectionChangeParams) => {
      const firstNodeId = selectedNodes[0]?.id ?? null;
      const firstEdgeId = selectedEdges[0]?.id ?? null;

      closeContextMenu();

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
    [closeContextMenu, setEdges, setNodes]
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
            // Use debounced update to prevent API flooding
            debouncedUpdateBlockPosition(change.id, nextPosition);
          }
        }
        if (change.type === "dimensions" && change.dimensions) {
          // Use debounced update to prevent API flooding
          debouncedUpdateBlockSize(change.id, {
            width: change.dimensions.width,
            height: change.dimensions.height
          });
        }
      });
    },
    [onNodesStateChange, debouncedUpdateBlockPosition, debouncedUpdateBlockSize]
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
      if (!activeDiagramId || !connection.source || !connection.target) return;
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
    [activeDiagramId, addConnector, setEdges, setNodes]
  );

  const handleAddBlock = useCallback(
    (preset: BlockPreset, position?: XYPosition) => {
      if (!activeDiagramId) {
        window.alert("Create or select a diagram before adding blocks.");
        return;
      }

      const placement = position ?? computeNextPlacement();
      const id = addBlock({
        name: preset.label,
        kind: preset.kind,
        stereotype: preset.stereotype,
        description: preset.description,
        x: placement.x,
        y: placement.y
      });

      if (!id) return;

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
    [activeDiagramId, addBlock, computeNextPlacement, setEdges, setNodes]
  );

  const handleReuseExistingBlock = useCallback(
    (blockId: string) => {
      if (!activeDiagramId) {
        window.alert("Create or select a diagram before adding blocks.");
        return;
      }

      const placement = computeNextPlacement();
      const id = reuseBlock(blockId, placement);

      if (!id) return;

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
    [activeDiagramId, computeNextPlacement, reuseBlock, setEdges, setNodes]
  );

  const contextMenuItems = useMemo<ContextMenuItem[]>(() => {
    if (contextMenuState.type === "canvas") {
      return INTERFACE_PRESETS.map(preset => ({
        label: `Add ${preset.label}`,
        onSelect: () => handleAddBlock(preset, contextMenuState.flowPosition),
        disabled: !activeDiagramId
      }));
    }

    if (contextMenuState.type === "node") {
      const block = interfaceData.blocks.find(item => item.id === contextMenuState.nodeId);
      if (!block) return [];

      const sharedBaseName = block.name.replace(/\s+copy$/i, "");
      const existingInputs = block.ports.filter(port => port.direction !== "out").length;
      const existingOutputs = block.ports.filter(port => port.direction !== "in").length;

      return [
        {
          label: "Add input port",
          onSelect: () => addPort(block.id, { name: `in${existingInputs + 1}`, direction: "in" })
        },
        {
          label: "Add output port",
          onSelect: () => addPort(block.id, { name: `out${existingOutputs + 1}`, direction: "out" })
        },
        {
          label: "Duplicate block",
          onSelect: () => handleAddBlock(
            {
              label: `${sharedBaseName} copy`,
              kind: block.kind,
              stereotype: block.stereotype ?? "block",
              description: block.description
            },
            {
              x: block.position.x + block.size.width + 40,
              y: block.position.y + 40
            }
          )
        },
        {
          label: "Delete block",
          onSelect: () => removeBlock(block.id)
        }
      ];
    }

    if (contextMenuState.type === "edge") {
      const connector = interfaceData.connectors.find(item => item.id === contextMenuState.edgeId);
      if (!connector) return [];
      return [
        {
          label: "Delete connector",
          onSelect: () => removeConnector(connector.id)
        }
      ];
    }

    return [];
  }, [
    contextMenuState,
    activeDiagramId,
    interfaceData.blocks,
    interfaceData.connectors,
    handleAddBlock,
    addPort,
    removeBlock,
    removeConnector
  ]);

  const selectedBlock = useMemo(
    () => interfaceData.blocks.find(block => block.id === selectedBlockId) ?? null,
    [interfaceData.blocks, selectedBlockId]
  );

  const selectedConnector = useMemo(
    () => interfaceData.connectors.find(connector => connector.id === selectedConnectorId) ?? null,
    [interfaceData.connectors, selectedConnectorId]
  );

  if (!tenant || !project) {
    return (
      <div className="architecture-empty-state">
        <h1>Architecture</h1>
        <p>Select a tenant and project to work on architectural diagrams.</p>
      </div>
    );
  }

  const showContextMenu = contextMenuState.type !== "closed" && contextMenuItems.length > 0;
  const diagramsForTabs = diagrams.map(diagram => ({ id: diagram.id, name: diagram.name }));

  return (
    <div className="architecture-shell">
      <header className="architecture-header">
        <div className="architecture-header-info">
          <h1>Interface Studio</h1>
          <p>Design interface specifications for {project}</p>
        </div>
        <div className="architecture-header-actions">
          <button className="ghost-button" onClick={handleCreateDiagram}>
            + Diagram
          </button>
          <button
            className="ghost-button"
            onClick={handleClearDiagram}
            disabled={!hasChanges || !activeDiagramId}
          >
            Clear Diagram
          </button>
        </div>
      </header>

      <DiagramTabs
        diagrams={diagramsForTabs}
        activeDiagramId={activeDiagramId}
        onSelect={setActiveDiagramId}
        onRename={handleRenameDiagram}
        onDelete={handleDeleteDiagram}
      />

      <div className="architecture-body">
        <aside className="architecture-pane palette-pane">
          <ArchitecturePalette
            presets={INTERFACE_PRESETS}
            onAddPreset={preset => handleAddBlock(preset)}
            disabled={!activeDiagramId}
          />
          <ArchitectureTreeBrowser
            blocks={blocksLibrary}
            disabled={!activeDiagramId}
            isLoading={isLibraryLoading}
            error={libraryError}
            onInsert={handleReuseExistingBlock}
            currentDiagramId={activeDiagramId}
            blocksInDiagram={blocksInDiagram}
          />
        </aside>

        <div className="architecture-canvas-area">
          <div className="architecture-canvas-shell" ref={canvasWrapperRef}>
            {activeDiagramId ? (
              <>
                <ReactFlow
                  nodes={nodes}
                  edges={edges}
                  nodeTypes={nodeTypes}
                  onNodesChange={handleNodesChange}
                  onEdgesChange={handleEdgesChange}
                  onConnect={handleConnect}
                  onPaneClick={() => {
                    closeContextMenu();
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
                  onPaneContextMenu={handlePaneContextMenu}
                  onNodeContextMenu={handleNodeContextMenu}
                  onEdgeContextMenu={handleEdgeContextMenu}
                  onNodeClick={(event: ReactMouseEvent, node: Node) => {
                    event.stopPropagation();
                    closeContextMenu();
                    if (DEBUG_ARCHITECTURE) {
                      console.debug("[Architecture] onNodeClick", node.id);
                    }
                    setSelectedBlockId(node.id);
                    setSelectedConnectorId(null);
                  }}
                  onEdgeClick={(event: ReactMouseEvent, edge: Edge) => {
                    event.stopPropagation();
                    closeContextMenu();
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
                  onInit={instance => {
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
                        const block = interfaceData.blocks.find(b => b.id === node.id);
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
                  )}
                  <Controls position="bottom-right" showInteractive={false} />
                </ReactFlow>

                <button
                  className="minimap-toggle"
                  style={{ right: minimapOpen ? 240 : 20 }}
                  onClick={() => setMinimapOpen(!minimapOpen)}
                  title={minimapOpen ? "Hide minimap" : "Show minimap"}
                >
                  {minimapOpen ? "◰" : "◲"}
                </button>

                {isLoading && (
                  <div className="architecture-loading-overlay">
                    <Spinner />
                  </div>
                )}

                {showContextMenu && (
                  <ArchitectureContextMenu
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

        <aside className="architecture-pane inspector-pane">
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
              documents={documents}
              onAddDocument={documentId => addDocumentToBlock(selectedBlock.id, documentId)}
              onRemoveDocument={documentId => removeDocumentFromBlock(selectedBlock.id, documentId)}
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
                <li>Use the palette to drop new blocks into the canvas.</li>
                <li>Right-click the canvas or blocks for quick actions.</li>
                <li>Drag handles between ports to author connectors.</li>
                <li>Open blocks to link supporting documents.</li>
              </ul>
            </div>
          )}
        </aside>
      </div>

      {/* Render floating document windows */}
      {floatingDocuments.map(doc => (
        <FloatingDocumentWindow
          key={doc.id}
          tenant={tenant!}
          project={project!}
          documentSlug={doc.documentSlug}
          documentName={doc.documentName}
          initialPosition={doc.position}
          onClose={() => closeFloatingDocument(doc.id)}
        />
      ))}
    </div>
  );
}
