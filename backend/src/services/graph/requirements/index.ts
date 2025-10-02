// Re-export all requirements-related functionality from sub-modules

// CRUD operations
export {
  mapRequirement,
  createRequirement,
  getRequirement,
  updateRequirement,
  updateRequirementTimestamp,
  softDeleteRequirement,
  updateRequirementRefsForDocument,
  updateRequirementRefsForSection,
  type RequirementInput
} from "./requirements-crud.js";

// Search and listing operations
export {
  listRequirements,
  countRequirements,
  listDocumentRequirements,
  listSectionRequirements,
  suggestLinks,
  findDuplicateRequirementRefs,
  fixDuplicateRequirementRefs
} from "./requirements-search.js";

// Tenant and project operations
export {
  listTenants,
  listProjects,
  createTenant,
  createProject,
  deleteTenant,
  deleteProject
} from "./requirements-tenants.js";
