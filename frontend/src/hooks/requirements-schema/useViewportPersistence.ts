/**
 * Viewport Persistence Hook
 *
 * Manages diagram viewport state with localStorage persistence:
 * - Per-diagram viewport state (x, y, zoom)
 * - Load viewports from localStorage on mount
 * - Save viewports to localStorage (debounced)
 * - Cleanup on unmount
 */

import { useState, useCallback, useEffect, useRef, useMemo } from "react";

export function useViewportPersistence(diagrams: any[], activeDiagramId: string | null) {
  const [diagramViewports, setDiagramViewports] = useState<Record<string, { x: number; y: number; zoom: number }>>({});
  const viewportTimeoutRef = useRef<NodeJS.Timeout>();

  // Load viewports from localStorage when diagrams are loaded
  useEffect(() => {
    if (typeof window === "undefined" || !diagrams.length) {
      return;
    }

    setDiagramViewports(prev => {
      let hasChanges = false;
      const next = { ...prev };

      diagrams.forEach(diagram => {
        if (next[diagram.id]) {
          return;
        }
        try {
          const raw = window.localStorage.getItem(`airgen:schemaViewport:${diagram.id}`);
          if (!raw) {
            return;
          }
          const parsed = JSON.parse(raw) as { x: number; y: number; zoom: number };
          if (
            typeof parsed === "object" &&
            typeof parsed.x === "number" &&
            typeof parsed.y === "number" &&
            typeof parsed.zoom === "number"
          ) {
            next[diagram.id] = parsed;
            hasChanges = true;
          }
        } catch (error) {
          console.warn("Failed to hydrate schema viewport", error);
        }
      });

      return hasChanges ? next : prev;
    });
  }, [diagrams]);

  // Handle viewport changes with debouncing
  const handleViewportChange = useCallback((viewport: { x: number; y: number; zoom: number }) => {
    if (!activeDiagramId) return;

    // Debounce viewport updates to avoid excessive writes
    if (viewportTimeoutRef.current) {
      clearTimeout(viewportTimeoutRef.current);
    }

    viewportTimeoutRef.current = setTimeout(() => {
      setDiagramViewports(prev => ({
        ...prev,
        [activeDiagramId]: viewport
      }));
      if (typeof window !== "undefined") {
        try {
          window.localStorage.setItem(
            `airgen:schemaViewport:${activeDiagramId}`,
            JSON.stringify(viewport)
          );
        } catch (error) {
          console.warn("Failed to persist schema viewport", error);
        }
      }
    }, 100);
  }, [activeDiagramId]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (viewportTimeoutRef.current) {
        clearTimeout(viewportTimeoutRef.current);
      }
    };
  }, []);

  // Current viewport for active diagram
  const currentViewport = useMemo(() => {
    if (!activeDiagramId) {
      return undefined;
    }
    return diagramViewports[activeDiagramId];
  }, [activeDiagramId, diagramViewports]);

  return {
    currentViewport,
    handleViewportChange
  };
}
