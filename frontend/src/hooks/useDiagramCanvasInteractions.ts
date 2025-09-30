import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent
} from "react";
import {
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type OnSelectionChangeParams,
  type ReactFlowInstance,
  type XYPosition,
  useEdgesState,
  useNodesState
} from "@xyflow/react";
import type { ArchitectureDiagramRecord, DocumentRecord } from "../types";
import type {
  ArchitectureState,
  BlockKind,
  BlockPort,
  ConnectorKind,
  PortDirection,
  SysmlBlock,
  SysmlConnector
} from "./useArchitectureApi";
import type { ContextMenuItem } from "../components/diagram/DiagramContextMenu";

type DiagramBlockPreset = {
  label: string;
  kind: BlockKind;
  stereotype: string;
  description?: string;
};

export type ContextMenuState =
  | { type: "closed" }
  | { type: "canvas"; client: { x: number; y: number }; flowPosition: XYPosition }
  | { type: "node"; nodeId: string; client: { x: number; y: number } }
  | { type: "edge"; edgeId: string; client: { x: number; y: number } };

interface UseCanvasInteractionsParams {
  architecture: ArchitectureState;
  activeDiagram: ArchitectureDiagramRecord | null;
  activeDiagramId: string | null;
  documents: DocumentRecord[];
  selectedBlockId: string | null;
  selectedConnectorId: string | null;
  onSelectBlock: (id: string | null) => void;
  onSelectConnector: (id: string | null) => void;
  blockPresets: DiagramBlockPreset[];
  computePlacement: (blockCount: number) => XYPosition;
  mapConnectorToEdge: (connector: SysmlConnector) => Edge;
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
  onOpenDocument: (slug: string) => void;
}

export interface UseCanvasInteractionsResult {
  minimapOpen: boolean;
  setMinimapOpen: (value: boolean | ((prev: boolean) => boolean)) => void;
  showCodeViewer: boolean;
  setShowCodeViewer: (value: boolean | ((prev: boolean) => boolean)) => void;
  nodes: Node[];
  edges: Edge[];
  nodesChangeHandler: (changes: NodeChange[]) => void;
  edgesChangeHandler: (changes: EdgeChange[]) => void;
  handleConnect: (connection: Connection) => void;
  handlePaneClick: () => void;
  handlePaneContextMenu: (event: ReactMouseEvent | MouseEvent) => void;
  handleNodeContextMenu: (event: ReactMouseEvent, node: Node) => void;
  handleEdgeContextMenu: (event: ReactMouseEvent, edge: Edge) => void;
  handleSelectionChange: (params: OnSelectionChangeParams) => void;
  contextMenuState: ContextMenuState;
  contextMenuItems: ContextMenuItem[];
  showContextMenu: boolean;
  closeContextMenu: () => void;
  blockStylingPopup: {
    blockId: string;
    position: { x: number; y: number };
  } | null;
  setBlockStylingPopup: (popup: { blockId: string; position: { x: number; y: number } } | null) => void;
  connectorStylingPopup: {
    connectorId: string;
    position: { x: number; y: number };
  } | null;
  setConnectorStylingPopup: (popup: { connectorId: string; position: { x: number; y: number } } | null) => void;
  canvasWrapperRef: React.MutableRefObject<HTMLDivElement | null>;
  reactFlowInstanceRef: React.MutableRefObject<ReactFlowInstance | null>;
  selectedConnector: SysmlConnector | null;
  addBlockFromPreset: (preset: DiagramBlockPreset, position?: XYPosition) => void;
  reuseExistingBlock: (blockId: string) => void;
}

const DEBUG_ARCHITECTURE = false;

