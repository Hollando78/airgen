import React, { useState, useRef } from "react";
import type { SysmlConnector } from "../../hooks/useArchitectureApi";

interface ConnectorStylingPopupProps {
  connector: SysmlConnector;
  position: { x: number; y: number };
  onUpdate: (updates: Partial<Pick<SysmlConnector, "lineStyle" | "markerStart" | "markerEnd" | "linePattern" | "color" | "strokeWidth">>) => void;
  onClose: () => void;
}

const CONNECTOR_PRESETS = [
  { label: "Default", lineStyle: "straight", linePattern: "solid", markerEnd: "arrowclosed", markerStart: "none" },
  { label: "Flow", lineStyle: "smoothstep", linePattern: "solid", markerEnd: "arrowclosed", markerStart: "none", color: "#2563eb" },
  { label: "Dependency", lineStyle: "straight", linePattern: "dashed", markerEnd: "arrowclosed", markerStart: "none", color: "#7c3aed" },
  { label: "Composition", lineStyle: "straight", linePattern: "solid", markerEnd: "arrowclosed", markerStart: "arrowclosed", color: "#dc2626" },
  { label: "Association", lineStyle: "straight", linePattern: "dotted", markerEnd: "none", markerStart: "none", color: "#334155" }
];

function getDefaultColorByKind(kind: string): string {
  switch (kind) {
    case "flow": return "#2563eb";
    case "dependency": return "#7c3aed";
    case "composition": return "#dc2626";
    case "association": return "#334155";
    default: return "#64748b";
  }
}

