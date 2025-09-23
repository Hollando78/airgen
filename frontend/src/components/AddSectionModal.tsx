import { useState } from "react";
import { Modal, TextInput, TextArea, Button } from "./Modal";

interface AddSectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (section: { name: string; description: string; shortCode?: string }) => void;
}

export function AddSectionModal({
  isOpen,
  onClose,
  onAdd
}: AddSectionModalProps): JSX.Element {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [shortCode, setShortCode] = useState("");

  const handleClose = () => {
    setName("");
    setDescription("");
    setShortCode("");
    onClose();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) {
      onAdd({
        name: name.trim(),
        description: description.trim(),
        shortCode: shortCode.trim() || undefined
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
        disabled={!name.trim()}
        onClick={handleSubmit}
      >
        Add Section
      </Button>
    </>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Add Section"
      subtitle="Create a new section to organize requirements by category"
      size="medium"
      footer={footer}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <TextInput
          label="Section Name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g., Functional Requirements, Security Requirements"
          autoFocus
        />

        <div className="form-row">
          <TextInput
            label="Short Code"
            value={shortCode}
            onChange={e => setShortCode(e.target.value.toUpperCase())}
            placeholder="e.g., FUN, SEC"
            maxLength={10}
            style={{ textTransform: "uppercase" }}
            help="Used for requirement IDs"
          />
        </div>

        <TextArea
          label="Description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Brief description of what requirements this section contains..."
          rows={3}
          help="Helps organize and categorize requirements effectively"
        />
      </form>
    </Modal>
  );
}