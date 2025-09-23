import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "../lib/client";
import { AddSectionModal } from "./AddSectionModal";
import { AddRequirementModal } from "./AddRequirementModal";
import { EditRequirementModal } from "./EditRequirementModal";
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
  const [selectedSection, setSelectedSection] = useState<string | null>(null);
  const [showAddSectionModal, setShowAddSectionModal] = useState(false);
  const [showAddRequirementModal, setShowAddRequirementModal] = useState(false);
  const [editRequirementModal, setEditRequirementModal] = useState<{
    isOpen: boolean;
    requirement: RequirementRecord | null;
  }>({ isOpen: false, requirement: null });
  const [draggedSection, setDraggedSection] = useState<string | null>(null);

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
    mutationFn: ({ sectionId, updates }: { sectionId: string; updates: { name?: string; description?: string; order?: number } }) =>
      api.updateDocumentSection(sectionId, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sections", tenant, project, documentSlug] });
    }
  });

  const createRequirementMutation = useMutation({
    mutationFn: (requirement: { title: string; text: string; pattern?: RequirementPattern; verification?: VerificationMethod; sectionId: string }) =>
      api.createRequirement({
        tenant,
        projectKey: project,
        documentSlug,
        sectionId: requirement.sectionId,
        title: requirement.title,
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
    mutationFn: (params: { requirementId: string; updates: { title?: string; text?: string; pattern?: RequirementPattern; verification?: VerificationMethod; } }) =>
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

  const handleAddSection = (newSection: { name: string; description: string; shortCode?: string }) => {
    createSectionMutation.mutate(newSection, {
      onSuccess: (response) => {
        setSelectedSection(response.section.id);
      }
    });
  };

  const handleAddRequirement = (newReq: {
    title: string;
    text: string;
    pattern?: RequirementPattern;
    verification?: VerificationMethod;
  }) => {
    if (!selectedSection) return;

    createRequirementMutation.mutate({
      title: newReq.title,
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
    title?: string;
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
      />
    </div>
  );
}

interface RequirementsTableProps {
  section: DocumentSectionWithRequirements;
  tenant: string;
  project: string;
  onAddRequirement: () => void;
  onEditRequirement: (requirement: RequirementRecord) => void;
}

function RequirementsTable({ section, tenant, project, onAddRequirement, onEditRequirement }: RequirementsTableProps) {
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
      {/* Table Header */}
      <div style={{
        padding: "16px 24px",
        borderBottom: "1px solid #e2e8f0",
        backgroundColor: "#f8f9fa"
      }}>
        <h2 style={{ margin: 0, fontSize: "18px" }}>{section.name}</h2>
        <p style={{ margin: "4px 0 0 0", color: "#64748b", fontSize: "14px" }}>
          {section.description}
        </p>
      </div>

      {/* Excel-like Table */}
      <div style={{ flex: 1, overflow: "auto" }}>
        <table style={{
          width: "100%",
          borderCollapse: "collapse",
          fontSize: "14px"
        }}>
          <thead style={{ position: "sticky", top: 0, backgroundColor: "#f1f5f9" }}>
            <tr>
              <th style={{ border: "1px solid #e2e8f0", padding: "12px", textAlign: "left", width: "100px" }}>
                ID
              </th>
              <th style={{ border: "1px solid #e2e8f0", padding: "12px", textAlign: "left", width: "200px" }}>
                Title
              </th>
              <th style={{ border: "1px solid #e2e8f0", padding: "12px", textAlign: "left" }}>
                Description
              </th>
              <th style={{ border: "1px solid #e2e8f0", padding: "12px", textAlign: "left", width: "120px" }}>
                Pattern
              </th>
              <th style={{ border: "1px solid #e2e8f0", padding: "12px", textAlign: "left", width: "120px" }}>
                Verification
              </th>
              <th style={{ border: "1px solid #e2e8f0", padding: "12px", textAlign: "left", width: "80px" }}>
                QA Score
              </th>
              <th style={{ border: "1px solid #e2e8f0", padding: "12px", textAlign: "left", width: "60px" }}>
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {section.requirements.length === 0 ? (
              <tr>
                <td colSpan={7} style={{
                  border: "1px solid #e2e8f0",
                  padding: "40px",
                  textAlign: "center",
                  color: "#64748b"
                }}>
                  No requirements in this section yet
                </td>
              </tr>
            ) : (
              section.requirements.map((req: RequirementRecord, index: number) => (
                <tr key={req.id} style={{
                  backgroundColor: index % 2 === 0 ? "white" : "#f8f9fa"
                }}>
                  <td style={{ border: "1px solid #e2e8f0", padding: "12px" }}>
                    {req.ref}
                  </td>
                  <td style={{ border: "1px solid #e2e8f0", padding: "12px" }}>
                    {req.title}
                  </td>
                  <td style={{ border: "1px solid #e2e8f0", padding: "12px" }}>
                    {req.text}
                  </td>
                  <td style={{ border: "1px solid #e2e8f0", padding: "12px" }}>
                    <span style={{
                      padding: "2px 6px",
                      borderRadius: "3px",
                      fontSize: "12px",
                      backgroundColor: "#e2e8f0"
                    }}>
                      {req.pattern || "—"}
                    </span>
                  </td>
                  <td style={{ border: "1px solid #e2e8f0", padding: "12px" }}>
                    <span style={{
                      padding: "2px 6px",
                      borderRadius: "3px",
                      fontSize: "12px",
                      backgroundColor: "#e2e8f0"
                    }}>
                      {req.verification || "—"}
                    </span>
                  </td>
                  <td style={{ border: "1px solid #e2e8f0", padding: "12px", textAlign: "center" }}>
                    {req.qaScore ? (
                      <span style={{
                        padding: "2px 6px",
                        borderRadius: "3px",
                        fontSize: "12px",
                        backgroundColor: req.qaScore >= 80 ? "#d4edda" : req.qaScore >= 60 ? "#fff3cd" : "#f8d7da",
                        color: req.qaScore >= 80 ? "#155724" : req.qaScore >= 60 ? "#856404" : "#721c24"
                      }}>
                        {req.qaScore}
                      </span>
                    ) : "—"}
                  </td>
                  <td style={{ border: "1px solid #e2e8f0", padding: "12px", textAlign: "center" }}>
                    <button 
                      onClick={() => onEditRequirement(req)}
                      style={{
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        padding: "4px",
                        borderRadius: "3px"
                      }}
                      title="Edit requirement"
                    >
                      ✏️
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Add Requirement Button */}
      <div style={{
        padding: "16px",
        borderTop: "1px solid #e2e8f0",
        backgroundColor: "#f8f9fa"
      }}>
        <button 
          onClick={onAddRequirement}
          style={{
            padding: "8px 16px",
            backgroundColor: "#3b82f6",
            color: "white",
            border: "none",
            borderRadius: "6px",
            cursor: "pointer"
          }}
        >
          + Add Requirement
        </button>
      </div>
    </div>
  );
}
