import type { ReactNode } from "react";
import { createContext, useContext, useState } from "react";
import type { Node, Edge, Viewport } from "@xyflow/react";

export type FloatingDocumentKind = "structured" | "surrogate" | "diagram" | "browser";

export interface FloatingDocument {
  id: string;
  documentSlug?: string;
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
  zIndex: number;
  // For diagram kind
  diagramNodes?: Node[];
  diagramEdges?: Edge[];
  diagramViewport?: Viewport;
}

interface FloatingDocumentsContextType {
  floatingDocuments: FloatingDocument[];
  openFloatingDocument: (doc: Omit<FloatingDocument, "id" | "position" | "zIndex">) => void;
  focusRequirementInDocument: (documentSlug: string, tenant: string, project: string, requirementId: string) => void;
  closeFloatingDocument: (documentId: string) => void;
  bringToFront: (documentId: string) => void;
  sendToBack: (documentId: string) => void;
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

  const openFloatingDocument = (doc: Omit<FloatingDocument, "id" | "position" | "zIndex">) => {
    // Check if document is already open
    const existingDoc = floatingDocuments.find(
      d =>
        d.kind === doc.kind &&
        d.tenant === doc.tenant &&
        d.project === doc.project &&
        (doc.kind === "browser" || d.documentSlug === doc.documentSlug)
    );

    if (existingDoc) {
      // Document already open - focus the requirement if specified
      if (doc.focusRequirementId && doc.documentSlug) {
        focusRequirementInDocument(doc.documentSlug, doc.tenant, doc.project, doc.focusRequirementId);
      }
      // Bring to front when reopening
      bringToFront(existingDoc.id);
      return;
    }

    // Calculate position for new window (cascade them)
    const basePosition = { x: 200, y: 150 };
    const offset = floatingDocuments.length * 30;
    const newPosition = {
      x: basePosition.x + offset,
      y: basePosition.y + offset
    };

    // Calculate highest z-index + 1 for new window
    const maxZIndex = floatingDocuments.length > 0
      ? Math.max(...floatingDocuments.map(d => d.zIndex))
      : 1000;

    const newDoc: FloatingDocument = {
      ...doc,
      id: `${doc.kind}-${doc.documentSlug || 'browser'}-${Date.now()}`,
      position: newPosition,
      zIndex: maxZIndex + 1
    };

    setFloatingDocuments(prev => [...prev, newDoc]);
  };

  const closeFloatingDocument = (documentId: string) => {
    setFloatingDocuments(prev => prev.filter(doc => doc.id !== documentId));
  };

  const bringToFront = (documentId: string) => {
    setFloatingDocuments(prev => {
      const maxZIndex = Math.max(...prev.map(d => d.zIndex));
      return prev.map(doc =>
        doc.id === documentId
          ? { ...doc, zIndex: maxZIndex + 1 }
          : doc
      );
    });
  };

  const sendToBack = (documentId: string) => {
    setFloatingDocuments(prev => {
      const minZIndex = Math.min(...prev.map(d => d.zIndex));
      return prev.map(doc =>
        doc.id === documentId
          ? { ...doc, zIndex: minZIndex - 1 }
          : doc
      );
    });
  };

  return (
    <FloatingDocumentsContext.Provider
      value={{
        floatingDocuments,
        openFloatingDocument,
        focusRequirementInDocument,
        closeFloatingDocument,
        bringToFront,
        sendToBack
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
