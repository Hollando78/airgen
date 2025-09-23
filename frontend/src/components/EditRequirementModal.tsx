import { useState, useEffect } from "react";
import { Modal, TextInput, TextArea, Select, Button } from "./Modal";
import type { RequirementRecord, RequirementPattern, VerificationMethod } from "../types";

interface EditRequirementModalProps {
  isOpen: boolean;
  requirement: RequirementRecord | null;
  onClose: () => void;
  onUpdate: (updates: {
    title?: string;
    text?: string;
    pattern?: RequirementPattern;
    verification?: VerificationMethod;
  }) => void;
}

export function EditRequirementModal({
  isOpen,
  requirement,
  onClose,
  onUpdate
}: EditRequirementModalProps): JSX.Element {
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [pattern, setPattern] = useState<RequirementPattern | "">("");
  const [verification, setVerification] = useState<VerificationMethod | "">("");

  useEffect(() => {
    if (isOpen && requirement) {
      setTitle(requirement.title);
      setText(requirement.text);
      setPattern(requirement.pattern || "");
      setVerification(requirement.verification || "");
    }
  }, [isOpen, requirement]);

  const handleClose = () => {
    setTitle("");
    setText("");
    setPattern("");
    setVerification("");
    onClose();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (title.trim() && text.trim()) {
      onUpdate({
        title: title.trim(),
        text: text.trim(),
        pattern: pattern as RequirementPattern || undefined,
        verification: verification as VerificationMethod || undefined
      });
      handleClose();
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
      <Button variant="secondary" onClick={handleClose}>
        Cancel
      </Button>
      <Button 
        type="submit" 
        disabled={!title.trim() || !text.trim()}
        onClick={handleSubmit}
      >
        Update Requirement
      </Button>
    </>
  );

  if (!requirement) return <div></div>;

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Edit Requirement"
      subtitle={`Update requirement ${requirement.ref}`}
      size="large"
      footer={footer}
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        <TextInput
          label="Requirement Title"
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g., User Authentication System, Password Security"
          autoFocus
          help="A concise, descriptive title for this requirement"
        />

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
      </form>
    </Modal>
  );
}