export function useDiagramCanvasInteractions({
  architecture,
  activeDiagram,
  activeDiagramId,
  documents,
  selectedBlockId,
  selectedConnectorId,
  onSelectBlock,
  onSelectConnector,
  blockPresets,
  computePlacement,
  mapConnectorToEdge,
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
}: UseCanvasInteractionsParams): UseCanvasInteractionsResult {
  const [minimapOpen, setMinimapOpen] = useState(true);
  const [showCodeViewer, setShowCodeViewer] = useState(false);
  const [contextMenuState, setContextMenuState] = useState<ContextMenuState>({ type: "closed" });
  const [blockStylingPopup, setBlockStylingPopup] = useState<{
    blockId: string;
    position: { x: number; y: number };
  } | null>(null);
  const [connectorStylingPopup, setConnectorStylingPopup] = useState<{
    connectorId: string;
    position: { x: number; y: number };
  } | null>(null);

  const canvasWrapperRef = useRef<HTMLDivElement | null>(null);
  const reactFlowInstanceRef = useRef<ReactFlowInstance | null>(null);

  const positionUpdateTimeouts = useRef<Map<string, number>>(new Map());
  const sizeUpdateTimeouts = useRef<Map<string, number>>(new Map());
  const draggingNodes = useRef<Set<string>>(new Set());

  const [nodes, setNodes, onNodesStateChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesStateChange] = useEdgesState<Edge>([]);

  const memoizedDocuments = useMemo(() => documents, [documents]);
  const blockCount = architecture.blocks.length;
  const computeNextPlacement = useCallback(
    () => computePlacement(blockCount),
    [blockCount, computePlacement]
  );

  const closeContextMenu = useCallback(() => {
    setContextMenuState({ type: "closed" });
  }, []);

  useEffect(() => {
    closeContextMenu();
  }, [activeDiagramId, closeContextMenu]);

  useEffect(() => {
    return () => {
      positionUpdateTimeouts.current.forEach(timeout => clearTimeout(timeout));
      positionUpdateTimeouts.current.clear();
      sizeUpdateTimeouts.current.forEach(timeout => clearTimeout(timeout));
      sizeUpdateTimeouts.current.clear();
    };
  }, []);

  const debouncedUpdateBlockPosition = useCallback((blockId: string, position: { x: number; y: number }) => {
    const timeouts = positionUpdateTimeouts.current;
    if (timeouts.has(blockId)) {
      clearTimeout(timeouts.get(blockId)!);
    }

    const timeout = window.setTimeout(() => {
      updateBlockPosition(blockId, position);
      timeouts.delete(blockId);
    }, 300);

    timeouts.set(blockId, timeout);
  }, [updateBlockPosition]);

  const debouncedUpdateBlockSize = useCallback((blockId: string, size: { width: number; height: number }) => {
    const timeouts = sizeUpdateTimeouts.current;
    if (timeouts.has(blockId)) {
      clearTimeout(timeouts.get(blockId)!);
    }

    const timeout = window.setTimeout(() => {
      updateBlockSize(blockId, size);
      timeouts.delete(blockId);
    }, 300);

    timeouts.set(blockId, timeout);
  }, [updateBlockSize]);

  const handlePaneContextMenu = useCallback((event: ReactMouseEvent | MouseEvent) => {
    event.preventDefault();
    onSelectBlock(null);
    onSelectConnector(null);

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
  }, [onSelectBlock, onSelectConnector]);

  const handleNodeContextMenu = useCallback((event: ReactMouseEvent, node: Node) => {
    event.preventDefault();
    setContextMenuState({
      type: "node",
      nodeId: node.id,
      client: { x: event.clientX, y: event.clientY }
    });
  }, []);

  const handleEdgeContextMenu = useCallback((event: ReactMouseEvent, edge: Edge) => {
    console.log("[DiagramCanvas] handleEdgeContextMenu called for edge:", edge.id);
    event.preventDefault();
    setContextMenuState({
      type: "edge",
      edgeId: edge.id,
      client: { x: event.clientX, y: event.clientY }
    });
    console.log("[DiagramCanvas] Context menu state set for edge:", edge.id);
  }, []);

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
        onSelectBlock(firstNodeId);
        onSelectConnector(null);
      } else if (firstEdgeId) {
        onSelectConnector(firstEdgeId);
        onSelectBlock(null);
      } else {
        onSelectBlock(null);
        onSelectConnector(null);
      }
    },
    [closeContextMenu, onSelectBlock, onSelectConnector]
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
            draggingNodes.current.add(change.id);
          } else if (nextPosition) {
            draggingNodes.current.delete(change.id);
            debouncedUpdateBlockPosition(change.id, nextPosition);
          }
        }
        if (change.type === "dimensions" && change.dimensions) {
          debouncedUpdateBlockSize(change.id, {
            width: change.dimensions.width,
            height: change.dimensions.height
          });
        }
      });
    },
    [debouncedUpdateBlockPosition, debouncedUpdateBlockSize, onNodesStateChange]
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
          sourcePortId: connection.sourceHandle ?? undefined,
          targetPortId: connection.targetHandle ?? undefined
        });
      onSelectConnector(newId);
      onSelectBlock(null);
      setNodes(prevNodes => prevNodes.map(node => ({
        ...node,
        selected: false
      })));
      setEdges(prevEdges => prevEdges.map(edge => ({
        ...edge,
        selected: false
      })));
    },
    [activeDiagramId, addConnector, onSelectBlock, onSelectConnector]
  );

  const handleAddBlock = useCallback(
    (preset: DiagramBlockPreset, position?: XYPosition) => {
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

      onSelectBlock(id);
      onSelectConnector(null);
      setNodes(prevNodes => prevNodes.map(node => ({
        ...node,
        selected: node.id === id
      })));
      setEdges(prevEdges => prevEdges.map(edge => ({
        ...edge,
        selected: false
      })));
    },
    [activeDiagramId, addBlock, computeNextPlacement, onSelectBlock, onSelectConnector]
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

      onSelectBlock(id);
      onSelectConnector(null);
      setNodes(prevNodes => prevNodes.map(node => ({
        ...node,
        selected: node.id === id
      })));
      setEdges(prevEdges => prevEdges.map(edge => ({
        ...edge,
        selected: false
      })));
    },
    [activeDiagramId, computeNextPlacement, onSelectBlock, onSelectConnector, reuseBlock]
  );

  const contextMenuItems = useMemo<ContextMenuItem[]>(() => {
    if (contextMenuState.type === "canvas") {
      return blockPresets.map(preset => ({
        label: `Add ${preset.label}`,
        onSelect: () => handleAddBlock(preset, contextMenuState.flowPosition),
        disabled: !activeDiagramId
      }));
    }

    if (contextMenuState.type === "node") {
      const block = architecture.blocks.find((item: SysmlBlock) => item.id === contextMenuState.nodeId);
      if (!block) return [];

      const sharedBaseName = block.name.replace(/\s+copy$/i, "");
      const existingInputs = block.ports.filter((port: BlockPort) => port.direction !== "out").length;
      const existingOutputs = block.ports.filter((port: BlockPort) => port.direction !== "in").length;

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
      const connector = architecture.connectors.find((item: SysmlConnector) => item.id === contextMenuState.edgeId);
      if (!connector) {
        console.error("[DiagramCanvas] Connector not found for edge:", contextMenuState.edgeId);
        console.log("[DiagramCanvas] Available connectors:", architecture.connectors.map(c => c.id));
        return [];
      }
      return [
        {
          label: "Delete connector",
          onSelect: () => {
            console.log("[DiagramCanvas] Delete connector clicked");
            console.log("[DiagramCanvas] Connector to delete:", connector);
            console.log("[DiagramCanvas] Edge ID:", contextMenuState.edgeId);
            console.log("[DiagramCanvas] About to call removeConnector with ID:", connector.id);
            removeConnector(connector.id);
            console.log("[DiagramCanvas] removeConnector call completed");
          }
        }
      ];
    }

    return [];
  }, [
    contextMenuState,
    activeDiagramId,
    architecture.blocks,
    architecture.connectors,
    blockPresets,
    handleAddBlock,
    addPort,
    removeBlock,
    removeConnector
  ]);

  useLayoutEffect(() => {
    setNodes(prevNodes => {
      const prevLookup = new Map(prevNodes.map(node => [node.id, node]));

      return architecture.blocks.map((block: SysmlBlock) => {
        const prev = prevLookup.get(block.id);
        const shouldPreservePosition = draggingNodes.current.has(block.id);
        const position = shouldPreservePosition && prev ? prev.position : block.position;

        return {
          ...prev,
          id: block.id,
          type: "sysmlBlock",
          position,
          data: {
            block,
            documents: memoizedDocuments,
            onOpenDocument
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
  }, [architecture.blocks, memoizedDocuments, onOpenDocument, selectedBlockId]);

  useEffect(() => {
    setEdges(prevEdges => {
      const prevLookup = new Map(prevEdges.map(edge => [edge.id, edge]));

      return architecture.connectors.map((connector: SysmlConnector) => {
        const prev = prevLookup.get(connector.id);

        return {
          ...prev,
          ...mapConnectorToEdge(connector),
          selected: connector.id === selectedConnectorId
        } satisfies Edge;
      });
    });
  }, [architecture.connectors, selectedConnectorId, mapConnectorToEdge]);

  useLayoutEffect(() => {
    if (!architecture.blocks.length) {
      setBlockStylingPopup(null);
    }
    if (!architecture.connectors.length) {
      setConnectorStylingPopup(null);
    }
  }, [architecture.blocks.length, architecture.connectors.length]);

  const handlePaneClick = useCallback(() => {
    closeContextMenu();
    onSelectBlock(null);
    onSelectConnector(null);
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
  }, [closeContextMenu, onSelectBlock, onSelectConnector, setNodes, setEdges]);

  const selectedConnector = useMemo(
    () => architecture.connectors.find(connector => connector.id === selectedConnectorId) ?? null,
    [architecture.connectors, selectedConnectorId]
  );

  const showContextMenu = contextMenuState.type !== "closed" && contextMenuItems.length > 0;

  return {
    minimapOpen,
    setMinimapOpen,
    showCodeViewer,
    setShowCodeViewer,
    nodes,
    edges,
    nodesChangeHandler: handleNodesChange,
    edgesChangeHandler: handleEdgesChange,
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
    addBlockFromPreset: handleAddBlock,
    reuseExistingBlock: handleReuseExistingBlock
  };
}