export function ConnectorStylingPopup({ connector, position: initialPosition, onUpdate, onClose }: ConnectorStylingPopupProps) {
  const [position, setPosition] = useState(initialPosition);
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<{ startX: number; startY: number; startPosX: number; startPosY: number }>({
    startX: 0,
    startY: 0,
    startPosX: 0,
    startPosY: 0
  });

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startPosX: position.x,
      startPosY: position.y
    };
    e.preventDefault();
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging) return;
    
    const deltaX = e.clientX - dragRef.current.startX;
    const deltaY = e.clientY - dragRef.current.startY;
    
    setPosition({
      x: dragRef.current.startPosX + deltaX,
      y: dragRef.current.startPosY + deltaY
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  React.useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging]);

  return (
    <div
      style={{
        position: "fixed",
        left: `${position.x}px`,
        top: `${position.y}px`,
        zIndex: 1000,
        background: "#ffffff",
        border: "1px solid #e2e8f0",
        borderRadius: "8px",
        boxShadow: "0 10px 25px rgba(0, 0, 0, 0.15), 0 4px 10px rgba(0, 0, 0, 0.1)",
        padding: "16px",
        minWidth: "280px",
        maxWidth: "320px"
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div 
        style={{ 
          display: "flex", 
          justifyContent: "space-between", 
          alignItems: "center", 
          marginBottom: "12px",
          cursor: isDragging ? "grabbing" : "grab",
          userSelect: "none",
          padding: "4px"
        }}
        onMouseDown={handleMouseDown}
      >
        <h4 style={{ margin: 0, fontSize: "14px", fontWeight: 600, color: "#1e293b", pointerEvents: "none" }}>
          Connector Styling
        </h4>
        <button
          onClick={onClose}
          onMouseDown={(e) => e.stopPropagation()}
          style={{
            background: "none",
            border: "none",
            fontSize: "16px",
            cursor: "pointer",
            color: "#64748b",
            padding: "4px",
            borderRadius: "4px",
            pointerEvents: "auto"
          }}
          onMouseEnter={e => e.currentTarget.style.background = "#f1f5f9"}
          onMouseLeave={e => e.currentTarget.style.background = "none"}
        >
          ×
        </button>
      </div>
      
      <div style={{ display: "grid", gap: "12px" }}>
        <div>
          <label style={{ fontSize: "12px", color: "#64748b", display: "block", marginBottom: "4px" }}>
            Presets
          </label>
          <select
            onChange={event => {
              const preset = CONNECTOR_PRESETS.find(p => p.label === event.target.value);
              if (preset) {
                onUpdate({
                  lineStyle: preset.lineStyle as any,
                  linePattern: preset.linePattern as any,
                  markerEnd: preset.markerEnd as any,
                  markerStart: preset.markerStart as any,
                  color: preset.color
                });
              }
            }}
            style={{ width: "100%", fontSize: "12px", padding: "4px", border: "1px solid #d1d5db", borderRadius: "4px" }}
            value=""
          >
            <option value="">Choose preset...</option>
            {CONNECTOR_PRESETS.map(preset => (
              <option key={preset.label} value={preset.label}>
                {preset.label}
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
          <div>
            <label style={{ fontSize: "12px", color: "#64748b", display: "block", marginBottom: "4px" }}>
              Line Style
            </label>
            <select
              value={connector.lineStyle ?? "straight"}
              onChange={event => onUpdate({ lineStyle: event.target.value as any })}
              style={{ width: "100%", fontSize: "12px", padding: "4px", border: "1px solid #d1d5db", borderRadius: "4px" }}
            >
              <option value="straight">Straight</option>
              <option value="smoothstep">Curved</option>
              <option value="step">Rectilinear</option>
              <option value="bezier">Bezier</option>
            </select>
          </div>
          
          <div>
            <label style={{ fontSize: "12px", color: "#64748b", display: "block", marginBottom: "4px" }}>
              Line Pattern
            </label>
            <select
              value={connector.linePattern ?? "solid"}
              onChange={event => onUpdate({ linePattern: event.target.value as any })}
              style={{ width: "100%", fontSize: "12px", padding: "4px", border: "1px solid #d1d5db", borderRadius: "4px" }}
            >
              <option value="solid">Solid</option>
              <option value="dashed">Dashed</option>
              <option value="dotted">Dotted</option>
            </select>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
          <div>
            <label style={{ fontSize: "12px", color: "#64748b", display: "block", marginBottom: "4px" }}>
              Color
            </label>
            <input
              type="color"
              value={connector.color ?? getDefaultColorByKind(connector.kind)}
              onChange={event => onUpdate({ color: event.target.value })}
              style={{ width: "100%", height: "32px", padding: "1px", border: "1px solid #d1d5db", borderRadius: "4px" }}
            />
          </div>
          
          <div>
            <label style={{ fontSize: "12px", color: "#64748b", display: "block", marginBottom: "4px" }}>
              Width ({connector.strokeWidth ?? 2}px)
            </label>
            <input
              type="range"
              min="1"
              max="6"
              value={connector.strokeWidth ?? 2}
              onChange={event => onUpdate({ strokeWidth: Number(event.target.value) })}
              style={{ width: "100%" }}
            />
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
          <div>
            <label style={{ fontSize: "12px", color: "#64748b", display: "block", marginBottom: "4px" }}>
              Start Marker
            </label>
            <select
              value={connector.markerStart ?? "none"}
              onChange={event => onUpdate({ markerStart: event.target.value as any })}
              style={{ width: "100%", fontSize: "12px", padding: "4px", border: "1px solid #d1d5db", borderRadius: "4px" }}
            >
              <option value="none">None</option>
              <option value="arrow">Arrow</option>
              <option value="arrowclosed">Arrow Closed</option>
              <option value="diamond">Diamond</option>
              <option value="circle">Circle</option>
            </select>
          </div>
          
          <div>
            <label style={{ fontSize: "12px", color: "#64748b", display: "block", marginBottom: "4px" }}>
              End Marker
            </label>
            <select
              value={connector.markerEnd ?? "arrowclosed"}
              onChange={event => onUpdate({ markerEnd: event.target.value as any })}
              style={{ width: "100%", fontSize: "12px", padding: "4px", border: "1px solid #d1d5db", borderRadius: "4px" }}
            >
              <option value="none">None</option>
              <option value="arrow">Arrow</option>
              <option value="arrowclosed">Arrow Closed</option>
              <option value="diamond">Diamond</option>
              <option value="circle">Circle</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}