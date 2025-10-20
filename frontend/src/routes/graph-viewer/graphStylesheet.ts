import type { EdgeStyle } from "./hooks/useEdgeStyles";

/**
 * Cytoscape graph stylesheet configuration
 *
 * Defines visual styles for all node types, edge types, and interactive states
 */

/**
 * Build dynamic edge stylesheets from user customizations
 * These styles override the default edge styles
 */
export function buildDynamicEdgeStyles(edgeStyles: Map<string, EdgeStyle>): any[] {
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
}

/**
 * Get the complete Cytoscape stylesheet
 * Includes base styles for all node and edge types plus dynamic customizations
 */
export function getGraphStylesheet(edgeStyles: Map<string, EdgeStyle>): any[] {
  return [
    // ============================================================================
    // Node Base Style
    // Enhanced with better text rendering and visual clarity
    // ============================================================================
    {
      selector: "node",
      style: {
        "background-color": "#3b82f6",
        label: "data(label)",
        color: "#111827",              // Gray-900 for better contrast
        "text-valign": "center",
        "text-halign": "center",
        "font-size": "12px",
        "font-weight": "500",
        "font-family": "system-ui, -apple-system, sans-serif",
        width: "60px",
        height: "60px",
        "border-width": "2px",
        "border-color": "#2563eb",
        "text-outline-width": "3px",   // Increased for better readability
        "text-outline-color": "#ffffff",
        "text-wrap": "wrap",
        "text-max-width": "80px",
        // Add subtle shadow for depth
        "overlay-padding": "6px",
        "overlay-opacity": 0
      }
    },

    // ============================================================================
    // Node Type-Specific Styles
    // Following best practices for semantic shape usage:
    // - Polygons (octagon/hexagon) for containers and templates
    // - Rectangles for formal entities and diagrams
    // - Rounded shapes for content and informational nodes
    // - Diamonds for connectors and relationships
    // - Stars for important links
    // - Vee/triangle for pending/draft items
    // ============================================================================

    // System/Organization Nodes (Purple family)
    {
      selector: "node[type='Tenant']",
      style: {
        "background-color": "#7c3aed",  // Violet-600
        "border-color": "#5b21b6",      // Violet-800
        "border-width": "3px",
        shape: "octagon",                // Top-level container
        width: "70px",
        height: "70px",
        "font-weight": "bold"
      }
    },
    {
      selector: "node[type='Project']",
      style: {
        "background-color": "#8b5cf6",  // Violet-500
        "border-color": "#6d28d9",      // Violet-700
        "border-width": "3px",
        shape: "hexagon",                // Project container
        width: "65px",
        height: "65px",
        "font-weight": "600"
      }
    },

    // Document Structure Nodes (Green/Amber family)
    {
      selector: "node[type='Document']",
      style: {
        "background-color": "#10b981",  // Emerald-500
        "border-color": "#047857",      // Emerald-700
        "border-width": "2px",
        shape: "round-rectangle",        // Content container
        width: "65px",
        height: "50px"
      }
    },
    {
      selector: "node[type='DocumentSection']",
      style: {
        "background-color": "#34d399",  // Emerald-400
        "border-color": "#059669",      // Emerald-600
        "border-width": "2px",
        shape: "round-rectangle",
        width: "55px",
        height: "45px",
        "font-size": "11px"
      }
    },
    {
      selector: "node[type='Info']",
      style: {
        "background-color": "#fbbf24",  // Amber-400
        "border-color": "#d97706",      // Amber-600
        "border-width": "2px",
        shape: "ellipse",                // Informational content
        width: "50px",
        height: "50px",
        "font-size": "11px"
      }
    },
    {
      selector: "node[type='SurrogateReference']",
      style: {
        "background-color": "#f59e0b",  // Amber-500
        "border-color": "#b45309",      // Amber-700
        "border-width": "2px",
        shape: "tag",                    // Reference pointer
        width: "55px",
        height: "40px",
        "font-size": "10px"
      }
    },

    // Requirements Nodes (Blue family)
    {
      selector: "node[type='Requirement']",
      style: {
        "background-color": "#3b82f6",  // Blue-500
        "border-color": "#1e40af",      // Blue-800
        "border-width": "2px",
        shape: "rectangle",              // Formal specification
        width: "60px",
        height: "45px"
      }
    },
    {
      selector: "node[type='RequirementCandidate']",
      style: {
        "background-color": "#93c5fd",  // Blue-300 (lighter for draft)
        "border-color": "#3b82f6",      // Blue-500
        "border-width": "2px",
        "line-style": "dashed",
        shape: "vee",                    // Pending/draft indicator
        width: "45px",
        height: "45px",
        "font-size": "10px"
      }
    },

    // Traceability Nodes (Pink/Purple family)
    {
      selector: "node[type='DocumentLinkset']",
      style: {
        "background-color": "#ec4899",  // Pink-500
        "border-color": "#be185d",      // Pink-700
        "border-width": "2px",
        shape: "diamond",                // Linking mechanism
        width: "50px",
        height: "50px",
        "font-size": "10px"
      }
    },
    {
      selector: "node[type='TraceLink']",
      style: {
        "background-color": "#a855f7",  // Purple-500
        "border-color": "#7e22ce",      // Purple-700
        "border-width": "2px",
        shape: "star",                   // Important connection
        width: "45px",
        height: "45px",
        "font-size": "9px"
      }
    },

    // Architecture Nodes (Teal/Indigo family)
    {
      selector: "node[type='ArchitectureDiagram']",
      style: {
        "background-color": "#14b8a6",  // Teal-500
        "border-color": "#0f766e",      // Teal-700
        "border-width": "3px",
        shape: "round-rectangle",        // Diagram canvas
        width: "70px",
        height: "55px",
        "font-weight": "600"
      }
    },
    {
      selector: "node[type='ArchitectureBlock']",
      style: {
        "background-color": "#6366f1",  // Indigo-500
        "border-color": "#3730a3",      // Indigo-800
        "border-width": "2px",
        shape: "rectangle",              // Component/block
        width: "60px",
        height: "50px"
      }
    },
    {
      selector: "node[type='ArchitectureConnector']",
      style: {
        "background-color": "#84cc16",  // Lime-500
        "border-color": "#4d7c0f",      // Lime-700
        "border-width": "2px",
        shape: "diamond",                // Connector element
        width: "40px",
        height: "40px",
        "font-size": "9px"
      }
    },

    // Port Nodes (Fuchsia family)
    {
      selector: "node[type='PortDefinition']",
      style: {
        "background-color": "#d946ef",  // Fuchsia-500
        "border-color": "#a21caf",      // Fuchsia-700
        "border-width": "2px",
        shape: "hexagon",                // Definition/template
        width: "40px",
        height: "40px",
        "font-size": "9px"
      }
    },
    {
      selector: "node[type='PortInstance']",
      style: {
        "background-color": "#f0abfc",  // Fuchsia-300
        "border-color": "#d946ef",      // Fuchsia-500
        "border-width": "2px",
        shape: "ellipse",                // Concrete instance
        width: "35px",
        height: "35px",
        "font-size": "8px"
      }
    },

    // ============================================================================
    // Node Interactive States
    // Enhanced with smooth transitions and better visual feedback
    // ============================================================================
    {
      selector: "node:selected",
      style: {
        "border-width": "5px",
        "border-color": "#ef4444",      // Red-500
        "border-opacity": 1,
        "overlay-opacity": 0.2,
        "overlay-color": "#ef4444",
        "overlay-padding": "8px",
        "z-index": 999
      }
    },
    {
      selector: "node:active",
      style: {
        "overlay-opacity": 0.3,
        "overlay-color": "#3b82f6"
      }
    },
    {
      selector: "node.highlighted",
      style: {
        "border-width": "4px",
        "border-color": "#f59e0b",      // Amber-500 for highlight
        "border-opacity": 1,
        "z-index": 998
      }
    },
    {
      selector: "node.pinned",
      style: {
        "border-style": "double",
        "border-width": "4px"
      }
    },

    // ============================================================================
    // Edge Base Style
    // Improved with better contrast and readability
    // ============================================================================
    {
      selector: "edge",
      style: {
        width: 2,
        "line-color": "#94a3b8",        // Slate-400
        "target-arrow-color": "#94a3b8",
        "target-arrow-shape": "triangle",
        "arrow-scale": 1.2,              // Slightly larger arrows
        "curve-style": "bezier",
        label: "data(label)",
        "font-size": "10px",
        "font-family": "system-ui, -apple-system, sans-serif",
        color: "#475569",                // Slate-600 for better contrast
        "text-rotation": "autorotate",
        "text-margin-y": -12,
        "text-background-color": "#ffffff",
        "text-background-opacity": 0.9,
        "text-background-padding": "3px",
        "text-background-shape": "roundrectangle",
        "text-border-color": "#e2e8f0",  // Slate-200
        "text-border-width": 1,
        "text-border-opacity": 0.8,
        "line-opacity": 0.8
      }
    },

    // ============================================================================
    // Edge Hierarchy Styles
    // Using visual weight and style to indicate relationship strength
    // ============================================================================

    // Hierarchical edges (stronger, darker) - applies to all hierarchical edges
    {
      selector: "edge[isHierarchical]",
      style: {
        width: 3,
        "line-color": "#334155",        // Slate-700
        "target-arrow-color": "#334155",
        "target-arrow-shape": "triangle",
        "arrow-scale": 1.3,
        "curve-style": "bezier",
        "font-weight": "600",
        "font-size": "11px",
        color: "#1e293b",                // Slate-800
        "line-opacity": 0.9
      }
    },

    // Strong hierarchy edges (OWNS, HAS_DOCUMENT, HAS_SECTION, CONTAINS, HAS_PORT, INSTANTIATED_AS)
    {
      selector: "edge[weight >= 100]",
      style: {
        width: 4,
        "line-color": "#1e40af",        // Blue-800 (strong containment)
        "target-arrow-color": "#1e40af",
        "target-arrow-shape": "triangle",
        "arrow-scale": 1.4,
        "font-weight": "bold",
        color: "#1e293b",
        "line-opacity": 1
      }
    },

    // Medium hierarchy edges (HAS_LINKSET, HAS_ARCHITECTURE_DIAGRAM, CONTAINS_PORT, etc.)
    {
      selector: "edge[weight >= 50][weight < 100]",
      style: {
        width: 3,
        "line-color": "#475569",        // Slate-600 (medium ownership)
        "target-arrow-color": "#475569",
        "target-arrow-shape": "triangle",
        "arrow-scale": 1.2,
        "line-opacity": 0.85
      }
    },

    // Peer relationship edges (SATISFIES, RELATED_TO, FROM_PORT, TO_PORT, etc.)
    // Dashed to show non-hierarchical relationships
    {
      selector: "edge[weight < 50]",
      style: {
        width: 2,
        "line-color": "#94a3b8",        // Slate-400 (peer relationships)
        "target-arrow-color": "#94a3b8",
        "target-arrow-shape": "triangle",
        "line-style": "dashed",
        "line-dash-pattern": [8, 4],
        "line-opacity": 0.7
      }
    },

    // ============================================================================
    // Dynamic Edge Customizations (override the above)
    // ============================================================================
    ...buildDynamicEdgeStyles(edgeStyles),

    // ============================================================================
    // Edge Interactive States
    // Enhanced for better user feedback
    // ============================================================================
    {
      selector: "edge:selected",
      style: {
        "line-color": "#ef4444",        // Red-500
        "target-arrow-color": "#ef4444",
        "source-arrow-color": "#ef4444",
        width: 4,
        "arrow-scale": 1.5,
        "line-opacity": 1,
        "z-index": 999,
        "overlay-opacity": 0.15,
        "overlay-color": "#ef4444",
        "overlay-padding": "4px"
      }
    },
    {
      selector: "edge:active",
      style: {
        "overlay-opacity": 0.25,
        "overlay-color": "#3b82f6"
      }
    },
    {
      selector: "edge.highlighted",
      style: {
        "line-color": "#f59e0b",        // Amber-500
        "target-arrow-color": "#f59e0b",
        width: 3,
        "line-opacity": 1,
        "z-index": 998
      }
    },

    // ============================================================================
    // Special Visual States
    // Path highlighting for traversal visualization
    // ============================================================================
    {
      selector: ".path-highlight",
      style: {
        "line-color": "#ef4444",        // Red-500
        "target-arrow-color": "#ef4444",
        "border-color": "#ef4444",
        "background-color": "#fecaca",  // Red-200
        "border-width": "5px",
        width: 5,
        "arrow-scale": 1.6,
        "line-opacity": 1,
        "z-index": 1000,
        "overlay-opacity": 0.2,
        "overlay-color": "#ef4444"
      }
    },
    {
      selector: ".faded",
      style: {
        opacity: 0.15
      }
    },
    {
      selector: "node.search-match",
      style: {
        "border-width": "4px",
        "border-color": "#22c55e",      // Green-500 for search matches
        "border-style": "solid"
      }
    }
  ];
}
