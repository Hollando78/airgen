import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "../lib/client";
import type { DocumentAttachment, DocumentRecord } from "../types";

interface DocumentAttachmentSelectorProps {
  tenant: string;
  project: string;
  attachments: DocumentAttachment[];
  onAttachmentsChange: (attachments: DocumentAttachment[]) => void;
}

export function DocumentAttachmentSelector({
  tenant,
  project,
  attachments,
  onAttachmentsChange
}: DocumentAttachmentSelectorProps): JSX.Element {
  const api = useApiClient();
  const [showSelector, setShowSelector] = useState(false);

  const documentsQuery = useQuery({
    queryKey: ["documents", tenant, project],
    queryFn: () => api.listDocuments(tenant, project),
    enabled: Boolean(tenant && project && showSelector)
  });

  const addAttachment = (document: DocumentRecord) => {
    const attachment: DocumentAttachment = {
      type: document.kind as "native" | "surrogate",
      documentSlug: document.slug
    };
    
    // Check if already attached
    if (!attachments.some(a => a.documentSlug === document.slug)) {
      onAttachmentsChange([...attachments, attachment]);
    }
  };

  const removeAttachment = (documentSlug: string) => {
    onAttachmentsChange(attachments.filter(a => a.documentSlug !== documentSlug));
  };

  const getDocumentName = (documentSlug: string) => {
    const doc = documentsQuery.data?.documents.find(d => d.slug === documentSlug);
    return doc?.name || documentSlug;
  };

  const getDocumentType = (documentSlug: string) => {
    const doc = documentsQuery.data?.documents.find(d => d.slug === documentSlug);
    return doc?.kind || "unknown";
  };

  return (
    <div className="document-attachment-selector">
      <div className="form-group">
        <label className="form-label">Attached Documents</label>
        
        {attachments.length > 0 && (
          <div className="attached-documents">
            {attachments.map((attachment) => (
              <div key={attachment.documentSlug} className="attached-document">
                <div className="document-info">
                  <span className="document-name">{getDocumentName(attachment.documentSlug)}</span>
                  <span className={`document-type document-type--${getDocumentType(attachment.documentSlug)}`}>
                    {getDocumentType(attachment.documentSlug)}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => removeAttachment(attachment.documentSlug)}
                  className="remove-button"
                  title="Remove attachment"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        <button
          type="button"
          onClick={() => setShowSelector(!showSelector)}
          className="btn btn--secondary"
          style={{ marginTop: attachments.length > 0 ? "8px" : "0" }}
        >
          {showSelector ? "Hide" : "Attach"} Documents
        </button>
      </div>

      {showSelector && (
        <div className="document-selector">
          <div className="form-help" style={{ marginBottom: "12px" }}>
            Select documents to provide context for AI generation. Native documents include existing requirements, while surrogate documents are uploaded files.
          </div>
          
          {documentsQuery.isLoading && (
            <div style={{ padding: "20px", textAlign: "center", color: "#64748b" }}>
              Loading documents...
            </div>
          )}

          {documentsQuery.error && (
            <div style={{ padding: "20px", textAlign: "center", color: "#ef4444" }}>
              Failed to load documents
            </div>
          )}

          {documentsQuery.data?.documents && (
            <div className="available-documents">
              {documentsQuery.data.documents.length === 0 ? (
                <div style={{ padding: "20px", textAlign: "center", color: "#64748b" }}>
                  No documents available
                </div>
              ) : (
                documentsQuery.data.documents.map((document) => {
                  const isAttached = attachments.some(a => a.documentSlug === document.slug);
                  return (
                    <div
                      key={document.slug}
                      className={`document-item ${isAttached ? "document-item--attached" : ""}`}
                    >
                      <div className="document-item-info">
                        <div className="document-item-name">{document.name}</div>
                        <div className="document-item-meta">
                          <span className={`document-type document-type--${document.kind}`}>
                            {document.kind}
                          </span>
                          {document.description && (
                            <span className="document-description">{document.description}</span>
                          )}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => isAttached ? removeAttachment(document.slug) : addAttachment(document)}
                        className={`btn btn--compact ${isAttached ? "btn--secondary" : "btn--primary"}`}
                        disabled={isAttached}
                      >
                        {isAttached ? "Attached" : "Attach"}
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      )}

      <style>{`
        .document-attachment-selector {
          margin-bottom: 16px;
        }

        .attached-documents {
          margin-bottom: 12px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .attached-document {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 8px 12px;
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 6px;
        }

        .document-info {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .document-name {
          font-weight: 500;
          color: #0f172a;
        }

        .document-type {
          padding: 2px 6px;
          border-radius: 4px;
          font-size: 11px;
          font-weight: 500;
          text-transform: uppercase;
        }

        .document-type--native {
          background: #dbeafe;
          color: #1e40af;
        }

        .document-type--surrogate {
          background: #fef3c7;
          color: #92400e;
        }

        .remove-button {
          border: none;
          background: none;
          color: #64748b;
          cursor: pointer;
          font-size: 18px;
          line-height: 1;
          padding: 4px;
          border-radius: 4px;
        }

        .remove-button:hover {
          background: #e2e8f0;
          color: #dc2626;
        }

        .document-selector {
          margin-top: 12px;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          padding: 16px;
          background: #fafbfc;
        }

        .available-documents {
          max-height: 300px;
          overflow-y: auto;
        }

        .document-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px;
          border: 1px solid #e2e8f0;
          border-radius: 6px;
          background: white;
          margin-bottom: 8px;
        }

        .document-item:last-child {
          margin-bottom: 0;
        }

        .document-item--attached {
          background: #f0f9ff;
          border-color: #bae6fd;
        }

        .document-item-info {
          flex: 1;
          min-width: 0;
        }

        .document-item-name {
          font-weight: 500;
          color: #0f172a;
          margin-bottom: 4px;
        }

        .document-item-meta {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }

        .document-description {
          color: #64748b;
          font-size: 13px;
        }
      `}</style>
    </div>
  );
}