import { useState, useRef, useEffect } from "react";
import type { EdgeProps, XYPosition } from "@xyflow/react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  getSmoothStepPath,
  getStraightPath,
  type Edge
} from "@xyflow/react";
import type { DocumentRecord } from "../../types";

interface CustomEdgeData extends Record<string, unknown> {
  documentIds?: string[];
  originalLabel?: string | null;
  documents?: DocumentRecord[];
  onOpenDocument?: (slug: string) => void;
  labelOffsetX?: number;
  labelOffsetY?: number;
  onUpdateLabelOffset?: (offsetX: number, offsetY: number) => void;
  onUpdateLabel?: (label: string) => void;
  selected?: boolean;
  controlPoints?: Array<{ x: number; y: number }>;
  onControlPointsPreview?: (points: Array<{ x: number; y: number }>) => void;
  onControlPointsCommit?: (points: Array<{ x: number; y: number }>) => void;
  screenToFlowPosition?: (position: XYPosition) => XYPosition;
}

const MAX_CONTROL_POINTS = 16;
const SNAP_INCREMENT = 10;

function snapCoordinate(value: number, increment: number = SNAP_INCREMENT): number {
  return Math.round(value / increment) * increment;
}

function projectClientPoint(clientX: number, clientY: number, project?: (position: XYPosition) => XYPosition): XYPosition | null {
  if (project) {
    return project({ x: clientX, y: clientY });
  }

  const viewport = document.querySelector(".react-flow__viewport") as HTMLElement | null;
  if (!viewport) {
    return null;
  }

  const rect = viewport.getBoundingClientRect();
  const transform = window.getComputedStyle(viewport).transform;

  if (!transform || transform === "none") {
    return {
      x: clientX - rect.left,
      y: clientY - rect.top
    };
  }

  const matrix = new DOMMatrix(transform);
  const x = (clientX - rect.left - matrix.e) / matrix.a;
  const y = (clientY - rect.top - matrix.f) / matrix.a;

  return { x, y };
}

function computePolylinePath(points: XYPosition[]): { path: string; midPoint: XYPosition } {
  if (points.length === 0) {
    return { path: "", midPoint: { x: 0, y: 0 } };
  }

  let path = `M ${points[0].x},${points[0].y}`;
  let totalLength = 0;
  const segmentLengths: number[] = [];

  for (let i = 0; i < points.length - 1; i += 1) {
    const start = points[i];
    const end = points[i + 1];
    path += ` L ${end.x},${end.y}`;
    const length = Math.hypot(end.x - start.x, end.y - start.y);
    segmentLengths.push(length);
    totalLength += length;
  }

  const halfLength = totalLength / 2;
  let accumulated = 0;
  let midPoint = points[0];

  for (let i = 0; i < segmentLengths.length; i += 1) {
    const length = segmentLengths[i];
    if (accumulated + length >= halfLength) {
      const ratio = length === 0 ? 0 : (halfLength - accumulated) / length;
      const start = points[i];
      const end = points[i + 1];
      midPoint = {
        x: start.x + (end.x - start.x) * ratio,
        y: start.y + (end.y - start.y) * ratio
      };
      break;
    }
    accumulated += length;
  }

  return { path, midPoint };
}

