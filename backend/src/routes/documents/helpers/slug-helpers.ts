import { getDocument } from "../../../services/graph.js";
import { slugify } from "../../../services/workspace.js";

/**
 * Ensure a document slug is unique by appending a counter if needed
 */
export async function ensureUniqueDocumentSlug(
  tenant: string,
  projectKey: string,
  desiredSlug: string
): Promise<string> {
  const baseSlug = slugify(desiredSlug);
  let candidate = baseSlug;
  let counter = 1;

  // Prevent tight loop in case slugify returns empty string
  const fallbackSlug = baseSlug || `document-${Date.now()}`;

  while (true) {
    const existing = await getDocument(tenant, projectKey, candidate || fallbackSlug);
    if (!existing) {
      return candidate || fallbackSlug;
    }
    candidate = `${baseSlug || fallbackSlug}-${counter++}`;
  }
}
