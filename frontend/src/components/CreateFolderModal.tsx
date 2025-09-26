import { useState } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { useApiClient } from "../lib/client";
import { Modal, TextInput, TextArea, Select, Button } from "./Modal";
import type { FolderRecord } from "../types";

interface CreateFolderModalProps {
  isOpen: boolean;
  tenant: string;
  project: string;
  parentFolder?: string;
  onClose: () => void;
  onCreated?: (folder: FolderRecord) => void;
}

export function CreateFolderModal({
  isOpen,
  tenant,
  project,
  parentFolder,
  onClose,
  onCreated
}: CreateFolderModalProps): JSX.Element {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selectedParentFolder, setSelectedParentFolder] = useState(parentFolder || "");
  const api = useApiClient();
  const queryClient = useQueryClient();

  const foldersQuery = useQuery({
    queryKey: ["folders", tenant, project],
    queryFn: () => api.listFolders(tenant, project),
    enabled: Boolean(tenant && project)
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error("Folder name is required");
      return api.createFolder({
        tenant,
        projectKey: project,
        name: name.trim(),
        description: description.trim() || undefined,
        parentFolder: selectedParentFolder || undefined
      });
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["folders", tenant, project] });
      onCreated?.(data.folder);
      handleClose();
    }
  });

  const handleClose = () => {
    setName("");
    setDescription("");
    setSelectedParentFolder(parentFolder || "");
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
        Create Folder
      </Button>
    </>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Create Folder"
      subtitle="Add a new folder to organize your documents and requirements"
      size="medium"
      footer={footer}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <TextInput
          label="Folder Name"
          required
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="e.g., User Interface, API Endpoints, System Architecture"
          autoFocus
        />
        
        <div className="form-row">
          <Select
            label="Parent Folder"
            value={selectedParentFolder}
            onChange={e => setSelectedParentFolder(e.target.value)}
            options={folderOptions}
            help="Optional organization folder"
          />
        </div>

        <TextArea
          label="Description"
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="Brief description of what this folder contains..."
          rows={3}
          help="Helps team members understand the folder's purpose"
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
            {createMutation.error?.message || "Failed to create folder"}
          </div>
        )}
      </form>
    </Modal>
  );
}