/**
 * Document View Handlers Hook
 *
 * Orchestrates event handlers by connecting mutations to state updates:
 * - Add/edit/delete operations
 * - Section reordering
 * - Modal control
 * - Navigation
 */

import { useCallback } from "react";
import type {
  RequirementPattern,
  VerificationMethod,
  DocumentSectionRecord,
  RequirementRecord
} from "../../types";
import type { DocumentSectionWithRequirements } from "./useDocumentState";

export function useDocumentHandlers(
  sections: DocumentSectionWithRequirements[],
  selectedSection: string | null,
  setSelectedSection: (id: string | null) => void,
  setEditRequirementModal: (state: { isOpen: boolean; requirement: RequirementRecord | null }) => void,
  setEditSectionModal: (state: { isOpen: boolean; section: DocumentSectionRecord | null }) => void,
  createSectionMutation: any,
  updateSectionMutation: any,
  createRequirementMutation: any,
  createInfoMutation: any,
  createSurrogateMutation: any,
  updateRequirementMutation: any,
  deleteRequirementMutation: any
) {
  // Add section handler
  const handleAddSection = useCallback((newSection: { name: string; description: string; shortCode?: string }) => {
    createSectionMutation.mutate(newSection, {
      onSuccess: (response: any) => {
        setSelectedSection(response.section.id);
      }
    });
  }, [createSectionMutation, setSelectedSection]);

  // Add requirement handler
  const handleAddRequirement = useCallback((newReq: {
    text: string;
    pattern?: RequirementPattern;
    verification?: VerificationMethod;
  }) => {
    if (!selectedSection) return;

    createRequirementMutation.mutate({
      text: newReq.text,
      pattern: newReq.pattern,
      verification: newReq.verification,
      sectionId: selectedSection
    });
  }, [selectedSection, createRequirementMutation]);

  // Add info handler
  const handleAddInfo = useCallback((newInfo: { text: string; title?: string; sectionId: string }) => {
    createInfoMutation.mutate({
      text: newInfo.text,
      title: newInfo.title,
      sectionId: newInfo.sectionId
    });
  }, [createInfoMutation]);

  // Add surrogate handler
  const handleAddSurrogate = useCallback((newSurrogate: { slug: string; caption?: string; sectionId: string }) => {
    createSurrogateMutation.mutate({
      slug: newSurrogate.slug,
      caption: newSurrogate.caption,
      sectionId: newSurrogate.sectionId
    });
  }, [createSurrogateMutation]);

  // Edit requirement handler
  const handleEditRequirement = useCallback((requirement: RequirementRecord) => {
    setEditRequirementModal({ isOpen: true, requirement });
  }, [setEditRequirementModal]);

  // Inline edit requirement handler (for when requirements are edited inline)
  const handleInlineEditRequirement = useCallback((updatedRequirement: RequirementRecord) => {
    console.log('[INLINE EDIT HANDLER] Requirement updated, query will refetch:', updatedRequirement.id);
    // Query will automatically refetch after mutation
  }, []);

  // Update requirement handler
  const handleUpdateRequirement = useCallback((
    editRequirementModal: { requirement: RequirementRecord | null },
    updates: {
      text?: string;
      pattern?: RequirementPattern;
      verification?: VerificationMethod;
      sectionId?: string;
    }
  ) => {
    if (!editRequirementModal.requirement) return;

    // Find the current section ID for this requirement
    const currentSection = sections.find(s =>
      s.requirements?.some((r: any) => r.id === editRequirementModal.requirement?.id)
    );

    updateRequirementMutation.mutate({
      requirementId: editRequirementModal.requirement.id,
      originalSectionId: currentSection?.id,
      updates
    });
  }, [sections, updateRequirementMutation]);

  // Delete requirement handler
  const handleDeleteRequirement = useCallback((requirement: RequirementRecord | null) => {
    if (!requirement) return;

    deleteRequirementMutation.mutate(requirement.id);
  }, [deleteRequirementMutation]);

  // Edit section handler
  const handleEditSection = useCallback((section: DocumentSectionRecord) => {
    setEditSectionModal({ isOpen: true, section });
  }, [setEditSectionModal]);

  // Update section handler
  const handleUpdateSection = useCallback((
    editSectionModal: { section: DocumentSectionRecord | null },
    updates: {
      name?: string;
      description?: string;
      shortCode?: string;
    }
  ) => {
    if (editSectionModal.section) {
      updateSectionMutation.mutate({
        sectionId: editSectionModal.section.id,
        updates
      });
    }
  }, [updateSectionMutation]);

  // Section reorder handler
  const handleSectionReorder = useCallback((draggedId: string, targetId: string) => {
    const draggedIndex = sections.findIndex(s => s.id === draggedId);
    const targetIndex = sections.findIndex(s => s.id === targetId);

    if (draggedIndex === -1 || targetIndex === -1) return;

    const newSections = [...sections];
    const [draggedSection] = newSections.splice(draggedIndex, 1);
    newSections.splice(targetIndex, 0, draggedSection);

    // Update order numbers and persist to backend
    newSections.forEach((section, index) => {
      const newOrder = index + 1;
      if (section.order !== newOrder) {
        updateSectionMutation.mutate({
          sectionId: section.id,
          updates: { order: newOrder }
        });
      }
    });
  }, [sections, updateSectionMutation]);

  return {
    handleAddSection,
    handleAddRequirement,
    handleAddInfo,
    handleAddSurrogate,
    handleEditRequirement,
    handleInlineEditRequirement,
    handleUpdateRequirement,
    handleDeleteRequirement,
    handleEditSection,
    handleUpdateSection,
    handleSectionReorder
  };
}
