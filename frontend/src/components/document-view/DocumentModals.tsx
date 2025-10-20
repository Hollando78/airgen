/**
 * Document Modals Component
 *
 * Groups all modal components used in DocumentView
 */

import { AddSectionModal } from "../AddSectionModal";
import { AddRequirementModal } from "../AddRequirementModal";
import { AddInfoModal } from "../AddInfoModal";
import { AddSurrogateModal } from "../AddSurrogateModal";
import { EditRequirementModal } from "../EditRequirementModal";
import { EditSectionModal } from "../EditSectionModal";
import { ExportModal } from "../DocumentView/ExportModal";
import { ImportModal } from "../DocumentView/ImportModal";
import { MarkdownEditorView } from "../MarkdownEditor/MarkdownEditorView";
import type {
  DocumentRecord,
  RequirementRecord,
  DocumentSectionRecord,
  RequirementPattern,
  VerificationMethod
} from "../../types";
import type { DocumentSectionWithRequirements } from "../../hooks/document-view/useDocumentState";

export interface DocumentModalsProps {
  // Modal visibility
  showAddSectionModal: boolean;
  showAddRequirementModal: boolean;
  showAddInfoModal: boolean;
  showAddSurrogateModal: boolean;
  showExportModal: boolean;
  showImportModal: boolean;
  showMarkdownEditor: boolean;

  // Modal data
  selectedSection: string | null;
  editRequirementModal: {
    isOpen: boolean;
    requirement: RequirementRecord | null;
  };
  editSectionModal: {
    isOpen: boolean;
    section: DocumentSectionRecord | null;
  };

  // Data
  document: DocumentRecord | undefined;
  sections: DocumentSectionWithRequirements[];
  tenant: string;
  project: string;
  documentSlug: string;

  // Handlers
  onAddSection: (section: { name: string; description: string; shortCode?: string }) => void;
  onAddRequirement: (req: { text: string; pattern?: RequirementPattern; verification?: VerificationMethod }) => void;
  onAddInfo: (info: { text: string; title?: string; sectionId: string }) => void;
  onAddSurrogate: (surrogate: { slug: string; caption?: string; sectionId: string }) => void;
  onUpdateRequirement: (updates: { text?: string; pattern?: RequirementPattern; verification?: VerificationMethod; sectionId?: string }) => void;
  onDeleteRequirement: () => void;
  onUpdateSection: (updates: { name?: string; description?: string; shortCode?: string }) => void;
  onImportComplete: () => void;

  // Close handlers
  onCloseAddSection: () => void;
  onCloseAddRequirement: () => void;
  onCloseAddInfo: () => void;
  onCloseAddSurrogate: () => void;
  onCloseEditRequirement: () => void;
  onCloseEditSection: () => void;
  onCloseExport: () => void;
  onCloseImport: () => void;
  onCloseMarkdownEditor: () => void;
}

export function DocumentModals({
  showAddSectionModal,
  showAddRequirementModal,
  showAddInfoModal,
  showAddSurrogateModal,
  showExportModal,
  showImportModal,
  showMarkdownEditor,
  selectedSection,
  editRequirementModal,
  editSectionModal,
  document,
  sections,
  tenant,
  project,
  documentSlug,
  onAddSection,
  onAddRequirement,
  onAddInfo,
  onAddSurrogate,
  onUpdateRequirement,
  onDeleteRequirement,
  onUpdateSection,
  onImportComplete,
  onCloseAddSection,
  onCloseAddRequirement,
  onCloseAddInfo,
  onCloseAddSurrogate,
  onCloseEditRequirement,
  onCloseEditSection,
  onCloseExport,
  onCloseImport,
  onCloseMarkdownEditor
}: DocumentModalsProps): JSX.Element {
  return (
    <>
      <AddSectionModal
        isOpen={showAddSectionModal}
        onClose={onCloseAddSection}
        onAdd={onAddSection}
      />

      <AddRequirementModal
        isOpen={showAddRequirementModal}
        sectionName={sections.find(s => s.id === selectedSection)?.name || ""}
        sectionId={selectedSection || ""}
        sections={sections}
        onClose={onCloseAddRequirement}
        onAdd={onAddRequirement}
      />

      <AddInfoModal
        isOpen={showAddInfoModal}
        sectionName={sections.find(s => s.id === selectedSection)?.name || ""}
        sectionId={selectedSection || ""}
        sections={sections}
        onClose={onCloseAddInfo}
        onAdd={onAddInfo}
      />

      <AddSurrogateModal
        isOpen={showAddSurrogateModal}
        sectionName={sections.find(s => s.id === selectedSection)?.name || ""}
        sectionId={selectedSection || ""}
        sections={sections}
        onClose={onCloseAddSurrogate}
        onAdd={onAddSurrogate}
      />

      <EditRequirementModal
        isOpen={editRequirementModal.isOpen}
        requirement={editRequirementModal.requirement}
        sections={sections.map(s => ({
          ...s,
          requirements: sections.find(sec => sec.id === s.id)?.requirements || []
        }))}
        onClose={onCloseEditRequirement}
        onUpdate={onUpdateRequirement}
        onDelete={onDeleteRequirement}
      />

      <EditSectionModal
        isOpen={editSectionModal.isOpen}
        tenant={tenant}
        project={project}
        documentSlug={documentSlug}
        section={editSectionModal.section}
        onClose={onCloseEditSection}
        onUpdated={() => {
          // The updateSectionMutation already handles cache invalidation
          // Additional refresh logic can be added here if needed
        }}
      />

      <ExportModal
        isOpen={showExportModal}
        onClose={onCloseExport}
        documentName={document?.name || "Document"}
        sections={sections}
        tenant={tenant}
        project={project}
        documentSlug={documentSlug}
      />

      <ImportModal
        isOpen={showImportModal}
        onClose={onCloseImport}
        documentName={document?.name || "Document"}
        tenant={tenant}
        project={project}
        documentSlug={documentSlug}
        sections={sections}
        onImportComplete={onImportComplete}
      />

      {/* Markdown Editor */}
      {showMarkdownEditor && document && (
        <MarkdownEditorView
          tenant={tenant}
          project={project}
          documentSlug={documentSlug}
          documentName={document.name}
          onClose={onCloseMarkdownEditor}
        />
      )}
    </>
  );
}
