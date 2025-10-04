import { useState, useRef, useEffect } from "react";
import { ReactFlow, Background, Controls, MiniMap, type Node, type Edge, type Viewport, useReactFlow } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { toPng } from "html-to-image";
import { toast } from "sonner";
import { useApiClient } from "../lib/client";
import { SysmlBlockNode } from "./architecture/SysmlBlockNode";
import { StraightEdge, SmoothStepEdge, StepEdge, BezierEdge } from "./diagram/CustomEdge";

const nodeTypes = { sysmlBlock: SysmlBlockNode };
const edgeTypes = {
  straight: StraightEdge,
  smoothstep: SmoothStepEdge,
  step: StepEdge,
  default: BezierEdge
};

interface FloatingDiagramWindowProps {
  diagramName: string;
  initialPosition: { x: number; y: number };
  nodes: Node[];
  edges: Edge[];
  viewport?: Viewport;
  onClose: () => void;
  tenant: string;
  project: string;
}

function SnapshotButton({ onSnapshot, isUploading }: { onSnapshot: () => void; isUploading: boolean }) {
  return (
    <button
      onClick={onSnapshot}
      className="react-flow__controls-button"
      title={isUploading ? "Uploading..." : "Snapshot and upload diagram"}
      disabled={isUploading}
      style={{
        width: "32px",
        height: "32px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        opacity: isUploading ? 0.5 : 1
      }}
    >
      {isUploading ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" strokeDasharray="15 10" strokeLinecap="round">
            <animateTransform
              attributeName="transform"
              type="rotate"
              from="0 12 12"
              to="360 12 12"
              dur="1s"
              repeatCount="indefinite"
            />
          </circle>
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
          <circle cx="12" cy="13" r="4" />
        </svg>
      )}
    </button>
  );
}

export function FloatingDiagramWindow({
  diagramName,
  initialPosition,
  nodes,
  edges,
  viewport,
  onClose,
  tenant,
  project
}: FloatingDiagramWindowProps) {
  const [position, setPosition] = useState(initialPosition);
  const [size, setSize] = useState({ width: 900, height: 600 });
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [resizeStart, setResizeStart] = useState({ x: 0, y: 0, width: 0, height: 0 });
  const [isUploading, setIsUploading] = useState(false);
  const windowRef = useRef<HTMLDivElement>(null);
  const diagramRef = useRef<HTMLDivElement>(null);
  const api = useApiClient();

  const handleSnapshot = async () => {
    if (!diagramRef.current) return;
    if (isUploading) return;

    const toastId = toast.loading("Capturing diagram snapshot...");

    try {
      setIsUploading(true);

      const dataUrl = await toPng(diagramRef.current, {
        backgroundColor: "#ffffff",
        pixelRatio: 2
      });

      toast.loading("Uploading snapshot...", { id: toastId });

      // Convert data URL to blob
      const response = await fetch(dataUrl);
      const blob = await response.blob();

      // Create a file from the blob
      const filename = `${diagramName.replace(/\s+/g, '-')}-${Date.now()}.png`;
      const file = new File([blob], filename, { type: "image/png" });

      // Upload to surrogates
      await api.uploadSurrogateDocument({
        tenant,
        projectKey: project,
        file,
        name: `${diagramName} Snapshot`
      });

      toast.success("Diagram snapshot uploaded successfully!", { id: toastId });
    } catch (error) {
      console.error("Failed to capture and upload snapshot:", error);
      toast.error("Failed to upload snapshot. Please try again.", { id: toastId });
    } finally {
      setIsUploading(false);
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest(".floating-diagram-header")) {
      setIsDragging(true);
      setDragOffset({
        x: e.clientX - position.x,
        y: e.clientY - position.y
      });
    }
  };

  const handleResizeMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
    setResizeStart({
      x: e.clientX,
      y: e.clientY,
      width: size.width,
      height: size.height
    });
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        setPosition({
          x: e.clientX - dragOffset.x,
          y: e.clientY - dragOffset.y
        });
      } else if (isResizing) {
        const deltaX = e.clientX - resizeStart.x;
        const deltaY = e.clientY - resizeStart.y;
        setSize({
          width: Math.max(400, resizeStart.width + deltaX),
          height: Math.max(300, resizeStart.height + deltaY)
        });
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      setIsResizing(false);
    };

    if (isDragging || isResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, isResizing, dragOffset, resizeStart]);

  return (
    <div
      ref={windowRef}
      className="floating-document-window"
      style={{
        position: "fixed",
        left: position.x,
        top: position.y,
        width: `${size.width}px`,
        height: `${size.height}px`,
        background: "white",
        border: "1px solid #cbd5e1",
        borderRadius: "8px",
        boxShadow: "0 10px 40px rgba(0, 0, 0, 0.2)",
        zIndex: 1000,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden"
      }}
      onMouseDown={handleMouseDown}
    >
      <div
        className="floating-diagram-header"
        style={{
          padding: "12px 16px",
          borderBottom: "1px solid #e2e8f0",
          background: "#f8fafc",
          cursor: isDragging ? "grabbing" : "grab",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          userSelect: "none"
        }}
      >
        <div>
          <h3 style={{ margin: 0, fontSize: "14px", fontWeight: 600, color: "#1a1a1a" }}>
            {diagramName}
          </h3>
          <span
            style={{
              fontSize: "11px",
              color: "#64748b",
              background: "#fef3c7",
              padding: "2px 6px",
              borderRadius: "4px",
              fontWeight: 600,
              marginLeft: "8px"
            }}
          >
            READ-ONLY
          </span>
        </div>
        <button
          onClick={onClose}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: "4px",
            borderRadius: "4px",
            color: "#64748b",
            display: "flex",
            alignItems: "center",
            justifyContent: "center"
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.background = "#e2e8f0";
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.background = "none";
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
      <div ref={diagramRef} style={{ flex: 1, position: "relative" }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          defaultViewport={viewport}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          panOnDrag={true}
          zoomOnScroll={true}
          fitView={!viewport}
          proOptions={{ hideAttribution: true }}
        >
          <Background />
          <Controls position="bottom-right" showInteractive={false}>
            <SnapshotButton onSnapshot={handleSnapshot} isUploading={isUploading} />
          </Controls>
        </ReactFlow>
        <div
          onMouseDown={handleResizeMouseDown}
          style={{
            position: "absolute",
            bottom: 0,
            right: 0,
            width: "20px",
            height: "20px",
            cursor: "nwse-resize",
            background: "linear-gradient(135deg, transparent 0%, transparent 50%, #94a3b8 50%, #94a3b8 100%)",
            borderBottomRightRadius: "8px",
            pointerEvents: "auto"
          }}
        />
      </div>
    </div>
  );
}
