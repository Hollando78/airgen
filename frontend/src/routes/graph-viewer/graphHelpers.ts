/**
 * Graph Viewer Helper Functions
 *
 * Utility functions for graph operations and relationship classification.
 */

import { RELATIONSHIP_HIERARCHY } from './graphConfig';

/**
 * Get hierarchical weight for a relationship type
 * Higher weight = stronger hierarchical preference in layout
 *
 * @param relationshipType - The type of relationship (e.g., 'OWNS', 'SATISFIES')
 * @returns The weight value (100 for strong, 50 for medium, 1 for weak)
 */
export function getEdgeWeight(relationshipType: string): number {
  if (RELATIONSHIP_HIERARCHY.strong.has(relationshipType)) {
    return 100; // Strong hierarchy
  } else if (RELATIONSHIP_HIERARCHY.medium.has(relationshipType)) {
    return 50;  // Medium hierarchy
  } else {
    return 1;   // Weak/no hierarchy
  }
}

/**
 * Check if relationship is hierarchical (parent → child direction matters)
 *
 * @param relationshipType - The type of relationship
 * @returns True if the relationship is hierarchical (strong or medium)
 */
export function isHierarchicalEdge(relationshipType: string): boolean {
  return RELATIONSHIP_HIERARCHY.strong.has(relationshipType) ||
         RELATIONSHIP_HIERARCHY.medium.has(relationshipType);
}