function EdgeLabelContent({
  label,
  documentIds,
  documents,
  onOpenDocument,
  labelX,
  labelY,
  labelOffsetX = 0,
  labelOffsetY = 0,
  onUpdateLabelOffset,
  onUpdateLabel,
  selected = false
}: {
  label?: string;
  documentIds: string[];
  documents: DocumentRecord[];
  onOpenDocument?: (slug: string) => void;
  labelX: number;
  labelY: number;
  labelOffsetX?: number;
  labelOffsetY?: number;
  onUpdateLabelOffset?: (offsetX: number, offsetY: number) => void;
  onUpdateLabel?: (label: string) => void;
  selected?: boolean;
}) {
  const linkedDocuments = documents.filter(doc => documentIds.includes(doc.id));
  const [isEditingLabel, setIsEditingLabel] = useState(false);
  const [editedLabel, setEditedLabel] = useState(label || "");
  const labelInputRef = useRef<HTMLInputElement>(null);

  // Handle F2 key for renaming
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (selected && e.key === "F2" && !isEditingLabel) {
        e.preventDefault();
        setIsEditingLabel(true);
        setEditedLabel(label || "");
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selected, label, isEditingLabel]);

  // Focus input when editing starts
  useEffect(() => {
    if (isEditingLabel && labelInputRef.current) {
      labelInputRef.current.focus();
      labelInputRef.current.select();
    }
  }, [isEditingLabel]);

  const handleLabelSubmit = () => {
    const trimmed = editedLabel.trim();
    if (trimmed !== label && onUpdateLabel) {
      onUpdateLabel(trimmed);
    }
    setIsEditingLabel(false);
  };

  const handleLabelKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleLabelSubmit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      setIsEditingLabel(false);
      setEditedLabel(label || "");
    }
  };

  const handleLabelDoubleClick = (e: React.MouseEvent) => {
    if (!onUpdateLabel) return;
    e.stopPropagation();
    setIsEditingLabel(true);
    setEditedLabel(label || "");
  };

  if (!label && linkedDocuments.length === 0 && !isEditingLabel) {
    return null;
  }

    const handleDragStart = (e: React.MouseEvent) => {
      if (!onUpdateLabelOffset || isEditingLabel) return;
      e.stopPropagation();
      e.preventDefault();

      const startX = e.clientX;
      const startY = e.clientY;
      const startOffsetX = labelOffsetX ?? 0;
      const startOffsetY = labelOffsetY ?? 0;
      const labelElement = e.currentTarget as HTMLElement;

    // Get ReactFlow viewport zoom from the transform applied to the viewport
    const reactFlowViewport = document.querySelector('.react-flow__viewport');
    let zoom = 1;
    if (reactFlowViewport) {
      const transform = window.getComputedStyle(reactFlowViewport).transform;
      const matrix = new DOMMatrix(transform);
      zoom = matrix.a; // Scale X from the transform matrix
    }

    let currentOffsetX = startOffsetX;
    let currentOffsetY = startOffsetY;

      const handleDrag = (moveEvent: MouseEvent) => {
        const deltaX = (moveEvent.clientX - startX) / zoom;
        const deltaY = (moveEvent.clientY - startY) / zoom;
        currentOffsetX = startOffsetX + deltaX;
        currentOffsetY = startOffsetY + deltaY;

        // Update DOM directly for smooth visual feedback during drag
        // Include the base labelX/labelY so the drag preview matches final position
        labelElement.style.transform = `translate(-50%, -50%) translate(${labelX + currentOffsetX}px,${labelY + currentOffsetY}px)`;
      };

    const handleDragEnd = () => {
      document.removeEventListener("mousemove", handleDrag);
      document.removeEventListener("mouseup", handleDragEnd);

      // Snap to the final position immediately so there is no visual jump while we persist
      labelElement.style.transform = `translate(-50%, -50%) translate(${labelX + currentOffsetX}px,${labelY + currentOffsetY}px)`;

      // Send final position to the server
      onUpdateLabelOffset(currentOffsetX, currentOffsetY);
    };

    document.addEventListener("mousemove", handleDrag);
    document.addEventListener("mouseup", handleDragEnd);
  };

  return (
    <div
      style={{
        position: "absolute",
        transform: `translate(-50%, -50%) translate(${labelX + labelOffsetX}px,${labelY + labelOffsetY}px)`,
        pointerEvents: "all",
        display: "flex",
        flexDirection: "column",
        gap: "4px",
        alignItems: "center",
        cursor: isEditingLabel ? "text" : (onUpdateLabelOffset ? "move" : "default")
      }}
      onMouseDown={!isEditingLabel && onUpdateLabelOffset ? handleDragStart : undefined}
    >
      {isEditingLabel ? (
        <input
          ref={labelInputRef}
          type="text"
          value={editedLabel}
          onChange={(e) => setEditedLabel(e.target.value)}
          onKeyDown={handleLabelKeyDown}
          onBlur={handleLabelSubmit}
          className="nodrag nopan"
          style={{
            background: "#ffffff",
            border: "2px solid #2563eb",
            borderRadius: "4px",
            padding: "6px 8px",
            fontSize: "12px",
            fontWeight: 500,
            color: "#0f172a",
            outline: "none",
            minWidth: "100px"
          }}
        />
      ) : label ? (
        <div
          style={{
            background: "#ffffff",
            border: selected ? "2px solid #2563eb" : "1px solid #e2e8f0",
            borderRadius: "4px",
            padding: "6px 8px",
            fontSize: "12px",
            fontWeight: 500,
            color: "#0f172a",
            whiteSpace: "nowrap",
            cursor: onUpdateLabel ? "text" : onUpdateLabelOffset ? "move" : "default",
            userSelect: onUpdateLabel ? "text" : "none"
          }}
          onDoubleClick={onUpdateLabel ? handleLabelDoubleClick : undefined}
          title={onUpdateLabel ? "Double-click or press F2 to rename" : undefined}
        >
          {label}
        </div>
      ) : null}
      {linkedDocuments.length > 0 && (
        <div
          style={{
            display: "flex",
            gap: "3px",
            flexWrap: "wrap",
            justifyContent: "center",
            maxWidth: "200px"
          }}
        >
          {linkedDocuments.map(doc => (
            <button
              key={doc.id}
              onClick={(e) => {
                e.stopPropagation();
                onOpenDocument?.(doc.slug);
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "4px",
                fontSize: "11px",
                background: "#dbeafe",
                borderRadius: "4px",
                padding: "3px 6px",
                border: "1px solid #bfdbfe",
                cursor: "pointer",
                transition: "all 0.2s ease",
                whiteSpace: "nowrap"
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "#bfdbfe";
                e.currentTarget.style.borderColor = "#93c5fd";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "#dbeafe";
                e.currentTarget.style.borderColor = "#bfdbfe";
              }}
              title={`Open document: ${doc.name}`}
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14,2 14,8 20,8" />
              </svg>
              <span
                style={{
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  maxWidth: "80px"
                }}
              >
                {doc.name}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function StraightEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  style = {},
  markerEnd,
  markerStart,
  data,
  label,
  selected
}: EdgeProps<Edge<CustomEdgeData>>) {
  const [edgePath, labelX, labelY] = getStraightPath({
    sourceX,
    sourceY,
    targetX,
    targetY
  });

  const edgeData = data || {};
  const documentIds = edgeData.documentIds || [];
  const documents = edgeData.documents || [];
  const originalLabel = edgeData.originalLabel || label;

  return (
    <>
      <BaseEdge id={id} path={edgePath} markerEnd={markerEnd} markerStart={markerStart} style={style} />
      <EdgeLabelRenderer>
        <EdgeLabelContent
          label={originalLabel as string}
          documentIds={documentIds}
          documents={documents}
          onOpenDocument={edgeData.onOpenDocument}
          labelX={labelX}
          labelY={labelY}
          labelOffsetX={edgeData.labelOffsetX}
          labelOffsetY={edgeData.labelOffsetY}
          onUpdateLabelOffset={edgeData.onUpdateLabelOffset}
          onUpdateLabel={edgeData.onUpdateLabel}
          selected={selected}
        />
      </EdgeLabelRenderer>
    </>
  );
}

export function SmoothStepEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
  markerStart,
  data,
  label,
  selected
}: EdgeProps<Edge<CustomEdgeData>>) {
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition
  });

  const edgeData = data || {};
  const documentIds = edgeData.documentIds || [];
  const documents = edgeData.documents || [];
  const originalLabel = edgeData.originalLabel || label;

  return (
    <>
      <BaseEdge id={id} path={edgePath} markerEnd={markerEnd} markerStart={markerStart} style={style} />
      <EdgeLabelRenderer>
        <EdgeLabelContent
          label={originalLabel as string}
          documentIds={documentIds}
          documents={documents}
          onOpenDocument={edgeData.onOpenDocument}
          labelX={labelX}
          labelY={labelY}
          labelOffsetX={edgeData.labelOffsetX}
          labelOffsetY={edgeData.labelOffsetY}
          onUpdateLabelOffset={edgeData.onUpdateLabelOffset}
          onUpdateLabel={edgeData.onUpdateLabel}
          selected={selected}
        />
      </EdgeLabelRenderer>
    </>
  );
}

