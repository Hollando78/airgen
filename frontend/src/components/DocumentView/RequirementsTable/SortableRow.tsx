import { useState, useRef, useEffect } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { RequirementRecord, InfoRecord, SurrogateReferenceRecord } from "../../../types";
import type { ColumnVisibility } from "./ColumnSelector";
import { InfoRow } from "./InfoRow";
import { SurrogateRow } from "./SurrogateRow";
import { EditableRequirementRow } from "./EditableRequirementRow";

// Define types for sortable items
export type SortableItemData = {
  id: string;
  type: 'requirement' | 'info' | 'surrogate';
  sectionId: string;
  data: RequirementRecord | InfoRecord | SurrogateReferenceRecord;
};

// SortableRow component for drag-and-drop
export interface SortableRowProps {
  item: SortableItemData;
  columnWidths: Record<string, number>;
  visibleColumns: ColumnVisibility;
  tenant: string;
  project: string;
  onContextMenu: (e: React.MouseEvent, requirement: RequirementRecord) => void;
  onEdit: (requirement: RequirementRecord) => void;
  onFieldUpdate?: (requirement: RequirementRecord, field: string, value: string) => void;
  onEditAttributes?: (requirement: RequirementRecord) => void;
  onViewHistory?: (requirement: RequirementRecord) => void;
  visibleColumnCount: number;
}

export function SortableRow({
  item,
  columnWidths,
  visibleColumns,
  tenant,
  project,
  onContextMenu,
  onEdit,
  onFieldUpdate,
  onEditAttributes,
  onViewHistory,
  visibleColumnCount
}: SortableRowProps): JSX.Element {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: item.id });

  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string>("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editingField && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingField]);

  const handleDoubleClick = (field: string, currentValue: string) => {
    if (field === 'id') return;
    setEditingField(field);
    setEditValue(currentValue || "");
  };

  const handleSave = () => {
    if (editingField && onFieldUpdate && item.type === 'requirement') {
      const req = item.data as RequirementRecord;
      if (editValue !== req[editingField as keyof RequirementRecord]) {
        onFieldUpdate(req, editingField, editValue);
      }
    }
    setEditingField(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSave();
    } else if (e.key === 'Escape') {
      setEditingField(null);
    }
  };

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    backgroundColor: isDragging ? "#f0f9ff" : undefined
  };

  if (item.type === 'info') {
    const info = item.data as InfoRecord;
    return (
      <InfoRow
        info={info}
        visibleColumnCount={visibleColumnCount}
        setNodeRef={setNodeRef}
        style={style}
        attributes={attributes}
        listeners={listeners}
        isDragging={isDragging}
      />
    );
  } else if (item.type === 'surrogate') {
    const surrogate = item.data as SurrogateReferenceRecord;
    return (
      <SurrogateRow
        surrogate={surrogate}
        visibleColumnCount={visibleColumnCount}
        tenant={tenant}
        project={project}
        setNodeRef={setNodeRef}
        style={style}
        attributes={attributes}
        listeners={listeners}
        isDragging={isDragging}
      />
    );
  } else {
    // Requirement row
    const req = item.data as RequirementRecord;
    return (
      <EditableRequirementRow
        requirement={req}
        columnWidths={columnWidths}
        visibleColumns={visibleColumns}
        setNodeRef={setNodeRef}
        style={style}
        attributes={attributes}
        listeners={listeners}
        isDragging={isDragging}
        editingField={editingField}
        editValue={editValue}
        inputRef={inputRef}
        onDoubleClick={handleDoubleClick}
        onSave={handleSave}
        onKeyDown={handleKeyDown}
        onEdit={onEdit}
        onContextMenu={onContextMenu}
        onEditAttributes={onEditAttributes}
        onViewHistory={onViewHistory}
        setEditValue={setEditValue}
      />
    );
  }
}
