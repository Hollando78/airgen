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
}

function EdgeLabelContent({
  label,
  documentIds,
  documents,
  onOpenDocument,
  labelX,
  labelY
}: {
  label?: string;
  documentIds: string[];
  documents: DocumentRecord[];
  onOpenDocument?: (slug: string) => void;
  labelX: number;
  labelY: number;
}) {
  const linkedDocuments = documents.filter(doc => documentIds.includes(doc.id));

  if (!label && linkedDocuments.length === 0) {
    return null;
  }

  return (
    <div
      style={{
        position: "absolute",
        transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
        pointerEvents: "all",
        display: "flex",
        flexDirection: "column",
        gap: "4px",
        alignItems: "center"
      }}
    >
      {label && (
        <div
          style={{
            background: "#ffffff",
            border: "1px solid #e2e8f0",
            borderRadius: "4px",
            padding: "6px 4px",
            fontSize: "12px",
            fontWeight: 500,
            color: "#0f172a",
            whiteSpace: "nowrap"
          }}
        >
          {label}
        </div>
      )}
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
  label
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
  label
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
  label
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
  label
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
        />
      </EdgeLabelRenderer>
    </>
  );
}
