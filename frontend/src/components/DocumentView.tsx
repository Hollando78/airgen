import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "../lib/client";
import { AddSectionModal } from "./AddSectionModal";
import { AddRequirementModal } from "./AddRequirementModal";
import { AddInfoModal } from "./AddInfoModal";
import { AddSurrogateModal } from "./AddSurrogateModal";
import { EditRequirementModal } from "./EditRequirementModal";
import { EditSectionModal } from "./EditSectionModal";
import { RequirementsTable } from "./DocumentView/RequirementsTable";
import { ExportModal } from "./DocumentView/ExportModal";
import { ImportModal } from "./DocumentView/ImportModal";
import { MarkdownEditorView } from "./MarkdownEditor/MarkdownEditorView";
import { useFloatingDocuments } from "../contexts/FloatingDocumentsContext";
import type { DocumentRecord, RequirementRecord, RequirementPattern, VerificationMethod, DocumentSectionRecord, InfoRecord } from "../types";

interface DocumentSectionWithRequirements extends DocumentSectionRecord {
  requirements: RequirementRecord[];
  infos: InfoRecord[];
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
  const [showAddInfoModal, setShowAddInfoModal] = useState(false);
  const [showAddSurrogateModal, setShowAddSurrogateModal] = useState(false);
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
  const [showMarkdownEditor, setShowMarkdownEditor] = useState(false);

  // Fetch document details
  const documentQuery = useQuery({
    queryKey: ["document", tenant, project, documentSlug],
    queryFn: () => api.getDocument(tenant, project, documentSlug)
  });

  // Fetch sections for this document with all related data in one optimized query
  // This replaces the N+1 query pattern (1 + 3*N API calls) with a single batched query
  const sectionsQuery = useQuery({
    queryKey: ["sections", tenant, project, documentSlug],
    queryFn: () => api.listDocumentSectionsWithRelations(tenant, project, documentSlug),
    enabled: Boolean(tenant && project && documentSlug)
  });

  // Fetch trace links for this project
  const traceLinksQuery = useQuery({
    queryKey: ["traceLinks", tenant, project],
    queryFn: () => api.listTraceLinks(tenant, project),
    enabled: Boolean(tenant && project)
  });

