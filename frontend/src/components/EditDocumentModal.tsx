import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "../lib/client";
import { Modal, TextInput, TextArea, Button } from "./Modal";
import type { DocumentRecord } from "../types";

interface EditDocumentModalProps {
  isOpen: boolean;
  tenant: string;
  project: string;
  document: DocumentRecord | null;
  onClose: () => void;
  onUpdated?: () => void;
}

export function EditDocumentModal({
  isOpen,
  tenant,
  project,
  document,
  onClose,
  onUpdated
}: EditDocumentModalProps): JSX.Element {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [shortCode, setShortCode] = useState("");
  const api = useApiClient();
  const queryClient = useQueryClient();

  // Initialize form values when document changes
  useEffect(() => {
    if (document) {
      setName(document.name || "");
      setDescription(document.description || "");
      setShortCode(document.shortCode || "");
    }
  }, [document]);

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!document || !name.trim()) throw new Error("Document name is required");
      return api.updateDocument(tenant, project, document.slug, {
        name: name.trim(),
        description: description.trim() || undefined,
        shortCode: shortCode.trim() || undefined
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documents", tenant, project] });
      queryClient.invalidateQueries({ queryKey: ["requirements", tenant, project] });
      onUpdated?.();
      handleClose();
    }
  });

  const handleClose = () => {
    if (document) {
      setName(document.name || "");
      setDescription(document.description || "");
      setShortCode(document.shortCode || "");
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
        Update Document
      </Button>
    </>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Edit Document"
      subtitle="Update document properties and short codes"
      size="medium"
      footer={footer}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <TextInput
          label="Document Name"
          required
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="e.g., User Requirements Document, Software Requirements"
          autoFocus
        />
        
        <TextInput
          label="Short Code"
          value={shortCode}
          onChange={e => setShortCode(e.target.value.toUpperCase())}
          placeholder="e.g., URD, SRS"
          maxLength={10}
          style={{ textTransform: "uppercase" }}
          help="Used for requirement IDs (e.g., URD-FUN-001). Changing this will update all related requirement references."
        />

        <TextArea
          label="Description"
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="Brief description of this document's scope and purpose..."
          rows={3}
          help="Helps team members understand what this document contains"
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
            {updateMutation.error?.message || "Failed to update document"}
          </div>
        )}
      </form>
    </Modal>
  );
}