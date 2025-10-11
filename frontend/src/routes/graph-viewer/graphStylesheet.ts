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
    // ============================================================================
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

    // ============================================================================
    // Node Type-Specific Styles
    // ============================================================================
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

    // ============================================================================
    // Node Interactive States
    // ============================================================================
    {
      selector: "node:selected",
      style: {
        "border-width": "4px",
        "border-color": "#dc2626",
        "background-color": "#ef4444"
      }
    },

    // ============================================================================
    // Edge Base Style
    // ============================================================================
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

    // ============================================================================
    // Edge Hierarchy Styles
    // ============================================================================

    // Hierarchical edges (stronger, darker) - applies to all hierarchical edges
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

    // Strong hierarchy edges (OWNS, HAS_DOCUMENT, HAS_SECTION, CONTAINS)
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

    // Medium hierarchy edges (HAS_LINKSET, HAS_ARCHITECTURE_DIAGRAM, etc.)
    {
      selector: "edge[weight >= 50][weight < 100]",
      style: {
        width: 3,
        "line-color": "#4b5563",
        "target-arrow-color": "#4b5563",
        "target-arrow-shape": "triangle"
      }
    },

    // Peer relationship edges (SATISFIES, RELATED_TO, etc.) - dashed to show non-hierarchy
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

    // ============================================================================
    // Dynamic Edge Customizations (override the above)
    // ============================================================================
    ...buildDynamicEdgeStyles(edgeStyles),

    // ============================================================================
    // Edge Interactive States
    // ============================================================================
    {
      selector: "edge:selected",
      style: {
        "line-color": "#dc2626",
        "target-arrow-color": "#dc2626",
        width: 3
      }
    },

    // ============================================================================
    // Special Visual States
    // ============================================================================
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
}
