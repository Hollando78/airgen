import { useState, useEffect } from "react";
import { Modal, TextInput, TextArea, Select, Button } from "./Modal";
import type { RequirementRecord, RequirementPattern, VerificationMethod, DocumentSectionRecord } from "../types";

interface EditRequirementModalProps {
  isOpen: boolean;
  requirement: RequirementRecord | null;
  sections?: Array<DocumentSectionRecord & { requirements?: RequirementRecord[] }>;
  onClose: () => void;
  onUpdate: (updates: {
    text?: string;
    pattern?: RequirementPattern;
    verification?: VerificationMethod;
    sectionId?: string;
  }) => void;
  onDelete?: () => void;
}

export function EditRequirementModal({
  isOpen,
  requirement,
  sections = [],
  onClose,
  onUpdate,
  onDelete
}: EditRequirementModalProps): JSX.Element {
  const [text, setText] = useState("");
  const [pattern, setPattern] = useState<RequirementPattern | "">("");
  const [verification, setVerification] = useState<VerificationMethod | "">("");
  const [sectionId, setSectionId] = useState<string>("");

  useEffect(() => {
    if (isOpen && requirement) {
      setText(requirement.text);
      setPattern(requirement.pattern || "");
      setVerification(requirement.verification || "");
      // Find the current section ID if the requirement belongs to a section
      const currentSection = sections.find(s =>
        s.requirements?.some((r: any) => r.id === requirement.id)
      );
      setSectionId(currentSection?.id || "");
    }
  }, [isOpen, requirement, sections]);

  const handleClose = () => {
    setText("");
    setPattern("");
    setVerification("");
    setSectionId("");
    onClose();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (text.trim()) {
      onUpdate({
        text: text.trim(),
        pattern: pattern as RequirementPattern || undefined,
        verification: verification as VerificationMethod || undefined,
        sectionId: sectionId || undefined
      });
      handleClose();
    }
  };

  const handleDelete = () => {
    if (onDelete && requirement) {
      const confirmed = window.confirm(
        `Are you sure you want to delete requirement ${requirement.ref}? This action cannot be undone.`
      );
      if (confirmed) {
        onDelete();
        handleClose();
      }
    }
  };

  const patternOptions = [
    { value: "", label: "Select pattern (optional)" },
    { value: "ubiquitous", label: "Ubiquitous - General requirements" },
    { value: "event", label: "Event - Triggered by events" },
    { value: "state", label: "State - Conditions to maintain" },
    { value: "unwanted", label: "Unwanted - Prohibited behaviors" },
    { value: "optional", label: "Optional - Nice-to-have features" }
  ];

  const verificationOptions = [
    { value: "", label: "Select method (optional)" },
    { value: "Test", label: "Test - Executable verification" },
    { value: "Analysis", label: "Analysis - Mathematical/logical proof" },
    { value: "Inspection", label: "Inspection - Visual examination" },
    { value: "Demonstration", label: "Demonstration - Operational display" }
  ];

  const footer = (
    <>
      {onDelete && (
        <Button 
          variant="secondary" 
          onClick={handleDelete}
          style={{ 
            marginRight: "auto",
            backgroundColor: "#dc2626",
            borderColor: "#dc2626",
            color: "white"
          }}
        >
          Delete Requirement
        </Button>
      )}
      <Button variant="secondary" onClick={handleClose}>
        Cancel
      </Button>
      <Button 
        type="submit" 
        disabled={!text.trim()}
        onClick={handleSubmit}
      >
        Update Requirement
      </Button>
    </>
  );

  if (!requirement) {return <div></div>;}

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Edit Requirement"
      subtitle={`Update requirement ${requirement.ref}`}
      size="large"
      footer={footer}
      dismissible={false}
    >
      <form onSubmit={handleSubmit} className="space-y-6">

        <TextArea
          label="Requirement Text"
          required
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="The system shall provide secure user authentication using multi-factor verification..."
          rows={5}
          help="Complete requirement statement following best practices (clear, testable, unambiguous)"
        />

        <div className="form-row">
          <Select
            label="Pattern"
            value={pattern}
            onChange={(e) => setPattern(e.target.value as RequirementPattern)}
            options={patternOptions}
            help="Classification of requirement type"
          />
          <Select
            label="Verification Method"
            value={verification}
            onChange={(e) => setVerification(e.target.value as VerificationMethod)}
            options={verificationOptions}
            help="How this requirement will be verified"
          />
        </div>

        {sections.length > 0 && (
          <Select
            label="Section"
            value={sectionId}
            onChange={(e) => setSectionId(e.target.value)}
            options={[
              { value: "", label: "Select section (optional)" },
              ...sections.map(section => ({
                value: section.id,
                label: `${section.shortCode ? `[${section.shortCode}] ` : ''}${section.name}`
              }))
            ]}
            help="Move this requirement to a different section"
          />
        )}
      </form>
    </Modal>
  );
}
