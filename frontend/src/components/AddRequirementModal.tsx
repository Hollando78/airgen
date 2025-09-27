import { useState } from "react";
import { Modal, TextInput, TextArea, Select, Button } from "./Modal";
import type { RequirementPattern, VerificationMethod } from "../types";

interface AddRequirementModalProps {
  isOpen: boolean;
  sectionName: string;
  onClose: () => void;
  onAdd: (requirement: {
    text: string;
    pattern?: RequirementPattern;
    verification?: VerificationMethod;
  }) => void;
}

export function AddRequirementModal({
  isOpen,
  sectionName,
  onClose,
  onAdd
}: AddRequirementModalProps): JSX.Element {
  const [text, setText] = useState("");
  const [pattern, setPattern] = useState<RequirementPattern | "">("");
  const [verification, setVerification] = useState<VerificationMethod | "">("");

  const handleClose = () => {
    setText("");
    setPattern("");
    setVerification("");
    onClose();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (text.trim()) {
      onAdd({
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
        disabled={!text.trim()}
        onClick={handleSubmit}
      >
        Add Requirement
      </Button>
    </>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={`Add Requirement`}
      subtitle={`Create a new requirement in ${sectionName}`}
      size="large"
      footer={footer}
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
      </form>
    </Modal>
  );
}