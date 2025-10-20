/**
 * Requirements Schema State Hook
 *
 * Manages UI state for the requirements schema view:
 * - Selected block/connector
 * - Active diagram
 * - Pending linkset creation
 * - Create dialog visibility
 * - New diagram form state
 */

import { useState, useCallback, useEffect, useRef } from "react";
import type { PendingLinksetCreation } from "../../types/requirements-schema";

export function useRequirementsSchemaState(diagrams: any[]) {
  // Selection state
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [selectedConnectorId, setSelectedConnectorId] = useState<string | null>(null);

  // Diagram state
  const [activeDiagramId, setActiveDiagramId] = useState<string | null>(null);

  // Dialog state
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  // Linkset creation state
  const linksetApiUnavailableRef = useRef(false);
  const [pendingLinksetCreation, setPendingLinksetCreation] = useState<PendingLinksetCreation | null>(null);

  // New diagram form state
  const [newDiagramName, setNewDiagramName] = useState("");
  const [newDiagramDescription, setNewDiagramDescription] = useState("");

  // Auto-select first diagram when diagrams load
  useEffect(() => {
    if (!diagrams.length) {
      if (activeDiagramId !== null) {
        setActiveDiagramId(null);
      }
      return;
    }

    const hasActive = activeDiagramId ? diagrams.some(diagram => diagram.id === activeDiagramId) : false;
    if (!hasActive) {
      setActiveDiagramId(diagrams[0].id);
    }
  }, [diagrams, activeDiagramId]);

  // Handle block selection
  const handleBlockSelect = useCallback((blockId: string | null) => {
    setSelectedBlockId(blockId);
    setSelectedConnectorId(null);
  }, []);

  // Handle connector selection
  const handleConnectorSelect = useCallback((connectorId: string | null) => {
    setSelectedConnectorId(connectorId);
    setSelectedBlockId(null);
  }, []);

  // Reset form state
  const resetCreateDialogForm = useCallback(() => {
    setNewDiagramName("");
    setNewDiagramDescription("");
  }, []);

  return {
    // Selection state
    selectedBlockId,
    selectedConnectorId,
    handleBlockSelect,
    handleConnectorSelect,

    // Diagram state
    activeDiagramId,
    setActiveDiagramId,

    // Dialog state
    showCreateDialog,
    setShowCreateDialog,

    // Linkset state
    linksetApiUnavailableRef,
    pendingLinksetCreation,
    setPendingLinksetCreation,

    // Form state
    newDiagramName,
    setNewDiagramName,
    newDiagramDescription,
    setNewDiagramDescription,
    resetCreateDialogForm
  };
}
