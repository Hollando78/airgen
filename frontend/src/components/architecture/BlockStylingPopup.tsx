import React, { useState, useRef, useEffect, useCallback } from "react";
import type { SysmlBlock } from "../../hooks/useArchitectureApi";

interface BlockStylingPopupProps {
  block: SysmlBlock;
  position: { x: number; y: number };
  onUpdate: (updates: Partial<Pick<SysmlBlock, "backgroundColor" | "borderColor" | "borderWidth" | "borderStyle" | "textColor" | "fontSize" | "fontWeight" | "borderRadius">>) => void;
  onClose: () => void;
}

type BlockStyleUpdates = Partial<Pick<SysmlBlock, "backgroundColor" | "borderColor" | "borderWidth" | "borderStyle" | "textColor" | "fontSize" | "fontWeight" | "borderRadius">>;

export function BlockStylingPopup({ block, position: initialPosition, onUpdate, onClose }: BlockStylingPopupProps) {
  const [position, setPosition] = useState(initialPosition);
  const [isDragging, setIsDragging] = useState(false);
  const [localUpdates, setLocalUpdates] = useState<BlockStyleUpdates>({});
  const updateTimeoutRef = useRef<NodeJS.Timeout>();
  const dragRef = useRef<{ startX: number; startY: number; startPosX: number; startPosY: number }>({
    startX: 0,
    startY: 0,
    startPosX: 0,
    startPosY: 0
  });

  // Debounced update handler
  const handleStyleChange = useCallback((updates: BlockStyleUpdates) => {
    setLocalUpdates(prev => {
      const merged = { ...prev, ...updates };

      // Clear any existing timeout
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
      }

      // Schedule the update to be sent after 300ms of no changes
      updateTimeoutRef.current = setTimeout(() => {
        onUpdate(merged);
      }, 300);

      return merged;
    });
  }, [onUpdate]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
      }
    };
  }, []);

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
    if (!isDragging) {return;}
    
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
        zIndex: 9999,
        background: "#ffffff",
        border: "3px solid #2563eb",
        borderRadius: "8px",
        boxShadow: "0 10px 25px rgba(0, 0, 0, 0.3), 0 4px 10px rgba(0, 0, 0, 0.2)",
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
          Block Styling
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
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
          <div>
            <label style={{ fontSize: "12px", color: "#64748b", display: "block", marginBottom: "4px" }}>
              Background
            </label>
            <input
              type="color"
              value={localUpdates.backgroundColor ?? block.backgroundColor ?? "#ffffff"}
              onChange={event => handleStyleChange({ backgroundColor: event.target.value })}
              style={{ width: "100%", height: "32px", padding: "1px", border: "1px solid #d1d5db", borderRadius: "4px" }}
            />
          </div>

          <div>
            <label style={{ fontSize: "12px", color: "#64748b", display: "block", marginBottom: "4px" }}>
              Border Color
            </label>
            <input
              type="color"
              value={localUpdates.borderColor ?? block.borderColor ?? "#e2e8f0"}
              onChange={event => handleStyleChange({ borderColor: event.target.value })}
              style={{ width: "100%", height: "32px", padding: "1px", border: "1px solid #d1d5db", borderRadius: "4px" }}
            />
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
          <div>
            <label style={{ fontSize: "12px", color: "#64748b", display: "block", marginBottom: "4px" }}>
              Border Style
            </label>
            <select
              value={localUpdates.borderStyle ?? block.borderStyle ?? "solid"}
              onChange={event => handleStyleChange({ borderStyle: event.target.value })}
              style={{ width: "100%", fontSize: "12px", padding: "4px", border: "1px solid #d1d5db", borderRadius: "4px" }}
            >
              <option value="solid">Solid</option>
              <option value="dashed">Dashed</option>
              <option value="dotted">Dotted</option>
            </select>
          </div>
          
          <div>
            <label style={{ fontSize: "12px", color: "#64748b", display: "block", marginBottom: "4px" }}>
              Border Width ({localUpdates.borderWidth ?? block.borderWidth ?? 2}px)
            </label>
            <input
              type="range"
              min="1"
              max="6"
              value={localUpdates.borderWidth ?? block.borderWidth ?? 2}
              onChange={event => handleStyleChange({ borderWidth: Number(event.target.value) })}
              style={{ width: "100%" }}
            />
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
          <div>
            <label style={{ fontSize: "12px", color: "#64748b", display: "block", marginBottom: "4px" }}>
              Text Color
            </label>
            <input
              type="color"
              value={localUpdates.textColor ?? block.textColor ?? "#1e293b"}
              onChange={event => handleStyleChange({ textColor: event.target.value })}
              style={{ width: "100%", height: "32px", padding: "1px", border: "1px solid #d1d5db", borderRadius: "4px" }}
            />
          </div>

          <div>
            <label style={{ fontSize: "12px", color: "#64748b", display: "block", marginBottom: "4px" }}>
              Font Weight
            </label>
            <select
              value={localUpdates.fontWeight ?? block.fontWeight ?? "normal"}
              onChange={event => handleStyleChange({ fontWeight: event.target.value })}
              style={{ width: "100%", fontSize: "12px", padding: "4px", border: "1px solid #d1d5db", borderRadius: "4px" }}
            >
              <option value="normal">Normal</option>
              <option value="bold">Bold</option>
            </select>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
          <div>
            <label style={{ fontSize: "12px", color: "#64748b", display: "block", marginBottom: "4px" }}>
              Font Size ({localUpdates.fontSize ?? block.fontSize ?? 14}px)
            </label>
            <input
              type="range"
              min="10"
              max="20"
              value={localUpdates.fontSize ?? block.fontSize ?? 14}
              onChange={event => handleStyleChange({ fontSize: Number(event.target.value) })}
              style={{ width: "100%" }}
            />
          </div>

          <div>
            <label style={{ fontSize: "12px", color: "#64748b", display: "block", marginBottom: "4px" }}>
              Corner Radius ({localUpdates.borderRadius ?? block.borderRadius ?? 6}px)
            </label>
            <input
              type="range"
              min="0"
              max="16"
              value={localUpdates.borderRadius ?? block.borderRadius ?? 6}
              onChange={event => handleStyleChange({ borderRadius: Number(event.target.value) })}
              style={{ width: "100%" }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}