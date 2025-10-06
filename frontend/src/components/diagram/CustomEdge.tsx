import { useState, useRef, useEffect } from "react";
import type { EdgeProps } from "@xyflow/react";
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
            cursor: onUpdateLabel ? "text" : "default"
          }}
          onDoubleClick={handleLabelDoubleClick}
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
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 0
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
  const [edgePath, labelX, labelY] = getBezierPath({
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
