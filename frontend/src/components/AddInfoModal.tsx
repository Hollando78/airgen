import { useState } from "react";
import { Modal, TextArea, TextInput, Select, Button } from "./Modal";
import type { DocumentSectionRecord } from "../types";

interface AddInfoModalProps {
  isOpen: boolean;
  sectionName: string;
  sectionId: string;
  sections?: DocumentSectionRecord[];
  onClose: () => void;
  onAdd: (info: {
    text: string;
    title?: string;
    sectionId: string;
  }) => void;
}

export function AddInfoModal({
  isOpen,
  sectionName,
  sectionId: defaultSectionId,
  sections = [],
  onClose,
  onAdd
}: AddInfoModalProps): JSX.Element {
  const [text, setText] = useState("");
  const [title, setTitle] = useState("");
  const [sectionId, setSectionId] = useState<string>(defaultSectionId);

  const handleClose = () => {
    setText("");
    setTitle("");
    setSectionId(defaultSectionId);
    onClose();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (text.trim() && sectionId) {
      onAdd({
        text: text.trim(),
        title: title.trim() || undefined,
        sectionId
      });
      handleClose();
    }
  };

  const footer = (
    <>
      <Button variant="secondary" onClick={handleClose}>
        Cancel
      </Button>
      <Button
        type="submit"
        disabled={!text.trim() || !sectionId}
        onClick={handleSubmit}
      >
        Add Info
      </Button>
    </>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={`Add Info`}
      subtitle={`Create informational content in ${sectionName}`}
      size="large"
      footer={footer}
    >
      <form onSubmit={handleSubmit} className="space-y-6">

        <TextInput
          label="Title (Optional)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Brief title for this information"
          help="Optional title to identify this info item"
        />

        <TextArea
          label="Info Text"
          required
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Enter informational content, notes, or context..."
          rows={8}
          help="Informational content that provides context or additional details"
        />

        {sections.length > 0 && (
          <Select
            label="Section"
            required
            value={sectionId}
            onChange={(e) => setSectionId(e.target.value)}
            options={[
              { value: "", label: "Select section" },
              ...sections.map(section => ({
                value: section.id,
                label: `${section.shortCode ? `[${section.shortCode}] ` : ''}${section.name}`
              }))
            ]}
            help="Section where this info will be added"
          />
        )}
      </form>
    </Modal>
  );
}
