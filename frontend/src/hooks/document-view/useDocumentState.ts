/**
 * Document View State Hook
 *
 * Manages all UI state for document view:
 * - Modal visibility (8 different modals)
 * - Selected section
 * - Edit modal states
 * - Drag and drop state
 * - Unsaved changes tracking with refs
 */

import { useState, useEffect, useRef } from "react";
import type { RequirementRecord, DocumentSectionRecord, DocumentSectionWithRelations } from "../../types";

// Type alias for clarity
export type DocumentSectionWithRequirements = DocumentSectionWithRelations;

export function useDocumentState(
  documentSlug: string,
  sections: DocumentSectionWithRequirements[]
) {
  // Modal visibility states
  const [showAddSectionModal, setShowAddSectionModal] = useState(false);
  const [showAddRequirementModal, setShowAddRequirementModal] = useState(false);
  const [showAddInfoModal, setShowAddInfoModal] = useState(false);
  const [showAddSurrogateModal, setShowAddSurrogateModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showMarkdownEditor, setShowMarkdownEditor] = useState(false);

  // Edit modal states
  const [editRequirementModal, setEditRequirementModal] = useState<{
    isOpen: boolean;
    requirement: RequirementRecord | null;
  }>({ isOpen: false, requirement: null });

  const [editSectionModal, setEditSectionModal] = useState<{
    isOpen: boolean;
    section: DocumentSectionRecord | null;
  }>({ isOpen: false, section: null });

  // Selection and drag state
  const [selectedSection, setSelectedSection] = useState<string | null>(null);
  const [draggedSection, setDraggedSection] = useState<string | null>(null);

  // Track sections with unsaved reorder changes
  const [sectionsWithUnsavedChanges, setSectionsWithUnsavedChanges] = useState<Set<string>>(new Set());

  // Refs to access current values without triggering re-renders
  const sectionsRef = useRef<DocumentSectionWithRequirements[]>([]);
  const sectionsWithUnsavedChangesRef = useRef<Set<string>>(new Set());
  const manuallyUpdatedSectionsRef = useRef<Set<string>>(new Set());

  // Keep refs in sync
  useEffect(() => {
    sectionsRef.current = sections;
  }, [sections]);

  useEffect(() => {
    sectionsWithUnsavedChangesRef.current = sectionsWithUnsavedChanges;
  }, [sectionsWithUnsavedChanges]);

  // Reset selected section when document changes
  useEffect(() => {
    setSelectedSection(null);
  }, [documentSlug]);

  // Auto-select first section when sections are loaded or when selected section no longer exists
  useEffect(() => {
    if (sections.length > 0) {
      // If no section is selected, select the first one
      if (!selectedSection) {
        setSelectedSection(sections[0].id);
      }
      // If the selected section no longer exists, select the first one
      else if (!sections.find(section => section.id === selectedSection)) {
        setSelectedSection(sections[0].id);
      }
    }
  }, [sections, selectedSection]);

  return {
    // Modal states
    showAddSectionModal,
    setShowAddSectionModal,
    showAddRequirementModal,
    setShowAddRequirementModal,
    showAddInfoModal,
    setShowAddInfoModal,
    showAddSurrogateModal,
    setShowAddSurrogateModal,
    showExportModal,
    setShowExportModal,
    showImportModal,
    setShowImportModal,
    showMarkdownEditor,
    setShowMarkdownEditor,

    // Edit modal states
    editRequirementModal,
    setEditRequirementModal,
    editSectionModal,
    setEditSectionModal,

    // Selection and drag
    selectedSection,
    setSelectedSection,
    draggedSection,
    setDraggedSection,

    // Unsaved changes
    sectionsWithUnsavedChanges,
    setSectionsWithUnsavedChanges,

    // Refs
    sectionsRef,
    sectionsWithUnsavedChangesRef,
    manuallyUpdatedSectionsRef
  };
}
