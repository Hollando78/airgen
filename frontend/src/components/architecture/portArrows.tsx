import type { BlockPort } from "../../hooks/useArchitectureApi";
import type { EdgeType } from "./portHelpers";
import { PORT_SIZE } from "./portHelpers";

/**
 * Generate directional arrow SVG for port based on edge and direction
 */
export function generatePortArrowSvg(
  port: BlockPort,
  actualEdge: EdgeType,
  isHidden: boolean
): JSX.Element | null {
  if (isHidden || port.direction === "none") {
    return null;
  }

  const isHorizontalEdge = actualEdge === "left" || actualEdge === "right";

  return (
    <svg
      width={PORT_SIZE - 4}
      height={PORT_SIZE - 4}
      viewBox="0 0 20 20"
      style={{
        pointerEvents: "none",
        transition: "transform 0.2s ease"
      }}
    >
      {isHorizontalEdge ? (
        // Horizontal arrows (left/right edges)
        <>
          {/* Left arrow (input) */}
          {(port.direction === "in" || port.direction === "inout") && (
            <path
              d="M 7 10 L 2 10 M 2 10 L 4.5 7.5 M 2 10 L 4.5 12.5"
              stroke="#64748b"
              strokeWidth="2"
              strokeLinecap="round"
              fill="none"
            />
          )}
          {/* Right arrow (output) */}
          {(port.direction === "out" || port.direction === "inout") && (
            <path
              d="M 13 10 L 18 10 M 18 10 L 15.5 7.5 M 18 10 L 15.5 12.5"
              stroke="#64748b"
              strokeWidth="2"
              strokeLinecap="round"
              fill="none"
            />
          )}
        </>
      ) : actualEdge === "top" ? (
        // Top edge: arrows point down (in) or up (out)
        <>
          {/* Down arrow (input - data coming into the block from top) */}
          {(port.direction === "in" || port.direction === "inout") && (
            <path
              d="M 10 13 L 10 18 M 10 18 L 7.5 15.5 M 10 18 L 12.5 15.5"
              stroke="#64748b"
              strokeWidth="2"
              strokeLinecap="round"
              fill="none"
            />
          )}
          {/* Up arrow (output - data going out of the block to top) */}
          {(port.direction === "out" || port.direction === "inout") && (
            <path
              d="M 10 7 L 10 2 M 10 2 L 7.5 4.5 M 10 2 L 12.5 4.5"
              stroke="#64748b"
              strokeWidth="2"
              strokeLinecap="round"
              fill="none"
            />
          )}
        </>
      ) : (
        // Bottom edge: arrows point up (in) or down (out)
        <>
          {/* Up arrow (input - data coming into the block from bottom) */}
          {(port.direction === "in" || port.direction === "inout") && (
            <path
              d="M 10 7 L 10 2 M 10 2 L 7.5 4.5 M 10 2 L 12.5 4.5"
              stroke="#64748b"
              strokeWidth="2"
              strokeLinecap="round"
              fill="none"
            />
          )}
          {/* Down arrow (output - data going out of the block to bottom) */}
          {(port.direction === "out" || port.direction === "inout") && (
            <path
              d="M 10 13 L 10 18 M 10 18 L 7.5 15.5 M 10 18 L 12.5 15.5"
              stroke="#64748b"
              strokeWidth="2"
              strokeLinecap="round"
              fill="none"
            />
          )}
        </>
      )}
    </svg>
  );
}
