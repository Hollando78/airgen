import { useState } from "react";
import { Modal, TextInput, Select, Button } from "./Modal";
import type { DocumentSectionRecord } from "../types";

interface AddSurrogateModalProps {
  isOpen: boolean;
  sectionName: string;
  sectionId: string;
  sections?: DocumentSectionRecord[];
  onClose: () => void;
  onAdd: (surrogate: {
    slug: string;
    caption?: string;
    sectionId: string;
  }) => void;
}

export function AddSurrogateModal({
  isOpen,
  sectionName,
  sectionId: defaultSectionId,
  sections = [],
  onClose,
  onAdd
}: AddSurrogateModalProps): JSX.Element {
  const [slug, setSlug] = useState("");
  const [caption, setCaption] = useState("");
  const [sectionId, setSectionId] = useState<string>(defaultSectionId);

  const handleClose = () => {
    setSlug("");
    setCaption("");
    setSectionId(defaultSectionId);
    onClose();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (slug.trim() && sectionId) {
      onAdd({
        slug: slug.trim(),
        caption: caption.trim() || undefined,
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
        disabled={!slug.trim() || !sectionId}
        onClick={handleSubmit}
      >
        Add Surrogate
      </Button>
    </>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={`Add Surrogate Reference`}
      subtitle={`Link a surrogate document to ${sectionName}`}
      size="large"
      footer={footer}
    >
      <form onSubmit={handleSubmit} className="space-y-6">

        <TextInput
          label="Surrogate Document Slug"
          required
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          placeholder="surrogate-document-name"
          help="The slug/identifier of the surrogate document to reference"
        />

        <TextInput
          label="Caption (Optional)"
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          placeholder="Brief description or caption"
          help="Optional caption to describe this surrogate reference"
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
            help="Section where this surrogate reference will be added"
          />
        )}
      </form>
    </Modal>
  );
}
