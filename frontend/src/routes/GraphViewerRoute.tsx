import { useRef, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Core, ElementDefinition } from "cytoscape";
import cytoscape from "cytoscape";
import cytoscapeDagre from "cytoscape-dagre";
import cytoscapeFcose from "cytoscape-fcose";
import { useApiClient } from "../lib/client";
import { useTenantProject } from "../hooks/useTenantProject";
import { NODE_TYPE_CATEGORIES, DEFAULT_VISIBLE_NODE_TYPES, DEFAULT_LAYOUT } from "./graph-viewer/graphConfig";
import { getEdgeWeight, isHierarchicalEdge } from "./graph-viewer/graphHelpers";
import * as graphOps from "./graph-viewer/graphOperations";
import * as menuActions from "./graph-viewer/contextMenuActions";
import { useGraphState } from "./graph-viewer/hooks/useGraphState";
import { useGraphFilters } from "./graph-viewer/hooks/useGraphFilters";
import { useGraphLayout } from "./graph-viewer/hooks/useGraphLayout";
import { useSavedViews } from "./graph-viewer/hooks/useSavedViews";
import { useContextMenus, type ContextMenuItem } from "./graph-viewer/hooks/useContextMenus";
import { useEdgeStyles, type EdgeStyle } from "./graph-viewer/hooks/useEdgeStyles";
import { GraphControls } from "./graph-viewer/components/GraphControls";
import { GraphInspector } from "./graph-viewer/components/GraphInspector";
import { GraphCanvas } from "./graph-viewer/components/GraphCanvas";
import { GraphLegendNodes } from "./graph-viewer/components/GraphLegendNodes";
import { GraphLegendRelationships } from "./graph-viewer/components/GraphLegendRelationships";
import { SaveViewDialog } from "./graph-viewer/components/SaveViewDialog";
import { GraphContextMenu } from "./graph-viewer/components/GraphContextMenu";
import "./graphViewer.css";

// Register layout extensions
cytoscape.use(cytoscapeDagre);
cytoscape.use(cytoscapeFcose);

