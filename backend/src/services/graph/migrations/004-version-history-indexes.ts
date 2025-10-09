/**
 * Migration 004: Create Indexes for Version History Nodes
 *
 * This migration creates database indexes for all version node types to ensure
 * efficient queries when creating and retrieving baselines.
 *
 * Indexes created:
 * - RequirementVersion(versionId)
 * - RequirementVersion(requirementId)
 * - DocumentVersion(versionId)
 * - DocumentVersion(documentId)
 * - DocumentSectionVersion(versionId)
 * - DocumentSectionVersion(sectionId)
 * - InfoVersion(versionId)
 * - InfoVersion(infoId)
 * - SurrogateReferenceVersion(versionId)
 * - SurrogateReferenceVersion(surrogateId)
 * - TraceLinkVersion(versionId)
 * - TraceLinkVersion(traceLinkId)
 * - DocumentLinksetVersion(versionId)
 * - DocumentLinksetVersion(linksetId)
 * - ArchitectureDiagramVersion(versionId)
 * - ArchitectureDiagramVersion(diagramId)
 * - ArchitectureBlockVersion(versionId)
 * - ArchitectureBlockVersion(blockId)
 * - ArchitectureConnectorVersion(versionId)
 * - ArchitectureConnectorVersion(connectorId)
 *
 * Benefits:
 * - Fast baseline creation (looking up version nodes by versionId)
 * - Fast version history retrieval (querying by entity ID)
 * - Efficient baseline comparison queries
 */

import { getSession } from "../driver.js";

export async function migrate004Up(): Promise<void> {
  const session = getSession();

  try {
    console.log("[Migration 004] Starting: Create version history indexes");

    // RequirementVersion indexes
    console.log("[Migration 004] Creating RequirementVersion indexes");
    await session.run(`
      CREATE INDEX requirement_version_id IF NOT EXISTS
      FOR (v:RequirementVersion) ON (v.versionId)
    `);
    await session.run(`
      CREATE INDEX requirement_version_requirement_id IF NOT EXISTS
      FOR (v:RequirementVersion) ON (v.requirementId)
    `);

    // DocumentVersion indexes
    console.log("[Migration 004] Creating DocumentVersion indexes");
    await session.run(`
      CREATE INDEX document_version_id IF NOT EXISTS
      FOR (v:DocumentVersion) ON (v.versionId)
    `);
    await session.run(`
      CREATE INDEX document_version_document_id IF NOT EXISTS
      FOR (v:DocumentVersion) ON (v.documentId)
    `);

    // DocumentSectionVersion indexes
    console.log("[Migration 004] Creating DocumentSectionVersion indexes");
    await session.run(`
      CREATE INDEX section_version_id IF NOT EXISTS
      FOR (v:DocumentSectionVersion) ON (v.versionId)
    `);
    await session.run(`
      CREATE INDEX section_version_section_id IF NOT EXISTS
      FOR (v:DocumentSectionVersion) ON (v.sectionId)
    `);

    // InfoVersion indexes
    console.log("[Migration 004] Creating InfoVersion indexes");
    await session.run(`
      CREATE INDEX info_version_id IF NOT EXISTS
      FOR (v:InfoVersion) ON (v.versionId)
    `);
    await session.run(`
      CREATE INDEX info_version_info_id IF NOT EXISTS
      FOR (v:InfoVersion) ON (v.infoId)
    `);

    // SurrogateReferenceVersion indexes
    console.log("[Migration 004] Creating SurrogateReferenceVersion indexes");
    await session.run(`
      CREATE INDEX surrogate_version_id IF NOT EXISTS
      FOR (v:SurrogateReferenceVersion) ON (v.versionId)
    `);
    await session.run(`
      CREATE INDEX surrogate_version_surrogate_id IF NOT EXISTS
      FOR (v:SurrogateReferenceVersion) ON (v.surrogateId)
    `);

    // TraceLinkVersion indexes
    console.log("[Migration 004] Creating TraceLinkVersion indexes");
    await session.run(`
      CREATE INDEX trace_link_version_id IF NOT EXISTS
      FOR (v:TraceLinkVersion) ON (v.versionId)
    `);
    await session.run(`
      CREATE INDEX trace_link_version_trace_link_id IF NOT EXISTS
      FOR (v:TraceLinkVersion) ON (v.traceLinkId)
    `);

    // DocumentLinksetVersion indexes
    console.log("[Migration 004] Creating DocumentLinksetVersion indexes");
    await session.run(`
      CREATE INDEX linkset_version_id IF NOT EXISTS
      FOR (v:DocumentLinksetVersion) ON (v.versionId)
    `);
    await session.run(`
      CREATE INDEX linkset_version_linkset_id IF NOT EXISTS
      FOR (v:DocumentLinksetVersion) ON (v.linksetId)
    `);

    // ArchitectureDiagramVersion indexes
    console.log("[Migration 004] Creating ArchitectureDiagramVersion indexes");
    await session.run(`
      CREATE INDEX diagram_version_id IF NOT EXISTS
      FOR (v:ArchitectureDiagramVersion) ON (v.versionId)
    `);
    await session.run(`
      CREATE INDEX diagram_version_diagram_id IF NOT EXISTS
      FOR (v:ArchitectureDiagramVersion) ON (v.diagramId)
    `);

    // ArchitectureBlockVersion indexes
    console.log("[Migration 004] Creating ArchitectureBlockVersion indexes");
    await session.run(`
      CREATE INDEX block_version_id IF NOT EXISTS
      FOR (v:ArchitectureBlockVersion) ON (v.versionId)
    `);
    await session.run(`
      CREATE INDEX block_version_block_id IF NOT EXISTS
      FOR (v:ArchitectureBlockVersion) ON (v.blockId)
    `);

    // ArchitectureConnectorVersion indexes
    console.log("[Migration 004] Creating ArchitectureConnectorVersion indexes");
    await session.run(`
      CREATE INDEX connector_version_id IF NOT EXISTS
      FOR (v:ArchitectureConnectorVersion) ON (v.versionId)
    `);
    await session.run(`
      CREATE INDEX connector_version_connector_id IF NOT EXISTS
      FOR (v:ArchitectureConnectorVersion) ON (v.connectorId)
    `);

    console.log("[Migration 004] Migration completed successfully");
    console.log("[Migration 004] Created 20 indexes for version history optimization");
  } catch (error) {
    console.error("[Migration 004] Migration failed:", error);
    throw error;
  } finally {
    await session.close();
  }
}

