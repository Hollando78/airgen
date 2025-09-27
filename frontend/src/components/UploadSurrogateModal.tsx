import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "../lib/client";
import { Modal, TextInput, TextArea, Select, Button } from "./Modal";
import type { FolderRecord } from "../types";

interface UploadSurrogateModalProps {
  isOpen: boolean;
  tenant: string;
  project: string;
  parentFolder?: string;
  onClose: () => void;
  onUploaded?: (documentSlug: string) => void;
}

function fileNameWithoutExtension(name: string): string {
  const lastDot = name.lastIndexOf(".");
  if (lastDot <= 0) {
    return name;
  }
  return name.slice(0, lastDot);
}

export function UploadSurrogateModal({
  isOpen,
  tenant,
  project,
  parentFolder,
  onClose,
  onUploaded
}: UploadSurrogateModalProps): JSX.Element {
  const api = useApiClient();
  const queryClient = useQueryClient();

  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selectedFolder, setSelectedFolder] = useState(parentFolder || "");

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    setSelectedFolder(parentFolder || "");
  }, [isOpen, parentFolder]);

  const foldersQuery = useQuery({
    queryKey: ["folders", tenant, project],
    queryFn: () => api.listFolders(tenant, project),
    enabled: Boolean(isOpen && tenant && project)
  });

  const folderOptions = useMemo(() => {
    const options = [{ value: "", label: "No parent folder (root level)" }];
    if (foldersQuery.data?.folders) {
      const sortedFolders = [...foldersQuery.data.folders].sort((a, b) => a.name.localeCompare(b.name));
      sortedFolders.forEach((folder: FolderRecord) => {
        options.push({ value: folder.slug, label: folder.name });
      });
    }
    return options;
  }, [foldersQuery.data]);

  const resetState = () => {
    setFile(null);
    setName("");
    setDescription("");
    setSelectedFolder(parentFolder || "");
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!file) {
        throw new Error("Choose a document to upload");
      }

      const effectiveName = name.trim() || fileNameWithoutExtension(file.name);

      const response = await api.uploadSurrogateDocument({
        tenant,
        projectKey: project,
        file,
        name: effectiveName,
        description: description.trim() || undefined,
        parentFolder: selectedFolder || undefined
      });

      return response;
    },
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ["documents", tenant, project] });
      onUploaded?.(response.document.slug);
      handleClose();
    }
  });

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0] ?? null;
    setFile(selected);
    if (selected && !name.trim()) {
      setName(fileNameWithoutExtension(selected.name));
    }
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    uploadMutation.mutate();
  };

  const footer = (
    <>
      <Button variant="secondary" onClick={handleClose}>
        Cancel
      </Button>
      <Button
        type="submit"
        loading={uploadMutation.isPending}
        disabled={!file}
        onClick={handleSubmit}
      >
        Upload File
      </Button>
    </>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Upload Surrogate Document"
      subtitle="Attach PDFs, Word files, spreadsheets, or other supporting artifacts"
      size="medium"
      footer={footer}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="form-row">
          <div className="field" style={{ flex: 1 }}>
            <label htmlFor="surrogate-file">Select file</label>
            <input
              id="surrogate-file"
              type="file"
              onChange={handleFileChange}
              required
            />
            <p className="hint">Files are stored as provided and available for download by your team.</p>
          </div>
        </div>

        <TextInput
          label="Display Name"
          required
          value={name}
          onChange={event => setName(event.target.value)}
          placeholder="e.g., Supplier Contract, Brake Test Report"
        />

        <div className="form-row">
          <Select
            label="Parent Folder"
            value={selectedFolder}
            onChange={event => setSelectedFolder(event.target.value)}
            options={folderOptions}
            help="Optional folder to organize the uploaded file"
          />
        </div>

        <TextArea
          label="Description"
          value={description}
          onChange={event => setDescription(event.target.value)}
          placeholder="Describe the purpose or context for this file (optional)"
          rows={3}
        />

        {file && (
          <div style={{ fontSize: "12px", color: "#475569" }}>
            Selected file: <strong>{file.name}</strong> ({(file.size / (1024 * 1024)).toFixed(2)} MB)
          </div>
        )}

        {uploadMutation.isError && (
          <div
            style={{
              padding: "12px",
              backgroundColor: "#fef2f2",
              border: "1px solid #fecaca",
              borderRadius: "8px",
              color: "#dc2626",
              fontSize: "14px"
            }}
          >
            {(uploadMutation.error as Error)?.message || "Failed to upload file"}
          </div>
        )}
      </form>
    </Modal>
  );
}
