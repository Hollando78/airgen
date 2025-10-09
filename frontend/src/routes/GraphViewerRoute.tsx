import { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import CytoscapeComponent from "react-cytoscapejs";
import type { Core, ElementDefinition } from "cytoscape";
import cytoscape from "cytoscape";
import cytoscapeDagre from "cytoscape-dagre";
import cytoscapeFcose from "cytoscape-fcose";
import { useApiClient } from "../lib/client";
import { useTenantProject } from "../hooks/useTenantProject";
import "./graphViewer.css";

// Register layout extensions
cytoscape.use(cytoscapeDagre);
cytoscape.use(cytoscapeFcose);

export function GraphViewerRoute() {
  const api = useApiClient();
  const { state } = useTenantProject();
  const { tenant, project } = state;
  const [cyInstance, setCyInstance] = useState<Core | null>(null);
  const [selectedNodeInfo, setSelectedNodeInfo] = useState<any>(null);
  const [visibleNodeTypes, setVisibleNodeTypes] = useState<Set<string>>(new Set([
    'Tenant', 'Project', 'Document', 'DocumentSection', 'Requirement', 'Info', 'SurrogateReference', 'DocumentLinkset', 'TraceLink', 'RequirementCandidate', 'ArchitectureDiagram', 'ArchitectureBlock', 'ArchitectureConnector'
  ]));
  const [searchTerm, setSearchTerm] = useState('');
  const [hiddenNodeIds, setHiddenNodeIds] = useState<Set<string>>(new Set());
  const [selectedLayout, setSelectedLayout] = useState('cose');
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
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const cyRef = useRef<HTMLDivElement>(null);

  // Edge styling customization
  type EdgeStyle = {
    color: string;
    width: number;
    lineStyle: 'solid' | 'dashed' | 'dotted';
    dashPattern?: number[];
  };

  const [edgeStyles, setEdgeStyles] = useState<Map<string, EdgeStyle>>(() => {
    // Load saved edge styles from localStorage
    const saved = localStorage.getItem(`graph-edge-styles-${tenant}-${project}`);
    if (saved) {
      const parsed = JSON.parse(saved);
      return new Map(Object.entries(parsed));
    }
    return new Map();
  });

  // Edge context menu state
  const [edgeContextMenu, setEdgeContextMenu] = useState<{
    x: number;
    y: number;
    edgeId: string;
    edgeLabel: string;
    sourceLabel: string;
    targetLabel: string;
  } | null>(null);

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

  // Build dynamic edge styles from customizations
  const buildEdgeStylesheets = () => {
    const dynamicStyles: any[] = [];

    edgeStyles.forEach((style, edgeType) => {
      const dashPattern = style.lineStyle === 'dashed' ? [10, 5] :
                         style.lineStyle === 'dotted' ? [2, 4] : undefined;

      dynamicStyles.push({
        selector: `edge[label='${edgeType}']`,
        style: {
          width: style.width,
          "line-color": style.color,
          "target-arrow-color": style.color,
          "line-style": style.lineStyle === 'solid' ? 'solid' : style.lineStyle === 'dashed' ? 'dashed' : 'dotted',
          ...(dashPattern && { "line-dash-pattern": dashPattern }),
          "curve-style": "bezier",
          "font-size": "11px",
          "font-weight": "600",
          color: style.color,
          "text-background-color": "#ffffff",
          "text-background-opacity": 0.8,
          "text-background-padding": "3px"
        }
      });
    });

    return dynamicStyles;
  };

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
      selector: "node[type='TraceLink']",
      style: {
        "background-color": "#a855f7",
        "border-color": "#9333ea",
        width: "40px",
        height: "40px",
        "font-size": "10px"
      }
    },
    {
      selector: "node[type='ArchitectureDiagram']",
      style: {
        "background-color": "#14b8a6",
        "border-color": "#0d9488"
      }
    },
    {
      selector: "node[type='ArchitectureBlock']",
      style: {
        "background-color": "#6366f1",
        "border-color": "#4f46e5"
      }
    },
    {
      selector: "node[type='ArchitectureConnector']",
      style: {
        "background-color": "#84cc16",
        "border-color": "#65a30d",
        width: "40px",
        height: "40px",
        "font-size": "10px"
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
    // Dynamic edge styles from customizations
    ...buildEdgeStylesheets(),
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

  // Layout configurations
  const getLayoutConfig = (layoutName: string) => {
    const baseConfig = {
      fit: true,
      padding: 30,
      animate: true,
      animationDuration: 500
    };

    switch (layoutName) {
      case 'cose':
        return {
          ...baseConfig,
          name: 'cose',
          idealEdgeLength: 100,
          nodeOverlap: 20,
          refresh: 20,
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
      case 'dagre':
        return {
          ...baseConfig,
          name: 'dagre',
          rankDir: 'TB', // Top to bottom
          ranker: 'network-simplex',
          nodeSep: 50,
          edgeSep: 10,
          rankSep: 75
        };
      case 'fcose':
        return {
          ...baseConfig,
          name: 'fcose',
          quality: 'default',
          randomize: false,
          animate: 'end',
          nodeSeparation: 75,
          idealEdgeLength: 100,
          edgeElasticity: 0.45,
          nestingFactor: 0.1,
          gravity: 0.25,
          numIter: 2500,
          initialTemp: 200,
          coolingFactor: 0.95,
          minTemp: 1.0
        };
      case 'circle':
        return {
          ...baseConfig,
          name: 'circle',
          radius: 300,
          startAngle: 0,
          sweep: undefined,
          clockwise: true,
          spacingFactor: 1.75
        };
      case 'grid':
        return {
          ...baseConfig,
          name: 'grid',
          rows: undefined,
          cols: undefined,
          position: (node: any) => ({ row: 0, col: 0 }),
          condense: false,
          avoidOverlap: true,
          avoidOverlapPadding: 10
        };
      case 'breadthfirst':
        return {
          ...baseConfig,
          name: 'breadthfirst',
          directed: true,
          spacingFactor: 1.5,
          avoidOverlap: true,
          nodeDimensionsIncludeLabels: true
        };
      case 'concentric':
        return {
          ...baseConfig,
          name: 'concentric',
          minNodeSpacing: 50,
          levelWidth: (nodes: any) => nodes.maxDegree() / 4,
          concentric: (node: any) => node.degree(),
          equidistant: false,
          startAngle: 0,
          clockwise: true
        };
      default:
        return {
          ...baseConfig,
          name: 'cose'
        };
    }
  };

  const layout = getLayoutConfig(selectedLayout);

  // Function to apply a new layout
  const applyLayout = (layoutName: string) => {
    if (cyInstance) {
      setSelectedLayout(layoutName);
      const layoutConfig = getLayoutConfig(layoutName);

      // Apply layout only to visible nodes
      const visibleNodes = cyInstance.nodes().filter((node: any) => {
        return node.style('display') !== 'none';
      });

      visibleNodes.layout(layoutConfig).run();
    }
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

      // Re-apply layout to visible nodes only
      const layoutConfig = getLayoutConfig(selectedLayout);
      const visibleNodes = cyInstance.nodes().filter((node: any) => {
        return node.style('display') !== 'none';
      });

      if (visibleNodes.length > 0) {
        visibleNodes.layout(layoutConfig).run();
      }
    }
  }, [cyInstance, visibleNodeTypes, searchTerm, hiddenNodeIds, selectedLayout]);

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
          setEdgeContextMenu(null);
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

      const handleEdgeRightClick = (event: any) => {
        const edge = event.target;
        const originalEvent = event.originalEvent;

        if (originalEvent) {
          originalEvent.preventDefault();
          originalEvent.stopPropagation();
        }

        const edgeId = edge.data("id");
        const edgeLabel = edge.data("label");
        const sourceNode = edge.source();
        const targetNode = edge.target();

        setEdgeContextMenu({
          x: originalEvent ? originalEvent.clientX : 0,
          y: originalEvent ? originalEvent.clientY : 0,
          edgeId,
          edgeLabel,
          sourceLabel: sourceNode.data("label"),
          targetLabel: targetNode.data("label")
        });
      };

      cyInstance.on("tap", "node", handleNodeTap);
      cyInstance.on("tap", handleBackgroundTap);
      cyInstance.on("cxttap", "node", handleNodeRightClick);
      cyInstance.on("cxttap", "edge", handleEdgeRightClick);

      return () => {
        cyInstance.off("tap", "node", handleNodeTap);
        cyInstance.off("tap", handleBackgroundTap);
        cyInstance.off("cxttap", "node", handleNodeRightClick);
        cyInstance.off("cxttap", "edge", handleEdgeRightClick);
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
    const handleClick = () => {
      setContextMenu(null);
      setEdgeContextMenu(null);
    };
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

  // Node type categories
  const nodeTypeCategories = {
    'System': ['Tenant', 'Project'],
    'Document Structure': ['Document', 'DocumentSection', 'Info', 'SurrogateReference'],
    'Requirements': ['Requirement', 'RequirementCandidate'],
    'Architecture': ['ArchitectureDiagram', 'ArchitectureBlock', 'ArchitectureConnector'],
    'Traceability': ['DocumentLinkset', 'TraceLink']
  };

  const nodeTypes = Object.values(nodeTypeCategories).flat();

  const toggleNodeType = (type: string) => {
    const newVisible = new Set(visibleNodeTypes);
    if (newVisible.has(type)) {
      newVisible.delete(type);
    } else {
      newVisible.add(type);
    }
    setVisibleNodeTypes(newVisible);
  };

  const selectAllInCategory = (types: string[]) => {
    const newVisible = new Set(visibleNodeTypes);
    types.forEach(type => newVisible.add(type));
    setVisibleNodeTypes(newVisible);
  };

  const deselectAllInCategory = (types: string[]) => {
    const newVisible = new Set(visibleNodeTypes);
    types.forEach(type => newVisible.delete(type));
    setVisibleNodeTypes(newVisible);
  };

  const toggleCategory = (category: string) => {
    const newCollapsed = new Set(collapsedCategories);
    if (newCollapsed.has(category)) {
      newCollapsed.delete(category);
    } else {
      newCollapsed.add(category);
    }
    setCollapsedCategories(newCollapsed);
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

  // Edge styling functions
  const applyEdgeStyle = (edgeLabel: string, style: EdgeStyle) => {
    const newEdgeStyles = new Map(edgeStyles);
    newEdgeStyles.set(edgeLabel, style);
    setEdgeStyles(newEdgeStyles);

    // Save to localStorage
    const stylesObj: any = {};
    newEdgeStyles.forEach((value, key) => {
      stylesObj[key] = value;
    });
    localStorage.setItem(`graph-edge-styles-${tenant}-${project}`, JSON.stringify(stylesObj));

    setEdgeContextMenu(null);
  };

  const resetEdgeStyle = (edgeLabel: string) => {
    const newEdgeStyles = new Map(edgeStyles);
    newEdgeStyles.delete(edgeLabel);
    setEdgeStyles(newEdgeStyles);

    // Save to localStorage
    const stylesObj: any = {};
    newEdgeStyles.forEach((value, key) => {
      stylesObj[key] = value;
    });
    localStorage.setItem(`graph-edge-styles-${tenant}-${project}`, JSON.stringify(stylesObj));

    setEdgeContextMenu(null);
  };

  const resetAllEdgeStyles = () => {
    setEdgeStyles(new Map());
    localStorage.removeItem(`graph-edge-styles-${tenant}-${project}`);
  };

  // Generate edge context menu items
  const generateEdgeContextMenuItems = (edgeLabel: string, sourceLabel: string, targetLabel: string): ContextMenuItem[] => {
    const items: ContextMenuItem[] = [];
    const currentStyle = edgeStyles.get(edgeLabel);

    items.push({
      label: `🎨 Style "${edgeLabel}" Edges`,
      submenu: [
        {
          label: 'Color',
          submenu: [
            { label: '🔴 Red', action: () => applyEdgeStyle(edgeLabel, { color: '#ef4444', width: currentStyle?.width || 3, lineStyle: currentStyle?.lineStyle || 'solid' }) },
            { label: '🟠 Orange', action: () => applyEdgeStyle(edgeLabel, { color: '#f97316', width: currentStyle?.width || 3, lineStyle: currentStyle?.lineStyle || 'solid' }) },
            { label: '🟡 Yellow', action: () => applyEdgeStyle(edgeLabel, { color: '#eab308', width: currentStyle?.width || 3, lineStyle: currentStyle?.lineStyle || 'solid' }) },
            { label: '🟢 Green', action: () => applyEdgeStyle(edgeLabel, { color: '#22c55e', width: currentStyle?.width || 3, lineStyle: currentStyle?.lineStyle || 'solid' }) },
            { label: '🔵 Blue', action: () => applyEdgeStyle(edgeLabel, { color: '#3b82f6', width: currentStyle?.width || 3, lineStyle: currentStyle?.lineStyle || 'solid' }) },
            { label: '🟣 Purple', action: () => applyEdgeStyle(edgeLabel, { color: '#a855f7', width: currentStyle?.width || 3, lineStyle: currentStyle?.lineStyle || 'solid' }) },
            { label: '🩷 Pink', action: () => applyEdgeStyle(edgeLabel, { color: '#ec4899', width: currentStyle?.width || 3, lineStyle: currentStyle?.lineStyle || 'solid' }) },
            { label: '🩵 Teal', action: () => applyEdgeStyle(edgeLabel, { color: '#14b8a6', width: currentStyle?.width || 3, lineStyle: currentStyle?.lineStyle || 'solid' }) }
          ]
        },
        {
          label: 'Line Style',
          submenu: [
            { label: '━ Solid', action: () => applyEdgeStyle(edgeLabel, { color: currentStyle?.color || '#94a3b8', width: currentStyle?.width || 3, lineStyle: 'solid' }) },
            { label: '╌ Dashed', action: () => applyEdgeStyle(edgeLabel, { color: currentStyle?.color || '#94a3b8', width: currentStyle?.width || 3, lineStyle: 'dashed' }) },
            { label: '┈ Dotted', action: () => applyEdgeStyle(edgeLabel, { color: currentStyle?.color || '#94a3b8', width: currentStyle?.width || 3, lineStyle: 'dotted' }) }
          ]
        },
        {
          label: 'Width',
          submenu: [
            { label: 'Thin (2px)', action: () => applyEdgeStyle(edgeLabel, { color: currentStyle?.color || '#94a3b8', width: 2, lineStyle: currentStyle?.lineStyle || 'solid' }) },
            { label: 'Normal (3px)', action: () => applyEdgeStyle(edgeLabel, { color: currentStyle?.color || '#94a3b8', width: 3, lineStyle: currentStyle?.lineStyle || 'solid' }) },
            { label: 'Thick (4px)', action: () => applyEdgeStyle(edgeLabel, { color: currentStyle?.color || '#94a3b8', width: 4, lineStyle: currentStyle?.lineStyle || 'solid' }) },
            { label: 'Extra Thick (5px)', action: () => applyEdgeStyle(edgeLabel, { color: currentStyle?.color || '#94a3b8', width: 5, lineStyle: currentStyle?.lineStyle || 'solid' }) }
          ]
        },
        { separator: true },
        { label: '🔄 Reset Style', action: () => resetEdgeStyle(edgeLabel), disabled: !currentStyle }
      ]
    });

    items.push({ separator: true });

    items.push({
      label: `📍 ${sourceLabel} → ${targetLabel}`,
      disabled: true
    });

    return items;
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
            <div className="context-menu-submenu" style={{ left: '100%', top: 0, zIndex: 1001 + depth }}>
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
    } else if (nodeType === 'ArchitectureDiagram') {
      items.push({
        label: '🏗️ Diagram Actions',
        submenu: [
          { label: 'Show All Blocks', action: () => showNeighbors(nodeId) },
          { label: 'Show Connectors', action: () => showNeighbors(nodeId) },
          { label: 'Show Full Diagram', action: () => expandNeighborhood(nodeId, 2) }
        ]
      });
    } else if (nodeType === 'ArchitectureBlock') {
      items.push({
        label: '🧱 Block Actions',
        submenu: [
          { label: 'Show Diagrams Using This Block', action: () => showNeighbors(nodeId) },
          { label: 'Show Connected Blocks', action: () => expandNeighborhood(nodeId, 2) }
        ]
      });
    } else if (nodeType === 'ArchitectureConnector') {
      items.push({
        label: '🔗 Connector Actions',
        submenu: [
          { label: 'Show Source & Target', action: () => showNeighbors(nodeId) },
          { label: 'Show Parent Diagram', action: () => showNeighbors(nodeId) }
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
          <select
            value={selectedLayout}
            onChange={(e) => applyLayout(e.target.value)}
            className="graph-control-btn"
            style={{
              padding: '0.5rem 0.75rem',
              fontSize: '0.875rem',
              cursor: 'pointer',
              minWidth: '180px'
            }}
          >
            <option value="cose">CoSE (Force-Directed)</option>
            <option value="fcose">fCoSE (Fast)</option>
            <option value="dagre">Dagre (Hierarchical)</option>
            <option value="breadthfirst">Breadth-First</option>
            <option value="circle">Circle</option>
            <option value="concentric">Concentric</option>
            <option value="grid">Grid</option>
          </select>
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
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="graph-control-btn">
            {sidebarOpen ? 'Hide Filters' : 'Show Filters'}
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', flex: 1, position: 'relative', overflow: 'hidden' }}>
        <div className="graph-viewer-content" style={{ flex: 1 }}>
          <CytoscapeComponent
            elements={elements}
            stylesheet={stylesheet as any}
            layout={layout as any}
            style={{ width: "100%", height: "100%" }}
            cy={(cy) => setCyInstance(cy)}
          />

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

        {/* Sidebar for filters */}
        <div style={{
          position: 'absolute',
          right: sidebarOpen ? 0 : '-320px',
          top: 0,
          bottom: 0,
          width: '320px',
          backgroundColor: 'white',
          boxShadow: '-2px 0 8px rgba(0,0,0,0.1)',
          transition: 'right 0.3s ease-in-out',
          zIndex: 100,
          display: 'flex',
          flexDirection: 'column',
          overflowY: 'auto'
        }}>
          <div style={{
            padding: '16px',
            borderBottom: '2px solid #e5e7eb',
            backgroundColor: '#f9fafb',
            position: 'sticky',
            top: 0,
            zIndex: 10
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: '700', margin: 0 }}>Filters & Controls</h2>
              <button
                onClick={() => setSidebarOpen(false)}
                style={{
                  padding: '4px 8px',
                  fontSize: '18px',
                  cursor: 'pointer',
                  backgroundColor: 'transparent',
                  border: 'none',
                  color: '#6b7280'
                }}
                title="Close sidebar"
              >
                ×
              </button>
            </div>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button
                onClick={() => setVisibleNodeTypes(new Set(nodeTypes))}
                style={{
                  flex: 1,
                  padding: '6px 12px',
                  fontSize: '12px',
                  cursor: 'pointer',
                  backgroundColor: '#6366f1',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  fontWeight: '500'
                }}
              >
                Select All
              </button>
              <button
                onClick={() => setVisibleNodeTypes(new Set())}
                style={{
                  flex: 1,
                  padding: '6px 12px',
                  fontSize: '12px',
                  cursor: 'pointer',
                  backgroundColor: '#6b7280',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  fontWeight: '500'
                }}
              >
                Clear All
              </button>
            </div>
          </div>

          <div style={{ flex: 1, padding: '16px' }}>
            {Object.entries(nodeTypeCategories).map(([category, types]) => {
              const isCollapsed = collapsedCategories.has(category);
              const allSelected = types.every(t => visibleNodeTypes.has(t));
              const someSelected = types.some(t => visibleNodeTypes.has(t)) && !allSelected;

              return (
                <div key={category} style={{ marginBottom: '16px', paddingBottom: '12px', borderBottom: '1px solid #e5e7eb' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <button
                      onClick={() => toggleCategory(category)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        fontSize: '14px',
                        fontWeight: '600',
                        color: '#111827',
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        padding: '4px 0'
                      }}
                    >
                      <span style={{ fontSize: '12px' }}>{isCollapsed ? '▶' : '▼'}</span>
                      <span>{category}</span>
                      <span style={{
                        fontSize: '11px',
                        padding: '2px 6px',
                        borderRadius: '10px',
                        backgroundColor: allSelected ? '#dcfce7' : someSelected ? '#fef3c7' : '#f3f4f6',
                        color: allSelected ? '#166534' : someSelected ? '#92400e' : '#6b7280',
                        fontWeight: '600'
                      }}>
                        {types.filter(t => visibleNodeTypes.has(t)).length}/{types.length}
                      </span>
                    </button>
                    {!isCollapsed && (
                      <div style={{ display: 'flex', gap: '4px' }}>
                        <button
                          onClick={() => selectAllInCategory(types)}
                          style={{
                            padding: '4px 8px',
                            fontSize: '11px',
                            cursor: 'pointer',
                            backgroundColor: '#10b981',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            fontWeight: '500'
                          }}
                          title={`Select all ${category}`}
                        >
                          All
                        </button>
                        <button
                          onClick={() => deselectAllInCategory(types)}
                          style={{
                            padding: '4px 8px',
                            fontSize: '11px',
                            cursor: 'pointer',
                            backgroundColor: '#ef4444',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            fontWeight: '500'
                          }}
                          title={`Deselect all ${category}`}
                        >
                          None
                        </button>
                      </div>
                    )}
                  </div>
                  {!isCollapsed && (
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr',
                      gap: '6px',
                      marginTop: '8px'
                    }}>
                      {types.map(type => (
                        <label key={type} style={{
                          display: 'flex',
                          alignItems: 'center',
                          cursor: 'pointer',
                          padding: '6px 8px',
                          backgroundColor: visibleNodeTypes.has(type) ? '#eff6ff' : '#f9fafb',
                          border: `1px solid ${visibleNodeTypes.has(type) ? '#3b82f6' : '#e5e7eb'}`,
                          borderRadius: '6px',
                          transition: 'all 0.15s'
                        }}>
                          <input
                            type="checkbox"
                            checked={visibleNodeTypes.has(type)}
                            onChange={() => toggleNodeType(type)}
                            style={{ marginRight: '8px', cursor: 'pointer', width: '16px', height: '16px' }}
                          />
                          <span style={{ fontSize: '13px', fontWeight: visibleNodeTypes.has(type) ? '500' : '400' }}>{type}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {savedViews.length > 0 && (
            <div style={{ padding: '16px', borderTop: '2px solid #e5e7eb', backgroundColor: '#f9fafb' }}>
              <h3 style={{ fontSize: '14px', margin: '0 0 12px 0', fontWeight: '600' }}>Saved Views</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {savedViews.map(view => (
                  <div key={view.name} style={{ display: 'flex', gap: '8px' }}>
                    <button
                      onClick={() => loadView(view.name)}
                      style={{
                        flex: 1,
                        padding: '8px 12px',
                        fontSize: '13px',
                        cursor: 'pointer',
                        backgroundColor: 'white',
                        border: '1px solid #d1d5db',
                        borderRadius: '6px',
                        textAlign: 'left',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        fontWeight: '500'
                      }}
                      title={view.name}
                    >
                      {view.name}
                    </button>
                    <button
                      onClick={() => deleteView(view.name)}
                      style={{
                        padding: '8px 12px',
                        fontSize: '14px',
                        cursor: 'pointer',
                        backgroundColor: '#ef4444',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px'
                      }}
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
          <div className="legend-item">
            <span className="legend-color" style={{ background: "#a855f7" }}></span>
            <span>TraceLink</span>
          </div>
          <div className="legend-item">
            <span className="legend-color" style={{ background: "#14b8a6" }}></span>
            <span>Arch Diagram</span>
          </div>
          <div className="legend-item">
            <span className="legend-color" style={{ background: "#6366f1" }}></span>
            <span>Arch Block</span>
          </div>
          <div className="legend-item">
            <span className="legend-color" style={{ background: "#84cc16" }}></span>
            <span>Connector</span>
          </div>
          {edgeStyles.size > 0 && (
            <div className="legend-item" style={{ borderTop: "1px solid #e5e7eb", marginTop: "8px", paddingTop: "8px" }}>
              <span style={{ fontSize: "12px", fontWeight: "700", display: "block", marginBottom: "8px" }}>Custom Edge Styles</span>
            </div>
          )}
          {Array.from(edgeStyles.entries()).map(([edgeType, style]) => {
            const linePattern =
              style.lineStyle === 'dashed'
                ? `linear-gradient(to right, ${style.color} 50%, transparent 50%)`
                : style.lineStyle === 'dotted'
                ? `repeating-linear-gradient(to right, ${style.color} 0px, ${style.color} 2px, transparent 2px, transparent 4px)`
                : style.color;

            const backgroundSize = style.lineStyle === 'dashed' ? '10px 100%' : undefined;

            return (
              <div key={edgeType} className="legend-item">
                <span className="legend-edge" style={{
                  display: "inline-block",
                  width: "20px",
                  height: `${style.width}px`,
                  background: linePattern,
                  backgroundSize,
                  marginRight: "8px",
                  verticalAlign: "middle"
                }}></span>
                <span style={{ fontSize: "11px", fontWeight: "600" }}>{edgeType}</span>
              </div>
            );
          })}
          {edgeStyles.size > 0 && (
            <div className="legend-item" style={{ marginTop: "8px" }}>
              <button
                onClick={() => {
                  if (confirm('Reset all edge styles?')) {
                    resetAllEdgeStyles();
                  }
                }}
                style={{
                  padding: '4px 8px',
                  fontSize: '11px',
                  cursor: 'pointer',
                  backgroundColor: '#ef4444',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  fontWeight: '500',
                  width: '100%'
                }}
              >
                Reset All Edge Styles
              </button>
            </div>
          )}
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

      {edgeContextMenu && (() => {
        const menuItems = generateEdgeContextMenuItems(edgeContextMenu.edgeLabel, edgeContextMenu.sourceLabel, edgeContextMenu.targetLabel);
        return (
          <div
            className="context-menu"
            style={{
              left: `${edgeContextMenu.x}px`,
              top: `${edgeContextMenu.y}px`
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
