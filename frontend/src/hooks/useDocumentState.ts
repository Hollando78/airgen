import { useCallback, useState } from "react";

export interface DocumentState {
  documentSlug: string | null;
}

export function useDocumentState() {
  const [state, setState] = useState<DocumentState>({
    documentSlug: null
  });

  const setDocument = useCallback((documentSlug: string | null) => {
    setState(prev => ({ ...prev, documentSlug }));
  }, []);

  const reset = useCallback(() => {
    setState({ documentSlug: null });
  }, []);

  return {
    state,
    setDocument,
    reset
  };
}