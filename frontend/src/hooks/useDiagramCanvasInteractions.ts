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
import { toast } from "sonner";
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

export type PortContextMenuState = {
  blockId: string;
  portId: string;
  portName: string;
  hidden: boolean;
  direction: PortDirection;
  x: number;
  y: number;
} | null;

interface UseCanvasInteractionsParams {
  architecture: ArchitectureState;
  activeDiagram: ArchitectureDiagramRecord | null;
  activeDiagramId: string | null;
  documents: DocumentRecord[];
  selectedBlockId: string | null;
  selectedConnectorId: string | null;
  selectedPortId?: string | null;
  onSelectBlock: (id: string | null) => void;
  onSelectConnector: (id: string | null) => void;
  onSelectPort?: (blockId: string, portId: string | null) => void;
  blockPresets: DiagramBlockPreset[];
  computePlacement: (blockCount: number) => XYPosition;
  mapConnectorToEdge: (connector: SysmlConnector, blocks?: SysmlBlock[]) => Edge;
  hideDefaultHandles?: boolean;
  isConnectMode?: boolean;
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
  updatePort: (blockId: string, portId: string, updates: { name?: string; direction?: PortDirection; edge?: "top" | "right" | "bottom" | "left"; offset?: number }) => void;
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
  portContextMenu: PortContextMenuState;
  handlePortContextMenu: (blockId: string, portId: string, portName: string, hidden: boolean, direction: PortDirection, x: number, y: number) => void;
  closePortContextMenu: () => void;
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
  selectedPortId,
  onSelectBlock,
  onSelectConnector,
  onSelectPort,
  blockPresets,
  computePlacement,
  mapConnectorToEdge,
  hideDefaultHandles = false,
  isConnectMode = false,
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
  const [portContextMenu, setPortContextMenu] = useState<PortContextMenuState>(null);
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
  const pendingResizeSizesRef = useRef<Map<string, { width: number; height: number }>>(new Map());
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

  const handlePortContextMenu = useCallback((
    blockId: string,
    portId: string,
    portName: string,
    hidden: boolean,
    direction: PortDirection,
    x: number,
    y: number
  ) => {
    setPortContextMenu({ blockId, portId, portName, hidden, direction, x, y });
  }, []);

  const closePortContextMenu = useCallback(() => {
    setPortContextMenu(null);
  }, []);