  // Sections now come directly from the optimized query with all relations included
  const sections = sectionsQuery.data?.sections || [];

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
    onSuccess: async () => {
      // Invalidate sections query to get fresh data with the new requirement
      await queryClient.invalidateQueries({ queryKey: ["sections", tenant, project, documentSlug] });
    }
  });

  const createInfoMutation = useMutation({
    mutationFn: (info: { text: string; title?: string; sectionId: string }) =>
      api.createInfo({
        tenant,
        projectKey: project,
        documentSlug,
        sectionId: info.sectionId,
        text: info.text,
        title: info.title
      }),
    onSuccess: async () => {
      // Invalidate sections query to get fresh data with the new info
      await queryClient.invalidateQueries({ queryKey: ["sections", tenant, project, documentSlug] });
    }
  });

  const createSurrogateMutation = useMutation({
    mutationFn: (surrogate: { slug: string; caption?: string; sectionId: string }) =>
      api.createSurrogate({
        tenant,
        projectKey: project,
        documentSlug,
        sectionId: surrogate.sectionId,
        slug: surrogate.slug,
        caption: surrogate.caption
      }),
    onSuccess: async () => {
      // Invalidate sections query to get fresh data with the new surrogate
      await queryClient.invalidateQueries({ queryKey: ["sections", tenant, project, documentSlug] });
    }
  });

  const updateRequirementMutation = useMutation({
    mutationFn: (params: { requirementId: string; originalSectionId?: string; updates: { text?: string; pattern?: RequirementPattern; verification?: VerificationMethod; sectionId?: string; } }) => {
      console.log('[UPDATE MUTATION] Called with requirementId:', params.requirementId);
      console.log('[UPDATE MUTATION] Updates:', JSON.stringify(params.updates, null, 2));
      console.log('[UPDATE MUTATION] Original section:', params.originalSectionId);
      return api.updateRequirement(tenant, project, params.requirementId, params.updates);
    },
    onSuccess: async (response, variables) => {
      console.log('[UPDATE MUTATION] Success, response:', response);
      // Check if section actually changed
      const sectionChanged = variables.updates.sectionId !== undefined &&
                            variables.updates.sectionId !== variables.originalSectionId;

      if (sectionChanged) {
        // When moving between sections, clear any unsaved changes flags for affected sections
        // to ensure they reload properly
        console.log('[UPDATE REQUIREMENT] Section changed from', variables.originalSectionId, 'to', variables.updates.sectionId);
        console.log('[UPDATE REQUIREMENT] Clearing unsaved flags and refetching');

        // Clear the unsaved changes flags from both state and ref immediately
        setSectionsWithUnsavedChanges(prev => {
          const next = new Set(prev);
          console.log('[UPDATE REQUIREMENT] Current unsaved sections:', Array.from(prev));
          if (variables.originalSectionId) {
            console.log('[UPDATE REQUIREMENT] Deleting from unsaved:', variables.originalSectionId);
            next.delete(variables.originalSectionId);
          }
          if (variables.updates.sectionId) {
            console.log('[UPDATE REQUIREMENT] Deleting from unsaved:', variables.updates.sectionId);
            next.delete(variables.updates.sectionId);
          }
          console.log('[UPDATE REQUIREMENT] New unsaved sections:', Array.from(next));
          // Update ref immediately to avoid timing issues
          sectionsWithUnsavedChangesRef.current = next;
          return next;
        });

        // Invalidate and manually trigger refetch to ensure data reloads
        await queryClient.invalidateQueries({ queryKey: ["sections", tenant, project, documentSlug] });
        const refetchResult = await queryClient.refetchQueries({ queryKey: ["sections", tenant, project, documentSlug] });
        console.log('[UPDATE REQUIREMENT] Refetch result:', refetchResult);

        // Force reload of the specific sections that changed
        if (variables.originalSectionId || variables.updates.sectionId) {
          console.log('[UPDATE REQUIREMENT] Manually reloading affected sections');
          const sectionsToReload = [variables.originalSectionId, variables.updates.sectionId].filter(Boolean) as string[];

          // Fetch all sections in parallel
          const sectionDataMap = new Map();
          await Promise.all(
            sectionsToReload.map(async (sectionId) => {
              try {
                console.log('[UPDATE REQUIREMENT] Fetching section:', sectionId);
                const [requirementsResponse, infosResponse, surrogatesResponse] = await Promise.all([
                  api.listSectionRequirements(sectionId, tenant),
                  api.listSectionInfos(sectionId, tenant),
                  api.listSectionSurrogates(sectionId, tenant)
                ]);
                console.log('[UPDATE REQUIREMENT] Fetched section', sectionId, 'requirements:', requirementsResponse.requirements.length);
                sectionDataMap.set(sectionId, {
                  requirements: requirementsResponse.requirements,
                  infos: infosResponse.infos,
                  surrogates: surrogatesResponse.surrogates
                });
              } catch (error) {
                console.error(`Failed to reload section ${sectionId}:`, error);
              }
            })
          );

          // Mark sections as manually updated to prevent useEffect from overwriting
          sectionsToReload.forEach(id => manuallyUpdatedSectionsRef.current.add(id));

          // Query will automatically refetch after mutation
          console.log('[UPDATE REQUIREMENT] Sections will update from query invalidation');

          // Verify the state was updated by checking current sections
          setTimeout(() => {
            const updatedSections = sectionsRef.current;
            sectionsToReload.forEach(sectionId => {
              const section = updatedSections.find(s => s.id === sectionId);
              if (section) {
                console.log(`[UPDATE REQUIREMENT VERIFY] Section ${sectionId} now has ${section.requirements.length} requirements`);
              }
            });
          }, 100);

          // Clear the manual update flag after a short delay
          setTimeout(() => {
            sectionsToReload.forEach(id => manuallyUpdatedSectionsRef.current.delete(id));
          }, 1000);
        }
      } else {
        // Invalidate sections query to get fresh data
        await queryClient.invalidateQueries({ queryKey: ["sections", tenant, project, documentSlug] });
      }

      setEditRequirementModal({ isOpen: false, requirement: null });
    }
  });

  const deleteRequirementMutation = useMutation({
    mutationFn: (requirementId: string) => api.deleteRequirement(tenant, project, requirementId),
    onSuccess: async (_, requirementId) => {
      // Invalidate sections query to get fresh data
      await queryClient.invalidateQueries({ queryKey: ["sections", tenant, project, documentSlug] });

      setEditRequirementModal({ isOpen: false, requirement: null });
    }
  });

  // Local reorder handler - handles reordering of all item types in a unified list
  const handleReorderItems = (sectionId: string, items: Array<{type: 'requirement' | 'info' | 'surrogate', id: string}>) => {
    console.log('[REORDER ITEMS] Called with:', { sectionId, items });

    // Optimistically update the cached query data
    queryClient.setQueryData(
      ["sections", tenant, project, documentSlug],
      (old: { sections: DocumentSectionWithRequirements[] } | undefined) => {
        if (!old) return old;

        return {
          ...old,
          sections: old.sections.map(section => {
            if (section.id === sectionId) {
              console.log('[REORDER ITEMS] Found section');

              // Assign order based on position in the reordered list
              const itemsWithOrder = items.map((item, index) => ({ ...item, order: index }));

              // Separate items by type and assign the new order values
              const requirements = itemsWithOrder
                .filter(item => item.type === 'requirement')
                .map(item => {
                  const req = section.requirements.find(r => r.id === item.id);
                  return req ? { ...req, order: item.order } : null;
                })
                .filter((r): r is NonNullable<typeof r> => r !== null);

              const infos = itemsWithOrder
                .filter(item => item.type === 'info')
                .map(item => {
                  const info = section.infos.find(i => i.id === item.id);
                  return info ? { ...info, order: item.order } : null;
                })
                .filter((i): i is NonNullable<typeof i> => i !== null);

              const surrogates = itemsWithOrder
                .filter(item => item.type === 'surrogate')
                .map(item => {
                  const surrogate = section.surrogates?.find(s => s.id === item.id);
                  return surrogate ? { ...surrogate, order: item.order } : null;
                })
                .filter((s): s is NonNullable<typeof s> => s !== null);

              console.log('[REORDER ITEMS] Reordered:', {
                requirements: requirements.map(r => ({ id: r.id, order: r.order })),
                infos: infos.map(i => ({ id: i.id, order: i.order })),
                surrogates: surrogates.map(s => ({ id: s.id, order: s.order }))
              });

              return {
                ...section,
                requirements,
                infos,
                surrogates
              };
            }
            return section;
          })
        };
      }
    );

    setSectionsWithUnsavedChanges(prev => new Set(prev).add(sectionId));
  };

  // Save reorder changes to backend
  const saveReorderMutation = useMutation({
    mutationFn: async (sectionId: string) => {
      const section = sections.find(s => s.id === sectionId);
      if (!section) return;

      console.log('[SAVE REORDER] Saving section:', sectionId);
      console.log('[SAVE REORDER] Requirements:', section.requirements.map(r => ({ id: r.id, order: r.order })));
      console.log('[SAVE REORDER] Infos:', section.infos.map(i => ({ id: i.id, order: i.order })));
      console.log('[SAVE REORDER] Surrogates:', section.surrogates?.map(s => ({ id: s.id, order: s.order })));

      // Prepare payload with explicit order values
      const payload: {
        requirements?: Array<{ id: string; order: number }>;
        infos?: Array<{ id: string; order: number }>;
        surrogates?: Array<{ id: string; order: number }>;
      } = {};

      // Only include arrays that have items, and filter out any items without valid IDs
      if (section.requirements && section.requirements.length > 0) {
        payload.requirements = section.requirements
          .filter(r => r.id) // Only include items with valid IDs
          .map(r => ({ id: r.id, order: typeof r.order === 'number' ? r.order : 0 }));
      }
      if (section.infos && section.infos.length > 0) {
        payload.infos = section.infos
          .filter(i => i.id) // Only include items with valid IDs
          .map(i => ({ id: i.id, order: typeof i.order === 'number' ? i.order : 0 }));
      }
      if (section.surrogates && section.surrogates.length > 0) {
        payload.surrogates = section.surrogates
          .filter(s => s.id) // Only include items with valid IDs
          .map(s => ({ id: s.id, order: typeof s.order === 'number' ? s.order : 0 }));
      }

      console.log('[SAVE REORDER] Final payload:', JSON.stringify(payload, null, 2));

      await api.reorderWithOrder(sectionId, payload);

      console.log('[SAVE REORDER] Save complete');
    },
    onSuccess: (_, sectionId) => {
      console.log('[SAVE REORDER] Clearing unsaved changes flag');
      setSectionsWithUnsavedChanges(prev => {
        const next = new Set(prev);
        next.delete(sectionId);
        return next;
      });
    }
  });

  // No longer needed: sections now come with all relations pre-loaded from the optimized endpoint
  // This eliminates the N+1 query problem (30 API calls → 1 API call for 10 sections)

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
    if (!selectedSection) {return;}

    createRequirementMutation.mutate({
      text: newReq.text,
      pattern: newReq.pattern,
      verification: newReq.verification,
      sectionId: selectedSection
    });
  };

  const handleAddInfo = (newInfo: { text: string; title?: string; sectionId: string }) => {
    createInfoMutation.mutate({
      text: newInfo.text,
      title: newInfo.title,
      sectionId: newInfo.sectionId
    });
  };

  const handleAddSurrogate = (newSurrogate: { slug: string; caption?: string; sectionId: string }) => {
    createSurrogateMutation.mutate({
      slug: newSurrogate.slug,
      caption: newSurrogate.caption,
      sectionId: newSurrogate.sectionId
    });
  };

  const handleEditRequirement = (requirement: RequirementRecord) => {
    setEditRequirementModal({ isOpen: true, requirement });
  };

  const handleInlineEditRequirement = (updatedRequirement: RequirementRecord) => {
    console.log('[INLINE EDIT HANDLER] Requirement updated, query will refetch:', updatedRequirement.id);
    // Query will automatically refetch after mutation
  };

  const handleUpdateRequirement = (updates: {
    text?: string;
    pattern?: RequirementPattern;
    verification?: VerificationMethod;
    sectionId?: string;
  }) => {
    if (!editRequirementModal.requirement) {return;}

    // Find the current section ID for this requirement
    const currentSection = sections.find(s =>
      s.requirements?.some((r: any) => r.id === editRequirementModal.requirement?.id)
    );

    updateRequirementMutation.mutate({
      requirementId: editRequirementModal.requirement.id,
      originalSectionId: currentSection?.id,
      updates
    });
  };

  const handleDeleteRequirement = () => {
    if (!editRequirementModal.requirement) {return;}
    
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
    
    if (draggedIndex === -1 || targetIndex === -1) {return;}
    
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
    if (!document) {return;}
    
    openFloatingDocument({
      documentSlug,
      documentName: document.name,
      tenant,
      project,
      kind: "structured"
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
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* Sections Sidebar */}
        <div style={{
          width: "300px",
          borderRight: "1px solid #e2e8f0",
          backgroundColor: "#fafafa",
          padding: "16px",
          overflowY: "auto"
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
                {(section.requirements || []).length} requirements, {(section.infos || []).length} infos
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
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {sections.length > 0 ? (
            <RequirementsTable
              sections={sections}
              tenant={tenant}
              project={project}
              documentSlug={documentSlug}
              traceLinks={traceLinksQuery.data?.traceLinks || []}
              onAddRequirement={() => setShowAddRequirementModal(true)}
              onAddInfo={() => setShowAddInfoModal(true)}
              onAddSurrogate={() => setShowAddSurrogateModal(true)}
              onEditRequirement={handleEditRequirement}
              onOpenFloatingDocument={handleOpenFloatingDocument}
              onEditMarkdown={() => setShowMarkdownEditor(true)}
              onReorderItems={handleReorderItems}
              sectionsWithUnsavedChanges={sectionsWithUnsavedChanges}
              onSaveReorder={(sectionId) => saveReorderMutation.mutate(sectionId)}
              isSaving={saveReorderMutation.isPending}
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

      {/* Modals */}
      <AddSectionModal
        isOpen={showAddSectionModal}
        onClose={() => setShowAddSectionModal(false)}
        onAdd={handleAddSection}
      />

      <AddRequirementModal
        isOpen={showAddRequirementModal}
        sectionName={sections.find(s => s.id === selectedSection)?.name || ""}
        sectionId={selectedSection || ""}
        sections={sectionsQuery.data?.sections || []}
        onClose={() => setShowAddRequirementModal(false)}
        onAdd={handleAddRequirement}
      />

      <AddInfoModal
        isOpen={showAddInfoModal}
        sectionName={sections.find(s => s.id === selectedSection)?.name || ""}
        sectionId={selectedSection || ""}
        sections={sectionsQuery.data?.sections || []}
        onClose={() => setShowAddInfoModal(false)}
        onAdd={handleAddInfo}
      />

      <AddSurrogateModal
        isOpen={showAddSurrogateModal}
        sectionName={sections.find(s => s.id === selectedSection)?.name || ""}
        sectionId={selectedSection || ""}
        sections={sectionsQuery.data?.sections || []}
        onClose={() => setShowAddSurrogateModal(false)}
        onAdd={handleAddSurrogate}
      />

      <EditRequirementModal
        isOpen={editRequirementModal.isOpen}
        requirement={editRequirementModal.requirement}
        sections={sectionsQuery.data?.sections.map(s => ({
          ...s,
          requirements: sections.find(sec => sec.id === s.id)?.requirements || []
        })) || []}
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

      {/* Markdown Editor */}
      {showMarkdownEditor && document && (
        <MarkdownEditorView
          tenant={tenant}
          project={project}
          documentSlug={documentSlug}
          documentName={document.name}
          onClose={() => {
            setShowMarkdownEditor(false);
            // Refresh data after markdown editing
            queryClient.invalidateQueries({ queryKey: ["sections", tenant, project, documentSlug] });
            queryClient.invalidateQueries({ queryKey: ["requirements", tenant, project] });
          }}
        />
      )}
    </div>
  );
}
