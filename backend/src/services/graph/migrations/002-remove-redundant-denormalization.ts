/**
 * Migration 002: Remove Redundant Denormalization
 *
 * This migration removes redundant tenant/project/document/section data from content nodes:
 * - Removes `tenant`, `projectKey`, `documentSlug`, `sectionId` from Requirement/Info/SurrogateReference
 * - These values should be derived via graph traversal from relationships
 * - Keeps only essential identifiers and content-specific fields
 *
 * Benefits:
 * - Eliminates update anomalies (no need to update denormalized copies)
 * - Reduces storage by ~30%
 * - Single source of truth via relationships
 * - Simpler data model
 */

import { getSession } from "../driver.js";

export async function migrate002Up(): Promise<void> {
  const session = getSession();

  try {
    console.log("[Migration 002] Starting: Remove redundant denormalization");

    // Phase 1: Remove redundant properties from Requirements
    console.log("[Migration 002] Phase 1: Removing redundant properties from Requirements");
    await session.run(`
      MATCH (req:Requirement)
      REMOVE req.tenant, req.projectKey, req.documentSlug, req.sectionId
    `);

    // Phase 2: Remove redundant properties from Infos
    console.log("[Migration 002] Phase 2: Removing redundant properties from Infos");
    await session.run(`
      MATCH (info:Info)
      REMOVE info.tenant, info.projectKey, info.documentSlug, info.sectionId
    `);

    // Phase 3: Remove redundant properties from SurrogateReferences
    console.log("[Migration 002] Phase 3: Removing redundant properties from SurrogateReferences");
    await session.run(`
      MATCH (surrogate:SurrogateReference)
      REMOVE surrogate.tenant, surrogate.projectKey, surrogate.documentSlug, surrogate.sectionId
    `);

    console.log("[Migration 002] Migration completed successfully");
    console.log("[Migration 002] Note: Queries must now derive these values from graph traversal");
  } catch (error) {
    console.error("[Migration 002] Migration failed:", error);
    throw error;
  } finally {
    await session.close();
  }
}

export async function migrate002Down(): Promise<void> {
  const session = getSession();

  try {
    console.log("[Migration 002] Starting rollback: Restore denormalized properties");

    // Phase 1: Restore denormalized properties on Requirements
    console.log("[Migration 002] Rollback Phase 1: Restoring properties on Requirements");
    await session.run(`
      MATCH (tenant:Tenant)-[:OWNS]->(project:Project)-[:HAS_DOCUMENT]->(doc:Document)
      MATCH (section:DocumentSection {documentSlug: doc.slug})-[:CONTAINS]->(req:Requirement)
      SET req.tenant = tenant.slug,
          req.projectKey = project.key,
          req.documentSlug = doc.slug,
          req.sectionId = section.id
    `);

    // Also handle requirements not in sections but directly in documents
    await session.run(`
      MATCH (tenant:Tenant)-[:OWNS]->(project:Project)-[:HAS_DOCUMENT]->(doc:Document)-[:CONTAINS]->(req:Requirement)
      WHERE NOT EXISTS((doc)-[:HAS_SECTION]->()-[:CONTAINS]->(req))
      SET req.tenant = tenant.slug,
          req.projectKey = project.key,
          req.documentSlug = doc.slug
    `);

    // Phase 2: Restore denormalized properties on Infos
    console.log("[Migration 002] Rollback Phase 2: Restoring properties on Infos");
    await session.run(`
      MATCH (tenant:Tenant)-[:OWNS]->(project:Project)-[:HAS_DOCUMENT]->(doc:Document)
      MATCH (section:DocumentSection {documentSlug: doc.slug})-[:CONTAINS]->(info:Info)
      SET info.tenant = tenant.slug,
          info.projectKey = project.key,
          info.documentSlug = doc.slug,
          info.sectionId = section.id
    `);

    // Phase 3: Restore denormalized properties on SurrogateReferences
    console.log("[Migration 002] Rollback Phase 3: Restoring properties on SurrogateReferences");
    await session.run(`
      MATCH (tenant:Tenant)-[:OWNS]->(project:Project)-[:HAS_DOCUMENT]->(doc:Document)
      MATCH (section:DocumentSection {documentSlug: doc.slug})-[:CONTAINS]->(surrogate:SurrogateReference)
      SET surrogate.tenant = tenant.slug,
          surrogate.projectKey = project.key,
          surrogate.documentSlug = doc.slug,
          surrogate.sectionId = section.id
    `);

    console.log("[Migration 002] Rollback completed successfully");
  } catch (error) {
    console.error("[Migration 002] Rollback failed:", error);
    throw error;
  } finally {
    await session.close();
  }
}

export const migration002 = {
  id: "002-remove-redundant-denormalization",
  description: "Remove redundant tenant/project/document/section properties from content nodes",
  up: migrate002Up,
  down: migrate002Down
};
