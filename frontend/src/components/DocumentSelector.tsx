import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "../lib/client";
import type { DocumentRecord } from "../types";

interface DocumentSelectorProps {
  tenant: string;
  project: string;
  selectedDocument: string | null;
  onDocumentChange: (documentSlug: string | null) => void;
  onCreateDocument?: () => void;
}

export function DocumentSelector({
  tenant,
  project,
  selectedDocument,
  onDocumentChange,
  onCreateDocument
}: DocumentSelectorProps): JSX.Element {
  const api = useApiClient();

  const documentsQuery = useQuery({
    queryKey: ["documents", tenant, project],
    queryFn: () => api.listDocuments(tenant, project),
    enabled: Boolean(tenant && project)
  });

  const documents = (documentsQuery.data?.documents ?? []).filter(doc => doc.kind !== "surrogate");

  return (
    <div className="selector-field">
      <label htmlFor="document-select">Document</label>
      <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
        <select
          id="document-select"
          value={selectedDocument ?? ""}
          onChange={e => onDocumentChange(e.target.value || null)}
          disabled={!tenant || !project}
          style={{ flex: 1 }}
        >
          <option value="">Select document (optional)</option>
          {documents.map(doc => (
            <option key={doc.slug} value={doc.slug}>
              {doc.name} ({doc.requirementCount || 0} requirements)
            </option>
          ))}
        </select>
        {onCreateDocument && (
          <button
            type="button"
            onClick={onCreateDocument}
            className="ghost-button"
            disabled={!tenant || !project}
            title="Create new document"
          >
            + Doc
          </button>
        )}
      </div>
      {documentsQuery.isError && <span className="hint">Failed to load documents.</span>}
    </div>
  );
}
