import { useState } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { useApiClient } from "../lib/client";
import type { FolderRecord } from "../types";

interface CreateDocumentModalProps {
  tenant: string;
  project: string;
  parentFolder?: string;
  onClose: () => void;
  onCreated?: (documentSlug: string) => void;
}

export function CreateDocumentModal({
  tenant,
  project,
  parentFolder,
  onClose,
  onCreated
}: CreateDocumentModalProps): JSX.Element {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
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
      if (!name.trim()) throw new Error("Document name is required");
      return api.createDocument({
        tenant,
        projectKey: project,
        name: name.trim(),
        description: description.trim() || undefined,
        parentFolder: selectedFolder || undefined
      });
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["documents", tenant, project] });
      onCreated?.(data.document.slug);
      onClose();
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Create Document</h2>
          <button type="button" onClick={onClose} className="ghost-button">×</button>
        </div>
        
        <form onSubmit={handleSubmit} className="modal-body">
          <div className="form-field">
            <label htmlFor="doc-name">Document Name *</label>
            <input
              id="doc-name"
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g., User Interface, Backend API"
              required
              autoFocus
            />
          </div>
          
          <div className="form-field">
            <label htmlFor="doc-description">Description</label>
            <textarea
              id="doc-description"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Brief description of this document's scope"
              rows={3}
            />
          </div>

          <div className="form-field">
            <label htmlFor="doc-folder">Parent Folder (optional)</label>
            <select
              id="doc-folder"
              value={selectedFolder}
              onChange={e => setSelectedFolder(e.target.value)}
            >
              <option value="">No parent folder (root level)</option>
              {foldersQuery.data?.folders.map(folder => (
                <option key={folder.slug} value={folder.slug}>
                  {folder.name}
                </option>
              ))}
            </select>
          </div>
          
          <div className="form-actions">
            <button type="button" onClick={onClose} className="ghost-button">
              Cancel
            </button>
            <button 
              type="submit" 
              disabled={!name.trim() || createMutation.isPending}
              className="primary-button"
            >
              {createMutation.isPending ? "Creating..." : "Create Document"}
            </button>
          </div>
          
          {createMutation.isError && (
            <div className="error-message">
              {createMutation.error?.message || "Failed to create document"}
            </div>
          )}
        </form>
      </div>
    </div>
  );
}