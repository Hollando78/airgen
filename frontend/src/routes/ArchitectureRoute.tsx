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
  useArchitecture,
  type SysmlBlock,
  type SysmlConnector,
  type BlockKind
} from "../hooks/useArchitectureApi";
import { SysmlBlockNode } from "../components/architecture/SysmlBlockNode";
import { BlockDetailsPanel } from "../components/architecture/BlockDetailsPanel";
import { ConnectorDetailsPanel } from "../components/architecture/ConnectorDetailsPanel";
import { ArchitectureTreeBrowser } from "../components/architecture/ArchitectureTreeBrowser";
import { BlockStylingPopup } from "../components/architecture/BlockStylingPopup";
import { ConnectorStylingPopup } from "../components/architecture/ConnectorStylingPopup";
import { DocumentView } from "../components/DocumentView";
import { useFloatingDocuments } from "../contexts/FloatingDocumentsContext";
import { FloatingDocumentWindow } from "../components/FloatingDocumentWindow";
import { Spinner } from "../components/Spinner";
import type { ArchitectureBlockLibraryRecord } from "../types";

type BlockPreset = {
  label: string;
  kind: BlockKind;
  stereotype: string;
  description?: string;
};

const BLOCK_PRESETS: BlockPreset[] = [
  { label: "Block", kind: "system", stereotype: "block" },
  { label: "Subsystem", kind: "subsystem", stereotype: "subsystem" },
  { label: "Component", kind: "component", stereotype: "component" },
  { label: "Actor", kind: "actor", stereotype: "actor" },
  { label: "External", kind: "external", stereotype: "external" }
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
        <p>Drag blocks to canvas</p>
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

function getMarkerType(markerType?: string) {
  switch (markerType) {
    case "arrow": return MarkerType.Arrow;
    case "arrowclosed": return MarkerType.ArrowClosed;
    case "none": return undefined;
    default: return MarkerType.ArrowClosed;
  }
}

function getStrokeDashArray(linePattern?: string): string | undefined {
  switch (linePattern) {
    case "dashed": return "8 4";
    case "dotted": return "2 2";
    case "solid":
    default: return undefined;
  }
}

function getDefaultColorByKind(kind: string): string {
  switch (kind) {
    case "flow": return "#2563eb";
    case "dependency": return "#7c3aed";
    case "association": return "#334155";
    case "composition": return "#dc2626";
    default: return "#334155";
  }
}

const CONNECTOR_PRESETS = [
  { label: "Default", lineStyle: "straight", linePattern: "solid", markerEnd: "arrowclosed", markerStart: "none" },
  { label: "Flow", lineStyle: "smoothstep", linePattern: "solid", markerEnd: "arrowclosed", markerStart: "none", color: "#2563eb" },
  { label: "Dependency", lineStyle: "straight", linePattern: "dashed", markerEnd: "arrowclosed", markerStart: "none", color: "#7c3aed" },
  { label: "Composition", lineStyle: "straight", linePattern: "solid", markerEnd: "arrowclosed", markerStart: "arrowclosed", color: "#dc2626" },
  { label: "Association", lineStyle: "straight", linePattern: "dotted", markerEnd: "none", markerStart: "none", color: "#334155" }
];

function mapConnectorToEdge(connector: SysmlConnector): Edge {
  const kind = connector.kind;
  const isFlow = kind === "flow";
  
  // Styling properties with defaults
  const lineStyle = connector.lineStyle || (isFlow ? "smoothstep" : "straight");
  const strokeColor = connector.color || getDefaultColorByKind(kind);
  const strokeWidth = connector.strokeWidth || 2;
  const linePattern = connector.linePattern || "solid";
  const markerEndType = getMarkerType(connector.markerEnd || "arrowclosed");
  const markerStartType = getMarkerType(connector.markerStart || (kind === "composition" ? "arrowclosed" : "none"));

  // Map lineStyle to valid React Flow edge types
  const getReactFlowEdgeType = (style: string): string => {
    switch (style) {
      case "straight": return "straight";
      case "smoothstep": return "smoothstep";
      case "step": return "step";
      case "bezier": return "default"; // Map bezier to default since React Flow doesn't have bezier built-in
      default: return "straight";
    }
  };

  return {
    id: connector.id,
    source: connector.source,
    target: connector.target,
    sourceHandle: connector.sourcePortId ?? undefined,
    targetHandle: connector.targetPortId ?? undefined,
    label: connector.label,
    type: getReactFlowEdgeType(lineStyle),
    animated: isFlow,
    style: {
      strokeWidth,
      strokeDasharray: getStrokeDashArray(linePattern),
      stroke: strokeColor
    },
    labelStyle: { fontSize: 12, fill: "#0f172a", fontWeight: 500 },
    labelBgPadding: [6, 4],
    labelBgBorderRadius: 4,
    labelBgStyle: { fill: "#ffffff", stroke: "#e2e8f0", strokeWidth: 1 },
    markerEnd: markerEndType ? {
      type: markerEndType,
      color: strokeColor,
      width: 22,
      height: 22
    } : undefined,
    markerStart: markerStartType ? {
      type: markerStartType,
      color: strokeColor,
      width: 18,
      height: 18
    } : undefined
  } satisfies Edge;
}

export function ArchitectureRoute(): JSX.Element {
  const { tenant, project } = useTenantProjectDocument();
  const api = useApiClient();
  const {
    architecture,
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
  } = useArchitecture(tenant, project);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [selectedConnectorId, setSelectedConnectorId] = useState<string | null>(null);
  const [minimapOpen, setMinimapOpen] = useState(true);
  const [openedDocumentFromArchitecture, setOpenedDocumentFromArchitecture] = useState<string | null>(null);
  const [contextMenuState, setContextMenuState] = useState<ContextMenuState>({ type: "closed" });
  const [showCodeViewer, setShowCodeViewer] = useState(false);
  const [floatingDocuments, setFloatingDocuments] = useState<Array<{
    id: string;
    documentSlug: string;
    documentName: string;
    position: { x: number; y: number };
  }>>([]);
  const [blockStylingPopup, setBlockStylingPopup] = useState<{
    blockId: string;
    position: { x: number; y: number };
  } | null>(null);
  const [connectorStylingPopup, setConnectorStylingPopup] = useState<{
    connectorId: string;
    position: { x: number; y: number };
  } | null>(null);
  const canvasWrapperRef = useRef<HTMLDivElement>(null);
  const reactFlowInstanceRef = useRef<ReactFlowInstance | null>(null);

  // Debounced update refs
  const positionUpdateTimeouts = useRef<Map<string, number>>(new Map());
  const sizeUpdateTimeouts = useRef<Map<string, number>>(new Map());
  const draggingNodes = useRef<Set<string>>(new Set());

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

  const blockCount = architecture.blocks.length;
  const blocksInDiagram = useMemo(() => new Set(architecture.blocks.map(block => block.id)), [architecture.blocks]);

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
    if (selectedBlockId && !architecture.blocks.some(block => block.id === selectedBlockId)) {
      setSelectedBlockId(null);
    }
  }, [architecture.blocks, selectedBlockId]);

  useEffect(() => {
    if (selectedConnectorId && !architecture.connectors.some(connector => connector.id === selectedConnectorId)) {
      setSelectedConnectorId(null);
    }
  }, [architecture.connectors, selectedConnectorId]);

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

      return architecture.blocks.map(block => {
        const prev = prevLookup.get(block.id);
        // If the node is currently being dragged, preserve its local position
        const shouldPreservePosition = draggingNodes.current.has(block.id);
        const position = shouldPreservePosition && prev ? prev.position : block.position;

        return {
          ...prev,
          id: block.id,
          type: "sysmlBlock",
          position,
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
  }, [architecture.blocks, selectedBlockId, documents, handleOpenDocumentFromArchitecture]);

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
  }, [architecture.connectors, selectedConnectorId]);

  // Clear popup states if diagram data is not available
  useLayoutEffect(() => {
    if (!activeDiagram || !activeDiagram.blocks) {
      setBlockStylingPopup(null);
    }
    if (!activeDiagram || !activeDiagram.connectors) {
      setConnectorStylingPopup(null);
    }
  }, [activeDiagram]);

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
          
          if (change.dragging) {
            // Track that this node is being dragged
            draggingNodes.current.add(change.id);
          } else if (nextPosition) {
            // Node drag ended, remove from tracking and send update
            draggingNodes.current.delete(change.id);
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
      return BLOCK_PRESETS.map(preset => ({
        label: `Add ${preset.label}`,
        onSelect: () => handleAddBlock(preset, contextMenuState.flowPosition),
        disabled: !activeDiagramId
      }));
    }

    if (contextMenuState.type === "node") {
      const block = architecture.blocks.find(item => item.id === contextMenuState.nodeId);
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
      const connector = architecture.connectors.find(item => item.id === contextMenuState.edgeId);
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
    architecture.blocks,
    architecture.connectors,
    handleAddBlock,
    addPort,
    removeBlock,
    removeConnector
  ]);

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
          <h1>Architecture Studio</h1>
          <p>Compose SysML views for {project}</p>
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
            presets={BLOCK_PRESETS}
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
                    setBlockStylingPopup(null);
                    setConnectorStylingPopup(null);
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
                    
                    // Show block styling popup above the node
                    if (reactFlowInstanceRef.current) {
                      // Try multiple selectors to find the node element
                      let nodeElement = document.querySelector(`[data-id="${node.id}"]`) as HTMLElement;
                      if (!nodeElement) {
                        nodeElement = document.querySelector(`.react-flow__node[data-id="${node.id}"]`) as HTMLElement;
                      }
                      if (!nodeElement) {
                        // Fallback: use event.target if available
                        nodeElement = event.currentTarget as HTMLElement;
                      }
                      
                      if (nodeElement) {
                        const rect = nodeElement.getBoundingClientRect();
                        const popupPosition = {
                          x: Math.max(10, rect.left + rect.width / 2 - 160), // Center popup, accounting for popup width, but ensure it's on screen
                          y: Math.max(10, rect.top - 20) // Position above the node, but ensure it's on screen
                        };
                        console.log('[DEBUG] Block popup position:', popupPosition, 'node rect:', rect);
                        setBlockStylingPopup({
                          blockId: node.id,
                          position: popupPosition
                        });
                      } else {
                        console.log('[DEBUG] Node element not found for:', node.id);
                        // Fallback: use a simple position
                        setBlockStylingPopup({
                          blockId: node.id,
                          position: { x: 200, y: 100 }
                        });
                      }
                    }
                    setConnectorStylingPopup(null);
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
                    
                    // Show connector styling popup next to the connector
                    setConnectorStylingPopup({
                      connectorId: edge.id,
                      position: {
                        x: event.clientX + 10, // Position to the right of mouse click
                        y: event.clientY - 50 // Position slightly above mouse click
                      }
                    });
                    setBlockStylingPopup(null);
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
                  )}
                  <Controls position="bottom-right" showInteractive={false} />
                  
                  {/* Code Viewer Button */}
                  <button
                    onClick={() => setShowCodeViewer(!showCodeViewer)}
                    style={{
                      position: "absolute",
                      bottom: "120px",
                      left: "10px",
                      backgroundColor: showCodeViewer ? "#3b82f6" : "#ffffff",
                      color: showCodeViewer ? "#ffffff" : "#374151",
                      border: "2px solid #e5e7eb",
                      borderRadius: "8px",
                      padding: "8px",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: "36px",
                      height: "36px",
                      boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)",
                      transition: "all 0.2s",
                      zIndex: 4
                    }}
                    onMouseEnter={e => {
                      if (!showCodeViewer) {
                        e.currentTarget.style.backgroundColor = "#f3f4f6";
                      }
                    }}
                    onMouseLeave={e => {
                      if (!showCodeViewer) {
                        e.currentTarget.style.backgroundColor = "#ffffff";
                      }
                    }}
                    title="View diagram query code"
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="16 18 22 12 16 6"/>
                      <polyline points="8 6 2 12 8 18"/>
                    </svg>
                  </button>
                </ReactFlow>

                <button
                  className="minimap-toggle"
                  style={{ right: minimapOpen ? 240 : 20 }}
                  onClick={() => setMinimapOpen(!minimapOpen)}
                  title={minimapOpen ? "Hide minimap" : "Show minimap"}
                >
                  {minimapOpen ? "◰" : "◲"}
                </button>

                {/* Code Viewer Panel */}
                {showCodeViewer && (
                  <div
                    style={{
                      position: "absolute",
                      bottom: "170px",
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
                        <span style={{ color: "#c084fc" }}>// Fetch blocks for diagram: {activeDiagram?.name || 'Unknown'}</span>
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

                {selectedConnector && (
                  <div 
                    className="connector-styling-toolbar"
                    style={{
                      position: "absolute",
                      top: "10px",
                      right: "10px",
                      background: "#ffffff",
                      border: "1px solid #e2e8f0",
                      borderRadius: "8px",
                      padding: "12px",
                      boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
                      display: "flex",
                      gap: "8px",
                      alignItems: "center",
                      fontSize: "12px",
                      zIndex: 1000,
                      minWidth: "360px",
                      flexWrap: "wrap"
                    }}
                  >
                    <span style={{ fontWeight: "500", color: "#374151", minWidth: "100%" }}>
                      Connector Style
                    </span>
                    
                    <select
                      onChange={event => {
                        const preset = CONNECTOR_PRESETS.find(p => p.label === event.target.value);
                        if (preset) {
                          updateConnector(selectedConnector.id, {
                            lineStyle: preset.lineStyle,
                            linePattern: preset.linePattern,
                            markerEnd: preset.markerEnd,
                            markerStart: preset.markerStart,
                            ...(preset.color && { color: preset.color })
                          });
                        }
                      }}
                      style={{ fontSize: "11px", padding: "2px 4px", width: "80px" }}
                      value=""
                    >
                      <option value="">Presets</option>
                      {CONNECTOR_PRESETS.map(preset => (
                        <option key={preset.label} value={preset.label}>
                          {preset.label}
                        </option>
                      ))}
                    </select>

                    <select
                      value={selectedConnector.lineStyle ?? "straight"}
                      onChange={event => updateConnector(selectedConnector.id, { lineStyle: event.target.value })}
                      style={{ fontSize: "11px", padding: "2px 4px" }}
                    >
                      <option value="straight">Straight</option>
                      <option value="smoothstep">Curved</option>
                      <option value="step">Rectilinear</option>
                      <option value="bezier">Bezier</option>
                    </select>

                    <select
                      value={selectedConnector.linePattern ?? "solid"}
                      onChange={event => updateConnector(selectedConnector.id, { linePattern: event.target.value })}
                      style={{ fontSize: "11px", padding: "2px 4px" }}
                    >
                      <option value="solid">Solid</option>
                      <option value="dashed">Dashed</option>
                      <option value="dotted">Dotted</option>
                    </select>

                    <input
                      type="color"
                      value={selectedConnector.color ?? getDefaultColorByKind(selectedConnector.kind)}
                      onChange={event => updateConnector(selectedConnector.id, { color: event.target.value })}
                      style={{ width: "24px", height: "24px", padding: "1px", border: "1px solid #d1d5db", borderRadius: "3px" }}
                      title="Color"
                    />

                    <input
                      type="range"
                      min="1"
                      max="6"
                      value={selectedConnector.strokeWidth ?? 2}
                      onChange={event => updateConnector(selectedConnector.id, { strokeWidth: Number(event.target.value) })}
                      style={{ width: "60px" }}
                      title="Line Width"
                    />

                    <select
                      value={selectedConnector.markerEnd ?? "arrowclosed"}
                      onChange={event => updateConnector(selectedConnector.id, { markerEnd: event.target.value })}
                      style={{ fontSize: "11px", padding: "2px 4px" }}
                    >
                      <option value="none">No End</option>
                      <option value="arrow">Arrow</option>
                      <option value="arrowclosed">Arrow ●</option>
                    </select>
                  </div>
                )}

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

      {/* Render styling popups */}
      {(() => {
        console.log('[DEBUG] Popup render conditions:', {
          blockStylingPopup: !!blockStylingPopup,
          activeDiagram: !!activeDiagram,
          blocks: !!activeDiagram?.blocks,
          blocksCount: activeDiagram?.blocks?.length,
          activeDiagramKeys: activeDiagram ? Object.keys(activeDiagram) : [],
          activeDiagramStructure: activeDiagram
        });
        
        if (!blockStylingPopup) {
          console.log('[DEBUG] No blockStylingPopup state');
          return null;
        }
        
        if (!activeDiagram) {
          console.log('[DEBUG] No activeDiagram');
          return null;
        }
        
        if (!architecture.blocks) {
          console.log('[DEBUG] No architecture.blocks');
          return null;
        }
        
        const block = architecture.blocks.find(b => b.id === blockStylingPopup.blockId);
        console.log('[DEBUG] Block search result:', {
          searchingFor: blockStylingPopup.blockId,
          availableIds: architecture.blocks.map(b => b.id),
          blockFound: !!block
        });
        
        return block ? (
          <BlockStylingPopup
            block={block}
            position={blockStylingPopup.position}
            onUpdate={(updates) => {
              updateBlock(blockStylingPopup.blockId, updates);
            }}
            onClose={() => setBlockStylingPopup(null)}
          />
        ) : null;
      })()}

      {connectorStylingPopup && architecture.connectors && (() => {
        const connector = architecture.connectors.find(c => c.id === connectorStylingPopup.connectorId);
        return connector ? (
          <ConnectorStylingPopup
            connector={connector}
            position={connectorStylingPopup.position}
            onUpdate={(updates) => {
              updateConnector(connectorStylingPopup.connectorId, updates);
            }}
            onClose={() => setConnectorStylingPopup(null)}
          />
        ) : null;
      })()}
    </div>
  );
}
