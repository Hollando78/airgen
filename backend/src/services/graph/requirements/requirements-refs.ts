import type { ManagedTransaction } from "neo4j-driver";

/**
 * Updates requirement refs for all requirements in a document
 * Regenerates refs based on document and section short codes
 *
 * Called when:
 * - Document short code changes
 * - Requirements are moved between sections
 * - Requirements are moved from section to document level
 *
 * @param tx - Active transaction
 * @param tenantSlug - Tenant slug
 * @param projectSlug - Project slug
 * @param documentSlug - Document slug
 */
export async function updateRequirementRefsForDocument(
  tx: ManagedTransaction,
  tenantSlug: string,
  projectSlug: string,
  documentSlug: string
): Promise<void> {
  const updateQuery = `
    MATCH (project:Project {slug: $projectSlug, tenantSlug: $tenantSlug})-[:HAS_DOCUMENT]->(document:Document {slug: $documentSlug})
    MATCH (document)-[:CONTAINS]->(requirement:Requirement)
    OPTIONAL MATCH (requirement)<-[:CONTAINS]-(section:DocumentSection)
    WITH requirement, document, section,
         CASE
           WHEN section IS NOT NULL THEN
             coalesce(document.shortCode, toUpper(document.slug)) + '-' +
             CASE
               WHEN coalesce(section.shortCode, toUpper(replace(section.name, ' ', ''))) = coalesce(document.shortCode, toUpper(document.slug))
               THEN 'REQ'
               ELSE coalesce(section.shortCode, toUpper(replace(section.name, ' ', '')))
             END
           ELSE
             coalesce(document.shortCode, toUpper(document.slug))
         END AS newPrefix,
         split(requirement.ref, '-') AS refParts
    WITH requirement, newPrefix,
         newPrefix + '-' + refParts[size(refParts)-1] AS newRef
    SET requirement.ref = newRef, requirement.updatedAt = $now
  `;

  await tx.run(updateQuery, {
    tenantSlug,
    projectSlug,
    documentSlug,
    now: new Date().toISOString()
  });
}

/**
 * Updates requirement refs for all requirements in a section
 * Regenerates refs based on document and section short codes
 *
 * Called when:
 * - Section short code changes
 * - Section is renamed (affecting short code)
 * - Requirements are moved into this section
 *
 * @param tx - Active transaction
 * @param sectionId - Document section ID
 */
export async function updateRequirementRefsForSection(
  tx: ManagedTransaction,
  sectionId: string
): Promise<void> {
  const updateQuery = `
    MATCH (section:DocumentSection {id: $sectionId})<-[:HAS_SECTION]-(document:Document)<-[:HAS_DOCUMENT]-(project:Project)
    MATCH (section)-[:CONTAINS]->(requirement:Requirement)
    WITH requirement, document, section,
         coalesce(document.shortCode, toUpper(document.slug)) + '-' +
         CASE
           WHEN coalesce(section.shortCode, toUpper(replace(section.name, ' ', ''))) = coalesce(document.shortCode, toUpper(document.slug))
           THEN 'REQ'
           ELSE coalesce(section.shortCode, toUpper(replace(section.name, ' ', '')))
         END AS newPrefix,
         split(requirement.ref, '-') AS refParts
    WITH requirement, newPrefix,
         newPrefix + '-' + refParts[size(refParts)-1] AS newRef
    SET requirement.ref = newRef, requirement.updatedAt = $now
  `;

  await tx.run(updateQuery, { sectionId, now: new Date().toISOString() });
}
