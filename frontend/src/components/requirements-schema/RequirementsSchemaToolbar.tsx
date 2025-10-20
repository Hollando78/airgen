/**
 * Requirements Schema Toolbar Component
 *
 * Displays header with diagram tabs and create button
 */

export interface RequirementsSchemaToolbarProps {
  project: string;
  diagrams: any[];
  activeDiagramId: string | null;
  onDiagramChange: (diagramId: string) => void;
  onCreateClick: () => void;
}

export function RequirementsSchemaToolbar({
  project,
  diagrams,
  activeDiagramId,
  onDiagramChange,
  onCreateClick
}: RequirementsSchemaToolbarProps): JSX.Element {
  return (
    <>
      <header className="architecture-header">
        <div className="architecture-header-info">
          <h1>Requirements Schema</h1>
          <p>Document relationships for {project}</p>
        </div>
        <div className="architecture-header-actions">
          <button className="ghost-button" onClick={onCreateClick}>
            + New Diagram
          </button>
        </div>
      </header>

      {/* Diagram Tabs */}
      <div className="architecture-tabs">
        {diagrams.map(diagram => (
          <div
            key={diagram.id}
            className={`diagram-tab ${diagram.id === activeDiagramId ? "active" : ""}`}
          >
            <button
              className="diagram-tab-button"
              onClick={() => onDiagramChange(diagram.id)}
              title={diagram.name}
            >
              {diagram.name}
            </button>
          </div>
        ))}
        {diagrams.length === 0 && (
          <div className="architecture-tabs empty">Create a diagram to start modeling</div>
        )}
      </div>
    </>
  );
}
