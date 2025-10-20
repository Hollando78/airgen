import { useState, useEffect, useRef } from "react";
import type { DocumentLinkset } from "../../types";

interface UseLinksetSelectionOptions {
  tenant: string;
  project: string;
  linksets: DocumentLinkset[] | undefined;
}

/**
 * Custom hook for managing linkset selection with localStorage persistence
 * Handles auto-selection and persistence across tenant/project changes
 */
export function useLinksetSelection({ tenant, project, linksets }: UseLinksetSelectionOptions) {
  const [selectedLinksetId, setSelectedLinksetId] = useState<string>("");
  const hasLoadedFromStorage = useRef(false);
  const previousTenantProject = useRef<string | null>(null);

  // Load from localStorage when tenant/project become available
  useEffect(() => {
    if (tenant && project && linksets && !hasLoadedFromStorage.current) {
      const storageKey = `trace-links-selected-linkset-${tenant}-${project}`;
      const saved = localStorage.getItem(storageKey);

      if (saved) {
        // Check if saved linkset still exists
        const exists = linksets.some(ls => ls.id === saved);
        if (exists) {
          setSelectedLinksetId(saved);
        } else if (linksets.length > 0) {
          // Saved linkset doesn't exist, select first available
          setSelectedLinksetId(linksets[0].id);
        }
      } else if (linksets.length > 0) {
        // No saved selection, auto-select first linkset
        setSelectedLinksetId(linksets[0].id);
      }
      hasLoadedFromStorage.current = true;
    }
  }, [tenant, project, linksets]);

  // Save selected linkset to localStorage when it changes
  useEffect(() => {
    if (tenant && project && selectedLinksetId && hasLoadedFromStorage.current) {
      const storageKey = `trace-links-selected-linkset-${tenant}-${project}`;
      localStorage.setItem(storageKey, selectedLinksetId);
    }
  }, [selectedLinksetId, tenant, project]);

  // Reset hasLoadedFromStorage flag when tenant/project ACTUALLY changes (not on initial mount)
  useEffect(() => {
    const currentTenantProject = `${tenant}-${project}`;
    if (previousTenantProject.current !== null && previousTenantProject.current !== currentTenantProject) {
      hasLoadedFromStorage.current = false;
    }
    previousTenantProject.current = currentTenantProject;
  }, [tenant, project]);

  return {
    selectedLinksetId,
    setSelectedLinksetId
  };
}