export async function migrate004Down(): Promise<void> {
  const session = getSession();

  try {
    console.log("[Migration 004] Starting rollback: Drop version history indexes");

    // Drop RequirementVersion indexes
    console.log("[Migration 004] Dropping RequirementVersion indexes");
    await session.run(`DROP INDEX requirement_version_id IF EXISTS`);
    await session.run(`DROP INDEX requirement_version_requirement_id IF EXISTS`);

    // Drop DocumentVersion indexes
    console.log("[Migration 004] Dropping DocumentVersion indexes");
    await session.run(`DROP INDEX document_version_id IF EXISTS`);
    await session.run(`DROP INDEX document_version_document_id IF EXISTS`);

    // Drop DocumentSectionVersion indexes
    console.log("[Migration 004] Dropping DocumentSectionVersion indexes");
    await session.run(`DROP INDEX section_version_id IF EXISTS`);
    await session.run(`DROP INDEX section_version_section_id IF EXISTS`);

    // Drop InfoVersion indexes
    console.log("[Migration 004] Dropping InfoVersion indexes");
    await session.run(`DROP INDEX info_version_id IF EXISTS`);
    await session.run(`DROP INDEX info_version_info_id IF EXISTS`);

    // Drop SurrogateReferenceVersion indexes
    console.log("[Migration 004] Dropping SurrogateReferenceVersion indexes");
    await session.run(`DROP INDEX surrogate_version_id IF EXISTS`);
    await session.run(`DROP INDEX surrogate_version_surrogate_id IF EXISTS`);

    // Drop TraceLinkVersion indexes
    console.log("[Migration 004] Dropping TraceLinkVersion indexes");
    await session.run(`DROP INDEX trace_link_version_id IF EXISTS`);
    await session.run(`DROP INDEX trace_link_version_trace_link_id IF EXISTS`);

    // Drop DocumentLinksetVersion indexes
    console.log("[Migration 004] Dropping DocumentLinksetVersion indexes");
    await session.run(`DROP INDEX linkset_version_id IF EXISTS`);
    await session.run(`DROP INDEX linkset_version_linkset_id IF EXISTS`);

    // Drop ArchitectureDiagramVersion indexes
    console.log("[Migration 004] Dropping ArchitectureDiagramVersion indexes");
    await session.run(`DROP INDEX diagram_version_id IF EXISTS`);
    await session.run(`DROP INDEX diagram_version_diagram_id IF EXISTS`);

    // Drop ArchitectureBlockVersion indexes
    console.log("[Migration 004] Dropping ArchitectureBlockVersion indexes");
    await session.run(`DROP INDEX block_version_id IF EXISTS`);
    await session.run(`DROP INDEX block_version_block_id IF EXISTS`);

    // Drop ArchitectureConnectorVersion indexes
    console.log("[Migration 004] Dropping ArchitectureConnectorVersion indexes");
    await session.run(`DROP INDEX connector_version_id IF EXISTS`);
    await session.run(`DROP INDEX connector_version_connector_id IF EXISTS`);

    console.log("[Migration 004] Rollback completed successfully");
    console.log("[Migration 004] Dropped 20 version history indexes");
  } catch (error) {
    console.error("[Migration 004] Rollback failed:", error);
    throw error;
  } finally {
    await session.close();
  }
}

export const migration004 = {
  id: "004-version-history-indexes",
  description: "Create database indexes for all version node types to optimize baseline and version history queries",
  up: migrate004Up,
  down: migrate004Down
};
