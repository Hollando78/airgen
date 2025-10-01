// Re-export all documents-related functionality from sub-modules

// Document CRUD operations and types
export {
  mapDocument,
  mapFolder,
  createDocument,
  listDocuments,
  getDocument,
  updateDocument,
  updateDocumentFolder,
  softDeleteDocument,
  type DocumentKind,
  type DocumentRecord,
  type FolderRecord
} from "./documents-crud.js";

// Document section operations
export {
  mapDocumentSection,
  createDocumentSection,
  listDocumentSections,
  updateDocumentSection,
  deleteDocumentSection,
  type DocumentSectionRecord
} from "./documents-sections.js";

// Folder operations
export {
  createFolder,
  listFolders,
  updateFolder,
  softDeleteFolder
} from "./documents-folders.js";
