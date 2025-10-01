import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { Label } from "../ui/label";
import { DocumentAttachmentSelector } from "../DocumentAttachmentSelector";
import { DiagramAttachmentSelector } from "../DiagramAttachmentSelector";
import type { DocumentAttachment, DiagramAttachment } from "../../types";

/**
 * Props for the QueryForm component
 */
export interface QueryFormProps {
  /** Current mode - requirements or diagram generation */
  mode: 'requirements' | 'diagram';
  /** Stakeholder instruction text */
  instruction: string;
  /** Optional glossary text */
  glossary: string;
  /** Optional constraints text */
  constraints: string;
  /** Number of candidates to generate */
  count: number;
  /** Attached documents for context */
  attachedDocuments: DocumentAttachment[];
  /** Attached diagrams for context */
  attachedDiagrams: DiagramAttachment[];
  /** Tenant slug */
  tenant: string;
  /** Project key */
  project: string;
  /** Whether the form is disabled */
  disabled: boolean;
  /** Whether a generation is pending */
  isPending: boolean;
  /** Handler for mode change */
  onModeChange: (mode: 'requirements' | 'diagram') => void;
  /** Handler for instruction change */
  onInstructionChange: (instruction: string) => void;
  /** Handler for glossary change */
  onGlossaryChange: (glossary: string) => void;
  /** Handler for constraints change */
  onConstraintsChange: (constraints: string) => void;
  /** Handler for count change */
  onCountChange: (count: number) => void;
  /** Handler for attached documents change */
  onAttachedDocumentsChange: (documents: DocumentAttachment[]) => void;
  /** Handler for attached diagrams change */
  onAttachedDiagramsChange: (diagrams: DiagramAttachment[]) => void;
  /** Handler for form submission */
  onSubmit: (event: React.FormEvent) => void;
}

/**
 * Form component for AIRGen query input with mode selection,
 * text inputs, and document/diagram attachments
 */
export function QueryForm({
  mode,
  instruction,
  glossary,
  constraints,
  count,
  attachedDocuments,
  attachedDiagrams,
  tenant,
  project,
  disabled,
  isPending,
  onModeChange,
  onInstructionChange,
  onGlossaryChange,
  onConstraintsChange,
  onCountChange,
  onAttachedDocumentsChange,
  onAttachedDiagramsChange,
  onSubmit
}: QueryFormProps): JSX.Element {
  return (
    <div className="chat-card">
      <div className="mode-selector">
        <h2 className="section-title">AIRGen Mode</h2>
        <div className="mode-options">
          <label className="mode-option">
            <input
              type="radio"
              name="mode"
              value="requirements"
              checked={mode === 'requirements'}
              onChange={(e) => onModeChange(e.target.value as 'requirements' | 'diagram')}
            />
            <span>Requirements</span>
          </label>
          <label className="mode-option">
            <input
              type="radio"
              name="mode"
              value="diagram"
              checked={mode === 'diagram'}
              onChange={(e) => onModeChange(e.target.value as 'requirements' | 'diagram')}
            />
            <span>Diagram</span>
          </label>
        </div>
      </div>

      <div className="form-section">
        <h2 className="form-title">{mode === 'requirements' ? 'Generate candidate requirements' : 'Generate candidate diagram'}</h2>
        <form className="airgen-form" onSubmit={onSubmit}>
          <div className="space-y-2">
            <Label htmlFor="instruction">Stakeholder instruction</Label>
            <Textarea
              id="instruction"
              value={instruction}
              onChange={event => onInstructionChange(event.target.value)}
              placeholder="Describe the stakeholder need or scenario..."
              rows={4}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="glossary">Glossary (optional)</Label>
            <Textarea
              id="glossary"
              value={glossary}
              onChange={event => onGlossaryChange(event.target.value)}
              placeholder="List key terms and definitions..."
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="constraints">Constraints (optional)</Label>
            <Textarea
              id="constraints"
              value={constraints}
              onChange={event => onConstraintsChange(event.target.value)}
              placeholder="Document assumptions, limits, certification targets, etc."
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="count">Number of candidates</Label>
            <Input
              id="count"
              type="number"
              min={1}
              max={10}
              value={count}
              onChange={event => onCountChange(Number(event.target.value) || 1)}
            />
          </div>

          <DocumentAttachmentSelector
            tenant={tenant}
            project={project}
            attachments={attachedDocuments}
            onAttachmentsChange={onAttachedDocumentsChange}
          />

          <DiagramAttachmentSelector
            tenant={tenant}
            project={project}
            attachments={attachedDiagrams}
            onAttachmentsChange={onAttachedDiagramsChange}
          />

          <Button type="submit" disabled={disabled || isPending} className="w-full">
            {isPending ? "Generating…" : mode === 'requirements' ? "Generate requirements" : "Generate diagram"}
          </Button>
        </form>
      </div>
    </div>
  );
}