export function GraphViewerRoute() {
  const api = useApiClient();
  const { state } = useTenantProject();
  const { tenant, project } = state;
  const cyRef = useRef<HTMLDivElement>(null);

  // Custom hooks for state management
  const graphState = useGraphState();
  const {
    cyInstance,
    selectedNodeInfo,
    pinnedNodes,
    highlightedNodes,
    setCyInstance,
    setSelectedNodeInfo,
    togglePin,
    toggleHighlight,
  } = graphState;

  const graphFilters = useGraphFilters();
  const {
    visibleNodeTypes,
    searchTerm,
    hiddenNodeIds,
    showOnlyHierarchy,
    collapsedCategories,
    sidebarOpen,
    setVisibleNodeTypes,
    setSearchTerm,
    setHiddenNodeIds,
    setShowOnlyHierarchy,
    setSidebarOpen,
    toggleNodeType,
    selectAllInCategory,
    deselectAllInCategory,
    toggleCategory,
    hideNode,
  } = graphFilters;

  const graphLayout = useGraphLayout();
  const {
    selectedLayout,
    hasInitialLayout,
    autoFitEnabled,
    setSelectedLayout,
    setHasInitialLayout,
    setAutoFitEnabled,
  } = graphLayout;

  const savedViewsState = useSavedViews(tenant, project);
  const {
    savedViews,
    showSaveDialog,
    newViewName,
    setShowSaveDialog,
    setNewViewName,
    saveCurrentView: saveView,
    loadView,
    deleteView,
  } = savedViewsState;

  const contextMenusState = useContextMenus();
  const {
    contextMenu,
    edgeContextMenu,
    setContextMenu,
    setEdgeContextMenu,
    closeMenus,
  } = contextMenusState;

  const edgeStylesState = useEdgeStyles(tenant, project);
  const {
    edgeStyles,
    applyEdgeStyle,
    resetEdgeStyle,
    resetAllEdgeStyles,
  } = edgeStylesState;

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

  // Transform Neo4j data to Cytoscape format WITH edge metadata for hierarchy
  // Memoized to prevent unnecessary re-creation that could trigger layout reapplication
  const elements: ElementDefinition[] = useMemo(() =>
    graphData
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
          // Edges WITH weight and hierarchy metadata
          ...graphData.relationships.map((rel: any) => ({
            data: {
              id: rel.id,
              source: rel.source,
              target: rel.target,
              label: rel.type,
              properties: rel.properties,
              // NEW: Add edge metadata for layout algorithms
              weight: getEdgeWeight(rel.type),
              isHierarchical: isHierarchicalEdge(rel.type)
            }
          })).filter((edge: any) => {
            // Filter edges based on hierarchy toggle
            if (showOnlyHierarchy) {
              return edge.data.isHierarchical;
            }
            return true;
          })
        ]
      : [],
    [graphData, showOnlyHierarchy]
  );

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
          "font-weight": "bold",
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
  // Memoized to prevent unnecessary recreation
  const stylesheet = useMemo(() => [
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
    // NEW: Hierarchical edges (stronger, darker) - applies to all hierarchical edges
    {
      selector: "edge[isHierarchical]",
      style: {
        width: 3,
        "line-color": "#334155",
        "target-arrow-color": "#334155",
        "target-arrow-shape": "triangle",
        "curve-style": "bezier",
        "font-weight": "bold",
        "font-size": "11px",
        color: "#1e293b"
      }
    },
    // NEW: Strong hierarchy edges (OWNS, HAS_DOCUMENT, HAS_SECTION, CONTAINS)
    {
      selector: "edge[weight >= 100]",
      style: {
        width: 4,
        "line-color": "#1e40af",
        "target-arrow-color": "#1e40af",
        "target-arrow-shape": "triangle",
        "font-weight": "bold",
        color: "#1e293b"
      }
    },
    // NEW: Medium hierarchy edges (HAS_LINKSET, HAS_ARCHITECTURE_DIAGRAM, etc.)
    {
      selector: "edge[weight >= 50][weight < 100]",
      style: {
        width: 3,
        "line-color": "#4b5563",
        "target-arrow-color": "#4b5563",
        "target-arrow-shape": "triangle"
      }
    },
    // NEW: Peer relationship edges (SATISFIES, RELATED_TO, etc.) - dashed to show non-hierarchy
    {
      selector: "edge[weight < 50]",
      style: {
        width: 2,
        "line-color": "#94a3b8",
        "target-arrow-color": "#94a3b8",
        "target-arrow-shape": "triangle",
        "line-style": "dashed"
      }
    },
    // Dynamic edge styles from customizations (these override the above)
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
  ], [edgeStyles]);

  // Memoize layout to prevent unnecessary recreation causing node position resets
  const layout = useMemo(() =>
    graphOps.getLayoutConfig(selectedLayout, hasInitialLayout, autoFitEnabled),
    [selectedLayout, hasInitialLayout, autoFitEnabled]
  );

  // Function to apply a new layout
  const applyLayout = (layoutName: string) => {
    graphOps.applyLayout(
      cyInstance,
      layoutName,
      hasInitialLayout,
      autoFitEnabled,
      setSelectedLayout,
      setHasInitialLayout
    );
  };

  // Apply filters and search (without auto-layout to prevent constant refocusing)
  useEffect(() => {
    if (!cyInstance) return;

    try {
      // Apply visibility filters only - layout is now opt-in via buttons
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
    } catch (error) {
      console.warn('Error applying filters:', error);
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
            'shadow-blur': '20px',
            'shadow-color': '#facc15',
            'shadow-opacity': 0.8
          });
        } else {
          // Reset to default if not highlighted and not selected
          if (!node.selected()) {
            // Reset border and shadow styles by setting to null (removes inline styles, falls back to stylesheet)
            node.style({
              'border-width': null,
              'border-color': null,
              'shadow-blur': null,
              'shadow-color': null,
              'shadow-opacity': null
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
        const nodeInfo = {
          id: node.data("id"),
          label: node.data("label"),
          type: node.data("type"),
          properties: node.data("properties")
        };
        console.log('[GraphViewer] Node clicked:', nodeInfo);
        setSelectedNodeInfo(nodeInfo);
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

  // Mark initial layout as complete after Cytoscape initialization
  useEffect(() => {
    if (cyInstance && !hasInitialLayout) {
      // Wait for initial layout to complete
      setTimeout(() => {
        setHasInitialLayout(true);
      }, 1000);
    }
  }, [cyInstance, hasInitialLayout]);

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
    graphOps.resetLayout(cyInstance, layout, setHasInitialLayout);
  };

  const handleFitView = () => {
    graphOps.fitView(cyInstance);
  };

  const handleZoomIn = () => {
    graphOps.zoomIn(cyInstance);
  };

  const handleZoomOut = () => {
    graphOps.zoomOut(cyInstance);
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
  const nodeTypeCategories = NODE_TYPE_CATEGORIES;
  const nodeTypes = Object.values(nodeTypeCategories).flat();

  // Wrapper functions for menu actions that need to close menus after execution
  const handleTogglePin = (nodeId: string) => {
    togglePin(nodeId);
    setContextMenu(null);
  };

  const handleToggleHighlight = (nodeId: string) => {
    toggleHighlight(nodeId);
    setContextMenu(null);
  };

  const handleApplyEdgeStyle = (edgeLabel: string, style: EdgeStyle) => {
    if (tenant && project) {
      applyEdgeStyle(tenant, project, edgeLabel, style);
      setEdgeContextMenu(null);
    }
  };

  const handleResetEdgeStyle = (edgeLabel: string) => {
    if (tenant && project) {
      resetEdgeStyle(tenant, project, edgeLabel);
      setEdgeContextMenu(null);
    }
  };

  // Wrapper for saveView that calls the hook version
  const handleSaveCurrentView = () => {
    if (tenant && project) {
      saveView(tenant, project, visibleNodeTypes, searchTerm, hiddenNodeIds, cyInstance, newViewName);
    }
  };

  // Wrapper for loadView that calls the hook version
  const handleLoadView = (viewName: string) => {
    loadView(viewName, setVisibleNodeTypes, setSearchTerm, setHiddenNodeIds, cyInstance);
  };

  // Wrapper for deleteView that calls the hook version
  const handleDeleteView = (viewName: string) => {
    if (tenant && project) {
      deleteView(tenant, project, viewName);
    }
  };

  // Wrapper for hideNode that closes menu
  const handleHideNode = (nodeId: string) => {
    hideNode(nodeId);
    setContextMenu(null);
  };

  // Advanced context menu functions (using extracted actions)

  // Neighborhood exploration
  const showNeighbors = (nodeId: string) => {
    menuActions.showNeighbors(cyInstance, nodeId, setHiddenNodeIds);
    setContextMenu(null);
  };

  const hideNeighbors = (nodeId: string) => {
    menuActions.hideNeighbors(cyInstance, nodeId, setHiddenNodeIds);
    setContextMenu(null);
  };

  const expandNeighborhood = (nodeId: string, hops: number) => {
    menuActions.expandNeighborhood(cyInstance, nodeId, hops, setHiddenNodeIds);
    setContextMenu(null);
  };

  const isolateNode = (nodeId: string) => {
    menuActions.isolateNode(cyInstance, nodeId, setHiddenNodeIds);
    setContextMenu(null);
  };

  // Path finding
  const highlightShortestPath = (sourceId: string) => {
    if (!selectedNodeInfo) return;
    menuActions.highlightShortestPath(cyInstance, sourceId, selectedNodeInfo.id);
    setContextMenu(null);
  };

  const showConnectedComponent = (nodeId: string) => {
    menuActions.showConnectedComponent(cyInstance, nodeId, setHiddenNodeIds);
    setContextMenu(null);
  };

  // Visual operations
  const changeNodeColor = (nodeId: string, color: string) => {
    menuActions.changeNodeColor(cyInstance, nodeId, color);
    setContextMenu(null);
  };

  // Information & export
  const copyNodeInfo = (nodeId: string) => {
    menuActions.copyNodeInfo(cyInstance, nodeId);
    setContextMenu(null);
  };

  const exportSubgraph = (nodeId: string) => {
    menuActions.exportSubgraph(cyInstance, nodeId);
    setContextMenu(null);
  };

  // Layout operations
  const centerNode = (nodeId: string) => {
    graphOps.centerNode(cyInstance, nodeId);
    setContextMenu(null);
  };

  const resetNodePosition = (nodeId: string) => {
    graphOps.resetNodePosition(cyInstance, layout);
    setContextMenu(null);
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
            { label: '🔴 Red', action: () => handleApplyEdgeStyle(edgeLabel, { color: '#ef4444', width: currentStyle?.width || 3, lineStyle: currentStyle?.lineStyle || 'solid' }) },
            { label: '🟠 Orange', action: () => handleApplyEdgeStyle(edgeLabel, { color: '#f97316', width: currentStyle?.width || 3, lineStyle: currentStyle?.lineStyle || 'solid' }) },
            { label: '🟡 Yellow', action: () => handleApplyEdgeStyle(edgeLabel, { color: '#eab308', width: currentStyle?.width || 3, lineStyle: currentStyle?.lineStyle || 'solid' }) },
            { label: '🟢 Green', action: () => handleApplyEdgeStyle(edgeLabel, { color: '#22c55e', width: currentStyle?.width || 3, lineStyle: currentStyle?.lineStyle || 'solid' }) },
            { label: '🔵 Blue', action: () => handleApplyEdgeStyle(edgeLabel, { color: '#3b82f6', width: currentStyle?.width || 3, lineStyle: currentStyle?.lineStyle || 'solid' }) },
            { label: '🟣 Purple', action: () => handleApplyEdgeStyle(edgeLabel, { color: '#a855f7', width: currentStyle?.width || 3, lineStyle: currentStyle?.lineStyle || 'solid' }) },
            { label: '🩷 Pink', action: () => handleApplyEdgeStyle(edgeLabel, { color: '#ec4899', width: currentStyle?.width || 3, lineStyle: currentStyle?.lineStyle || 'solid' }) },
            { label: '🩵 Teal', action: () => handleApplyEdgeStyle(edgeLabel, { color: '#14b8a6', width: currentStyle?.width || 3, lineStyle: currentStyle?.lineStyle || 'solid' }) }
          ]
        },
        {
          label: 'Line Style',
          submenu: [
            { label: '━ Solid', action: () => handleApplyEdgeStyle(edgeLabel, { color: currentStyle?.color || '#94a3b8', width: currentStyle?.width || 3, lineStyle: 'solid' }) },
            { label: '╌ Dashed', action: () => handleApplyEdgeStyle(edgeLabel, { color: currentStyle?.color || '#94a3b8', width: currentStyle?.width || 3, lineStyle: 'dashed' }) },
            { label: '┈ Dotted', action: () => handleApplyEdgeStyle(edgeLabel, { color: currentStyle?.color || '#94a3b8', width: currentStyle?.width || 3, lineStyle: 'dotted' }) }
          ]
        },
        {
          label: 'Width',
          submenu: [
            { label: 'Thin (2px)', action: () => handleApplyEdgeStyle(edgeLabel, { color: currentStyle?.color || '#94a3b8', width: 2, lineStyle: currentStyle?.lineStyle || 'solid' }) },
            { label: 'Normal (3px)', action: () => handleApplyEdgeStyle(edgeLabel, { color: currentStyle?.color || '#94a3b8', width: 3, lineStyle: currentStyle?.lineStyle || 'solid' }) },
            { label: 'Thick (4px)', action: () => handleApplyEdgeStyle(edgeLabel, { color: currentStyle?.color || '#94a3b8', width: 4, lineStyle: currentStyle?.lineStyle || 'solid' }) },
            { label: 'Extra Thick (5px)', action: () => handleApplyEdgeStyle(edgeLabel, { color: currentStyle?.color || '#94a3b8', width: 5, lineStyle: currentStyle?.lineStyle || 'solid' }) }
          ]
        },
        { separator: true },
        { label: '🔄 Reset Style', action: () => handleResetEdgeStyle(edgeLabel), disabled: !currentStyle }
      ]
    });

    items.push({ separator: true });

    items.push({
      label: `📍 ${sourceLabel} → ${targetLabel}`,
      disabled: true
    });

    return items;
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
        { label: pinnedNodes.has(nodeId) ? '📌 Unpin' : '📍 Pin', action: () => handleTogglePin(nodeId) },
        { label: highlightedNodes.has(nodeId) ? '💡 Unhighlight' : '✨ Highlight', action: () => handleToggleHighlight(nodeId) },
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
    items.push({ label: '👁️ Hide Node', action: () => handleHideNode(nodeId) });

    return items;
  };

  return (
    <div className="graph-viewer-container">
      <GraphControls
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        selectedLayout={selectedLayout}
        onLayoutChange={applyLayout}
        onResetLayout={handleResetLayout}
        onFitView={handleFitView}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onSaveView={() => setShowSaveDialog(true)}
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
      />

      <div style={{ display: 'flex', flex: 1, position: 'relative', overflow: 'hidden' }}>
        <div className="graph-viewer-content" style={{ flex: 1, position: 'relative' }}>
          <GraphCanvas
            elements={elements}
            stylesheet={stylesheet}
            layout={layout}
            onCyInit={setCyInstance}
          />

          <GraphInspector
            selectedNodeInfo={selectedNodeInfo}
            onClose={() => setSelectedNodeInfo(null)}
          />

          <GraphLegendNodes inspectorOpen={!!selectedNodeInfo} />
          <GraphLegendRelationships
            edgeStyles={edgeStyles}
            onResetAllEdgeStyles={resetAllEdgeStyles}
            sidebarOpen={sidebarOpen}
          />
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

            {/* NEW: Hierarchy Filter Toggle */}
            <div style={{ marginTop: '12px', padding: '8px', backgroundColor: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '6px' }}>
              <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', fontSize: '13px', fontWeight: '500' }}>
                <input
                  type="checkbox"
                  checked={showOnlyHierarchy}
                  onChange={(e) => setShowOnlyHierarchy(e.target.checked)}
                  style={{ marginRight: '8px', cursor: 'pointer', width: '16px', height: '16px' }}
                />
                <span>Show Only Hierarchical Relationships</span>
              </label>
              <p style={{ margin: '6px 0 0 24px', fontSize: '11px', color: '#1e40af', lineHeight: '1.4' }}>
                Hide peer relationships (SATISFIES, RELATED_TO, etc.) to see only the structural hierarchy.
              </p>
            </div>

            {/* Auto-Fit Toggle */}
            <div style={{ marginTop: '12px', padding: '8px', backgroundColor: '#fef3c7', border: '1px solid #fcd34d', borderRadius: '6px' }}>
              <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', fontSize: '13px', fontWeight: '500' }}>
                <input
                  type="checkbox"
                  checked={autoFitEnabled}
                  onChange={(e) => setAutoFitEnabled(e.target.checked)}
                  style={{ marginRight: '8px', cursor: 'pointer', width: '16px', height: '16px' }}
                />
                <span>Auto-Fit on Layout</span>
              </label>
              <p style={{ margin: '6px 0 0 24px', fontSize: '11px', color: '#92400e', lineHeight: '1.4' }}>
                Automatically zoom and pan to fit the graph when applying layouts. Disable to preserve your viewport position.
              </p>
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
                      onClick={() => handleLoadView(view.name)}
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
                      onClick={() => handleDeleteView(view.name)}
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

      <SaveViewDialog
        show={showSaveDialog}
        viewName={newViewName}
        onViewNameChange={setNewViewName}
        onSave={handleSaveCurrentView}
        onCancel={() => setShowSaveDialog(false)}
      />

      <GraphContextMenu
        contextMenu={contextMenu}
        edgeContextMenu={edgeContextMenu}
        generateNodeMenuItems={generateContextMenuItems}
        generateEdgeMenuItems={generateEdgeContextMenuItems}
      />
    </div>
  );
}
