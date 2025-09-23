import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useApiClient } from "../lib/client";
import type { FolderRecord } from "../types";

interface CreateFolderModalProps {
  tenant: string;
  project: string;
  parentFolder?: string;
  onClose: () => void;
  onCreated: (folder: FolderRecord) => void;
}

export function CreateFolderModal({
  tenant,
  project,
  parentFolder,
  onClose,
  onCreated
}: CreateFolderModalProps): JSX.Element {
  const api = useApiClient();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const createFolderMutation = useMutation({
    mutationFn: (data: { name: string; description?: string; parentFolder?: string }) =>
      api.createFolder({
        tenant,
        projectKey: project,
        name: data.name,
        description: data.description,
        parentFolder: data.parentFolder
      }),
    onSuccess: (response) => {
      onCreated(response.folder);
      onClose();
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) {
      createFolderMutation.mutate({
        name: name.trim(),
        description: description.trim() || undefined,
        parentFolder
      });
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Create New Folder</h2>
          <button type="button" onClick={onClose} className="ghost-button">×</button>
        </div>
        
        <form onSubmit={handleSubmit} className="modal-body">
          <div className="form-field">
            <label htmlFor="folder-name">Folder Name *</label>
            <input
              id="folder-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., User Interface, API Endpoints"
              required
              autoFocus
            />
          </div>

          <div className="form-field">
            <label htmlFor="folder-description">Description</label>
            <textarea
              id="folder-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of what this folder contains..."
              rows={3}
            />
          </div>

          {parentFolder && (
            <div className="form-field">
              <small className="text-muted">
                This folder will be created inside: {parentFolder}
              </small>
            </div>
          )}
          
          <div className="form-actions">
            <button type="button" onClick={onClose} className="ghost-button">
              Cancel
            </button>
            <button 
              type="submit" 
              disabled={!name.trim() || createFolderMutation.isPending}
              className="primary-button"
            >
              {createFolderMutation.isPending ? "Creating..." : "Create Folder"}
            </button>
          </div>
          
          {createFolderMutation.isError && (
            <div className="error-message">
              {createFolderMutation.error?.message || "Failed to create folder"}
            </div>
          )}
        </form>
      </div>
    </div>
  );
}