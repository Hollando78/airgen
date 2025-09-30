import { useEffect, useRef, useState } from "react";
import * as React from "react";
import type { DocumentRecord, TraceLink } from "../../types";

const linkTypeColors: Record<string, string> = {
  satisfies: "#2563eb",
  derives: "#16a34a",
  verifies: "#9333ea",
  implements: "#dc2626",
  refines: "#ea580c",
  conflicts: "#64748b"
};

export interface VisualLinksAreaProps {
  traceLinks: TraceLink[];
  leftDocument: DocumentRecord | null;
  rightDocument: DocumentRecord | null;
  onDeleteLink?: (linkId: string) => void;
}

export function VisualLinksArea({ traceLinks, leftDocument, rightDocument, onDeleteLink }: VisualLinksAreaProps): JSX.Element {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [svgDimensions, setSvgDimensions] = useState({ width: 0, height: 0 });
  const [forceUpdate, setForceUpdate] = useState(0);

  // Filter trace links to only show those between the currently selected documents
  const relevantTraceLinks = React.useMemo(() => {
    if (!leftDocument || !rightDocument) return [];
    
    return traceLinks.filter(link => {
      const leftSlug = leftDocument.slug;
      const rightSlug = rightDocument.slug;
      
      // Simple check: does the requirement ID contain the document slug?
      const sourceInLeft = link.sourceRequirementId.includes(leftSlug);
      const targetInRight = link.targetRequirementId.includes(rightSlug);
      const sourceInRight = link.sourceRequirementId.includes(rightSlug);
      const targetInLeft = link.targetRequirementId.includes(leftSlug);
      
      return (sourceInLeft && targetInRight) || (sourceInRight && targetInLeft);
    });
  }, [traceLinks, leftDocument, rightDocument]);



  useEffect(() => {
    if (!containerRef.current) return;

    const updateDimensions = () => {
      if (!containerRef.current) return;
      
      // Get the height of the document panels to match their height
      const leftPanel = document.querySelector('.document-panel.left-panel');
      const rightPanel = document.querySelector('.document-panel.right-panel');
      const containerRect = containerRef.current.getBoundingClientRect();
      
      const maxPanelHeight = Math.max(
        leftPanel?.scrollHeight || 0,
        rightPanel?.scrollHeight || 0,
        400 // minimum height
      );
      
      
      setSvgDimensions({ 
        width: containerRect.width, 
        height: Math.max(maxPanelHeight, containerRect.height)
      });
      setForceUpdate(prev => prev + 1);
    };

    const observer = new ResizeObserver(updateDimensions);
    
    // Also listen for content changes in document panels
    const leftPanel = document.querySelector('.document-panel.left-panel');
    const rightPanel = document.querySelector('.document-panel.right-panel');
    
    if (leftPanel) observer.observe(leftPanel);
    if (rightPanel) observer.observe(rightPanel);
    observer.observe(containerRef.current);
    
    // Initial update
    updateDimensions();
    
    // Update when trace links change (requirements loaded)
    const timeout = setTimeout(updateDimensions, 500);
    
    return () => {
      observer.disconnect();
      clearTimeout(timeout);
    };
  }, [traceLinks]);

  // Force update when trace links change
  useEffect(() => {
    setForceUpdate(prev => prev + 1);
  }, [traceLinks]);

  const calculatePosition = (documentSide: "left" | "right", requirementId: string) => {
    const selector = `.document-panel.${documentSide}-panel [data-requirement-id="${requirementId}"]`;
    const container = document.querySelector(selector);

    if (!container || !svgRef.current || !containerRef.current) return null;

    const containerRect = containerRef.current.getBoundingClientRect();
    const elementRect = container.getBoundingClientRect();

    if (!containerRect) return null;

    const y = elementRect.top - containerRect.top + elementRect.height / 2;
    const x = documentSide === "left"
      ? elementRect.right - containerRect.left
      : elementRect.left - containerRect.left;

    return { x, y };
  };

  const handleDelete = (linkId: string) => {
    if (onDeleteLink) {
      onDeleteLink(linkId);
    }
  };

  return (
    <div className="visual-links-area" ref={containerRef}>
      <svg ref={svgRef} width={svgDimensions.width} height={svgDimensions.height}>
        <defs>
          <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
            <polygon points="0 0, 10 3.5, 0 7" fill="#64748b" />
          </marker>
        </defs>

        {relevantTraceLinks.map(link => {
          // Try both directions for source and target positioning
          let sourcePos = calculatePosition("left", link.sourceRequirementId);
          let targetPos = calculatePosition("right", link.targetRequirementId);
          
          // If that doesn't work, try the reverse (bidirectional support)
          if (!sourcePos || !targetPos) {
            sourcePos = calculatePosition("left", link.targetRequirementId);
            targetPos = calculatePosition("right", link.sourceRequirementId);
          }
          
          if (!sourcePos || !targetPos) {
            return null;
          }


          const color = linkTypeColors[link.linkType] || "#64748b";

          const offsetLeftPoints = {
            x: sourcePos.x,
            y: sourcePos.y
          };
          const offsetRightPoints = {
            x: targetPos.x,
            y: targetPos.y
          };

          return (
            <g key={link.id} className="trace-link-line">
              <path
                d={`M ${offsetLeftPoints.x},${offsetLeftPoints.y} C
                  ${(offsetLeftPoints.x + offsetRightPoints.x) / 2},${offsetLeftPoints.y}
                  ${(offsetLeftPoints.x + offsetRightPoints.x) / 2},${offsetRightPoints.y}
                  ${offsetRightPoints.x},${offsetRightPoints.y}`}
                stroke={color}
                strokeWidth={2}
                fill="none"
                markerEnd="url(#arrowhead)"
              />

              <text
                x={(offsetLeftPoints.x + offsetRightPoints.x) / 2}
                y={(offsetLeftPoints.y + offsetRightPoints.y) / 2 - 5}
                fill={color}
                textAnchor="middle"
                className="trace-link-label"
              >
                {link.linkType}
              </text>

              <rect
                x={(offsetLeftPoints.x + offsetRightPoints.x) / 2 - 40}
                y={(offsetLeftPoints.y + offsetRightPoints.y) / 2}
                width={80}
                height={20}
                fill="transparent"
                onClick={() => handleDelete(link.id)}
                className="trace-link-delete-target"
              />
            </g>
          );
        })}
      </svg>

      {relevantTraceLinks.length === 0 && (
        <div className="visual-links-placeholder">
          {!leftDocument || !rightDocument 
            ? "Select documents to view trace links"
            : traceLinks.length === 0
              ? "No trace links exist. Right-click on requirements to create links."
              : `No trace links between "${leftDocument.name}" and "${rightDocument.name}". Select different documents or create new links.`
          }
        </div>
      )}
    </div>
  );
}
