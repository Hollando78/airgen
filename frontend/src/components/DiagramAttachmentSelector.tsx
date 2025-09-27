import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "../lib/client";
import type { DiagramAttachment, ArchitectureDiagramRecord } from "../types";

interface DiagramAttachmentSelectorProps {
  tenant: string;
  project: string;
  attachments: DiagramAttachment[];
  onAttachmentsChange: (attachments: DiagramAttachment[]) => void;
}

export function DiagramAttachmentSelector({
  tenant,
  project,
  attachments,
  onAttachmentsChange
}: DiagramAttachmentSelectorProps): JSX.Element {
  const api = useApiClient();
  const [showSelector, setShowSelector] = useState(false);

  const diagramsQuery = useQuery({
    queryKey: ["diagrams", tenant, project],
    queryFn: () => api.listArchitectureDiagrams(tenant, project),
    enabled: Boolean(tenant && project && showSelector)
  });

  const addAttachment = (diagram: ArchitectureDiagramRecord, includeGeometry = false, includeConnections = true) => {
    const attachment: DiagramAttachment = {
      type: "diagram",
      diagramId: diagram.id,
      includeGeometry,
      includeConnections
    };
    
    // Check if already attached
    if (!attachments.some(a => a.diagramId === diagram.id)) {
      onAttachmentsChange([...attachments, attachment]);
    }
  };

  const removeAttachment = (diagramId: string) => {
    onAttachmentsChange(attachments.filter(a => a.diagramId !== diagramId));
  };

  const updateAttachment = (diagramId: string, updates: Partial<DiagramAttachment>) => {
    onAttachmentsChange(attachments.map(a => 
      a.diagramId === diagramId ? { ...a, ...updates } : a
    ));
  };

  const getDiagramName = (diagramId: string) => {
    const diagram = diagramsQuery.data?.diagrams.find(d => d.id === diagramId);
    return diagram?.name || diagramId;
  };

  const getDiagramView = (diagramId: string) => {
    const diagram = diagramsQuery.data?.diagrams.find(d => d.id === diagramId);
    return diagram?.view || "unknown";
  };

  return (
    <div className="diagram-attachment-selector">
      <div className="form-group">
        <label className="form-label">Attached Diagrams</label>
        
        {attachments.length > 0 && (
          <div className="attached-diagrams">
            {attachments.map((attachment) => (
              <div key={attachment.diagramId} className="attached-diagram">
                <div className="diagram-info">
                  <span className="diagram-name">{getDiagramName(attachment.diagramId)}</span>
                  <span className={`diagram-view diagram-view--${getDiagramView(attachment.diagramId)}`}>
                    {getDiagramView(attachment.diagramId)}
                  </span>
                </div>
                <div className="diagram-options">
                  <label className="diagram-option">
                    <input
                      type="checkbox"
                      checked={attachment.includeConnections || false}
                      onChange={(e) => updateAttachment(attachment.diagramId, { 
                        includeConnections: e.target.checked 
                      })}
                    />
                    Connections
                  </label>
                  <label className="diagram-option">
                    <input
                      type="checkbox"
                      checked={attachment.includeGeometry || false}
                      onChange={(e) => updateAttachment(attachment.diagramId, { 
                        includeGeometry: e.target.checked 
                      })}
                    />
                    Layout
                  </label>
                </div>
                <button
                  type="button"
                  onClick={() => removeAttachment(attachment.diagramId)}
                  className="remove-button"
                  title="Remove attachment"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        <button
          type="button"
          onClick={() => setShowSelector(!showSelector)}
          className="btn btn--secondary"
          style={{ marginTop: attachments.length > 0 ? "8px" : "0" }}
        >
          {showSelector ? "Hide" : "Attach"} Diagrams
        </button>
      </div>

      {showSelector && (
        <div className="diagram-selector">
          <div className="form-help" style={{ marginBottom: "12px" }}>
            Select architecture diagrams to provide context for AI generation. Include connections for interface requirements, layout for spatial constraints.
          </div>
          
          {diagramsQuery.isLoading && (
            <div style={{ padding: "20px", textAlign: "center", color: "#64748b" }}>
              Loading diagrams...
            </div>
          )}

          {diagramsQuery.error && (
            <div style={{ padding: "20px", textAlign: "center", color: "#ef4444" }}>
              Failed to load diagrams
            </div>
          )}

          {diagramsQuery.data?.diagrams && (
            <div className="available-diagrams">
              {diagramsQuery.data.diagrams.length === 0 ? (
                <div style={{ padding: "20px", textAlign: "center", color: "#64748b" }}>
                  No diagrams available. Create diagrams in the Architecture workspace.
                </div>
              ) : (
                diagramsQuery.data.diagrams.map((diagram) => {
                  const isAttached = attachments.some(a => a.diagramId === diagram.id);
                  return (
                    <div
                      key={diagram.id}
                      className={`diagram-item ${isAttached ? "diagram-item--attached" : ""}`}
                    >
                      <div className="diagram-item-info">
                        <div className="diagram-item-name">{diagram.name}</div>
                        <div className="diagram-item-meta">
                          <span className={`diagram-view diagram-view--${diagram.view}`}>
                            {diagram.view}
                          </span>
                          {diagram.description && (
                            <span className="diagram-description">{diagram.description}</span>
                          )}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => isAttached ? removeAttachment(diagram.id) : addAttachment(diagram)}
                        className={`btn btn--compact ${isAttached ? "btn--secondary" : "btn--primary"}`}
                        disabled={isAttached}
                      >
                        {isAttached ? "Attached" : "Attach"}
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      )}

      <style>{`
        .diagram-attachment-selector {
          margin-bottom: 16px;
        }

        .attached-diagrams {
          margin-bottom: 12px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .attached-diagram {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 8px 12px;
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 6px;
          gap: 12px;
        }

        .diagram-info {
          display: flex;
          align-items: center;
          gap: 8px;
          flex: 1;
        }

        .diagram-name {
          font-weight: 500;
          color: #0f172a;
        }

        .diagram-view {
          padding: 2px 6px;
          border-radius: 4px;
          font-size: 11px;
          font-weight: 500;
          text-transform: uppercase;
        }

        .diagram-view--block {
          background: #dbeafe;
          color: #1e40af;
        }

        .diagram-view--internal {
          background: #dcfce7;
          color: #166534;
        }

        .diagram-view--deployment {
          background: #fef3c7;
          color: #92400e;
        }

        .diagram-options {
          display: flex;
          gap: 12px;
        }

        .diagram-option {
          display: flex;
          align-items: center;
          gap: 4px;
          font-size: 12px;
          color: #64748b;
          cursor: pointer;
        }

        .diagram-option input[type="checkbox"] {
          margin: 0;
        }

        .remove-button {
          border: none;
          background: none;
          color: #64748b;
          cursor: pointer;
          font-size: 18px;
          line-height: 1;
          padding: 4px;
          border-radius: 4px;
        }

        .remove-button:hover {
          background: #e2e8f0;
          color: #dc2626;
        }

        .diagram-selector {
          margin-top: 12px;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          padding: 16px;
          background: #fafbfc;
        }

        .available-diagrams {
          max-height: 300px;
          overflow-y: auto;
        }

        .diagram-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px;
          border: 1px solid #e2e8f0;
          border-radius: 6px;
          background: white;
          margin-bottom: 8px;
        }

        .diagram-item:last-child {
          margin-bottom: 0;
        }

        .diagram-item--attached {
          background: #f0f9ff;
          border-color: #bae6fd;
        }

        .diagram-item-info {
          flex: 1;
          min-width: 0;
        }

        .diagram-item-name {
          font-weight: 500;
          color: #0f172a;
          margin-bottom: 4px;
        }

        .diagram-item-meta {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }

        .diagram-description {
          color: #64748b;
          font-size: 13px;
        }
      `}</style>
    </div>
  );
}