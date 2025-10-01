import { useCallback } from "react";

/**
 * Props for the ColumnResizer component
 */
export interface ColumnResizerProps {
  /** Column key to resize */
  columnKey: string;
  /** Current column widths map */
  columnWidths: Record<string, number>;
  /** Whether currently resizing this column */
  isResizing: boolean;
  /** Handler to update column widths */
  onColumnWidthChange: (columnKey: string, width: number) => void;
  /** Handler to set/unset resizing state */
  onResizingChange: (columnKey: string | null) => void;
}

/**
 * Resizable column handle component that allows dragging to resize table columns
 */
export function ColumnResizer({
  columnKey,
  columnWidths,
  isResizing,
  onColumnWidthChange,
  onResizingChange
}: ColumnResizerProps): JSX.Element {
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = columnWidths[columnKey];
    onResizingChange(columnKey);

    const handleMouseMove = (e: MouseEvent) => {
      const diff = e.clientX - startX;
      const newWidth = Math.max(50, startWidth + diff);
      onColumnWidthChange(columnKey, newWidth);
    };

    const handleMouseUp = () => {
      onResizingChange(null);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [columnKey, columnWidths, onColumnWidthChange, onResizingChange]);

  return (
    <div
      onMouseDown={handleMouseDown}
      style={{
        position: 'absolute',
        right: 0,
        top: 0,
        bottom: 0,
        width: '4px',
        cursor: 'col-resize',
        backgroundColor: isResizing ? '#3b82f6' : 'transparent',
        zIndex: 1
      }}
      onMouseEnter={(e) => {
        if (!isResizing) {
          e.currentTarget.style.backgroundColor = '#e2e8f0';
        }
      }}
      onMouseLeave={(e) => {
        if (!isResizing) {
          e.currentTarget.style.backgroundColor = 'transparent';
        }
      }}
    />
  );
}
