/**
 * Document View - Main Orchestrator
 *
 * Full-screen document editor for structured requirements documents.
 * Coordinates custom hooks and components for the document view.
 */

import { useQueryClient } from "@tanstack/react-query";
import { useFloatingDocuments } from "../contexts/FloatingDocumentsContext";
import { RequirementsTable } from "./DocumentView/RequirementsTable";
import { DocumentHeader } from "./document-view/DocumentHeader";
import { SectionsSidebar } from "./document-view/SectionsSidebar";
import { DocumentModals } from "./document-view/DocumentModals";
import { useDocumentData } from "../hooks/document-view/useDocumentData";
import { useDocumentState } from "../hooks/document-view/useDocumentState";
import { useDocumentMutations } from "../hooks/document-view/useDocumentMutations";
import { useDocumentHandlers } from "../hooks/document-view/useDocumentHandlers";

interface DocumentViewProps {
  tenant: string;
  project: string;
  documentSlug: string;
  onClose: () => void;
}

export function DocumentView({
  tenant,
  project,
  documentSlug,
  onClose
}: DocumentViewProps): JSX.Element {
  const queryClient = useQueryClient();
  const { openFloatingDocument } = useFloatingDocuments();

  // Use custom hooks for data, state, mutations, and handlers
  const data = useDocumentData(tenant, project, documentSlug);
  const state = useDocumentState(documentSlug, data.sections);
  const mutations = useDocumentMutations(
    tenant,
    project,
    documentSlug,
    data.sections,
    state.sectionsRef,
    state.sectionsWithUnsavedChangesRef,
    state.manuallyUpdatedSectionsRef,
    state.setEditRequirementModal,
    state.setEditSectionModal,
    state.setSectionsWithUnsavedChanges
  );
  const handlers = useDocumentHandlers(
    data.sections,
    state.selectedSection,
    state.setSelectedSection,
    state.setEditRequirementModal,
    state.setEditSectionModal,
    mutations.createSectionMutation,
    mutations.updateSectionMutation,
    mutations.createRequirementMutation,
    mutations.createInfoMutation,
    mutations.createSurrogateMutation,
    mutations.updateRequirementMutation,
    mutations.deleteRequirementMutation
  );

  // Helper for opening floating document
  const handleOpenFloatingDocument = () => {
    if (!data.document) return;

    openFloatingDocument({
      documentSlug,
      documentName: data.document.name,
      tenant,
      project,
      kind: "structured"
    });
  };

  // Loading and error states
  if (data.isLoading) {
    return (
      <div style={{ padding: "20px", textAlign: "center" }}>
        Loading document...
      </div>
    );
  }

  if (data.isError) {
    return (
      <div style={{ padding: "20px", textAlign: "center", color: "red" }}>
        Error loading document: {(data.error as Error)?.message}
      </div>
    );
  }

  // Main render
  return (
    <div style={{
      position: "fixed",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: "white",
      zIndex: 1000,
      display: "flex",
      flexDirection: "column"
    }}>
      <DocumentHeader
        document={data.document}
        onClose={onClose}
      />

      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        <SectionsSidebar
          sections={data.sections}
          selectedSection={state.selectedSection}
          draggedSection={state.draggedSection}
          onSectionSelect={state.setSelectedSection}
          onSectionEdit={handlers.handleEditSection}
          onDraggedSectionChange={state.setDraggedSection}
          onSectionReorder={handlers.handleSectionReorder}
          onAddSectionClick={() => state.setShowAddSectionModal(true)}
          onImportClick={() => state.setShowImportModal(true)}
          onExportClick={() => state.setShowExportModal(true)}
        />

        {/* Requirements Table */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {data.sections.length > 0 ? (
            <RequirementsTable
              sections={data.sections}
              tenant={tenant}
              project={project}
              documentSlug={documentSlug}
              traceLinks={data.traceLinks}
              onAddRequirement={() => state.setShowAddRequirementModal(true)}
              onAddInfo={() => state.setShowAddInfoModal(true)}
              onAddSurrogate={() => state.setShowAddSurrogateModal(true)}
              onEditRequirement={handlers.handleEditRequirement}
              onOpenFloatingDocument={handleOpenFloatingDocument}
              onEditMarkdown={() => state.setShowMarkdownEditor(true)}
              onReorderItems={mutations.handleReorderItems}
              sectionsWithUnsavedChanges={state.sectionsWithUnsavedChanges}
              onSaveReorder={(sectionId) => mutations.saveReorderMutation.mutate(sectionId)}
              isSaving={mutations.saveReorderMutation.isPending}
            />
          ) : (
            <div style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flex: 1,
              color: "#64748b",
              fontSize: "16px"
            }}>
              No sections found. Add a section to get started.
            </div>
          )}
        </div>
      </div>

      {/* All Modals */}
      <DocumentModals
        showAddSectionModal={state.showAddSectionModal}
        showAddRequirementModal={state.showAddRequirementModal}
        showAddInfoModal={state.showAddInfoModal}
        showAddSurrogateModal={state.showAddSurrogateModal}
        showExportModal={state.showExportModal}
        showImportModal={state.showImportModal}
        showMarkdownEditor={state.showMarkdownEditor}
        selectedSection={state.selectedSection}
        editRequirementModal={state.editRequirementModal}
        editSectionModal={state.editSectionModal}
        document={data.document}
        sections={data.sections}
        tenant={tenant}
        project={project}
        documentSlug={documentSlug}
        onAddSection={handlers.handleAddSection}
        onAddRequirement={handlers.handleAddRequirement}
        onAddInfo={handlers.handleAddInfo}
        onAddSurrogate={handlers.handleAddSurrogate}
        onUpdateRequirement={(updates) => handlers.handleUpdateRequirement(state.editRequirementModal, updates)}
        onDeleteRequirement={() => handlers.handleDeleteRequirement(state.editRequirementModal.requirement)}
        onUpdateSection={(updates) => handlers.handleUpdateSection(state.editSectionModal, updates)}
        onImportComplete={() => {
          queryClient.invalidateQueries({ queryKey: ["sections", tenant, project, documentSlug] });
          state.setShowImportModal(false);
        }}
        onCloseAddSection={() => state.setShowAddSectionModal(false)}
        onCloseAddRequirement={() => state.setShowAddRequirementModal(false)}
        onCloseAddInfo={() => state.setShowAddInfoModal(false)}
        onCloseAddSurrogate={() => state.setShowAddSurrogateModal(false)}
        onCloseEditRequirement={() => state.setEditRequirementModal({ isOpen: false, requirement: null })}
        onCloseEditSection={() => state.setEditSectionModal({ isOpen: false, section: null })}
        onCloseExport={() => state.setShowExportModal(false)}
        onCloseImport={() => state.setShowImportModal(false)}
        onCloseMarkdownEditor={() => {
          state.setShowMarkdownEditor(false);
          queryClient.invalidateQueries({ queryKey: ["sections", tenant, project, documentSlug] });
          queryClient.invalidateQueries({ queryKey: ["requirements", tenant, project] });
        }}
      />
    </div>
  );
}
