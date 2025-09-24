import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "../lib/client";
import { Modal, TextInput, TextArea, Button } from "./Modal";
import type { DocumentSectionRecord } from "../types";

interface EditSectionModalProps {
  isOpen: boolean;
  tenant: string;
  project: string;
  documentSlug: string;
  section: DocumentSectionRecord | null;
  onClose: () => void;
  onUpdated?: () => void;
}

export function EditSectionModal({
  isOpen,
  tenant,
  project,
  documentSlug,
  section,
  onClose,
  onUpdated
}: EditSectionModalProps): JSX.Element {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [shortCode, setShortCode] = useState("");
  const api = useApiClient();
  const queryClient = useQueryClient();

  // Initialize form values when section changes
  useEffect(() => {
    if (section) {
      setName(section.name || "");
      setDescription(section.description || "");
      setShortCode(section.shortCode || "");
    }
  }, [section]);

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!section || !name.trim()) throw new Error("Section name is required");
      return api.updateDocumentSection(section.id, {
        name: name.trim(),
        description: description.trim() || undefined,
        shortCode: shortCode.trim() || undefined
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sections", tenant, project, documentSlug] });
      queryClient.invalidateQueries({ queryKey: ["requirements", tenant, project] });
      onUpdated?.();
      handleClose();
    }
  });

  const handleClose = () => {
    if (section) {
      setName(section.name || "");
      setDescription(section.description || "");
      setShortCode(section.shortCode || "");
    }
    onClose();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateMutation.mutate();
  };

  const footer = (
    <>
      <Button variant="secondary" onClick={handleClose}>
        Cancel
      </Button>
      <Button 
        type="submit" 
        loading={updateMutation.isPending}
        disabled={!name.trim()}
        onClick={handleSubmit}
      >
        Update Section
      </Button>
    </>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Edit Section"
      subtitle="Update section properties and short codes"
      size="medium"
      footer={footer}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <TextInput
          label="Section Name"
          required
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="e.g., Functional Requirements, User Interface"
          autoFocus
        />
        
        <TextInput
          label="Short Code"
          value={shortCode}
          onChange={e => setShortCode(e.target.value.toUpperCase())}
          placeholder="e.g., FUN, UI, SEC"
          maxLength={10}
          style={{ textTransform: "uppercase" }}
          help="Used for requirement IDs (e.g., URD-FUN-001). Changing this will update all related requirement references."
        />

        <TextArea
          label="Description"
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="Brief description of this section's purpose..."
          rows={3}
          help="Helps team members understand what requirements belong in this section"
        />

        {updateMutation.isError && (
          <div style={{ 
            padding: "12px", 
            backgroundColor: "#fef2f2", 
            border: "1px solid #fecaca", 
            borderRadius: "8px",
            color: "#dc2626",
            fontSize: "14px"
          }}>
            {updateMutation.error?.message || "Failed to update section"}
          </div>
        )}
      </form>
    </Modal>
  );
}