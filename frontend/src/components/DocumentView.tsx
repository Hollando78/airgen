import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "../lib/client";
import { AddSectionModal } from "./AddSectionModal";
import { AddRequirementModal } from "./AddRequirementModal";
import { EditRequirementModal } from "./EditRequirementModal";
import { EditSectionModal } from "./EditSectionModal";
import { RequirementsTable } from "./DocumentView/RequirementsTable";
import { ExportModal } from "./DocumentView/ExportModal";
import { ImportModal } from "./DocumentView/ImportModal";
import { useFloatingDocuments } from "../contexts/FloatingDocumentsContext";
import type { DocumentRecord, RequirementRecord, RequirementPattern, VerificationMethod, DocumentSectionRecord } from "../types";

interface DocumentSectionWithRequirements extends DocumentSectionRecord {
  requirements: RequirementRecord[];
}

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
  const api = useApiClient();
  const queryClient = useQueryClient();
  const { openFloatingDocument } = useFloatingDocuments();
  const [selectedSection, setSelectedSection] = useState<string | null>(null);
  const [showAddSectionModal, setShowAddSectionModal] = useState(false);
  const [showAddRequirementModal, setShowAddRequirementModal] = useState(false);
  const [editRequirementModal, setEditRequirementModal] = useState<{
    isOpen: boolean;
    requirement: RequirementRecord | null;
  }>({ isOpen: false, requirement: null });
  const [editSectionModal, setEditSectionModal] = useState<{
    isOpen: boolean;
    section: DocumentSectionRecord | null;
  }>({ isOpen: false, section: null });
  const [draggedSection, setDraggedSection] = useState<string | null>(null);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);

  // Fetch document details
  const documentQuery = useQuery({
    queryKey: ["document", tenant, project, documentSlug],
    queryFn: () => api.getDocument(tenant, project, documentSlug)
  });

  // Fetch sections for this document
  const sectionsQuery = useQuery({
    queryKey: ["sections", tenant, project, documentSlug],
    queryFn: () => api.listDocumentSections(tenant, project, documentSlug),
    enabled: Boolean(tenant && project && documentSlug)
  });

  // Combine sections with their requirements
  const [sections, setSections] = useState<DocumentSectionWithRequirements[]>([]);

  // Mutations for section operations
  const createSectionMutation = useMutation({
    mutationFn: (newSection: { name: string; description: string; shortCode?: string }) =>
      api.createDocumentSection({
        tenant,
        projectKey: project,
        documentSlug,
        name: newSection.name,
        description: newSection.description,
        shortCode: newSection.shortCode,
        order: sections.length + 1
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sections", tenant, project, documentSlug] });
    }
  });

  const updateSectionMutation = useMutation({
    mutationFn: ({ sectionId, updates }: { sectionId: string; updates: { name?: string; description?: string; order?: number; shortCode?: string } }) =>
      api.updateDocumentSection(sectionId, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sections", tenant, project, documentSlug] });
      queryClient.invalidateQueries({ queryKey: ["requirements", tenant, project] });
      setEditSectionModal({ isOpen: false, section: null });
    }
  });

  const createRequirementMutation = useMutation({
    mutationFn: (requirement: { text: string; pattern?: RequirementPattern; verification?: VerificationMethod; sectionId: string }) =>
      api.createRequirement({
        tenant,
        projectKey: project,
        documentSlug,
        sectionId: requirement.sectionId,
        text: requirement.text,
        pattern: requirement.pattern,
        verification: requirement.verification
      }),
    onSuccess: async (response, variables) => {
      // Invalidate sections query to get fresh data
      await queryClient.invalidateQueries({ queryKey: ["sections", tenant, project, documentSlug] });
      
      // Immediately update local state to show the new requirement
      setSections(prevSections => 
        prevSections.map(section => 
          section.id === variables.sectionId 
            ? { ...section, requirements: [...section.requirements, response.requirement] }
            : section
        )
      );
    }
  });

  const updateRequirementMutation = useMutation({
    mutationFn: (params: { requirementId: string; updates: { text?: string; pattern?: RequirementPattern; verification?: VerificationMethod; } }) =>
      api.updateRequirement(tenant, project, params.requirementId, params.updates),
    onSuccess: async (response, variables) => {
      // Invalidate sections query to get fresh data
      await queryClient.invalidateQueries({ queryKey: ["sections", tenant, project, documentSlug] });
      
      // Immediately update local state to show the updated requirement
      setSections(prevSections => 
        prevSections.map(section => ({
          ...section,
          requirements: section.requirements.map(req => 
            req.id === variables.requirementId ? response.requirement : req
          )
        }))
      );
      
      setEditRequirementModal({ isOpen: false, requirement: null });
    }
  });

  const deleteRequirementMutation = useMutation({
    mutationFn: (requirementId: string) => api.deleteRequirement(tenant, project, requirementId),
    onSuccess: async (_, requirementId) => {
      // Invalidate sections query to get fresh data
      await queryClient.invalidateQueries({ queryKey: ["sections", tenant, project, documentSlug] });
      
      // Remove the requirement from local state
      setSections(prevSections => 
        prevSections.map(section => ({
          ...section,
          requirements: section.requirements.filter(req => req.id !== requirementId)
        }))
      );
      
      setEditRequirementModal({ isOpen: false, requirement: null });
    }
  });

  // Populate sections with their requirements when sections data is available
  useEffect(() => {
    if (sectionsQuery.data?.sections) {
      const loadSectionsWithRequirements = async () => {
        const sectionsWithRequirements = await Promise.all(
          sectionsQuery.data.sections.map(async (section) => {
            try {
              const requirementsResponse = await api.listSectionRequirements(section.id);
              return {
                ...section,
                requirements: requirementsResponse.requirements
              };
            } catch (error) {
              console.error(`Failed to load requirements for section ${section.id}:`, error);
              return {
                ...section,
                requirements: []
              };
            }
          })
        );
        setSections(sectionsWithRequirements);
      };

      loadSectionsWithRequirements();
    }
  }, [sectionsQuery.data, api]);

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

  const handleAddSection = (newSection: { name: string; description: string; shortCode?: string }) => {
    createSectionMutation.mutate(newSection, {
      onSuccess: (response) => {
        setSelectedSection(response.section.id);
      }
    });
  };

  const handleAddRequirement = (newReq: {
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
  };

  const handleEditRequirement = (requirement: RequirementRecord) => {
    setEditRequirementModal({ isOpen: true, requirement });
  };

  const handleUpdateRequirement = (updates: {
    text?: string;
    pattern?: RequirementPattern;
    verification?: VerificationMethod;
  }) => {
    if (!editRequirementModal.requirement) return;

    updateRequirementMutation.mutate({
      requirementId: editRequirementModal.requirement.id,
      updates
    });
  };

  const handleDeleteRequirement = () => {
    if (!editRequirementModal.requirement) return;
    
    deleteRequirementMutation.mutate(editRequirementModal.requirement.id);
  };

  const handleEditSection = (section: DocumentSectionRecord) => {
    setEditSectionModal({ isOpen: true, section });
  };

  const handleUpdateSection = (updates: {
    name?: string;
    description?: string;
    shortCode?: string;
  }) => {
    if (editSectionModal.section) {
      updateSectionMutation.mutate({
        sectionId: editSectionModal.section.id,
        updates
      });
    }
  };

  const handleSectionReorder = (draggedId: string, targetId: string) => {
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
  };

  const handleOpenFloatingDocument = () => {
    if (!document) return;
    
    openFloatingDocument({
      documentSlug,
      documentName: document.name,
      tenant,
      project
    });
  };

  if (documentQuery.isLoading || sectionsQuery.isLoading) {
    return (
      <div style={{ padding: "20px", textAlign: "center" }}>
        Loading document...
      </div>
    );
  }

  if (documentQuery.isError) {
    return (
      <div style={{ padding: "20px", textAlign: "center", color: "red" }}>
        Error loading document: {(documentQuery.error as Error).message}
      </div>
    );
  }

  if (sectionsQuery.isError) {
    return (
      <div style={{ padding: "20px", textAlign: "center", color: "red" }}>
        Error loading sections: {(sectionsQuery.error as Error).message}
      </div>
    );
  }

  const document = documentQuery.data?.document;

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
      {/* Header */}
      <div style={{
        borderBottom: "1px solid #e2e8f0",
        padding: "16px 24px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        backgroundColor: "#f8f9fa"
      }}>
        <div>
          {/* Breadcrumb Navigation */}
          <div style={{ 
            display: "flex", 
            alignItems: "center", 
            fontSize: "14px", 
            color: "#64748b",
            marginBottom: "8px"
          }}>
            <button
              onClick={onClose}
              style={{
                background: "none",
                border: "none",
                color: "#3b82f6",
                cursor: "pointer",
                textDecoration: "underline",
                fontSize: "14px"
              }}
            >
              Documents
            </button>
            <span style={{ margin: "0 8px" }}>/</span>
            <span>{document?.name}</span>
          </div>
          
          <h1 style={{ margin: 0, fontSize: "24px" }}>
            {document?.name}
            {document?.shortCode && (
              <span style={{ 
                fontSize: "12px", 
                backgroundColor: "#e0f2fe", 
                color: "#0369a1", 
                padding: "4px 8px", 
                borderRadius: "6px",
                fontWeight: "600",
                textTransform: "uppercase",
                marginLeft: "12px"
              }}>
                {document.shortCode}
              </span>
            )}
          </h1>
          <p style={{ margin: "4px 0 0 0", color: "#64748b", fontSize: "14px" }}>
            {document?.description || "No description provided"}
          </p>
        </div>
        <button
          onClick={onClose}
          style={{
            background: "none",
            border: "1px solid #e2e8f0",
            borderRadius: "4px",
            padding: "8px 12px",
            cursor: "pointer",
            fontSize: "16px"
          }}
        >
          ✕ Close
        </button>
      </div>

      {/* Content Area */}
      <div style={{ display: "flex", flex: 1 }}>
        {/* Sections Sidebar */}
        <div style={{
          width: "300px",
          borderRight: "1px solid #e2e8f0",
          backgroundColor: "#fafafa",
          padding: "16px"
        }}>
          <h3 style={{ margin: "0 0 16px 0", fontSize: "16px" }}>Document Sections</h3>
          {[...sections]
            .sort((a, b) => a.order - b.order)
            .map(section => (
            <div
              key={section.id}
              draggable={true}
              onDragStart={(e) => {
                setDraggedSection(section.id);
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", section.id);
              }}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
              }}
              onDrop={(e) => {
                e.preventDefault();
                const draggedId = e.dataTransfer.getData("text/plain");
                if (draggedId && draggedId !== section.id) {
                  handleSectionReorder(draggedId, section.id);
                }
                setDraggedSection(null);
              }}
              onDragEnd={() => {
                setDraggedSection(null);
              }}
              onClick={() => setSelectedSection(section.id)}
              style={{
                padding: "12px",
                marginBottom: "8px",
                borderRadius: "6px",
                cursor: draggedSection === section.id ? "grabbing" : "grab",
                backgroundColor: selectedSection === section.id ? "#e2e8f0" : "white",
                border: `1px solid ${draggedSection === section.id ? "#3b82f6" : "#e2e8f0"}`,
                opacity: draggedSection === section.id ? 0.5 : 1,
                transition: "all 0.2s ease"
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ 
                  color: "#64748b", 
                  fontSize: "12px",
                  cursor: "grab",
                  userSelect: "none"
                }}>
                  ⋮⋮
                </span>
                <div style={{ fontWeight: "bold", fontSize: "14px", flex: 1 }}>
                  {section.name}
                  {section.shortCode && (
                    <span style={{ 
                      fontSize: "10px", 
                      backgroundColor: "#e0f2fe", 
                      color: "#0369a1", 
                      padding: "2px 6px", 
                      borderRadius: "4px",
                      fontWeight: "600",
                      textTransform: "uppercase",
                      marginLeft: "8px"
                    }}>
                      {section.shortCode}
                    </span>
                  )}
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleEditSection(section);
                  }}
                  style={{
                    background: "none",
                    border: "1px solid #d1d5db",
                    borderRadius: "4px",
                    padding: "4px 6px",
                    fontSize: "10px",
                    color: "#6b7280",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "2px"
                  }}
                  title="Edit section"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                  </svg>
                  Edit
                </button>
              </div>
              <div style={{ fontSize: "12px", color: "#64748b", marginTop: "4px" }}>
                {section.requirements.length} requirements
              </div>
              {section.description && (
                <div style={{ fontSize: "12px", color: "#64748b", marginTop: "4px" }}>
                  {section.description}
                </div>
              )}
            </div>
          ))}
          
          <button
            onClick={() => setShowAddSectionModal(true)}
            style={{
              width: "100%",
              padding: "12px",
              backgroundColor: "#3b82f6",
              color: "white",
              border: "none",
              borderRadius: "6px",
              cursor: "pointer",
              marginTop: "16px"
            }}
          >
            + Add Section
          </button>

          <button
            onClick={() => setShowImportModal(true)}
            style={{
              width: "100%",
              padding: "12px",
              backgroundColor: "#dc2626",
              color: "white",
              border: "none",
              borderRadius: "6px",
              cursor: "pointer",
              marginTop: "8px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px"
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 15v4a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-4"/>
              <polyline points="17,8 12,3 7,8"/>
              <line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            Import Document
          </button>

          <button
            onClick={() => setShowExportModal(true)}
            style={{
              width: "100%",
              padding: "12px",
              backgroundColor: "#059669",
              color: "white",
              border: "none",
              borderRadius: "6px",
              cursor: "pointer",
              marginTop: "8px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px"
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7,10 12,15 17,10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            Export Document
          </button>
        </div>

        {/* Requirements Table */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
          {selectedSection && sections.find(s => s.id === selectedSection) ? (
            <RequirementsTable 
              section={sections.find(s => s.id === selectedSection)!}
              tenant={tenant}
              project={project}
              onAddRequirement={() => setShowAddRequirementModal(true)}
              onEditRequirement={handleEditRequirement}
              onOpenFloatingDocument={handleOpenFloatingDocument}
            />
          ) : selectedSection ? (
            <div style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flex: 1,
              color: "#64748b",
              fontSize: "16px"
            }}>
              Loading section...
            </div>
          ) : (
            <div style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flex: 1,
              color: "#64748b",
              fontSize: "16px"
            }}>
              Select a section to view requirements
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      <AddSectionModal
        isOpen={showAddSectionModal}
        onClose={() => setShowAddSectionModal(false)}
        onAdd={handleAddSection}
      />

      <AddRequirementModal
        isOpen={showAddRequirementModal}
        sectionName={sections.find(s => s.id === selectedSection)?.name || ""}
        onClose={() => setShowAddRequirementModal(false)}
        onAdd={handleAddRequirement}
      />

      <EditRequirementModal
        isOpen={editRequirementModal.isOpen}
        requirement={editRequirementModal.requirement}
        onClose={() => setEditRequirementModal({ isOpen: false, requirement: null })}
        onUpdate={handleUpdateRequirement}
        onDelete={handleDeleteRequirement}
      />

      <EditSectionModal
        isOpen={editSectionModal.isOpen}
        tenant={tenant}
        project={project}
        documentSlug={documentSlug}
        section={editSectionModal.section}
        onClose={() => setEditSectionModal({ isOpen: false, section: null })}
        onUpdated={() => {
          // The updateSectionMutation already handles cache invalidation
          // Additional refresh logic can be added here if needed
        }}
      />

      <ExportModal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        documentName={document?.name || "Document"}
        sections={sections}
        tenant={tenant}
        project={project}
        documentSlug={documentSlug}
      />

      <ImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        documentName={document?.name || "Document"}
        tenant={tenant}
        project={project}
        documentSlug={documentSlug}
        sections={sections}
        onImportComplete={() => {
          // Refresh sections data after import
          queryClient.invalidateQueries({ queryKey: ["sections", tenant, project, documentSlug] });
          setShowImportModal(false);
        }}
      />
    </div>
  );
}
