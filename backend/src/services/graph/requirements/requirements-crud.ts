/**
 * Requirements CRUD Operations - Re-export Module
 *
 * This file maintains backward compatibility by re-exporting all requirement operations
 * from their new specialized modules.
 *
 * **Module Organization:**
 * - requirements-mapper.ts - Type definitions and Neo4j node mapping
 * - requirements-read.ts - Read operations (getRequirement)
 * - requirements-create.ts - Create operations (createRequirement)
 * - requirements-update.ts - Update operations (updateRequirement, updateRequirementTimestamp)
 * - requirements-lifecycle.ts - Lifecycle operations (softDelete, restore, archive, unarchive)
 * - requirements-refs.ts - Reference management (updateRefsForDocument, updateRefsForSection)
 * - requirements-ordering.ts - Ordering operations (reorderRequirements)
 *
 * **Refactoring History:**
 * - Before: 1,064 lines in single file mixing 6+ concerns
 * - After: ~920 lines split across 7 focused modules (~100-400 lines each)
 * - Result: Better separation of concerns, easier testing, improved maintainability
 */

// ============================================================================
// Type Definitions and Mapping
// ============================================================================

export type { ComplianceStatus, RequirementInput } from "./requirements-mapper.js";
export { mapRequirement } from "./requirements-mapper.js";

// ============================================================================
// Read Operations
// ============================================================================

export { getRequirement } from "./requirements-read.js";

// ============================================================================
// Create Operations
// ============================================================================

export { createRequirement } from "./requirements-create.js";

// ============================================================================
// Update Operations
// ============================================================================

export { updateRequirement, updateRequirementTimestamp } from "./requirements-update.js";

// ============================================================================
// Lifecycle Operations (Delete, Restore, Archive, Unarchive)
// ============================================================================

export {
  softDeleteRequirement,
  restoreRequirement,
  archiveRequirements,
  unarchiveRequirements
} from "./requirements-lifecycle.js";

// ============================================================================
// Reference Management
// ============================================================================

export {
  updateRequirementRefsForDocument,
  updateRequirementRefsForSection
} from "./requirements-refs.js";

// ============================================================================
// Ordering Operations
// ============================================================================

export {
  reorderRequirements,
  reorderRequirementsWithOrder
} from "./requirements-ordering.js";