export function StepEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
  markerStart,
  data,
  label,
  selected
}: EdgeProps<Edge<CustomEdgeData>>) {
  const edgeData = data || {};
  const controlPoints = Array.isArray(edgeData.controlPoints) ? edgeData.controlPoints : [];
  const [hoveredSegment, setHoveredSegment] = useState<number | null>(null);

  const documentIds = edgeData.documentIds || [];
  const documents = edgeData.documents || [];
  const originalLabel = edgeData.originalLabel || label;

  const points: XYPosition[] = [
    { x: sourceX, y: sourceY },
    ...controlPoints,
    { x: targetX, y: targetY }
  ];

  const { path: polylinePath, midPoint } = computePolylinePath(points);
  const hasCustomPath = controlPoints.length > 0 && polylinePath.length > 0;

  const [defaultPath, defaultLabelX, defaultLabelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 0
  });

  const edgePath = hasCustomPath ? polylinePath : defaultPath;
  const labelX = hasCustomPath ? midPoint.x : defaultLabelX;
  const labelY = hasCustomPath ? midPoint.y : defaultLabelY;

  const segments = points.slice(0, -1).map((start, index) => {
    const end = points[index + 1];
    const orientation = Math.abs(end.x - start.x) >= Math.abs(end.y - start.y) ? "horizontal" : "vertical";
    return { start, end, orientation };
  });

  const beginControlPointDrag = (index: number, basePoints: XYPosition[]) => {
    if (!edgeData.onControlPointsPreview || !edgeData.onControlPointsCommit) {
      return;
    }

    const mutablePoints = basePoints.map(point => ({ ...point }));
    const previous = index === 0 ? { x: sourceX, y: sourceY } : mutablePoints[index - 1] ?? { x: sourceX, y: sourceY };
    const next = index === mutablePoints.length - 1 ? { x: targetX, y: targetY } : mutablePoints[index + 1] ?? { x: targetX, y: targetY };

    const prevOrientation = Math.abs(previous.y - mutablePoints[index].y) <= Math.abs(previous.x - mutablePoints[index].x) ? "horizontal" : "vertical";
    const nextOrientation = Math.abs(mutablePoints[index].x - next.x) <= Math.abs(mutablePoints[index].y - next.y) ? "vertical" : "horizontal";

    const updatePoint = (clientX: number, clientY: number, commit: boolean) => {
      const projected = projectClientPoint(clientX, clientY, edgeData.screenToFlowPosition);
      if (!projected) {
        return;
      }

      let nextValue: XYPosition = {
        x: snapCoordinate(projected.x),
        y: snapCoordinate(projected.y)
      };

      if (prevOrientation === "horizontal") {
        nextValue.y = previous.y;
      } else if (prevOrientation === "vertical") {
        nextValue.x = previous.x;
      }

      if (nextOrientation === "vertical") {
        nextValue.x = next.x;
      } else if (nextOrientation === "horizontal") {
        nextValue.y = next.y;
      }

      mutablePoints[index] = nextValue;

      const snapshot = mutablePoints.map(point => ({ ...point }));
      if (commit) {
        edgeData.onControlPointsCommit?.(snapshot);
      } else {
        edgeData.onControlPointsPreview?.(snapshot);
      }
    };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      updatePoint(moveEvent.clientX, moveEvent.clientY, false);
    };

    const handleMouseUp = (upEvent: MouseEvent) => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.userSelect = "";
      updatePoint(upEvent.clientX, upEvent.clientY, true);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    document.body.style.userSelect = "none";
  };

  const handleControlPointMouseDown = (index: number) => (event: React.MouseEvent) => {
    event.stopPropagation();
    event.preventDefault();
    if (!edgeData.onControlPointsPreview || !edgeData.onControlPointsCommit) {
      return;
    }

    beginControlPointDrag(index, controlPoints.map(point => ({ ...point })));
  };

  const handleControlPointDoubleClick = (index: number) => (event: React.MouseEvent) => {
    event.stopPropagation();
    event.preventDefault();
    if (!edgeData.onControlPointsCommit) {
      return;
    }
    const updated = controlPoints.filter((_, idx) => idx !== index);
    edgeData.onControlPointsCommit(updated);
  };

  const handleControlPointClick = (index: number) => (event: React.MouseEvent) => {
    // Alt+Click or Option+Click: Remove waypoint
    if (event.altKey) {
      event.stopPropagation();
      event.preventDefault();
      if (!edgeData.onControlPointsCommit) {
        return;
      }
      const updated = controlPoints.filter((_, idx) => idx !== index);
      edgeData.onControlPointsCommit(updated);
    }
  };

  const handleSegmentMouseDown = (
    segmentIndex: number,
    segment: { start: XYPosition; end: XYPosition; orientation: "horizontal" | "vertical" },
    event: React.MouseEvent
  ) => {
    if (event.button !== 0) {
      return;
    }
    if (!edgeData.onControlPointsPreview || !edgeData.onControlPointsCommit) {
      return;
    }

    const projected = projectClientPoint(event.clientX, event.clientY, edgeData.screenToFlowPosition);
    if (!projected) {
      return;
    }

    // Check if clicking near existing waypoint - if so, start dragging it
    let nearestIndex: number | null = null;
    let nearestDistance = Number.POSITIVE_INFINITY;
    controlPoints.forEach((point, index) => {
      const dx = point.x - projected.x;
      const dy = point.y - projected.y;
      const distance = Math.hypot(dx, dy);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = index;
      }
    });

    if (nearestIndex !== null && nearestDistance <= 12) {
      event.stopPropagation();
      event.preventDefault();
      beginControlPointDrag(nearestIndex, controlPoints.map(point => ({ ...point })));
      return;
    }

    if (controlPoints.length >= MAX_CONTROL_POINTS) {
      return;
    }

    event.stopPropagation();
    event.preventDefault();

    // Ctrl+Click: Add waypoint without dragging
    if (event.ctrlKey || event.metaKey) {
      const insertionIndex = Math.max(0, Math.min(controlPoints.length, segmentIndex));
      const snappedPoint: XYPosition = {
        x: snapCoordinate(projected.x),
        y: snapCoordinate(projected.y)
      };

      if (segment.orientation === "horizontal") {
        snappedPoint.y = segment.start.y;
      } else {
        snappedPoint.x = segment.start.x;
      }

      const updatedPoints = [...controlPoints];
      updatedPoints.splice(insertionIndex, 0, snappedPoint);
      edgeData.onControlPointsCommit(updatedPoints.map(point => ({ ...point })));
      return;
    }

    // Normal click: Add waypoint and immediately start dragging it
    const insertionIndex = Math.max(0, Math.min(controlPoints.length, segmentIndex));
    const snappedPoint: XYPosition = {
      x: snapCoordinate(projected.x),
      y: snapCoordinate(projected.y)
    };

    if (segment.orientation === "horizontal") {
      snappedPoint.y = segment.start.y;
    } else {
      snappedPoint.x = segment.start.x;
    }

    const updatedPoints = [...controlPoints];
    updatedPoints.splice(insertionIndex, 0, snappedPoint);
    edgeData.onControlPointsPreview(updatedPoints.map(point => ({ ...point })));
    beginControlPointDrag(insertionIndex, updatedPoints);
  };

  return (
    <>
      {selected && edgeData.onControlPointsCommit && segments.map((segment, index) => (
        <path
          key={`${id}-segment-overlay-${index}`}
          d={`M ${segment.start.x},${segment.start.y} L ${segment.end.x},${segment.end.y}`}
          stroke={hoveredSegment === index ? "rgba(37, 99, 235, 0.45)" : "rgba(37, 99, 235, 0.2)"}
          strokeWidth={selected ? 12 : 0}
          fill="none"
          pointerEvents="stroke"
          style={{ cursor: edgeData.onControlPointsCommit ? "pointer" : "default" }}
          onMouseEnter={() => setHoveredSegment(index)}
          onMouseLeave={() => setHoveredSegment(prev => (prev === index ? null : prev))}
          onMouseDown={(event) => handleSegmentMouseDown(index, segment, event)}
        />
      ))}
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        markerStart={markerStart}
        style={style}
      />
      <EdgeLabelRenderer>
        <EdgeLabelContent
          label={originalLabel as string}
          documentIds={documentIds}
          documents={documents}
          onOpenDocument={edgeData.onOpenDocument}
          labelX={labelX}
          labelY={labelY}
          labelOffsetX={edgeData.labelOffsetX}
          labelOffsetY={edgeData.labelOffsetY}
          onUpdateLabelOffset={edgeData.onUpdateLabelOffset}
          onUpdateLabel={edgeData.onUpdateLabel}
          selected={selected}
        />
      </EdgeLabelRenderer>
      {selected && controlPoints.map((point, index) => (
        <EdgeLabelRenderer key={`${id}-cp-${index}`}>
          <div
            role="button"
            title="Drag to adjust • Double-click to remove • Alt+Click to delete"
            onMouseDown={handleControlPointMouseDown(index)}
            onDoubleClick={handleControlPointDoubleClick(index)}
            onClick={handleControlPointClick(index)}
            className="nodrag nopan"
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${point.x}px, ${point.y}px)`,
              width: "14px",
              height: "14px",
              borderRadius: "4px",
              background: "#ffffff",
              border: selected ? "2px solid #2563eb" : "1px solid #94a3b8",
              boxShadow: "0 2px 4px rgba(37, 99, 235, 0.2)",
              cursor: "grab",
              zIndex: 10,
              pointerEvents: "all"
            }}
          />
        </EdgeLabelRenderer>
      ))}
    </>
  );
}

export function PolylineEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  style = {},
  markerEnd,
  markerStart,
  data,
  label,
  selected
}: EdgeProps<Edge<CustomEdgeData>>) {
  const edgeData = data || {};
  const controlPoints = Array.isArray(edgeData.controlPoints) ? edgeData.controlPoints : [];
  const [hoveredSegment, setHoveredSegment] = useState<number | null>(null);

  const documentIds = edgeData.documentIds || [];
  const documents = edgeData.documents || [];
  const originalLabel = edgeData.originalLabel || label;

  const points: XYPosition[] = [
    { x: sourceX, y: sourceY },
    ...controlPoints,
    { x: targetX, y: targetY }
  ];

  const { path: polylinePath, midPoint } = computePolylinePath(points);
  const hasCustomPath = controlPoints.length > 0 && polylinePath.length > 0;

  // Fallback to straight line if no waypoints
  const [defaultPath, defaultLabelX, defaultLabelY] = getStraightPath({
    sourceX,
    sourceY,
    targetX,
    targetY
  });

  const edgePath = hasCustomPath ? polylinePath : defaultPath;
  const labelX = hasCustomPath ? midPoint.x : defaultLabelX;
  const labelY = hasCustomPath ? midPoint.y : defaultLabelY;

  const segments = points.slice(0, -1).map((start, index) => {
    const end = points[index + 1];
    return { start, end };
  });

  const beginControlPointDrag = (index: number, basePoints: XYPosition[]) => {
    if (!edgeData.onControlPointsPreview || !edgeData.onControlPointsCommit) {
      return;
    }

    const mutablePoints = basePoints.map(point => ({ ...point }));

    const updatePoint = (clientX: number, clientY: number, commit: boolean, disableSnap: boolean = false) => {
      const projected = projectClientPoint(clientX, clientY, edgeData.screenToFlowPosition);
      if (!projected) {
        return;
      }

      const nextValue: XYPosition = {
        x: disableSnap ? projected.x : snapCoordinate(projected.x),
        y: disableSnap ? projected.y : snapCoordinate(projected.y)
      };

      mutablePoints[index] = nextValue;

      const snapshot = mutablePoints.map(point => ({ ...point }));
      if (commit) {
        edgeData.onControlPointsCommit?.(snapshot);
      } else {
        edgeData.onControlPointsPreview?.(snapshot);
      }
    };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      // Shift key disables snap-to-grid
      updatePoint(moveEvent.clientX, moveEvent.clientY, false, moveEvent.shiftKey);
    };

    const handleMouseUp = (upEvent: MouseEvent) => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.userSelect = "";
      updatePoint(upEvent.clientX, upEvent.clientY, true, upEvent.shiftKey);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    document.body.style.userSelect = "none";
  };

  const handleControlPointMouseDown = (index: number) => (event: React.MouseEvent) => {
    event.stopPropagation();
    event.preventDefault();
    if (!edgeData.onControlPointsPreview || !edgeData.onControlPointsCommit) {
      return;
    }

    beginControlPointDrag(index, controlPoints.map(point => ({ ...point })));
  };

  const handleControlPointDoubleClick = (index: number) => (event: React.MouseEvent) => {
    event.stopPropagation();
    event.preventDefault();
    if (!edgeData.onControlPointsCommit) {
      return;
    }
    const updated = controlPoints.filter((_, idx) => idx !== index);
    edgeData.onControlPointsCommit(updated);
  };

  const handleControlPointClick = (index: number) => (event: React.MouseEvent) => {
    if (event.altKey) {
      event.stopPropagation();
      event.preventDefault();
      if (!edgeData.onControlPointsCommit) {
        return;
      }
      const updated = controlPoints.filter((_, idx) => idx !== index);
      edgeData.onControlPointsCommit(updated);
    }
  };

  const handleSegmentMouseDown = (
    segmentIndex: number,
    event: React.MouseEvent
  ) => {
    if (event.button !== 0) {
      return;
    }
    if (!edgeData.onControlPointsPreview || !edgeData.onControlPointsCommit) {
      return;
    }

    const projected = projectClientPoint(event.clientX, event.clientY, edgeData.screenToFlowPosition);
    if (!projected) {
      return;
    }

    // Check if clicking near existing waypoint
    let nearestIndex: number | null = null;
    let nearestDistance = Number.POSITIVE_INFINITY;
    controlPoints.forEach((point, index) => {
      const dx = point.x - projected.x;
      const dy = point.y - projected.y;
      const distance = Math.hypot(dx, dy);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = index;
      }
    });

    if (nearestIndex !== null && nearestDistance <= 12) {
      event.stopPropagation();
      event.preventDefault();
      beginControlPointDrag(nearestIndex, controlPoints.map(point => ({ ...point })));
      return;
    }

    if (controlPoints.length >= MAX_CONTROL_POINTS) {
      return;
    }

    event.stopPropagation();
    event.preventDefault();

    // Ctrl+Click: Add waypoint without dragging
    if (event.ctrlKey || event.metaKey) {
      const insertionIndex = Math.max(0, Math.min(controlPoints.length, segmentIndex));
      const snappedPoint: XYPosition = {
        x: event.shiftKey ? projected.x : snapCoordinate(projected.x),
        y: event.shiftKey ? projected.y : snapCoordinate(projected.y)
      };

      const updatedPoints = [...controlPoints];
      updatedPoints.splice(insertionIndex, 0, snappedPoint);
      edgeData.onControlPointsCommit(updatedPoints.map(point => ({ ...point })));
      return;
    }

    // Normal click: Add waypoint and start dragging
    const insertionIndex = Math.max(0, Math.min(controlPoints.length, segmentIndex));
    const snappedPoint: XYPosition = {
      x: event.shiftKey ? projected.x : snapCoordinate(projected.x),
      y: event.shiftKey ? projected.y : snapCoordinate(projected.y)
    };

    const updatedPoints = [...controlPoints];
    updatedPoints.splice(insertionIndex, 0, snappedPoint);
    edgeData.onControlPointsPreview(updatedPoints.map(point => ({ ...point })));
    beginControlPointDrag(insertionIndex, updatedPoints);
  };

  return (
    <>
      {selected && edgeData.onControlPointsCommit && segments.map((segment, index) => (
        <path
          key={`${id}-segment-overlay-${index}`}
          d={`M ${segment.start.x},${segment.start.y} L ${segment.end.x},${segment.end.y}`}
          stroke={hoveredSegment === index ? "rgba(37, 99, 235, 0.45)" : "rgba(37, 99, 235, 0.2)"}
          strokeWidth={selected ? 12 : 0}
          fill="none"
          pointerEvents="stroke"
          style={{ cursor: edgeData.onControlPointsCommit ? "crosshair" : "default" }}
          onMouseEnter={() => setHoveredSegment(index)}
          onMouseLeave={() => setHoveredSegment(prev => (prev === index ? null : prev))}
          onMouseDown={(event) => handleSegmentMouseDown(index, event)}
        />
      ))}
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        markerStart={markerStart}
        style={style}
      />
      <EdgeLabelRenderer>
        <EdgeLabelContent
          label={originalLabel as string}
          documentIds={documentIds}
          documents={documents}
          onOpenDocument={edgeData.onOpenDocument}
          labelX={labelX}
          labelY={labelY}
          labelOffsetX={edgeData.labelOffsetX}
          labelOffsetY={edgeData.labelOffsetY}
          onUpdateLabelOffset={edgeData.onUpdateLabelOffset}
          onUpdateLabel={edgeData.onUpdateLabel}
          selected={selected}
        />
      </EdgeLabelRenderer>
      {selected && controlPoints.map((point, index) => (
        <EdgeLabelRenderer key={`${id}-cp-${index}`}>
          <div
            role="button"
            title="Drag to adjust • Double-click to remove • Alt+Click to delete • Shift to disable snap"
            onMouseDown={handleControlPointMouseDown(index)}
            onDoubleClick={handleControlPointDoubleClick(index)}
            onClick={handleControlPointClick(index)}
            className="nodrag nopan"
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${point.x}px, ${point.y}px)`,
              width: "14px",
              height: "14px",
              borderRadius: "50%",
              background: "#ffffff",
              border: selected ? "2px solid #2563eb" : "1px solid #94a3b8",
              boxShadow: "0 2px 4px rgba(37, 99, 235, 0.2)",
              cursor: "grab",
              zIndex: 10,
              pointerEvents: "all"
            }}
          />
        </EdgeLabelRenderer>
      ))}
    </>
  );
}

