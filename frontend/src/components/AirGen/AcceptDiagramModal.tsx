import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "../../lib/client";
import { Modal, TextInput, Select, TextArea, Button } from "../Modal";
import type { DiagramCandidate } from "../../types";

type AcceptDiagramModalProps = {
  isOpen: boolean;
  candidate: DiagramCandidate | null;
  tenant: string;
  project: string;
  onClose: () => void;
  onAccept: (params: {
    candidate: DiagramCandidate;
    mode: "new" | "update";
    targetDiagramId?: string;
    diagramName?: string;
    diagramDescription?: string;
  }) => void;
};

export function AcceptDiagramModal({
  isOpen,
  candidate,
  tenant,
  project,
  onClose,
  onAccept
}: AcceptDiagramModalProps): JSX.Element | null {
  const api = useApiClient();

  const [mode, setMode] = useState<"new" | "update">("new");
  const [targetDiagramId, setTargetDiagramId] = useState<string>("");
  const [diagramName, setDiagramName] = useState<string>("");
  const [diagramDescription, setDiagramDescription] = useState<string>("");

  // Query existing diagrams for the update option
  const diagramsQuery = useQuery({
    queryKey: ["architecture", "diagrams", tenant, project],
    queryFn: () => api.listArchitectureDiagrams(tenant, project),
    enabled: isOpen && Boolean(tenant && project)
  });

  // Reset form when modal opens or candidate changes
  useEffect(() => {
    if (isOpen && candidate) {
      setMode("new");
      setTargetDiagramId("");
      setDiagramName(candidate.diagramName || "");
      setDiagramDescription(candidate.diagramDescription || "");
    }
  }, [isOpen, candidate]);

  const handleSubmit = () => {
    if (!candidate) return;

    onAccept({
      candidate,
      mode,
      targetDiagramId: mode === "update" ? targetDiagramId : undefined,
      diagramName: mode === "new" ? diagramName : undefined,
      diagramDescription: mode === "new" ? diagramDescription : undefined
    });
  };

  const diagrams = diagramsQuery.data?.diagrams ?? [];
  const canSubmit = mode === "new" ? diagramName.trim() : targetDiagramId;

  const footer = (
    <>
      <Button variant="secondary" onClick={onClose}>
        Cancel
      </Button>
      <Button
        type="submit"
        onClick={handleSubmit}
        disabled={!canSubmit}
      >
        Accept diagram
      </Button>
    </>
  );

  return (
    <Modal
      isOpen={isOpen && Boolean(candidate)}
      onClose={onClose}
      title="Accept diagram candidate"
      size="medium"
      footer={footer}
    >
      {!candidate ? (
        <p>No candidate selected.</p>
      ) : (
        <div className="accept-diagram-modal">
          <div className="diagram-summary">
            <h4>{candidate.diagramName || "Untitled Diagram"}</h4>
            {candidate.diagramDescription && (
              <p className="description">{candidate.diagramDescription}</p>
            )}
            <div className="meta">
              <span><strong>Blocks:</strong> {candidate.blocks.length}</span>
              <span><strong>Connectors:</strong> {candidate.connectors.length}</span>
              <span><strong>Action:</strong> {candidate.action}</span>
            </div>
          </div>

          <div className="mode-selection">
            <label className="mode-label">How would you like to accept this diagram?</label>
            <div className="mode-options">
              <label className={`mode-option ${mode === "new" ? "selected" : ""}`}>
                <input
                  type="radio"
                  name="acceptMode"
                  value="new"
                  checked={mode === "new"}
                  onChange={() => setMode("new")}
                />
                <div className="mode-content">
                  <span className="mode-title">Create new diagram</span>
                  <span className="mode-description">
                    Create a brand new diagram with these blocks and connectors
                  </span>
                </div>
              </label>

              <label className={`mode-option ${mode === "update" ? "selected" : ""}`}>
                <input
                  type="radio"
                  name="acceptMode"
                  value="update"
                  checked={mode === "update"}
                  onChange={() => setMode("update")}
                />
                <div className="mode-content">
                  <span className="mode-title">Update existing diagram</span>
                  <span className="mode-description">
                    Add to an existing diagram, reusing blocks with matching names
                  </span>
                </div>
              </label>
            </div>
          </div>

          {mode === "new" && (
            <div className="new-diagram-form">
              <TextInput
                label="Diagram Name"
                value={diagramName}
                onChange={(e) => setDiagramName(e.target.value)}
                placeholder="Enter diagram name"
                required
              />
              <TextArea
                label="Description"
                value={diagramDescription}
                onChange={(e) => setDiagramDescription(e.target.value)}
                placeholder="Optional description"
                rows={3}
              />
            </div>
          )}

          {mode === "update" && (
            <div className="update-diagram-form">
              <Select
                label="Target Diagram"
                value={targetDiagramId}
                onChange={(e) => setTargetDiagramId(e.target.value)}
                options={diagrams.map(diagram => ({
                  value: diagram.id,
                  label: diagram.name
                }))}
                placeholder="Select diagram to update"
                help="Blocks with matching names will be reused instead of duplicated"
                required
              />
              {diagrams.length === 0 && (
                <p className="no-diagrams-hint">
                  No existing diagrams found. Create a new diagram instead.
                </p>
              )}
            </div>
          )}

          <style>{`
            .accept-diagram-modal {
              display: flex;
              flex-direction: column;
              gap: 24px;
            }

            .diagram-summary {
              background: #f8fafc;
              border: 1px solid #e2e8f0;
              border-radius: 8px;
              padding: 16px;
            }

            .diagram-summary h4 {
              font-size: 16px;
              font-weight: 600;
              color: #1e293b;
              margin: 0 0 8px 0;
            }

            .diagram-summary .description {
              color: #64748b;
              font-size: 14px;
              margin: 0 0 12px 0;
              line-height: 1.5;
            }

            .diagram-summary .meta {
              display: flex;
              gap: 16px;
              font-size: 13px;
              color: #475569;
            }

            .mode-selection {
              display: flex;
              flex-direction: column;
              gap: 12px;
            }

            .mode-label {
              font-size: 14px;
              font-weight: 600;
              color: #1e293b;
            }

            .mode-options {
              display: flex;
              flex-direction: column;
              gap: 12px;
            }

            .mode-option {
              display: flex;
              gap: 12px;
              padding: 16px;
              border: 2px solid #e2e8f0;
              border-radius: 8px;
              cursor: pointer;
              transition: all 0.2s ease;
              background: white;
            }

            .mode-option:hover {
              border-color: #cbd5e1;
              background: #f8fafc;
            }

            .mode-option.selected {
              border-color: #3b82f6;
              background: #eff6ff;
            }

            .mode-option input[type="radio"] {
              margin-top: 2px;
              flex-shrink: 0;
              accent-color: #3b82f6;
              cursor: pointer;
            }

            .mode-content {
              display: flex;
              flex-direction: column;
              gap: 4px;
              flex: 1;
            }

            .mode-title {
              font-size: 14px;
              font-weight: 600;
              color: #1e293b;
            }

            .mode-description {
              font-size: 13px;
              color: #64748b;
              line-height: 1.4;
            }

            .new-diagram-form,
            .update-diagram-form {
              display: flex;
              flex-direction: column;
              gap: 16px;
            }

            .no-diagrams-hint {
              background: #fef3c7;
              border: 1px solid #fcd34d;
              color: #92400e;
              padding: 12px;
              border-radius: 6px;
              font-size: 13px;
              margin: 0;
            }
          `}</style>
        </div>
      )}
    </Modal>
  );
}
