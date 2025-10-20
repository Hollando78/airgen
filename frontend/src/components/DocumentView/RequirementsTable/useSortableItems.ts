import { useMemo } from "react";
import type { DocumentSectionRecord, RequirementRecord, InfoRecord, SurrogateReferenceRecord } from "../../../types";
import type { FilterState } from "./TableFilterBar";
import type { SortableItemData } from "./SortableRow";

type ItemType =
  | { type: 'requirement'; data: RequirementRecord; sectionName: string; sectionOrder: number }
  | { type: 'info'; data: InfoRecord; sectionName: string; sectionOrder: number }
  | { type: 'surrogate'; data: SurrogateReferenceRecord; sectionName: string; sectionOrder: number }
  | { type: 'section-header'; sectionName: string; sectionOrder: number; sectionId: string };

export function useSortableItems(
  sections: (DocumentSectionRecord & { requirements: RequirementRecord[]; infos: InfoRecord[]; surrogates?: SurrogateReferenceRecord[] })[],
  filters: FilterState
) {
  // Merge requirements, infos, and surrogates from all sections into a single sorted list
  const sortedItems = useMemo(() => {
    const items: ItemType[] = [];
    const getOrder = (entity: Record<string, unknown>, fallback: number) => {
      const value = entity["order"];
      return typeof value === "number" ? value : fallback;
    };

    // Add items from all sections in order
    sections.forEach((section, sectionIndex) => {
      // Add section header
      items.push({
        type: 'section-header' as const,
        sectionName: section.name,
        sectionOrder: sectionIndex,
        sectionId: section.id
      });

      // Add requirements, infos, and surrogates for this section
      // Use stored order field if available, otherwise use index
      const sectionItems = [
        ...(section.requirements || []).map((req, idx) => ({
          type: 'requirement' as const,
          data: req,
          order: getOrder(req as Record<string, unknown>, idx),
          sectionName: section.name,
          sectionOrder: sectionIndex
        })),
        ...(section.infos || []).map((info, idx) => ({
          type: 'info' as const,
          data: info,
          order: getOrder(info as Record<string, unknown>, (section.requirements || []).length + idx),
          sectionName: section.name,
          sectionOrder: sectionIndex
        })),
        ...(section.surrogates || []).map((surrogate, idx) => ({
          type: 'surrogate' as const,
          data: surrogate,
          order: getOrder(
            surrogate as Record<string, unknown>,
            (section.requirements || []).length + (section.infos?.length || 0) + idx
          ),
          sectionName: section.name,
          sectionOrder: sectionIndex
        }))
      ];

      // Sort items within this section by order
      sectionItems.sort((a, b) => a.order - b.order);
      items.push(...sectionItems);
    });

    return items;
  }, [sections]);

  const filteredRequirements = useMemo(() => {
    const allRequirements = sections.flatMap(section => section.requirements);
    return allRequirements.filter(req => {
      // Text filter
      if (filters.text && !req.text.toLowerCase().includes(filters.text.toLowerCase()) && !req.ref.toLowerCase().includes(filters.text.toLowerCase())) {
        return false;
      }

      // Pattern filter
      if (filters.pattern && req.pattern !== filters.pattern) {
        return false;
      }

      // Verification filter
      if (filters.verification && req.verification !== filters.verification) {
        return false;
      }

      // Rationale filter
      if (filters.rationale && (!req.rationale || !req.rationale.toLowerCase().includes(filters.rationale.toLowerCase()))) {
        return false;
      }

      // Compliance Status filter
      if (filters.complianceStatus && req.complianceStatus !== filters.complianceStatus) {
        return false;
      }

      // Compliance Rationale filter
      if (filters.complianceRationale && (!req.complianceRationale || !req.complianceRationale.toLowerCase().includes(filters.complianceRationale.toLowerCase()))) {
        return false;
      }

      // QA Score filters
      if (filters.minQaScore && req.qaScore && req.qaScore < parseInt(filters.minQaScore)) {
        return false;
      }

      if (filters.maxQaScore && req.qaScore && req.qaScore > parseInt(filters.maxQaScore)) {
        return false;
      }

      return true;
    });
  }, [sections, filters]);

  const filteredItems = useMemo(() => {
    const allowedTypes = filters.objectTypes || ['requirement', 'info'];

    return sortedItems.filter(item => {
      // Always show section headers
      if (item.type === 'section-header') {
        return true;
      }

      // Check if object type is enabled
      if (!allowedTypes.includes(item.type)) {
        return false;
      }

      if (item.type === 'requirement') {
        return filteredRequirements.some(r => r.id === item.data.id);
      }

      // Info and surrogate items pass through if their type is enabled
      return true;
    });
  }, [sortedItems, filteredRequirements, filters.objectTypes]);

  // Create sortable items grouped by section for drag-and-drop
  const sortableItemsBySection = useMemo(() => {
    const itemsBySectionMap = new Map<string, SortableItemData[]>();
    let currentSectionId: string | null = null;

    filteredItems.forEach(item => {
      if (item.type === 'section-header') {
        // Initialize the section in the map and track it as current
        currentSectionId = item.sectionId;
        if (!itemsBySectionMap.has(item.sectionId)) {
          itemsBySectionMap.set(item.sectionId, []);
        }
      } else {
        // Use the current section ID from the most recent section header
        if (currentSectionId) {
          if (!itemsBySectionMap.has(currentSectionId)) {
            itemsBySectionMap.set(currentSectionId, []);
          }

          // Create a unique ID for the sortable item: type-sectionId-itemId
          const sortableId = `${item.type}-${currentSectionId}-${item.data.id}`;

          itemsBySectionMap.get(currentSectionId)!.push({
            id: sortableId,
            type: item.type,
            sectionId: currentSectionId,
            data: item.data
          });
        }
      }
    });

    return itemsBySectionMap;
  }, [filteredItems]);

  return {
    sortedItems,
    filteredRequirements,
    filteredItems,
    sortableItemsBySection
  };
}
