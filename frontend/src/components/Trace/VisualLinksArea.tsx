import { useEffect, useRef, useState } from "react";
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

  useEffect(() => {
    if (!containerRef.current) return;

    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setSvgDimensions({ width, height });
        setForceUpdate(prev => prev + 1);
      }
    });

    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const calculatePosition = (documentSide: "left" | "right", requirementId: string) => {
    const container = document.querySelector(
      `.document-panel.${documentSide}-panel [data-requirement-id="${requirementId}"]`
    );

    if (!container || !svgRef.current) return null;

    const containerRect = containerRef.current?.getBoundingClientRect();
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

        {traceLinks.map(link => {
          const sourcePos = calculatePosition("left", link.sourceRequirementId);
          const targetPos = calculatePosition("right", link.targetRequirementId);
          if (!sourcePos || !targetPos) return null;

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

      {(forceUpdate + traceLinks.length) === 0 && (
        <div className="visual-links-placeholder">Select requirements to view trace links</div>
      )}
    </div>
  );
}
