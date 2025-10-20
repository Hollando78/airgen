import { MouseEvent } from "react";

interface DiagramToolbarProps {
  isConnectMode: boolean;
  onToggleConnectMode: () => void;
  diagramName?: string;
  onPopout?: () => void;
  onAutoLayout?: () => void;
  onAutoSize?: () => void;
  onAutoRoute?: () => void;
}

export function DiagramToolbar({
  isConnectMode,
  onToggleConnectMode,
  diagramName,
  onPopout,
  onAutoLayout,
  onAutoSize,
  onAutoRoute
}: DiagramToolbarProps): JSX.Element {
  const handleClick = (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    onToggleConnectMode();
  };

  const handlePopout = (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (onPopout) {
      onPopout();
    }
  };

  const handleAutoLayout = (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (onAutoLayout) {
      onAutoLayout();
    }
  };

  const handleAutoSize = (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (onAutoSize) {
      onAutoSize();
    }
  };

  const handleAutoRoute = (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (onAutoRoute) {
      onAutoRoute();
    }
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

      <button
        onClick={handleAutoLayout}
        style={{
          background: "#f1f5f9",
          color: "#475569",
          border: "1px solid #cbd5e1",
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
          e.currentTarget.style.background = "#e2e8f0";
          e.currentTarget.style.borderColor = "#94a3b8";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "#f1f5f9";
          e.currentTarget.style.borderColor = "#cbd5e1";
        }}
        title="Arrange blocks hierarchically"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="5" r="2" />
          <circle cx="6" cy="15" r="2" />
          <circle cx="18" cy="15" r="2" />
          <line x1="12" y1="7" x2="12" y2="11" />
          <line x1="12" y1="11" x2="6" y2="13" />
          <line x1="12" y1="11" x2="18" y2="13" />
        </svg>
        Auto-Layout
      </button>

      <button
        onClick={handleAutoSize}
        style={{
          background: "#f1f5f9",
          color: "#475569",
          border: "1px solid #cbd5e1",
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
          e.currentTarget.style.background = "#e2e8f0";
          e.currentTarget.style.borderColor = "#94a3b8";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "#f1f5f9";
          e.currentTarget.style.borderColor = "#cbd5e1";
        }}
        title="Resize blocks to fit content"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
        </svg>
        Auto-Size
      </button>

      <button
        onClick={handleAutoRoute}
        style={{
          background: "#f1f5f9",
          color: "#475569",
          border: "1px solid #cbd5e1",
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
          e.currentTarget.style.background = "#e2e8f0";
          e.currentTarget.style.borderColor = "#94a3b8";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "#f1f5f9";
          e.currentTarget.style.borderColor = "#cbd5e1";
        }}
        title="Route connectors around blocks"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="4 4 10 4 10 10" />
          <polyline points="20 20 14 20 14 14" />
          <line x1="10" y1="10" x2="14" y2="14" />
        </svg>
        Auto-Route
      </button>

      <button
        onClick={handlePopout}
        style={{
          background: "#f1f5f9",
          color: "#475569",
          border: "1px solid #cbd5e1",
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
          e.currentTarget.style.background = "#e2e8f0";
          e.currentTarget.style.borderColor = "#94a3b8";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "#f1f5f9";
          e.currentTarget.style.borderColor = "#cbd5e1";
        }}
        title="Open diagram in new window"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
          <polyline points="15 3 21 3 21 9" />
          <line x1="10" y1="14" x2="21" y2="3" />
        </svg>
        Popout
      </button>
    </div>
  );
}
