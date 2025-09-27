interface DiagramTab {
  id: string;
  name: string;
}

interface DiagramTabsProps {
  diagrams: DiagramTab[];
  activeDiagramId: string | null;
  onSelect: (diagramId: string) => void;
  onRename: (diagramId: string) => void;
  onDelete: (diagramId: string) => void;
}

export function DiagramTabs({ diagrams, activeDiagramId, onSelect, onRename, onDelete }: DiagramTabsProps) {
  if (diagrams.length === 0) {
    return <div className="architecture-tabs empty">Create a diagram to start modelling</div>;
  }

  return (
    <div className="architecture-tabs">
      {diagrams.map(diagram => (
        <div
          key={diagram.id}
          className={`diagram-tab ${diagram.id === activeDiagramId ? "active" : ""}`}
        >
          <button
            className="diagram-tab-button"
            onClick={() => onSelect(diagram.id)}
            onDoubleClick={() => onRename(diagram.id)}
            title="Double-click to rename"
          >
            {diagram.name}
          </button>
          <button
            className="diagram-tab-close"
            onClick={() => onDelete(diagram.id)}
            title="Delete diagram"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