  useEffect(() => {
    closeContextMenu();
    closePortContextMenu();
  }, [activeDiagramId, closeContextMenu, closePortContextMenu]);

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
    }, 180);

    timeouts.set(blockId, timeout);
  }, [updateBlockSize]);

  const applyPendingResizeOverrides = useCallback(() => {
    if (pendingResizeSizesRef.current.size === 0) {
      return;
    }

    setNodes(prevNodes => prevNodes.map(node => {
      const override = pendingResizeSizesRef.current.get(node.id);
      if (!override) {
        return node;
      }

      const existingBlock = (node.data as { block?: SysmlBlock }).block;
      if (!existingBlock) {
        return node;
      }

      return {
        ...node,
        style: {
          ...node.style,
          width: override.width,
          height: override.height
        },
        data: {
          ...node.data,
          block: {
            ...existingBlock,
            size: override
          }
        }
      };
    }));
  }, [setNodes]);

  const handlePaneContextMenu = useCallback((event: ReactMouseEvent | MouseEvent) => {
    event.preventDefault();
    onSelectBlock(null);
    onSelectConnector(null);

    if (!canvasWrapperRef.current || !reactFlowInstanceRef.current) {return;}
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
    event.preventDefault();
    setContextMenuState({
      type: "edge",
      edgeId: edge.id,
      client: { x: event.clientX, y: event.clientY }
    });
  }, []);

  const handleSelectionChange = useCallback(
    ({ nodes: selectedNodes, edges: selectedEdges }: OnSelectionChangeParams) => {
      const firstNodeId = selectedNodes[0]?.id ?? null;
      const firstEdgeId = selectedEdges[0]?.id ?? null;

      closeContextMenu();
      closePortContextMenu();

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
    [closeContextMenu, closePortContextMenu, onSelectBlock, onSelectConnector]
  );

  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => {
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
          const baseBlock = architecture.blocks.find((candidate: SysmlBlock) => candidate.id === change.id);
          if (!baseBlock) {
            return;
          }

          const nextSize = {
            width: change.dimensions.width,
            height: change.dimensions.height
          };

          const widthDelta = Math.abs((baseBlock.size?.width ?? 0) - nextSize.width);
          const heightDelta = Math.abs((baseBlock.size?.height ?? 0) - nextSize.height);
          const hasPendingOverride = pendingResizeSizesRef.current.has(change.id);

          if (!hasPendingOverride && widthDelta < 0.5 && heightDelta < 0.5) {
            return;
          }

          pendingResizeSizesRef.current.set(change.id, nextSize);
          applyPendingResizeOverrides();
          debouncedUpdateBlockSize(change.id, nextSize);
        }
      });
    },
    [architecture.blocks, applyPendingResizeOverrides, debouncedUpdateBlockPosition, debouncedUpdateBlockSize, onNodesStateChange]
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
      if (!activeDiagramId || !connection.source || !connection.target) {return;}

        // Strip "-target" suffix from target port ID if present
        const targetPortId = connection.targetHandle?.endsWith('-target')
          ? connection.targetHandle.slice(0, -7) // Remove "-target" (7 chars)
          : connection.targetHandle;

        const newId = addConnector({
          source: connection.source,
          target: connection.target,
          sourcePortId: connection.sourceHandle ?? undefined,
          targetPortId: targetPortId ?? undefined
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
        toast.warning("Create or select a diagram before adding blocks.");
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

      if (!id) {return;}

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
        toast.warning("Create or select a diagram before adding blocks.");
        return;
      }

      const placement = computeNextPlacement();
      const id = reuseBlock(blockId, placement);

      if (!id) {return;}

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
      if (!block) {return [];}

      const sharedBaseName = block.name.replace(/\s+copy$/i, "");
      const existingPorts = block.ports.length;
      const hasHiddenPorts = block.ports.some(port => port.hidden);

      return [
        {
          label: "Style block",
          onSelect: () => {
            setBlockStylingPopup({
              blockId: block.id,
              position: { x: contextMenuState.client.x + 10, y: contextMenuState.client.y }
            });
            closeContextMenu();
          }
        },
        {
          label: "Add Port",
          onSelect: () => addPort(block.id, { name: `port${existingPorts + 1}`, direction: "inout" })
        },
        {
          label: "Show all ports",
          onSelect: () => {
            block.ports.forEach(port => {
              if (port.hidden) {
                updatePort(block.id, port.id, { hidden: false });
              }
            });
          },
          disabled: !hasHiddenPorts
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
        return [];
      }
      return [
        {
          label: "Style connector",
          onSelect: () => {
            setConnectorStylingPopup({
              connectorId: connector.id,
              position: { x: contextMenuState.client.x + 10, y: contextMenuState.client.y }
            });
            closeContextMenu();
          }
        },
        {
          label: "Delete connector",
          onSelect: () => {
            removeConnector(connector.id);
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
    updatePort,
    removeBlock,
    removeConnector,
    setBlockStylingPopup,
    setConnectorStylingPopup,
    closeContextMenu
  ]);

  /**
   * PERFORMANCE OPTIMIZATION:
   * Memoize node data template to prevent all nodes from re-rendering when only
   * internal hook state changes. This significantly improves responsiveness during
   * user interactions like dragging, resizing, and port manipulation.
   */
  const nodeDataTemplate = useMemo(() => ({
    documents: memoizedDocuments,
    onOpenDocument,
    hideDefaultHandles,
    isConnectMode,
    selectedPortId,
    onSelectPort,
    updatePort,
    removePort,
    updateBlock,
    portContextMenu,
    onPortContextMenu: handlePortContextMenu,
    onClosePortContextMenu: closePortContextMenu
  }), [memoizedDocuments, onOpenDocument, hideDefaultHandles, isConnectMode, selectedPortId, onSelectPort, updatePort, removePort, updateBlock, portContextMenu, handlePortContextMenu, closePortContextMenu]);

  /**
   * SMART NODE SYNCHRONIZATION:
   * Syncs ReactFlow nodes with architecture blocks state while minimizing re-renders.
   * Key optimizations:
   * 1. Preserves node instances during drag operations to avoid visual glitches
   * 2. Only updates nodes when actual data changes (not on every render)
   * 3. Uses structural comparison to detect when nodes are added/removed
   * 4. Maintains position continuity during drag operations
   */
  useLayoutEffect(() => {
    setNodes(prevNodes => {
      const prevLookup = new Map(prevNodes.map(node => [node.id, node]));
      const newBlockIds = new Set(architecture.blocks.map((b: SysmlBlock) => b.id));

      // Check if we need to update - avoid unnecessary re-renders
      const hasStructuralChanges =
        prevNodes.length !== architecture.blocks.length ||
        prevNodes.some(node => !newBlockIds.has(node.id));

      return architecture.blocks.map((block: SysmlBlock) => {
        const prev = prevLookup.get(block.id);
        const shouldPreservePosition = draggingNodes.current.has(block.id);
        const position = shouldPreservePosition && prev ? prev.position : block.position;

        const resizeOverride = pendingResizeSizesRef.current.get(block.id);
        const isOverrideSatisfied = resizeOverride
          ? Math.abs(resizeOverride.width - block.size.width) < 0.5 &&
            Math.abs(resizeOverride.height - block.size.height) < 0.5
          : false;

        if (isOverrideSatisfied) {
          pendingResizeSizesRef.current.delete(block.id);
        }

        const effectiveBlock = resizeOverride && !isOverrideSatisfied
          ? { ...block, size: resizeOverride }
          : block;

        // Only update node if block data changed or it's a new node
        const needsUpdate = !prev || hasStructuralChanges ||
          prev.data.block !== effectiveBlock ||
          prev.selected !== (block.id === selectedBlockId);

        if (prev && !needsUpdate && shouldPreservePosition) {
          // Return existing node to avoid unnecessary re-render during drag
          return prev;
        }

        return {
          ...prev,
          id: block.id,
          type: "sysmlBlock",
          position,
          data: {
            ...nodeDataTemplate,
            block: effectiveBlock
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
  }, [architecture.blocks, selectedBlockId, nodeDataTemplate]);

  /**
   * SMART EDGE SYNCHRONIZATION:
   * Syncs ReactFlow edges with architecture connectors while avoiding unnecessary updates.
   * Preserves edge instances when possible to prevent flickering and maintain smooth animations.
   */
  useEffect(() => {
    setEdges(prevEdges => {
      const prevLookup = new Map(prevEdges.map(edge => [edge.id, edge]));
      const newConnectorIds = new Set(architecture.connectors.map((c: SysmlConnector) => c.id));

      // Check for structural changes (added/removed connectors)
      const hasStructuralChanges =
        prevEdges.length !== architecture.connectors.length ||
        prevEdges.some(edge => !newConnectorIds.has(edge.id));

      // If no structural changes and same connectors, be very conservative about updates
      if (!hasStructuralChanges && prevEdges.length === architecture.connectors.length) {
        // Only update edges that actually changed
        const newEdges = architecture.connectors.map((connector: SysmlConnector) => {
          const prev = prevLookup.get(connector.id);
          const mappedEdge = mapConnectorToEdge(connector, architecture.blocks);

          // If no previous edge, return new one
          if (!prev) {
            return {
              ...mappedEdge,
              selected: connector.id === selectedConnectorId,
              data: {
                ...mappedEdge.data,
                documents,
                onOpenDocument,
                onUpdateLabelOffset: (offsetX: number, offsetY: number) => {
                  updateConnector(connector.id, { labelOffsetX: offsetX, labelOffsetY: offsetY });
                },
                onUpdateLabel: (label: string) => {
                  updateConnector(connector.id, { label });
                }
              }
            } satisfies Edge;
          }

          // Check if anything meaningful changed
          const selectionChanged = prev.selected !== (connector.id === selectedConnectorId);
          const handleChanged = prev.sourceHandle !== mappedEdge.sourceHandle || prev.targetHandle !== mappedEdge.targetHandle;
          const documentIdsChanged = JSON.stringify(prev.data?.documentIds) !== JSON.stringify(mappedEdge.data?.documentIds);
          const labelOffsetChanged =
            (prev.data?.labelOffsetX ?? 0) !== (mappedEdge.data?.labelOffsetX ?? 0) ||
            (prev.data?.labelOffsetY ?? 0) !== (mappedEdge.data?.labelOffsetY ?? 0);
          const dataChanged = documentIdsChanged || labelOffsetChanged;
          const visualChanged =
            prev.type !== mappedEdge.type ||
            prev.animated !== mappedEdge.animated ||
            prev.style?.stroke !== mappedEdge.style?.stroke ||
            prev.style?.strokeWidth !== mappedEdge.style?.strokeWidth ||
            prev.style?.strokeDasharray !== mappedEdge.style?.strokeDasharray ||
            prev.markerStart?.type !== mappedEdge.markerStart?.type ||
            prev.markerStart?.color !== mappedEdge.markerStart?.color ||
            prev.markerEnd?.type !== mappedEdge.markerEnd?.type ||
            prev.markerEnd?.color !== mappedEdge.markerEnd?.color ||
            prev.label !== mappedEdge.label;

          // If nothing changed, return existing edge reference (critical for performance)
          if (!selectionChanged && !handleChanged && !visualChanged && !dataChanged) {
            return prev;
          }

          // Only selection changed - just update that property
          if (selectionChanged && !handleChanged && !visualChanged && !dataChanged) {
            return { ...prev, selected: connector.id === selectedConnectorId };
          }

          // Something meaningful changed, return new edge
          return {
            ...mappedEdge,
            selected: connector.id === selectedConnectorId,
            data: {
              ...mappedEdge.data,
              documents,
              onOpenDocument,
              onUpdateLabelOffset: (offsetX: number, offsetY: number) => {
                updateConnector(connector.id, { labelOffsetX: offsetX, labelOffsetY: offsetY });
              },
              onUpdateLabel: (label: string) => {
                updateConnector(connector.id, { label });
              }
            }
          } satisfies Edge;
        });

        return newEdges;
      }

      // Structural changes detected, rebuild all edges
      return architecture.connectors.map((connector: SysmlConnector) => {
        const mappedEdge = mapConnectorToEdge(connector, architecture.blocks);
        return {
          ...mappedEdge,
          selected: connector.id === selectedConnectorId,
          data: {
            ...mappedEdge.data,
            documents,
            onOpenDocument,
            onUpdateLabelOffset: (offsetX: number, offsetY: number) => {
              updateConnector(connector.id, { labelOffsetX: offsetX, labelOffsetY: offsetY });
            },
            onUpdateLabel: (label: string) => {
              updateConnector(connector.id, { label });
            }
          }
        } satisfies Edge;
      });
    });
  }, [architecture.connectors, architecture.blocks, selectedConnectorId, mapConnectorToEdge, documents, onOpenDocument, updateConnector]);

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
    closePortContextMenu();
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
  }, [closeContextMenu, closePortContextMenu, onSelectBlock, onSelectConnector, setNodes, setEdges]);

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
    portContextMenu,
    handlePortContextMenu,
    closePortContextMenu,
    canvasWrapperRef,
    reactFlowInstanceRef,
    selectedConnector,
    addBlockFromPreset: handleAddBlock,
    reuseExistingBlock: handleReuseExistingBlock
  };
}
