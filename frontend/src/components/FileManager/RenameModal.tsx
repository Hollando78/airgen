import { useState, useEffect } from "react";
import { Modal, TextInput, TextArea, Button } from "../Modal";
import type { FileItem } from "./DocumentManager";

interface RenameModalProps {
  isOpen: boolean;
  item: FileItem | null;
  onClose: () => void;
  onRename: (newName: string, newDescription?: string, newShortCode?: string) => void;
}

export function RenameModal({ isOpen, item, onClose, onRename }: RenameModalProps): JSX.Element {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [shortCode, setShortCode] = useState("");

  useEffect(() => {
    if (isOpen && item) {
      setName(item.name);
      setDescription(item.description || "");
      setShortCode(item.shortCode || "");
    }
  }, [isOpen, item]);

  const handleClose = () => {
    setName("");
    setDescription("");
    setShortCode("");
    onClose();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) {
      onRename(
        name.trim(), 
        description.trim() || undefined,
        item?.type === "document" ? (shortCode.trim() || undefined) : undefined
      );
      onClose();
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
        Rename {item?.type === "folder" ? "Folder" : "Document"}
      </Button>
    </>
  );

  if (!item) return <div></div>;

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={`Rename ${item.type === "folder" ? "Folder" : "Document"}`}
      subtitle={`Update the properties of "${item.name}"`}
      size="medium"
      footer={footer}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <TextInput
          label={`${item.type === "folder" ? "Folder" : "Document"} Name`}
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={item.type === "folder" ? "e.g., Requirements Documents" : "e.g., User Interface Requirements"}
          autoFocus
        />

        {item.type === "document" && (
          <div className="form-row">
            <TextInput
              label="Short Code"
              value={shortCode}
              onChange={e => setShortCode(e.target.value.toUpperCase())}
              placeholder="e.g., URD, SRS"
              maxLength={10}
              style={{ textTransform: "uppercase" }}
              help="Used for requirement IDs (e.g., URD-FUN-001). Changing this will update all related requirement references."
            />
          </div>
        )}

        <TextArea
          label="Description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={`Brief description of this ${item.type}...`}
          rows={3}
          help={`Helps organize and understand the purpose of this ${item.type}`}
        />
      </form>
    </Modal>
  );
}