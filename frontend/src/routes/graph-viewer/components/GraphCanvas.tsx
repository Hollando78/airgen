/**
 * GraphCanvas Component
 *
 * Wrapper around CytoscapeComponent that handles graph rendering
 * and initialization.
 */

import CytoscapeComponent from "react-cytoscapejs";
import type { Core, ElementDefinition } from "cytoscape";

interface GraphCanvasProps {
  elements: ElementDefinition[];
  stylesheet: any;
  layout: any;
  onCyInit: (cy: Core) => void;
}

export function GraphCanvas({ elements, stylesheet, layout, onCyInit }: GraphCanvasProps) {
  return (
    <CytoscapeComponent
      elements={elements}
      stylesheet={stylesheet}
      layout={layout}
      style={{ width: "100%", height: "100%" }}
      cy={onCyInit}
    />
  );
}
