import { useState, useCallback } from "react";
import type { RequirementRecord, DocumentRecord } from "../../types";

interface UseDragAndDropOptions {
  onRequestLink: (source: RequirementRecord, target: RequirementRecord) => void;
  onRequestCopyLink: (source: RequirementRecord, targetSectionId: string, targetDocument: DocumentRecord) => void;
  selectedLinkset?: {
    sourceDocument: DocumentRecord;
    targetDocument: DocumentRecord;
  } | null;
}

/**
 * Custom hook for managing drag and drop interactions for requirements
 * Handles drag state and drop events for linking and copying requirements
 */
export function useDragAndDrop({ onRequestLink, onRequestCopyLink, selectedLinkset }: UseDragAndDropOptions) {
  const [draggedRequirement, setDraggedRequirement] = useState<RequirementRecord | null>(null);

  const handleDragStart = useCallback((requirement: RequirementRecord) => {
    setDraggedRequirement(requirement);
  }, []);

  const handleDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault(); // Allow drop
    const target = event.currentTarget as HTMLElement;
    target.classList.add('drag-over');
  }, []);

  const handleDragLeave = useCallback((event: React.DragEvent) => {
    const target = event.currentTarget as HTMLElement;
    target.classList.remove('drag-over');
  }, []);

  const handleDrop = useCallback((event: React.DragEvent, targetRequirement: RequirementRecord) => {
    event.preventDefault();
    const target = event.currentTarget as HTMLElement;
    target.classList.remove('drag-over');

    if (draggedRequirement && draggedRequirement.id !== targetRequirement.id) {
      onRequestLink(draggedRequirement, targetRequirement);
    }
    setDraggedRequirement(null);
  }, [draggedRequirement, onRequestLink]);

  const handleDropOnSection = useCallback((event: React.DragEvent, sectionId: string, targetDocumentSlug: string) => {
    event.preventDefault();
    const target = event.currentTarget as HTMLElement;
    target.classList.remove('drag-over');

    if (!draggedRequirement || !selectedLinkset) {
      setDraggedRequirement(null);
      return;
    }

    // Determine the target document based on which document the section belongs to
    let targetDocument: DocumentRecord;
    if (targetDocumentSlug === selectedLinkset.sourceDocument.slug) {
      targetDocument = selectedLinkset.sourceDocument;
    } else if (targetDocumentSlug === selectedLinkset.targetDocument.slug) {
      targetDocument = selectedLinkset.targetDocument;
    } else {
      setDraggedRequirement(null);
      return;
    }

    onRequestCopyLink(draggedRequirement, sectionId, targetDocument);
    setDraggedRequirement(null);
  }, [draggedRequirement, selectedLinkset, onRequestCopyLink]);

  return {
    draggedRequirement,
    handleDragStart,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handleDropOnSection
  };
}
