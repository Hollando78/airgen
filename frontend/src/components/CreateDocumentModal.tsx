import { useState } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { useApiClient } from "../lib/client";
import { Modal, TextInput, TextArea, Select, Button } from "./Modal";
import type { FolderRecord } from "../types";

interface CreateDocumentModalProps {
  isOpen: boolean;
  tenant: string;
  project: string;
  parentFolder?: string;
  onClose: () => void;
  onCreated?: (documentSlug: string) => void;
}

export function CreateDocumentModal({
  isOpen,
  tenant,
  project,
  parentFolder,
  onClose,
  onCreated
}: CreateDocumentModalProps): JSX.Element {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [shortCode, setShortCode] = useState("");
  const [selectedFolder, setSelectedFolder] = useState(parentFolder || "");
  const api = useApiClient();
  const queryClient = useQueryClient();

  const foldersQuery = useQuery({
    queryKey: ["folders", tenant, project],
    queryFn: () => api.listFolders(tenant, project),
    enabled: Boolean(tenant && project)
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!name.trim()) {throw new Error("Document name is required");}
      return api.createDocument({
        tenant,
        projectKey: project,
        name: name.trim(),
        description: description.trim() || undefined,
        shortCode: shortCode.trim() || undefined,
        parentFolder: selectedFolder || undefined
      });
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["documents", tenant, project] });
      onCreated?.(data.document.slug);
      handleClose();
    }
  });

  const handleClose = () => {
    setName("");
    setDescription("");
    setShortCode("");
    setSelectedFolder(parentFolder || "");
    onClose();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate();
  };

  const folderOptions = [
    { value: "", label: "No parent folder (root level)" },
    ...(foldersQuery.data?.folders.map(folder => ({
      value: folder.slug,
      label: folder.name
    })) || [])
  ];

  const footer = (
    <>
      <Button variant="secondary" onClick={handleClose}>
        Cancel
      </Button>
      <Button 
        type="submit" 
        loading={createMutation.isPending}
        disabled={!name.trim()}
        onClick={handleSubmit}
      >
        Create Document
      </Button>
    </>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Create Document"
      subtitle="Add a new requirements document to organize your project"
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
        
        <div className="form-row">
          <TextInput
            label="Short Code"
            value={shortCode}
            onChange={e => setShortCode(e.target.value.toUpperCase())}
            placeholder="e.g., URD, SRS"
            maxLength={10}
            style={{ textTransform: "uppercase" }}
            help="Used for requirement IDs (e.g., URD-FUN-001)"
          />
          <Select
            label="Parent Folder"
            value={selectedFolder}
            onChange={e => setSelectedFolder(e.target.value)}
            options={folderOptions}
            help="Optional organization folder"
          />
        </div>

        <TextArea
          label="Description"
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="Brief description of this document's scope and purpose..."
          rows={3}
          help="Helps team members understand what this document contains"
        />

        {createMutation.isError && (
          <div style={{ 
            padding: "12px", 
            backgroundColor: "#fef2f2", 
            border: "1px solid #fecaca", 
            borderRadius: "8px",
            color: "#dc2626",
            fontSize: "14px"
          }}>
            {createMutation.error?.message || "Failed to create document"}
          </div>
        )}
      </form>
    </Modal>
  );
}