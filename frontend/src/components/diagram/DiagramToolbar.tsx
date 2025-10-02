import { MouseEvent } from "react";

interface DiagramToolbarProps {
  isConnectMode: boolean;
  onToggleConnectMode: () => void;
}

export function DiagramToolbar({ isConnectMode, onToggleConnectMode }: DiagramToolbarProps): JSX.Element {
  const handleClick = (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    onToggleConnectMode();
  };

  return (
    <div
      style={{
        position: "absolute",
        top: "16px",
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 100,
        background: "white",
        border: "1px solid #cbd5e1",
        borderRadius: "8px",
        boxShadow: "0 2px 8px rgba(0, 0, 0, 0.1)",
        padding: "8px 12px",
        display: "flex",
        gap: "8px",
        alignItems: "center"
      }}
    >
      <button
        onClick={handleClick}
        style={{
          background: isConnectMode ? "#2563eb" : "#f1f5f9",
          color: isConnectMode ? "white" : "#475569",
          border: "1px solid",
          borderColor: isConnectMode ? "#1e40af" : "#cbd5e1",
          borderRadius: "6px",
          padding: "6px 12px",
          fontSize: "13px",
          fontWeight: 500,
          cursor: "pointer",
          transition: "all 0.2s ease",
          display: "flex",
          alignItems: "center",
          gap: "6px"
        }}
        onMouseEnter={(e) => {
          if (!isConnectMode) {
            e.currentTarget.style.background = "#e2e8f0";
            e.currentTarget.style.borderColor = "#94a3b8";
          }
        }}
        onMouseLeave={(e) => {
          if (!isConnectMode) {
            e.currentTarget.style.background = "#f1f5f9";
            e.currentTarget.style.borderColor = "#cbd5e1";
          }
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="6" cy="12" r="3" />
          <circle cx="18" cy="12" r="3" />
          <line x1="9" y1="12" x2="15" y2="12" />
        </svg>
        {isConnectMode ? "Connect Mode" : "Drag Mode"}
      </button>
    </div>
  );
}
