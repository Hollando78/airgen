/**
 * Migration 003: Simplify Document Hierarchy
 *
 * This migration removes ambiguity in the document structure:
 * - Removes direct Document-[:CONTAINS]->Content relationships
 * - All content MUST belong to a section (creates "Unsectioned" section if needed)
 * - Single source of truth: Content → Section → Document
 *
 * Benefits:
 * - Eliminates ambiguity about where content lives
 * - Simpler query patterns (one path, not two)
 * - Consistent data model
 */

import { getSession } from "../driver.js";

export async function migrate003Up(): Promise<void> {
  const session = getSession();

  try {
    console.log("[Migration 003] Starting: Simplify document hierarchy");

    // Phase 1: Create "Unsectioned" sections for documents with direct content
    console.log("[Migration 003] Phase 1: Creating 'Unsectioned' sections for orphaned content");

    // Handle Requirements
    await session.run(`
      MATCH (doc:Document)-[rel:CONTAINS]->(req:Requirement)
      WHERE NOT EXISTS((doc)-[:HAS_SECTION]->()-[:CONTAINS]->(req))
      WITH doc, collect(req) AS requirements, collect(rel) AS oldRels
      WHERE size(requirements) > 0
      MERGE (doc)-[:HAS_SECTION]->(section:DocumentSection {
        id: 'unsectioned-' + doc.slug,
        documentSlug: doc.slug,
        name: 'Unsectioned',
        description: 'Content not assigned to a specific section',
        order: 999999,
        createdAt: datetime(),
        updatedAt: datetime()
      })
      WITH section, requirements, oldRels
      UNWIND range(0, size(requirements)-1) AS idx
      WITH section, requirements[idx] AS req, oldRels[idx] AS oldRel, idx
      CREATE (section)-[:CONTAINS {
        order: idx,
        createdAt: coalesce(oldRel.createdAt, req.createdAt),
        updatedAt: coalesce(oldRel.updatedAt, req.updatedAt)
      }]->(req)
      DELETE oldRel
    `);

    // Handle Infos
    await session.run(`
      MATCH (doc:Document)-[rel:HAS_INFO]->(info:Info)
      WHERE NOT EXISTS((doc)-[:HAS_SECTION]->()-[:CONTAINS]->(info))
      WITH doc, collect(info) AS infos, collect(rel) AS oldRels
      WHERE size(infos) > 0
      MERGE (doc)-[:HAS_SECTION]->(section:DocumentSection {
        id: 'unsectioned-' + doc.slug,
        documentSlug: doc.slug,
        name: 'Unsectioned',
        description: 'Content not assigned to a specific section',
        order: 999999,
        createdAt: datetime(),
        updatedAt: datetime()
      })
      WITH section, infos, oldRels
      UNWIND range(0, size(infos)-1) AS idx
      WITH section, infos[idx] AS info, oldRels[idx] AS oldRel, idx
      CREATE (section)-[:CONTAINS {
        order: idx + 10000,
        createdAt: coalesce(oldRel.createdAt, info.createdAt),
        updatedAt: coalesce(oldRel.updatedAt, info.updatedAt)
      }]->(info)
      DELETE oldRel
    `);

    // Handle SurrogateReferences
    await session.run(`
      MATCH (doc:Document)-[rel:HAS_SURROGATE_REFERENCE]->(surrogate:SurrogateReference)
      WHERE NOT EXISTS((doc)-[:HAS_SECTION]->()-[:CONTAINS]->(surrogate))
      WITH doc, collect(surrogate) AS surrogates, collect(rel) AS oldRels
      WHERE size(surrogates) > 0
      MERGE (doc)-[:HAS_SECTION]->(section:DocumentSection {
        id: 'unsectioned-' + doc.slug,
        documentSlug: doc.slug,
        name: 'Unsectioned',
        description: 'Content not assigned to a specific section',
        order: 999999,
        createdAt: datetime(),
        updatedAt: datetime()
      })
      WITH section, surrogates, oldRels
      UNWIND range(0, size(surrogates)-1) AS idx
      WITH section, surrogates[idx] AS surrogate, oldRels[idx] AS oldRel, idx
      CREATE (section)-[:CONTAINS {
        order: idx + 20000,
        createdAt: coalesce(oldRel.createdAt, surrogate.createdAt),
        updatedAt: coalesce(oldRel.updatedAt, surrogate.updatedAt)
      }]->(surrogate)
      DELETE oldRel
    `);

    // Phase 2: Remove any remaining direct Document->Content relationships
    console.log("[Migration 003] Phase 2: Removing direct Document->Content relationships");
    await session.run(`
      MATCH (doc:Document)-[rel:CONTAINS|HAS_INFO|HAS_SURROGATE_REFERENCE]->()
      DELETE rel
    `);

    console.log("[Migration 003] Migration completed successfully");
    console.log("[Migration 003] All content now belongs to sections");
  } catch (error) {
    console.error("[Migration 003] Migration failed:", error);
    throw error;
  } finally {
    await session.close();
  }
}

export async function migrate003Down(): Promise<void> {
  const session = getSession();

  try {
    console.log("[Migration 003] Starting rollback: Restore direct document relationships");

    // Phase 1: Restore direct Document->Requirement relationships for unsectioned content
    console.log("[Migration 003] Rollback Phase 1: Restoring direct Document->Requirement relationships");
    await session.run(`
      MATCH (doc:Document)-[:HAS_SECTION]->(section:DocumentSection)-[rel:CONTAINS]->(req:Requirement)
      WHERE section.name = 'Unsectioned'
      CREATE (doc)-[:CONTAINS {
        createdAt: rel.createdAt,
        updatedAt: rel.updatedAt
      }]->(req)
    `);

    // Phase 2: Restore direct Document->Info relationships for unsectioned content
    console.log("[Migration 003] Rollback Phase 2: Restoring direct Document->Info relationships");
    await session.run(`
      MATCH (doc:Document)-[:HAS_SECTION]->(section:DocumentSection)-[rel:CONTAINS]->(info:Info)
      WHERE section.name = 'Unsectioned'
      CREATE (doc)-[:HAS_INFO {
        createdAt: rel.createdAt,
        updatedAt: rel.updatedAt
      }]->(info)
    `);

    // Phase 3: Restore direct Document->SurrogateReference relationships for unsectioned content
    console.log("[Migration 003] Rollback Phase 3: Restoring direct Document->SurrogateReference relationships");
    await session.run(`
      MATCH (doc:Document)-[:HAS_SECTION]->(section:DocumentSection)-[rel:CONTAINS]->(surrogate:SurrogateReference)
      WHERE section.name = 'Unsectioned'
      CREATE (doc)-[:HAS_SURROGATE_REFERENCE {
        createdAt: rel.createdAt,
        updatedAt: rel.updatedAt
      }]->(surrogate)
    `);

    // Phase 4: Delete "Unsectioned" sections and their relationships
    console.log("[Migration 003] Rollback Phase 4: Removing 'Unsectioned' sections");
    await session.run(`
      MATCH (section:DocumentSection)
      WHERE section.name = 'Unsectioned'
      DETACH DELETE section
    `);

    console.log("[Migration 003] Rollback completed successfully");
  } catch (error) {
    console.error("[Migration 003] Rollback failed:", error);
    throw error;
  } finally {
    await session.close();
  }
}

export const migration003 = {
  id: "003-simplify-document-hierarchy",
  description: "Remove direct Document->Content relationships, enforce all content belongs to sections",
  up: migrate003Up,
  down: migrate003Down
};
