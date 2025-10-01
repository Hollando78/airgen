import type { ReactNode } from "react";
import { createContext, useContext, useState } from "react";

export type FloatingDocumentKind = "structured" | "surrogate";

export interface FloatingDocument {
  id: string;
  documentSlug: string;
  documentName: string;
  position: { x: number; y: number };
  tenant: string;
  project: string;
  kind: FloatingDocumentKind;
  downloadUrl?: string | null;
  mimeType?: string | null;
  originalFileName?: string | null;
  previewDownloadUrl?: string | null;
  previewMimeType?: string | null;
  focusRequirementId?: string;
}

interface FloatingDocumentsContextType {
  floatingDocuments: FloatingDocument[];
  openFloatingDocument: (doc: Omit<FloatingDocument, "id" | "position">) => void;
  focusRequirementInDocument: (documentSlug: string, tenant: string, project: string, requirementId: string) => void;
  closeFloatingDocument: (documentId: string) => void;
}

const FloatingDocumentsContext = createContext<FloatingDocumentsContextType | null>(null);

interface FloatingDocumentsProviderProps {
  children: ReactNode;
}

export function FloatingDocumentsProvider({ children }: FloatingDocumentsProviderProps) {
  const [floatingDocuments, setFloatingDocuments] = useState<FloatingDocument[]>([]);

  const focusRequirementInDocument = (documentSlug: string, tenant: string, project: string, requirementId: string) => {
    setFloatingDocuments(prev => 
      prev.map(doc => {
        if (doc.documentSlug === documentSlug && doc.tenant === tenant && doc.project === project) {
          return { ...doc, focusRequirementId: requirementId };
        }
        return doc;
      })
    );
  };

  const openFloatingDocument = (doc: Omit<FloatingDocument, "id" | "position">) => {
    // Check if document is already open
    const existingDoc = floatingDocuments.find(
      d =>
        d.documentSlug === doc.documentSlug &&
        d.tenant === doc.tenant &&
        d.project === doc.project &&
        d.kind === doc.kind
    );

    if (existingDoc) {
      // Document already open - focus the requirement if specified
      if (doc.focusRequirementId) {
        focusRequirementInDocument(doc.documentSlug, doc.tenant, doc.project, doc.focusRequirementId);
      }
      return;
    }

    // Calculate position for new window (cascade them)
    const basePosition = { x: 200, y: 150 };
    const offset = floatingDocuments.length * 30;
    const newPosition = {
      x: basePosition.x + offset,
      y: basePosition.y + offset
    };

    const newDoc: FloatingDocument = {
      ...doc,
      id: `${doc.documentSlug}-${Date.now()}`,
      position: newPosition
    };

    setFloatingDocuments(prev => [...prev, newDoc]);
  };

  const closeFloatingDocument = (documentId: string) => {
    setFloatingDocuments(prev => prev.filter(doc => doc.id !== documentId));
  };

  return (
    <FloatingDocumentsContext.Provider
      value={{
        floatingDocuments,
        openFloatingDocument,
        focusRequirementInDocument,
        closeFloatingDocument
      }}
    >
      {children}
    </FloatingDocumentsContext.Provider>
  );
}

export function useFloatingDocuments() {
  const context = useContext(FloatingDocumentsContext);
  if (!context) {
    throw new Error("useFloatingDocuments must be used within a FloatingDocumentsProvider");
  }
  return context;
}