export function BezierEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
  markerStart,
  data,
  label,
  selected
}: EdgeProps<Edge<CustomEdgeData>>) {
  const edgeData = data || {};
  const controlPoints = Array.isArray(edgeData.controlPoints) ? edgeData.controlPoints : [];

  const documentIds = edgeData.documentIds || [];
  const documents = edgeData.documents || [];
  const originalLabel = edgeData.originalLabel || label;

  // If we have exactly 2 control points, use them for Bezier curve
  // Otherwise, use default Bezier calculation
  let edgePath: string;
  let labelX: number;
  let labelY: number;

  if (controlPoints.length === 2) {
    // Custom Bezier with user-defined control points
    const [cp1, cp2] = controlPoints;
    edgePath = `M ${sourceX},${sourceY} C ${cp1.x},${cp1.y} ${cp2.x},${cp2.y} ${targetX},${targetY}`;
    labelX = (sourceX + cp1.x + cp2.x + targetX) / 4;
    labelY = (sourceY + cp1.y + cp2.y + targetY) / 4;
  } else {
    // Default Bezier path
    [edgePath, labelX, labelY] = getBezierPath({
      sourceX,
      sourceY,
      sourcePosition,
      targetX,
      targetY,
      targetPosition
    });
  }

  const beginControlPointDrag = (index: number) => {
    if (!edgeData.onControlPointsPreview || !edgeData.onControlPointsCommit) {
      return;
    }

    const mutablePoints = controlPoints.map(point => ({ ...point }));

    const updatePoint = (clientX: number, clientY: number, commit: boolean, disableSnap: boolean = false) => {
      const projected = projectClientPoint(clientX, clientY, edgeData.screenToFlowPosition);
      if (!projected) {
        return;
      }

      const nextValue: XYPosition = {
        x: disableSnap ? projected.x : snapCoordinate(projected.x),
        y: disableSnap ? projected.y : snapCoordinate(projected.y)
      };

      mutablePoints[index] = nextValue;

      const snapshot = mutablePoints.map(point => ({ ...point }));
      if (commit) {
        edgeData.onControlPointsCommit?.(snapshot);
      } else {
        edgeData.onControlPointsPreview?.(snapshot);
      }
    };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      updatePoint(moveEvent.clientX, moveEvent.clientY, false, moveEvent.shiftKey);
    };

    const handleMouseUp = (upEvent: MouseEvent) => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.userSelect = "";
      updatePoint(upEvent.clientX, upEvent.clientY, true, upEvent.shiftKey);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    document.body.style.userSelect = "none";
  };

  const handleControlPointMouseDown = (index: number) => (event: React.MouseEvent) => {
    event.stopPropagation();
    event.preventDefault();
    if (!edgeData.onControlPointsPreview || !edgeData.onControlPointsCommit) {
      return;
    }

    beginControlPointDrag(index);
  };

  const handleEdgeDoubleClick = (event: React.MouseEvent) => {
    if (!edgeData.onControlPointsCommit || !selected) {
      return;
    }

    event.stopPropagation();
    event.preventDefault();

    // Initialize control points if not already set
    if (controlPoints.length === 0) {
      // Create default control points based on Bezier algorithm
      const dx = targetX - sourceX;
      const dy = targetY - sourceY;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const offset = distance * 0.25;

      const cp1 = {
        x: sourceX + (sourcePosition === 'right' ? offset : sourcePosition === 'left' ? -offset : 0),
        y: sourceY + (sourcePosition === 'bottom' ? offset : sourcePosition === 'top' ? -offset : 0)
      };
      const cp2 = {
        x: targetX + (targetPosition === 'left' ? offset : targetPosition === 'right' ? -offset : 0),
        y: targetY + (targetPosition === 'top' ? offset : targetPosition === 'bottom' ? -offset : 0)
      };

      edgeData.onControlPointsCommit([cp1, cp2]);
    }
  };

  const handleControlPointDoubleClick = (index: number) => (event: React.MouseEvent) => {
    event.stopPropagation();
    event.preventDefault();
    if (!edgeData.onControlPointsCommit) {
      return;
    }
    // Reset to default Bezier
    edgeData.onControlPointsCommit([]);
  };

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        markerStart={markerStart}
        style={style}
        onDoubleClick={handleEdgeDoubleClick}
      />
      {selected && controlPoints.length === 2 && (
        <>
          {/* Control lines */}
          <path
            d={`M ${sourceX},${sourceY} L ${controlPoints[0].x},${controlPoints[0].y}`}
            stroke="#94a3b8"
            strokeWidth="1"
            strokeDasharray="4 2"
            fill="none"
            pointerEvents="none"
          />
          <path
            d={`M ${targetX},${targetY} L ${controlPoints[1].x},${controlPoints[1].y}`}
            stroke="#94a3b8"
            strokeWidth="1"
            strokeDasharray="4 2"
            fill="none"
            pointerEvents="none"
          />
        </>
      )}
      <EdgeLabelRenderer>
        <EdgeLabelContent
          label={originalLabel as string}
          documentIds={documentIds}
          documents={documents}
          onOpenDocument={edgeData.onOpenDocument}
          labelX={labelX}
          labelY={labelY}
          labelOffsetX={edgeData.labelOffsetX}
          labelOffsetY={edgeData.labelOffsetY}
          onUpdateLabelOffset={edgeData.onUpdateLabelOffset}
          onUpdateLabel={edgeData.onUpdateLabel}
          selected={selected}
        />
      </EdgeLabelRenderer>
      {selected && controlPoints.map((point, index) => (
        <EdgeLabelRenderer key={`${id}-cp-${index}`}>
          <div
            role="button"
            title="Drag to adjust control point • Double-click to reset • Shift to disable snap"
            onMouseDown={handleControlPointMouseDown(index)}
            onDoubleClick={handleControlPointDoubleClick(index)}
            className="nodrag nopan"
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${point.x}px, ${point.y}px)`,
              width: "12px",
              height: "12px",
              borderRadius: "50%",
              background: "#94a3b8",
              border: "2px solid #ffffff",
              boxShadow: "0 2px 4px rgba(0, 0, 0, 0.2)",
              cursor: "grab",
              zIndex: 10,
              pointerEvents: "all"
            }}
          />
        </EdgeLabelRenderer>
      ))}
    </>
  );
}
