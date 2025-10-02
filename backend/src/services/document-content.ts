import { promises as fs } from "node:fs";
import { getDocument } from "./graph/documents/index.js";
import {
  listDocumentRequirements,
  listSectionRequirements
} from "./graph/requirements/index.js";
import type { RequirementRecord } from "./workspace.js";
import { readFileSafely, getWorkspacePath, validateFilePath } from "./secure-file.js";

/**
 * Extracts text content from a PDF file securely
 * Uses dynamic import to avoid pdf-parse loading test data at module initialization
 */
async function extractPdfText(filePath: string): Promise<string> {
  try {
    // Lazy load pdf-parse to avoid test file loading issues
    const pdfModule = await import("pdf-parse");
    const pdfFactory = pdfModule as unknown as { default?: typeof import("pdf-parse") };
    const pdf = (pdfFactory.default ?? (pdfModule as typeof import("pdf-parse")));
    const dataBuffer = await fs.readFile(filePath);
    const data = await pdf(dataBuffer);
    return data.text;
  } catch (error) {
    throw new Error(`Failed to extract PDF text: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Extracts content from a surrogate document
 */
async function extractSurrogateContent(
  tenant: string,
  projectKey: string,
  documentSlug: string,
  storagePath: string,
  mimeType: string | null,
  documentName: string
): Promise<string> {
  const baseDirectory = getWorkspacePath(tenant, projectKey);

  // Validate and read the file securely
  let content: string;

  if (mimeType === 'application/pdf') {
    // Use pdf-parse library for PDF extraction
    const validation = await validateFilePath(baseDirectory, storagePath);
    if (!validation.isValid || !validation.safePath) {
      throw new Error(validation.error || 'Invalid file path');
    }

    content = await extractPdfText(validation.safePath);
  } else {
    // For text-based files, read directly
    content = await readFileSafely(baseDirectory, storagePath);
  }

  return `=== DOCUMENT: ${documentName} ===\n${content.trim()}\n\n`;
}

/**
 * Extracts content from a native structured document
 */
async function extractNativeContent(
  tenant: string,
  projectKey: string,
  documentSlug: string,
  sectionIds: string[] | undefined,
  documentName: string
): Promise<string> {
  let requirements: RequirementRecord[];

  if (sectionIds && sectionIds.length > 0) {
    const sectionRequirements = await Promise.all(
      sectionIds.map(sectionId => listSectionRequirements(sectionId))
    );

    const deduped = new Map<string, RequirementRecord>();
    for (const sectionList of sectionRequirements) {
      for (const requirement of sectionList) {
        deduped.set(requirement.id, requirement);
      }
    }

    requirements = Array.from(deduped.values());
  } else {
    if (typeof listDocumentRequirements === "function") {
      try {
        requirements = await listDocumentRequirements(tenant, projectKey, documentSlug);
      } catch {
        requirements = [];
      }
    } else {
      requirements = [];
    }
  }

  if (requirements.length === 0) {
    return `=== DOCUMENT: ${documentName} ===\n(No requirements found)\n\n`;
  }

  const requirementTexts = requirements.map(req =>
    `[${req.ref}] ${req.text}`
  ).join('\n');

  return `=== DOCUMENT: ${documentName} ===\n${requirementTexts}\n\n`;
}

/**
 * Extracts content from a document attachment (native or surrogate)
 */
export async function extractDocumentContent(
  tenant: string,
  projectKey: string,
  attachment: { type: "native" | "surrogate" | "structured"; documentSlug: string; sectionIds?: string[] }
): Promise<string> {
  const document = await getDocument(tenant, projectKey, attachment.documentSlug);
  if (!document) {
    throw new Error(`Document not found: ${attachment.documentSlug}`);
  }

  if (attachment.type === "surrogate") {
    if (!document.storagePath) {
      throw new Error(`Surrogate document has no storage path: ${attachment.documentSlug}`);
    }

    return extractSurrogateContent(
      tenant,
      projectKey,
      attachment.documentSlug,
      document.storagePath,
      document.mimeType ?? null,
      document.name
    );
  }

  return extractNativeContent(
    tenant,
    projectKey,
    attachment.documentSlug,
    attachment.sectionIds,
    document.name
  );
}
