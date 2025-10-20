/**
 * Document View Mutations Hook
 *
 * Manages all mutations for document view:
 * - Section CRUD operations
 * - Requirement CRUD operations
 * - Info and Surrogate creation
 * - Complex reorder logic with optimistic updates
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "../../lib/client";
import type {
  RequirementPattern,
  VerificationMethod,
  DocumentSectionWithRelations
} from "../../types";
import type { DocumentSectionWithRequirements } from "./useDocumentState";

export function useDocumentMutations(
  tenant: string,
  project: string,
  documentSlug: string,
  sections: DocumentSectionWithRequirements[],
  sectionsRef: React.MutableRefObject<DocumentSectionWithRequirements[]>,
  sectionsWithUnsavedChangesRef: React.MutableRefObject<Set<string>>,
  manuallyUpdatedSectionsRef: React.MutableRefObject<Set<string>>,
  setEditRequirementModal: (state: { isOpen: boolean; requirement: any }) => void,
  setEditSectionModal: (state: { isOpen: boolean; section: any }) => void,
  setSectionsWithUnsavedChanges: React.Dispatch<React.SetStateAction<Set<string>>>
) {
  const api = useApiClient();
  const queryClient = useQueryClient();

  // Create section mutation
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

  // Update section mutation
  const updateSectionMutation = useMutation({
    mutationFn: ({ sectionId, updates }: { sectionId: string; updates: { name?: string; description?: string; order?: number; shortCode?: string } }) =>
      api.updateDocumentSection(sectionId, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sections", tenant, project, documentSlug] });
      queryClient.invalidateQueries({ queryKey: ["requirements", tenant, project] });
      setEditSectionModal({ isOpen: false, section: null });
    }
  });

  // Create requirement mutation
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

  // Create info mutation
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

  // Create surrogate mutation
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

  // Update requirement mutation
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

  // Delete requirement mutation
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
        tenant: string;
        requirements?: Array<{ id: string; order: number }>;
        infos?: Array<{ id: string; order: number }>;
        surrogates?: Array<{ id: string; order: number }>;
      } = {
        tenant
      };

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

  return {
    createSectionMutation,
    updateSectionMutation,
    createRequirementMutation,
    createInfoMutation,
    createSurrogateMutation,
    updateRequirementMutation,
    deleteRequirementMutation,
    handleReorderItems,
    saveReorderMutation
  };
}
