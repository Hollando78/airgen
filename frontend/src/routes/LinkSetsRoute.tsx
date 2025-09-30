import { useState, useRef, useCallback, useEffect, memo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "../lib/client";
import { useTenantProject } from "../hooks/useTenantProject";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "../components/ui/dialog";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import { Badge } from "../components/ui/badge";
import { Spinner } from "../components/Spinner";
import { ErrorState } from "../components/ErrorState";
import type { DocumentRecord, DocumentLinkset, CreateLinksetRequest } from "../types";

interface DocumentNode {
  id: string;
  document: DocumentRecord;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Connection {
  from: string;
  to: string;
  linkset?: DocumentLinkset;
}

interface DragState {
  isDragging: boolean;
  dragType: 'node' | 'connection' | null;
  draggedNodeId: string | null;
  connectionStart: string | null;
  mouseStart: { x: number; y: number };
  nodeStart: { x: number; y: number };
}

const NODE_WIDTH = 200;
const NODE_HEIGHT = 120;
const CANVAS_PADDING = 50;
const SNAP_GRID = 20;
const CANVAS_WIDTH = 1200;
const CANVAS_HEIGHT = 600;

// Utility function to snap coordinates to grid
const snapToGrid = (value: number, gridSize: number): number => {
  return Math.round(value / gridSize) * gridSize;
};

// Memoized DocumentNode component for better performance
const DocumentNodeComponent = memo<{
  node: DocumentNode;
  isDragging: boolean;
  isSelected: boolean;
  connectionMode: boolean;
  onMouseDown: (e: React.MouseEvent, nodeId: string) => void;
  onMouseUp: (e: React.MouseEvent, nodeId: string) => void;
  onClick: (e: React.MouseEvent, nodeId: string) => void;
}>(({ node, isDragging, isSelected, connectionMode, onMouseDown, onMouseUp, onClick }) => {
  return (
    <div
      style={{
        position: 'absolute',
        left: node.x,
        top: node.y,
        width: node.width,
        height: node.height,
        zIndex: isDragging ? 20 : 10,
        transform: isDragging ? 'scale(1.02)' : 'scale(1)',
        backgroundColor: 'white',
        border: `2px solid ${
          isSelected ? '#10b981' : 
          connectionMode ? '#f59e0b' : 
          '#3b82f6'
        }`,
        borderRadius: '8px',
        boxShadow: isDragging 
          ? '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
          : isSelected 
          ? '0 0 0 3px rgba(16, 185, 129, 0.2)'
          : '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
        padding: '16px',
        cursor: connectionMode ? 'pointer' : (isDragging ? 'grabbing' : 'grab'),
        userSelect: 'none',
        transition: isDragging ? 'none' : 'all 0.15s ease-out',
        willChange: isDragging ? 'transform' : 'auto'
      }}
      onMouseDown={(e) => onMouseDown(e, node.id)}
      onMouseUp={(e) => onMouseUp(e, node.id)}
      onClick={(e) => onClick(e, node.id)}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div style={{ 
          fontWeight: '600', 
          fontSize: '14px', 
          color: '#111827',
          lineHeight: '1.2',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical'
        }}>
          {node.document.name}
        </div>
        <div style={{ fontSize: '12px', color: '#4b5563' }}>
          {node.document.type}
        </div>
        {node.document.requirementCount !== undefined && (
          <div style={{ fontSize: '12px', color: '#2563eb' }}>
            {node.document.requirementCount} requirements
          </div>
        )}
      </div>
    </div>
  );
});

DocumentNodeComponent.displayName = 'DocumentNodeComponent';

export function LinkSetsRoute(): JSX.Element {
  const { state: { tenant, project } } = useTenantProject();
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  
  const canvasRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  
  const [nodes, setNodes] = useState<DocumentNode[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [dragState, setDragState] = useState<DragState>({
    isDragging: false,
    dragType: null,
    draggedNodeId: null,
    connectionStart: null,
    mouseStart: { x: 0, y: 0 },
    nodeStart: { x: 0, y: 0 }
  });
  
  // Performance optimization: disable edge updates during drag
  const [edgeUpdatesEnabled, setEdgeUpdatesEnabled] = useState(true);
  
  // Linkset creation mode
  const [connectionMode, setConnectionMode] = useState(false);
  const [selectedNodeForConnection, setSelectedNodeForConnection] = useState<string | null>(null);

  // Debug connectionMode changes
  useEffect(() => {
    console.log('Connection mode changed to:', connectionMode);
  }, [connectionMode]);

  useEffect(() => {
    console.log('Selected node for connection changed to:', selectedNodeForConnection);
  }, [selectedNodeForConnection]);
  
  const [showLinksetDialog, setShowLinksetDialog] = useState(false);
  const [newLinkset, setNewLinkset] = useState<{
    sourceDocId: string;
    targetDocId: string;
    description: string;
  }>({ sourceDocId: '', targetDocId: '', description: '' });

  // Fetch documents
  const documentsQuery = useQuery({
    queryKey: ["documents", tenant, project],
    queryFn: () => apiClient.listDocuments(tenant, project),
    enabled: Boolean(tenant && project)
  });

  // Fetch existing linksets
  const linksetsQuery = useQuery({
    queryKey: ["linksets", tenant, project],
    queryFn: () => apiClient.listLinksets(tenant, project),
    enabled: Boolean(tenant && project)
  });

  // Create linkset mutation
  const createLinksetMutation = useMutation({
    mutationFn: (body: CreateLinksetRequest) => 
      apiClient.createLinkset(tenant, project, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["linksets", tenant, project] });
      setShowLinksetDialog(false);
      setNewLinkset({ sourceDocId: '', targetDocId: '', description: '' });
    }
  });

  // Save node positions to localStorage
  const saveNodePositions = useCallback((nodes: DocumentNode[]) => {
    if (!tenant || !project) return;
    const key = `linksets-positions-${tenant}-${project}`;
    const positions = nodes.reduce((acc, node) => {
      acc[node.id] = { x: node.x, y: node.y };
      return acc;
    }, {} as Record<string, { x: number; y: number }>);
    localStorage.setItem(key, JSON.stringify(positions));
  }, [tenant, project]);

  // Load node positions from localStorage
  const loadNodePositions = useCallback((): Record<string, { x: number; y: number }> => {
    if (!tenant || !project) return {};
    const key = `linksets-positions-${tenant}-${project}`;
    try {
      const saved = localStorage.getItem(key);
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  }, [tenant, project]);

  // Initialize nodes when documents load
  useEffect(() => {
    if (documentsQuery.data?.documents && nodes.length === 0) {
      const docs = documentsQuery.data.documents;
      const gridCols = Math.ceil(Math.sqrt(docs.length));
      const savedPositions = loadNodePositions();
      
      const newNodes: DocumentNode[] = docs.map((doc, index) => {
        const row = Math.floor(index / gridCols);
        const col = index % gridCols;
        const saved = savedPositions[doc.id];
        
        return {
          id: doc.id,
          document: doc,
          x: saved ? saved.x : CANVAS_PADDING + col * (NODE_WIDTH + 80),
          y: saved ? saved.y : CANVAS_PADDING + row * (NODE_HEIGHT + 80),
          width: NODE_WIDTH,
          height: NODE_HEIGHT
        };
      });
      
      setNodes(newNodes);
    }
  }, [documentsQuery.data?.documents, nodes.length, loadNodePositions]);

  // Initialize connections when linksets load
  useEffect(() => {
    if (linksetsQuery.data?.linksets) {
      const newConnections: Connection[] = linksetsQuery.data.linksets.map(linkset => ({
        from: linkset.sourceDocument.id,
        to: linkset.targetDocument.id,
        linkset
      }));
      setConnections(newConnections);
    }
  }, [linksetsQuery.data?.linksets]);

  const getMousePosition = useCallback((event: React.MouseEvent) => {
    if (!canvasRef.current) return { x: 0, y: 0 };
    
    const rect = canvasRef.current.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    };
  }, []);

  const handleMouseDown = useCallback((event: React.MouseEvent, nodeId: string) => {
    if (connectionMode) {
      console.log('🔗 Connection mode - mouseDown:', { nodeId, selectedNodeForConnection });
    }
    event.preventDefault();
    event.stopPropagation();
    
    // Handle connection mode clicking
    if (connectionMode) {
      if (selectedNodeForConnection === null) {
        // First node selection
        console.log('🟢 First node selected:', nodeId);
        setSelectedNodeForConnection(nodeId);
        return;
      } else if (selectedNodeForConnection === nodeId) {
        // Clicking the same node - deselect
        console.log('❌ Deselecting node:', nodeId);
        setSelectedNodeForConnection(null);
        return;
      } else {
        // Second node selection - create linkset
        console.log('🟢🟢 Second node selected:', { from: selectedNodeForConnection, to: nodeId });
        const sourceNode = nodes.find(n => n.id === selectedNodeForConnection);
        const targetNode = nodes.find(n => n.id === nodeId);
        
        if (sourceNode && targetNode) {
          // Check if connection already exists
          const existingConnection = connections.find(conn => 
            (conn.from === selectedNodeForConnection && conn.to === nodeId) ||
            (conn.from === nodeId && conn.to === selectedNodeForConnection)
          );
          
          if (!existingConnection) {
            console.log('🎯 Opening linkset dialog');
            setNewLinkset({
              sourceDocId: sourceNode.document.id,
              targetDocId: targetNode.document.id,
              description: ''
            });
            setShowLinksetDialog(true);
          } else {
            console.log('⚠️ Connection already exists');
          }
        }
        setSelectedNodeForConnection(null);
        return;
      }
    }
    
    // Don't start drag if in connection mode
    if (!connectionMode) {
      const mousePos = getMousePosition(event);
      const node = nodes.find(n => n.id === nodeId);
      
      if (!node) return;

      // Disable edge updates during drag for better performance
      setEdgeUpdatesEnabled(false);
      if (event.shiftKey) {
        // Start connection mode
        setDragState({
          isDragging: true,
          dragType: 'connection',
          draggedNodeId: null,
          connectionStart: nodeId,
          mouseStart: mousePos,
          nodeStart: { x: node.x, y: node.y }
        });
      } else {
        // Start node drag mode
        setDragState({
          isDragging: true,
          dragType: 'node',
          draggedNodeId: nodeId,
          connectionStart: null,
          mouseStart: mousePos,
          nodeStart: { x: node.x, y: node.y }
        });
      }
    }
  }, [nodes, getMousePosition, connectionMode, selectedNodeForConnection, connections]);

  const handleClick = useCallback((event: React.MouseEvent, nodeId: string) => {
    if (connectionMode) {
      console.log('🖱️ Connection mode - click:', { nodeId, selectedNodeForConnection });
    }
    
    // Only handle clicks in connection mode
    if (!connectionMode) return;
    
    event.preventDefault();
    event.stopPropagation();
    
    if (selectedNodeForConnection === null) {
      // First node selection
      console.log('🔵 Click: First node selected:', nodeId);
      setSelectedNodeForConnection(nodeId);
    } else if (selectedNodeForConnection === nodeId) {
      // Clicking the same node - deselect
      console.log('🔴 Click: Deselecting node:', nodeId);
      setSelectedNodeForConnection(null);
    } else {
      // Second node selection - create linkset
      console.log('🔵🔵 Click: Second node selected:', { from: selectedNodeForConnection, to: nodeId });
      const sourceNode = nodes.find(n => n.id === selectedNodeForConnection);
      const targetNode = nodes.find(n => n.id === nodeId);
      
      if (sourceNode && targetNode) {
        // Check if connection already exists
        const existingConnection = connections.find(conn => 
          (conn.from === selectedNodeForConnection && conn.to === nodeId) ||
          (conn.from === nodeId && conn.to === selectedNodeForConnection)
        );
        
        if (!existingConnection) {
          console.log('🎯 Click: Opening linkset dialog');
          setNewLinkset({
            sourceDocId: sourceNode.document.id,
            targetDocId: targetNode.document.id,
            description: ''
          });
          setShowLinksetDialog(true);
        }
      }
      setSelectedNodeForConnection(null);
    }
  }, [connectionMode, selectedNodeForConnection, nodes, connections]);

  // Global mouse move handler for smooth dragging
  useEffect(() => {
    const handleGlobalMouseMove = (event: MouseEvent) => {
      if (!dragState.isDragging || !canvasRef.current) return;
      
      const rect = canvasRef.current.getBoundingClientRect();
      const mousePos = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top
      };
      
      if (dragState.dragType === 'node' && dragState.draggedNodeId) {
        const deltaX = mousePos.x - dragState.mouseStart.x;
        const deltaY = mousePos.y - dragState.mouseStart.y;
        
        // Calculate new position with grid snapping and bounds
        let newX = dragState.nodeStart.x + deltaX;
        let newY = dragState.nodeStart.y + deltaY;
        
        // Snap to grid
        newX = snapToGrid(newX, SNAP_GRID);
        newY = snapToGrid(newY, SNAP_GRID);
        
        // Constrain within canvas bounds
        newX = Math.max(0, Math.min(newX, CANVAS_WIDTH - NODE_WIDTH));
        newY = Math.max(0, Math.min(newY, CANVAS_HEIGHT - NODE_HEIGHT));
        
        // Use requestAnimationFrame for smoother updates
        requestAnimationFrame(() => {
          setNodes(prev => prev.map(node => 
            node.id === dragState.draggedNodeId 
              ? { ...node, x: newX, y: newY }
              : node
          ));
        });
      }
    };

    const handleGlobalMouseUp = () => {
      // Re-enable edge updates
      setEdgeUpdatesEnabled(true);
      
      // Save positions after drag
      if (dragState.isDragging && dragState.dragType === 'node') {
        saveNodePositions(nodes);
      }
      
      setDragState({
        isDragging: false,
        dragType: null,
        draggedNodeId: null,
        connectionStart: null,
        mouseStart: { x: 0, y: 0 },
        nodeStart: { x: 0, y: 0 }
      });
    };

    if (dragState.isDragging) {
      document.addEventListener('mousemove', handleGlobalMouseMove, { passive: true });
      document.addEventListener('mouseup', handleGlobalMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleGlobalMouseMove);
      document.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [dragState, saveNodePositions, nodes]);

  const handleMouseMove = useCallback((event: React.MouseEvent) => {
    // This is now handled by the global listener above
  }, []);

  const handleMouseUp = useCallback((event: React.MouseEvent, targetNodeId?: string) => {
    if (dragState.dragType === 'connection' && dragState.connectionStart && targetNodeId) {
      const sourceNode = nodes.find(n => n.id === dragState.connectionStart);
      const targetNode = nodes.find(n => n.id === targetNodeId);
      
      if (sourceNode && targetNode && sourceNode.id !== targetNode.id) {
        // Check if connection already exists
        const existingConnection = connections.find(conn => 
          (conn.from === sourceNode.id && conn.to === targetNode.id) ||
          (conn.from === targetNode.id && conn.to === sourceNode.id)
        );
        
        if (!existingConnection) {
          setNewLinkset({
            sourceDocId: sourceNode.document.id,
            targetDocId: targetNode.document.id,
            description: ''
          });
          setShowLinksetDialog(true);
        }
      }
    }
    
    setDragState({
      isDragging: false,
      dragType: null,
      draggedNodeId: null,
      connectionStart: null,
      mouseStart: { x: 0, y: 0 },
      nodeStart: { x: 0, y: 0 }
    });
  }, [dragState, nodes, connections]);

  const handleCreateLinkset = useCallback(() => {
    if (newLinkset.sourceDocId && newLinkset.targetDocId) {
      createLinksetMutation.mutate({
        sourceDocumentId: newLinkset.sourceDocId,
        targetDocumentId: newLinkset.targetDocId,
        description: newLinkset.description || undefined
      });
    }
  }, [newLinkset, createLinksetMutation]);

  const getConnectionPath = useCallback((fromId: string, toId: string) => {
    if (!edgeUpdatesEnabled) return ''; // Skip during drag for performance
    
    const fromNode = nodes.find(n => n.id === fromId);
    const toNode = nodes.find(n => n.id === toId);
    
    if (!fromNode || !toNode) return '';
    
    const fromX = fromNode.x + fromNode.width / 2;
    const fromY = fromNode.y + fromNode.height / 2;
    const toX = toNode.x + toNode.width / 2;
    const toY = toNode.y + toNode.height / 2;
    
    // Simple straight line for performance
    return `M ${fromX},${fromY} L ${toX},${toY}`;
  }, [nodes, edgeUpdatesEnabled]);

  if (!tenant || !project) {
    return <ErrorState message="Please select a tenant and project" />;
  }

  if (documentsQuery.isLoading) {
    return <Spinner />;
  }

  if (documentsQuery.error) {
    return <ErrorState message="Failed to load documents" />;
  }

  const sourceDoc = documentsQuery.data?.documents.find(d => d.id === newLinkset.sourceDocId);
  const targetDoc = documentsQuery.data?.documents.find(d => d.id === newLinkset.targetDocId);

  return (
    <div className="p-6 space-y-6 min-h-screen">
      <Card>
        <CardHeader>
          <CardTitle>Link Sets</CardTitle>
          <CardDescription>
            Create and manage document relationships visually. Hold Shift and drag between documents to create linksets.
          </CardDescription>
        </CardHeader>
        
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-2">
                <p className="text-sm font-medium text-gray-700">Connection Mode:</p>
                <Button
                  variant={connectionMode ? "default" : "outline"}
                  size="sm"
                  onClick={() => {
                    console.log('Connection mode button clicked, current state:', connectionMode);
                    const newMode = !connectionMode;
                    setConnectionMode(newMode);
                    console.log('Setting connection mode to:', newMode);
                    if (connectionMode) {
                      setSelectedNodeForConnection(null); // Reset selection when deactivating
                    }
                  }}
                  className="flex items-center gap-2"
                >
                  {connectionMode ? (
                    <>
                      <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                      Active - Click documents to connect
                    </>
                  ) : (
                    <>
                      <span className="w-2 h-2 bg-gray-400 rounded-full"></span>
                      Click to activate
                    </>
                  )}
                </Button>
              </div>
            </div>
            
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="space-y-2">
                <p className="text-sm font-medium text-blue-900">How to use:</p>
                <ul className="text-sm text-blue-800 space-y-1">
                  <li>• Drag document nodes to rearrange them</li>
                  <li>• {connectionMode ? (
                    <>Click the <span className="font-semibold">Connection Mode</span> button above, then click two documents to create a linkset</>
                  ) : (
                    <>Hold <kbd className="bg-blue-100 px-1 py-0.5 rounded text-xs">Shift</kbd> and drag from one document to another to create a linkset</>
                  )}</li>
                  <li>• Existing linksets are shown as blue arrows between documents</li>
                </ul>
              </div>
            </div>
            
            {linksetsQuery.data?.linksets && linksetsQuery.data.linksets.length > 0 && (
              <div className="space-y-2">
                <Label className="text-sm font-semibold">Existing Linksets</Label>
                <div className="flex flex-wrap gap-2">
                  {linksetsQuery.data.linksets.map(linkset => (
                    <Badge key={linkset.id} variant="secondary" className="text-xs">
                      {linkset.sourceDocument.name} → {linkset.targetDocument.name}
                      <span className="ml-1 text-muted-foreground">({linkset.linkCount})</span>
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="flex-1">
        <CardContent className="p-0">
          <div 
            ref={canvasRef}
            style={{
              width: '100%',
              height: `${CANVAS_HEIGHT}px`,
              position: 'relative',
              overflow: dragState.isDragging ? 'hidden' : 'auto', // Disable panning during drag
              backgroundColor: '#f9fafb',
              border: '1px solid #d1d5db',
              borderRadius: '8px',
              cursor: dragState.isDragging ? 'grabbing' : 'grab',
              userSelect: 'none',
              // Add subtle grid pattern
              backgroundImage: `
                linear-gradient(rgba(59, 130, 246, 0.1) 1px, transparent 1px),
                linear-gradient(90deg, rgba(59, 130, 246, 0.1) 1px, transparent 1px)
              `,
              backgroundSize: `${SNAP_GRID}px ${SNAP_GRID}px`
            }}
            onMouseMove={handleMouseMove}
            onMouseUp={() => handleMouseUp(undefined)}
          >
            <svg 
              ref={svgRef}
              className="absolute inset-0 w-full h-full pointer-events-none"
              style={{ zIndex: 1 }}
            >
              <defs>
                <marker
                  id="arrowhead"
                  markerWidth="10"
                  markerHeight="7"
                  refX="9"
                  refY="3.5"
                  orient="auto"
                >
                  <polygon points="0 0, 10 3.5, 0 7" fill="#2563eb" />
                </marker>
              </defs>
              
              {/* Render connections */}
              {connections.map(conn => (
                <path
                  key={`${conn.from}-${conn.to}`}
                  d={getConnectionPath(conn.from, conn.to)}
                  stroke="#2563eb"
                  strokeWidth="2"
                  fill="none"
                  markerEnd="url(#arrowhead)"
                />
              ))}
              
              {/* Render temporary connection while dragging */}
              {dragState.dragType === 'connection' && dragState.connectionStart && (
                <path
                  d={`M ${nodes.find(n => n.id === dragState.connectionStart)?.x + NODE_WIDTH/2 || 0},${nodes.find(n => n.id === dragState.connectionStart)?.y + NODE_HEIGHT/2 || 0} L ${dragState.mouseStart.x},${dragState.mouseStart.y}`}
                  stroke="#94a3b8"
                  strokeWidth="2"
                  strokeDasharray="5,5"
                  fill="none"
                />
              )}
            </svg>
            
            {/* Render document nodes */}
            {nodes.length === 0 && documentsQuery.data?.documents && (
              <div className="absolute top-4 left-4 bg-yellow-100 border border-yellow-400 rounded-lg p-4 z-50">
                <p className="text-yellow-800 font-medium">Canvas Ready</p>
                <p className="text-yellow-700 text-sm">
                  Documents loaded: {documentsQuery.data.documents.length}
                </p>
                <p className="text-yellow-600 text-xs mt-1">
                  Nodes should appear here...
                </p>
              </div>
            )}
            {nodes.map(node => (
              <DocumentNodeComponent
                key={node.id}
                node={node}
                isDragging={dragState.draggedNodeId === node.id}
                isSelected={selectedNodeForConnection === node.id}
                connectionMode={connectionMode}
                onMouseDown={handleMouseDown}
                onMouseUp={handleMouseUp}
                onClick={handleClick}
              />
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Create Linkset Dialog */}
      <Dialog open={showLinksetDialog} onOpenChange={setShowLinksetDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Document Linkset</DialogTitle>
            <DialogDescription>
              Create a relationship between {sourceDoc?.name} and {targetDoc?.name}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-sm font-medium">Source Document</Label>
                <div className="mt-1 p-2 bg-gray-50 rounded border text-sm">
                  {sourceDoc?.name}
                </div>
              </div>
              <div>
                <Label className="text-sm font-medium">Target Document</Label>
                <div className="mt-1 p-2 bg-gray-50 rounded border text-sm">
                  {targetDoc?.name}
                </div>
              </div>
            </div>
            
            <div>
              <Label htmlFor="description" className="text-sm font-medium">
                Description (optional)
              </Label>
              <Textarea
                id="description"
                value={newLinkset.description}
                onChange={(e) => setNewLinkset(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Describe the relationship between these documents..."
                className="mt-1"
                rows={3}
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLinksetDialog(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleCreateLinkset}
              disabled={createLinksetMutation.isPending}
            >
              {createLinksetMutation.isPending ? "Creating..." : "Create Linkset"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}