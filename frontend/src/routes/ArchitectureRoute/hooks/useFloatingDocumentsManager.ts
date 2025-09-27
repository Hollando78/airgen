import { useCallback, useState } from "react";
import type { DocumentRecord } from "../../../types";

export interface FloatingDocumentEntry {
  id: string;
  documentSlug: string;
  documentName: string;
  position: { x: number; y: number };
}

interface UseFloatingDocumentsParams {
  documents: DocumentRecord[];
}

export function useFloatingDocumentsManager({ documents }: UseFloatingDocumentsParams) {
  const [floatingDocuments, setFloatingDocuments] = useState<FloatingDocumentEntry[]>([]);

  const openDocument = useCallback((documentSlug: string) => {
    const document = documents.find(item => item.slug === documentSlug);
    if (!document) {
      return;
    }

    if (document.kind === "surrogate") {
      return;
    }

    setFloatingDocuments(prev => {
      if (prev.some(entry => entry.documentSlug === documentSlug)) {
        return prev;
      }

      const basePosition = { x: 150, y: 150 };
      const offset = prev.length * 30;
      const newEntry: FloatingDocumentEntry = {
        id: `${documentSlug}-${Date.now()}`,
        documentSlug,
        documentName: document.name,
        position: {
          x: basePosition.x + offset,
          y: basePosition.y + offset
        }
      };

      return [...prev, newEntry];
    });
  }, [documents]);

  const closeDocument = useCallback((documentId: string) => {
    setFloatingDocuments(prev => prev.filter(entry => entry.id !== documentId));
  }, []);

  return {
    floatingDocuments,
    openDocument,
    closeDocument
  };
}
