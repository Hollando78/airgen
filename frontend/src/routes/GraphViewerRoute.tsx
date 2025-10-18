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
import { GraphSidebar } from "./graph-viewer/components/GraphSidebar";
import { SaveViewDialog } from "./graph-viewer/components/SaveViewDialog";
import { GraphContextMenu } from "./graph-viewer/components/GraphContextMenu";
import * as menuConfig from "./graph-viewer/contextMenuConfig";
import { getGraphStylesheet } from "./graph-viewer/graphStylesheet";
import "./graphViewer.css";

// Register layout extensions
cytoscape.use(cytoscapeDagre);
cytoscape.use(cytoscapeFcose);

export function GraphViewerRoute() {
  const api = useApiClient();
  const { state } = useTenantProject();
  const { tenant, project } = state;

  // Early return BEFORE other hooks to avoid React error #185
  if (!tenant || !project) {
    return (
      <div className="graph-viewer-container">
        <div className="graph-viewer-empty">
          <p>Please select a tenant and project to view the graph.</p>
        </div>
      </div>
    );
  }

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

  // Cytoscape stylesheet (using extracted config)
  // Memoized to prevent unnecessary recreation
  const stylesheet = useMemo(() => getGraphStylesheet(edgeStyles), [edgeStyles]);

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

  // Generate edge context menu items (using extracted config)
  const generateEdgeContextMenuItems = (edgeLabel: string, sourceLabel: string, targetLabel: string): ContextMenuItem[] => {
    return menuConfig.generateEdgeContextMenuItems({
      edgeLabel,
      sourceLabel,
      targetLabel,
      currentStyle: edgeStyles.get(edgeLabel),
      onApplyStyle: handleApplyEdgeStyle,
      onResetStyle: handleResetEdgeStyle,
    });
  };

  // Generate context menu items based on node type (using extracted config)
  const generateContextMenuItems = (nodeId: string, nodeType: string, nodeLabel: string): ContextMenuItem[] => {
    return menuConfig.generateNodeContextMenuItems({
      nodeId,
      nodeType,
      nodeLabel,
      selectedNodeInfo,
      pinnedNodes,
      highlightedNodes,
      onShowNeighbors: showNeighbors,
      onHideNeighbors: hideNeighbors,
      onExpandNeighborhood: expandNeighborhood,
      onIsolateNode: isolateNode,
      onHighlightShortestPath: highlightShortestPath,
      onShowConnectedComponent: showConnectedComponent,
      onTogglePin: handleTogglePin,
      onToggleHighlight: handleToggleHighlight,
      onChangeNodeColor: changeNodeColor,
      onCopyNodeInfo: copyNodeInfo,
      onExportSubgraph: exportSubgraph,
      onCenterNode: centerNode,
      onResetNodePosition: resetNodePosition,
      onHideNode: handleHideNode,
      onViewDetails: (nodeId, nodeLabel, nodeType) => {
        setSelectedNodeInfo({ id: nodeId, label: nodeLabel, type: nodeType });
        setContextMenu(null);
      },
    });
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

        {/* Sidebar component */}
        <GraphSidebar
          sidebarOpen={sidebarOpen}
          onCloseSidebar={() => setSidebarOpen(false)}
          nodeTypes={nodeTypes}
          nodeTypeCategories={nodeTypeCategories}
          visibleNodeTypes={visibleNodeTypes}
          onSetVisibleNodeTypes={setVisibleNodeTypes}
          onToggleNodeType={toggleNodeType}
          onSelectAllInCategory={selectAllInCategory}
          onDeselectAllInCategory={deselectAllInCategory}
          collapsedCategories={collapsedCategories}
          onToggleCategory={toggleCategory}
          showOnlyHierarchy={showOnlyHierarchy}
          onSetShowOnlyHierarchy={setShowOnlyHierarchy}
          autoFitEnabled={autoFitEnabled}
          onSetAutoFitEnabled={setAutoFitEnabled}
          savedViews={savedViews}
          onLoadView={handleLoadView}
          onDeleteView={handleDeleteView}
        />
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
