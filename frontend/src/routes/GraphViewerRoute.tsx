import { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import CytoscapeComponent from "react-cytoscapejs";
import type { Core, ElementDefinition } from "cytoscape";
import { useApiClient } from "../lib/client";
import { useTenantProject } from "../hooks/useTenantProject";
import "./graphViewer.css";

export function GraphViewerRoute() {
  const api = useApiClient();
  const { state } = useTenantProject();
  const { tenant, project } = state;
  const [cyInstance, setCyInstance] = useState<Core | null>(null);
  const [selectedNodeInfo, setSelectedNodeInfo] = useState<any>(null);
  const [visibleNodeTypes, setVisibleNodeTypes] = useState<Set<string>>(new Set([
    'Tenant', 'Project', 'Document', 'DocumentSection', 'Requirement', 'Info', 'SurrogateReference', 'DocumentLinkset'
  ]));
  const [searchTerm, setSearchTerm] = useState('');
  const [hiddenNodeIds, setHiddenNodeIds] = useState<Set<string>>(new Set());
  const [savedViews, setSavedViews] = useState<Array<{
    name: string;
    visibleNodeTypes: string[];
    searchTerm: string;
    hiddenNodeIds: string[];
    layout?: any;
  }>>(() => {
    // Load saved views from localStorage
    const saved = localStorage.getItem(`graph-views-${tenant}-${project}`);
    return saved ? JSON.parse(saved) : [];
  });
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [newViewName, setNewViewName] = useState('');
  // Context menu types
  type ContextMenuItem = {
    label: string;
    action?: () => void;
    submenu?: ContextMenuItem[];
    separator?: boolean;
    icon?: string;
    disabled?: boolean;
  };

  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    nodeId: string;
    nodeLabel: string;
    nodeType: string;
    menuItems: ContextMenuItem[];
  } | null>(null);
  const [pinnedNodes, setPinnedNodes] = useState<Set<string>>(new Set());
  const [highlightedNodes, setHighlightedNodes] = useState<Set<string>>(new Set());
  const cyRef = useRef<HTMLDivElement>(null);

  // Fetch graph data from Neo4j
  const { data: graphData, isLoading } = useQuery({
    queryKey: ["graph-data", tenant, project],
    queryFn: async () => {
      // We'll need to create an API endpoint to fetch graph data
      const response = await api.getGraphData(tenant!, project!);
      return response;
    },
    enabled: !!(tenant && project)
  });

  // Transform Neo4j data to Cytoscape format
  const elements: ElementDefinition[] = graphData
    ? [
        // Nodes
        ...graphData.nodes.map((node: any) => ({
          data: {
            id: node.id,
            label: node.label,
            type: node.type,
            properties: node.properties
          }
        })),
        // Edges
        ...graphData.relationships.map((rel: any) => ({
          data: {
            id: rel.id,
            source: rel.source,
            target: rel.target,
            label: rel.type,
            properties: rel.properties
          }
        }))
      ]
    : [];

  // Cytoscape stylesheet
  const stylesheet = [
    {
      selector: "node",
      style: {
        "background-color": "#3b82f6",
        label: "data(label)",
        color: "#1f2937",
        "text-valign": "center",
        "text-halign": "center",
        "font-size": "12px",
        "font-weight": "500",
        width: "60px",
        height: "60px",
        "border-width": "2px",
        "border-color": "#2563eb",
        "text-outline-width": "2px",
        "text-outline-color": "#ffffff"
      }
    },
    {
      selector: "node[type='Tenant']",
      style: {
        "background-color": "#8b5cf6",
        "border-color": "#7c3aed"
      }
    },
    {
      selector: "node[type='Project']",
      style: {
        "background-color": "#06b6d4",
        "border-color": "#0891b2"
      }
    },
    {
      selector: "node[type='Document']",
      style: {
        "background-color": "#10b981",
        "border-color": "#059669"
      }
    },
    {
      selector: "node[type='DocumentSection']",
      style: {
        "background-color": "#f59e0b",
        "border-color": "#d97706"
      }
    },
    {
      selector: "node[type='Requirement']",
      style: {
        "background-color": "#3b82f6",
        "border-color": "#2563eb"
      }
    },
    {
      selector: "node[type='DocumentLinkset']",
      style: {
        "background-color": "#ec4899",
        "border-color": "#db2777"
      }
    },
    {
      selector: "node:selected",
      style: {
        "border-width": "4px",
        "border-color": "#dc2626",
        "background-color": "#ef4444"
      }
    },
    {
      selector: "edge",
      style: {
        width: 2,
        "line-color": "#94a3b8",
        "target-arrow-color": "#94a3b8",
        "target-arrow-shape": "triangle",
        "curve-style": "bezier",
        label: "data(label)",
        "font-size": "10px",
        color: "#64748b",
        "text-rotation": "autorotate",
        "text-margin-y": -10
      }
    },
    {
      selector: "edge:selected",
      style: {
        "line-color": "#dc2626",
        "target-arrow-color": "#dc2626",
        width: 3
      }
    },
    {
      selector: ".path-highlight",
      style: {
        "line-color": "#ef4444",
        "target-arrow-color": "#ef4444",
        "border-color": "#ef4444",
        "background-color": "#fecaca",
        "border-width": "4px",
        width: 4,
        "z-index": 999
      }
    }
  ];

  // Layout configuration
  const layout = {
    name: "cose",
    idealEdgeLength: 100,
    nodeOverlap: 20,
    refresh: 20,
    fit: true,
    padding: 30,
    randomize: false,
    componentSpacing: 100,
    nodeRepulsion: 400000,
    edgeElasticity: 100,
    nestingFactor: 5,
    gravity: 80,
    numIter: 1000,
    initialTemp: 200,
    coolingFactor: 0.95,
    minTemp: 1.0
  };

  // Apply filters and search
  useEffect(() => {
    if (cyInstance) {
      cyInstance.nodes().forEach((node: any) => {
        const nodeId = node.data('id');
        const nodeType = node.data('type');
        const nodeLabel = node.data('label')?.toLowerCase() || '';
        const isTypeVisible = visibleNodeTypes.has(nodeType);
        const matchesSearch = searchTerm === '' || nodeLabel.includes(searchTerm.toLowerCase());
        const isManuallyHidden = hiddenNodeIds.has(nodeId);

        if (isTypeVisible && matchesSearch && !isManuallyHidden) {
          node.style('display', 'element');
        } else {
          node.style('display', 'none');
        }
      });
    }
  }, [cyInstance, visibleNodeTypes, searchTerm, hiddenNodeIds]);

  // Apply visual highlighting styles
  useEffect(() => {
    if (cyInstance) {
      cyInstance.nodes().forEach((node: any) => {
        const nodeId = node.data('id');

        // Apply highlight style
        if (highlightedNodes.has(nodeId)) {
          node.style({
            'border-width': '5px',
            'border-color': '#facc15',
            'shadow-blur': '20',
            'shadow-color': '#facc15',
            'shadow-opacity': 0.8
          });
        } else {
          // Reset to default if not highlighted and not selected
          if (!node.selected()) {
            // Reset only border styles, remove shadow entirely
            node.style({
              'border-width': '',
              'border-color': '',
              'shadow-opacity': 0
            });
          }
        }
      });
    }
  }, [cyInstance, highlightedNodes, pinnedNodes]);

  // Handle node selection and context menu
  useEffect(() => {
    if (cyInstance) {
      const handleNodeTap = (event: any) => {
        const node = event.target;
        setSelectedNodeInfo({
          id: node.data("id"),
          label: node.data("label"),
          type: node.data("type"),
          properties: node.data("properties")
        });
      };

      const handleBackgroundTap = (event: any) => {
        if (event.target === cyInstance) {
          setSelectedNodeInfo(null);
          setContextMenu(null);
        }
      };

      const handleNodeRightClick = (event: any) => {
        const node = event.target;
        const originalEvent = event.originalEvent;

        if (originalEvent) {
          originalEvent.preventDefault();
          originalEvent.stopPropagation();
        }

        const nodeId = node.data("id");
        const nodeLabel = node.data("label");
        const nodeType = node.data("type");

        // Set menu with empty items for now - will be populated by generateContextMenuItems
        setContextMenu({
          x: originalEvent ? originalEvent.clientX : 0,
          y: originalEvent ? originalEvent.clientY : 0,
          nodeId,
          nodeLabel,
          nodeType,
          menuItems: [] // Populated below in the rendering
        });
      };

      cyInstance.on("tap", "node", handleNodeTap);
      cyInstance.on("tap", handleBackgroundTap);
      cyInstance.on("cxttap", "node", handleNodeRightClick);

      return () => {
        cyInstance.off("tap", "node", handleNodeTap);
        cyInstance.off("tap", handleBackgroundTap);
        cyInstance.off("cxttap", "node", handleNodeRightClick);
      };
    }
  }, [cyInstance]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (cyInstance) {
        cyInstance.destroy();
      }
    };
  }, [cyInstance]);

  // Close context menu when clicking anywhere
  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, []);

  // Layout controls
  const handleResetLayout = () => {
    if (cyInstance) {
      cyInstance.layout(layout as any).run();
    }
  };

  const handleFitView = () => {
    if (cyInstance) {
      cyInstance.fit();
    }
  };

  const handleZoomIn = () => {
    if (cyInstance) {
      cyInstance.zoom(cyInstance.zoom() * 1.2);
      cyInstance.center();
    }
  };

  const handleZoomOut = () => {
    if (cyInstance) {
      cyInstance.zoom(cyInstance.zoom() * 0.8);
      cyInstance.center();
    }
  };

  if (!tenant || !project) {
    return (
      <div className="graph-viewer-container">
        <div className="graph-viewer-empty">
          <p>Please select a tenant and project to view the graph.</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="graph-viewer-container">
        <div className="graph-viewer-loading">Loading graph data...</div>
      </div>
    );
  }

  const nodeTypes = ['Tenant', 'Project', 'Document', 'DocumentSection', 'Requirement', 'Info', 'SurrogateReference', 'DocumentLinkset'];

  const toggleNodeType = (type: string) => {
    const newVisible = new Set(visibleNodeTypes);
    if (newVisible.has(type)) {
      newVisible.delete(type);
    } else {
      newVisible.add(type);
    }
    setVisibleNodeTypes(newVisible);
  };

  const saveCurrentView = () => {
    if (!newViewName.trim()) {
      alert('Please enter a view name');
      return;
    }

    const newView = {
      name: newViewName.trim(),
      visibleNodeTypes: Array.from(visibleNodeTypes),
      searchTerm,
      hiddenNodeIds: Array.from(hiddenNodeIds),
      layout: cyInstance ? {
        positions: cyInstance.nodes().map((node: any) => {
          const pos = node.position();
          return {
            id: node.id(),
            position: { x: pos.x, y: pos.y }
          };
        })
      } : undefined
    };

    const updatedViews = [...savedViews.filter(v => v.name !== newView.name), newView];
    setSavedViews(updatedViews);
    localStorage.setItem(`graph-views-${tenant}-${project}`, JSON.stringify(updatedViews));
    setNewViewName('');
    setShowSaveDialog(false);
  };

  const loadView = (viewName: string) => {
    const view = savedViews.find(v => v.name === viewName);
    if (!view) return;

    setVisibleNodeTypes(new Set(view.visibleNodeTypes));
    setSearchTerm(view.searchTerm);
    setHiddenNodeIds(new Set(view.hiddenNodeIds || []));

    // Restore node positions if saved
    if (view.layout?.positions && cyInstance && Array.isArray(view.layout.positions)) {
      setTimeout(() => {
        try {
          // Stop any running layouts/animations to prevent conflicts
          cyInstance.stop();

          const validPositions = view.layout.positions.filter((pos: any) => {
            return pos && pos.id && pos.position &&
                   typeof pos.position.x === 'number' &&
                   typeof pos.position.y === 'number';
          });

          if (validPositions.length > 0) {
            cyInstance.startBatch();

            validPositions.forEach((pos: any) => {
              const node = cyInstance.$id(pos.id);
              if (node && node.length > 0) {
                node.position({ x: pos.position.x, y: pos.position.y });
              }
            });

            cyInstance.endBatch();
            cyInstance.fit();
          }
        } catch (error) {
          console.error('Error restoring node positions:', error);
          // Just fit the view if position restoration fails
          cyInstance.fit();
        }
      }, 300);
    }
  };

  const deleteView = (viewName: string) => {
    if (!confirm(`Delete view "${viewName}"?`)) return;
    const updatedViews = savedViews.filter(v => v.name !== viewName);
    setSavedViews(updatedViews);
    localStorage.setItem(`graph-views-${tenant}-${project}`, JSON.stringify(updatedViews));
  };

  const hideNode = (nodeId: string) => {
    setHiddenNodeIds(prev => new Set([...prev, nodeId]));
    setContextMenu(null);
  };

  // Advanced context menu functions

  // Neighborhood exploration
  const showNeighbors = (nodeId: string) => {
    if (!cyInstance) return;
    const node = cyInstance.$id(nodeId);
    const neighbors = node.neighborhood();

    neighbors.forEach((ele: any) => {
      if (ele.isNode()) {
        const id = ele.data('id');
        setHiddenNodeIds(prev => {
          const newSet = new Set(prev);
          newSet.delete(id);
          return newSet;
        });
      }
    });
    setContextMenu(null);
  };

  const hideNeighbors = (nodeId: string) => {
    if (!cyInstance) return;
    const node = cyInstance.$id(nodeId);
    const neighbors = node.neighborhood().nodes();

    neighbors.forEach((neighbor: any) => {
      const id = neighbor.data('id');
      setHiddenNodeIds(prev => new Set([...prev, id]));
    });
    setContextMenu(null);
  };

  const expandNeighborhood = (nodeId: string, hops: number) => {
    if (!cyInstance) return;
    const node = cyInstance.$id(nodeId);
    let currentLevel = node;

    for (let i = 0; i < hops; i++) {
      currentLevel = currentLevel.neighborhood();
    }

    currentLevel.nodes().forEach((n: any) => {
      const id = n.data('id');
      setHiddenNodeIds(prev => {
        const newSet = new Set(prev);
        newSet.delete(id);
        return newSet;
      });
    });
    setContextMenu(null);
  };

  const isolateNode = (nodeId: string) => {
    if (!cyInstance) return;
    const node = cyInstance.$id(nodeId);
    const neighborhood = node.neighborhood().nodes();
    const toShow = new Set([nodeId, ...neighborhood.map((n: any) => n.data('id'))]);

    cyInstance.nodes().forEach((n: any) => {
      const id = n.data('id');
      if (!toShow.has(id)) {
        setHiddenNodeIds(prev => new Set([...prev, id]));
      }
    });
    setContextMenu(null);
  };

  // Path finding
  const highlightShortestPath = (sourceId: string) => {
    if (!cyInstance || !selectedNodeInfo) return;

    const source = cyInstance.$id(sourceId);
    const target = cyInstance.$id(selectedNodeInfo.id);

    if (source.id() === target.id()) return;

    const dijkstra = cyInstance.elements().dijkstra({
      root: source,
      weight: () => 1
    });

    const path = dijkstra.pathTo(target);

    if (path && path.length > 0) {
      // Reset previous highlights
      cyInstance.elements().removeClass('path-highlight');

      // Highlight path
      path.addClass('path-highlight');
    }
    setContextMenu(null);
  };

  const showConnectedComponent = (nodeId: string) => {
    if (!cyInstance) return;
    const node = cyInstance.$id(nodeId);
    const component = node.component();
    const componentIds = new Set(component.nodes().map((n: any) => n.data('id')));

    cyInstance.nodes().forEach((n: any) => {
      const id = n.data('id');
      if (!componentIds.has(id)) {
        setHiddenNodeIds(prev => new Set([...prev, id]));
      }
    });
    setContextMenu(null);
  };

  // Visual operations
  const togglePin = (nodeId: string) => {
    setPinnedNodes(prev => {
      const newSet = new Set(prev);
      if (newSet.has(nodeId)) {
        newSet.delete(nodeId);
        if (cyInstance) {
          const node = cyInstance.$id(nodeId);
          node.unlock();
        }
      } else {
        newSet.add(nodeId);
        if (cyInstance) {
          const node = cyInstance.$id(nodeId);
          node.lock();
        }
      }
      return newSet;
    });
    setContextMenu(null);
  };

  const toggleHighlight = (nodeId: string) => {
    setHighlightedNodes(prev => {
      const newSet = new Set(prev);
      if (newSet.has(nodeId)) {
        newSet.delete(nodeId);
      } else {
        newSet.add(nodeId);
      }
      return newSet;
    });
    setContextMenu(null);
  };

  const changeNodeColor = (nodeId: string, color: string) => {
    if (!cyInstance) return;
    const node = cyInstance.$id(nodeId);
    node.style('background-color', color);
    setContextMenu(null);
  };

  // Information & export
  const copyNodeInfo = (nodeId: string) => {
    if (!cyInstance) return;
    const node = cyInstance.$id(nodeId);
    const info = {
      id: node.data('id'),
      label: node.data('label'),
      type: node.data('type'),
      properties: node.data('properties')
    };
    navigator.clipboard.writeText(JSON.stringify(info, null, 2));
    setContextMenu(null);
  };

  const exportSubgraph = (nodeId: string) => {
    if (!cyInstance) return;
    const node = cyInstance.$id(nodeId);
    const subgraph = node.neighborhood();
    const data = {
      nodes: subgraph.nodes().map((n: any) => ({
        id: n.data('id'),
        label: n.data('label'),
        type: n.data('type'),
        properties: n.data('properties')
      })),
      edges: subgraph.edges().map((e: any) => ({
        source: e.data('source'),
        target: e.data('target'),
        type: e.data('label')
      }))
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `subgraph-${nodeId}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setContextMenu(null);
  };

  // Layout operations
  const centerNode = (nodeId: string) => {
    if (!cyInstance) return;
    const node = cyInstance.$id(nodeId);
    cyInstance.center(node);
    setContextMenu(null);
  };

  const resetNodePosition = (nodeId: string) => {
    if (!cyInstance) return;
    // Re-run the layout algorithm
    cyInstance.layout(layout as any).run();
    setContextMenu(null);
  };

  // Recursive context menu item renderer
  const ContextMenuItemComponent = ({ item, depth = 0 }: { item: ContextMenuItem; depth?: number }) => {
    const [showSubmenu, setShowSubmenu] = useState(false);

    if (item.separator) {
      return <div className="context-menu-separator" />;
    }

    if (item.submenu) {
      return (
        <div
          className="context-menu-item context-menu-item-with-submenu"
          onMouseEnter={() => setShowSubmenu(true)}
          onMouseLeave={() => setShowSubmenu(false)}
        >
          <span>{item.label}</span>
          <span className="context-menu-arrow">▶</span>
          {showSubmenu && (
            <div className="context-menu-submenu" style={{ left: '100%', top: 0 }}>
              {item.submenu.map((subitem, idx) => (
                <ContextMenuItemComponent key={idx} item={subitem} depth={depth + 1} />
              ))}
            </div>
          )}
        </div>
      );
    }

    return (
      <div
        className={`context-menu-item ${item.disabled ? 'context-menu-item-disabled' : ''}`}
        onClick={(e) => {
          if (!item.disabled && item.action) {
            e.preventDefault();
            e.stopPropagation();
            item.action();
          }
        }}
      >
        {item.icon && <span className="context-menu-icon">{item.icon}</span>}
        <span>{item.label}</span>
      </div>
    );
  };

  // Generate context menu items based on node type
  const generateContextMenuItems = (nodeId: string, nodeType: string, nodeLabel: string): ContextMenuItem[] => {
    const items: ContextMenuItem[] = [];

    // Neighborhood exploration
    items.push({
      label: '🔍 Explore',
      submenu: [
        { label: 'Show Neighbors', action: () => showNeighbors(nodeId) },
        { label: 'Hide Neighbors', action: () => hideNeighbors(nodeId) },
        { label: 'Expand 2 Hops', action: () => expandNeighborhood(nodeId, 2) },
        { label: 'Expand 3 Hops', action: () => expandNeighborhood(nodeId, 3) },
        { label: 'Isolate Node & Neighbors', action: () => isolateNode(nodeId) }
      ]
    });

    // Path finding (only if another node is selected)
    if (selectedNodeInfo && selectedNodeInfo.id !== nodeId) {
      items.push({
        label: '🛤️ Paths',
        submenu: [
          { label: `Find Path to "${selectedNodeInfo.label}"`, action: () => highlightShortestPath(nodeId) },
          { label: 'Show Connected Component', action: () => showConnectedComponent(nodeId) }
        ]
      });
    }

    items.push({ separator: true });

    // Node type-specific actions
    if (nodeType === 'Requirement') {
      items.push({
        label: '📋 Requirement Actions',
        submenu: [
          { label: 'View Details', action: () => { setSelectedNodeInfo({ id: nodeId, label: nodeLabel, type: nodeType }); setContextMenu(null); } },
          { label: 'Show Traceability', action: () => showNeighbors(nodeId) }
        ]
      });
    } else if (nodeType === 'Document') {
      items.push({
        label: '📄 Document Actions',
        submenu: [
          { label: 'Show All Sections', action: () => showNeighbors(nodeId) },
          { label: 'Show Full Tree', action: () => expandNeighborhood(nodeId, 3) }
        ]
      });
    } else if (nodeType === 'DocumentSection') {
      items.push({
        label: '📑 Section Actions',
        submenu: [
          { label: 'Show Contents', action: () => showNeighbors(nodeId) },
          { label: 'Show Parent Document', action: () => showNeighbors(nodeId) }
        ]
      });
    }

    items.push({ separator: true });

    // Visual operations
    items.push({
      label: '🎨 Visual',
      submenu: [
        { label: pinnedNodes.has(nodeId) ? '📌 Unpin' : '📍 Pin', action: () => togglePin(nodeId) },
        { label: highlightedNodes.has(nodeId) ? '💡 Unhighlight' : '✨ Highlight', action: () => toggleHighlight(nodeId) },
        { label: 'Change Color', submenu: [
          { label: '🔴 Red', action: () => changeNodeColor(nodeId, '#ef4444') },
          { label: '🟢 Green', action: () => changeNodeColor(nodeId, '#22c55e') },
          { label: '🔵 Blue', action: () => changeNodeColor(nodeId, '#3b82f6') },
          { label: '🟡 Yellow', action: () => changeNodeColor(nodeId, '#eab308') },
          { label: '🟣 Purple', action: () => changeNodeColor(nodeId, '#a855f7') }
        ]}
      ]
    });

    items.push({ separator: true });

    // Information & Export
    items.push({
      label: '📤 Export',
      submenu: [
        { label: 'Copy Node Info', action: () => copyNodeInfo(nodeId) },
        { label: 'Export Subgraph (JSON)', action: () => exportSubgraph(nodeId) }
      ]
    });

    items.push({ separator: true });

    // Layout operations
    items.push({
      label: '⚙️ Layout',
      submenu: [
        { label: 'Center Node', action: () => centerNode(nodeId) },
        { label: 'Reset Position', action: () => resetNodePosition(nodeId) }
      ]
    });

    items.push({ separator: true });

    // Basic actions
    items.push({ label: '👁️ Hide Node', action: () => hideNode(nodeId) });

    return items;
  };

  return (
    <div className="graph-viewer-container">
      <div className="graph-viewer-header">
        <h1>Graph Database Viewer</h1>
        <div className="graph-viewer-controls">
          <input
            type="text"
            placeholder="Search nodes..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="graph-search-input"
          />
          <button onClick={handleResetLayout} className="graph-control-btn">
            Reset Layout
          </button>
          <button onClick={handleFitView} className="graph-control-btn">
            Fit View
          </button>
          <button onClick={handleZoomIn} className="graph-control-btn">
            Zoom In
          </button>
          <button onClick={handleZoomOut} className="graph-control-btn">
            Zoom Out
          </button>
          <button onClick={() => setShowSaveDialog(true)} className="graph-control-btn">
            Save View
          </button>
        </div>
      </div>

      <div className="graph-filters">
        <div className="filter-section">
          <h3>Filter Node Types:</h3>
          <div className="filter-checkboxes">
            {nodeTypes.map(type => (
              <label key={type} className="filter-checkbox">
                <input
                  type="checkbox"
                  checked={visibleNodeTypes.has(type)}
                  onChange={() => toggleNodeType(type)}
                />
                <span>{type}</span>
              </label>
            ))}
          </div>
        </div>

        {savedViews.length > 0 && (
          <div className="saved-views-section">
            <h3>Saved Views:</h3>
            <div className="saved-views-list">
              {savedViews.map(view => (
                <div key={view.name} className="saved-view-item">
                  <button
                    onClick={() => loadView(view.name)}
                    className="saved-view-load-btn"
                    title={`Load view: ${view.name}`}
                  >
                    {view.name}
                  </button>
                  <button
                    onClick={() => deleteView(view.name)}
                    className="saved-view-delete-btn"
                    title="Delete view"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="graph-viewer-content">
        <div className="graph-canvas-container">
          <CytoscapeComponent
            elements={elements}
            stylesheet={stylesheet as any}
            layout={layout as any}
            style={{ width: "100%", height: "100%" }}
            cy={(cy) => setCyInstance(cy)}
          />
        </div>

        {selectedNodeInfo && (
          <div className="graph-inspector-panel">
            <div className="inspector-header">
              <h3>Node Details</h3>
              <button
                onClick={() => setSelectedNodeInfo(null)}
                className="inspector-close"
              >
                ×
              </button>
            </div>
            <div className="inspector-content">
              <div className="inspector-field">
                <label>ID:</label>
                <span>{selectedNodeInfo.id}</span>
              </div>
              <div className="inspector-field">
                <label>Label:</label>
                <span>{selectedNodeInfo.label}</span>
              </div>
              <div className="inspector-field">
                <label>Type:</label>
                <span className="node-type-badge">{selectedNodeInfo.type}</span>
              </div>
              {selectedNodeInfo.properties && (
                <div className="inspector-field">
                  <label>Properties:</label>
                  <pre className="properties-json">
                    {JSON.stringify(selectedNodeInfo.properties, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="graph-legend">
        <h4>Legend</h4>
        <div className="legend-items">
          <div className="legend-item">
            <span className="legend-color" style={{ background: "#8b5cf6" }}></span>
            <span>Tenant</span>
          </div>
          <div className="legend-item">
            <span className="legend-color" style={{ background: "#06b6d4" }}></span>
            <span>Project</span>
          </div>
          <div className="legend-item">
            <span className="legend-color" style={{ background: "#10b981" }}></span>
            <span>Document</span>
          </div>
          <div className="legend-item">
            <span className="legend-color" style={{ background: "#f59e0b" }}></span>
            <span>Section</span>
          </div>
          <div className="legend-item">
            <span className="legend-color" style={{ background: "#3b82f6" }}></span>
            <span>Requirement</span>
          </div>
          <div className="legend-item">
            <span className="legend-color" style={{ background: "#ec4899" }}></span>
            <span>LinkSet</span>
          </div>
        </div>
      </div>

      {showSaveDialog && (
        <div className="save-dialog-overlay" onClick={() => setShowSaveDialog(false)}>
          <div className="save-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="save-dialog-header">
              <h3>Save Current View</h3>
              <button
                onClick={() => setShowSaveDialog(false)}
                className="save-dialog-close"
              >
                ×
              </button>
            </div>
            <div className="save-dialog-content">
              <label htmlFor="view-name">View Name:</label>
              <input
                id="view-name"
                type="text"
                value={newViewName}
                onChange={(e) => setNewViewName(e.target.value)}
                placeholder="Enter view name..."
                className="save-dialog-input"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    saveCurrentView();
                  } else if (e.key === 'Escape') {
                    setShowSaveDialog(false);
                  }
                }}
                autoFocus
              />
            </div>
            <div className="save-dialog-footer">
              <button
                onClick={() => setShowSaveDialog(false)}
                className="save-dialog-btn save-dialog-btn-cancel"
              >
                Cancel
              </button>
              <button
                onClick={saveCurrentView}
                className="save-dialog-btn save-dialog-btn-save"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {contextMenu && (() => {
        const menuItems = generateContextMenuItems(contextMenu.nodeId, contextMenu.nodeType, contextMenu.nodeLabel);
        return (
          <div
            className="context-menu"
            style={{
              left: `${contextMenu.x}px`,
              top: `${contextMenu.y}px`
            }}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
          >
            {menuItems.map((item, idx) => (
              <ContextMenuItemComponent key={idx} item={item} />
            ))}
          </div>
        );
      })()}
    </div>
  );
}
