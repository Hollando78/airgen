/**
 * Migration 001: Unify Containment Relationships
 *
 * This migration addresses the inconsistent relationship patterns in the schema:
 * - Replaces HAS_REQUIREMENT, CONTAINS_INFO, CONTAINS_SURROGATE_REFERENCE with unified CONTAINS
 * - Moves `order` from node properties to relationship properties
 * - Enables O(1) reordering operations via relationship updates
 *
 * Benefits:
 * - Consistent semantics across all content types
 * - Efficient reordering (update relationships, not nodes)
 * - Simpler query patterns
 */

import { getSession } from "../driver.js";

export async function migrate001Up(): Promise<void> {
  const session = getSession();

  try {
    console.log("[Migration 001] Starting: Unify containment relationships");

    // Phase 1: Migrate DocumentSection -> Requirement relationships
    console.log("[Migration 001] Phase 1: Migrating DocumentSection-[:HAS_REQUIREMENT]->Requirement");
    await session.run(`
      MATCH (section:DocumentSection)-[oldRel:HAS_REQUIREMENT]->(req:Requirement)
      WITH section, req, oldRel, coalesce(req.order, 999999) AS orderValue
      CREATE (section)-[:CONTAINS {
        order: orderValue,
        createdAt: coalesce(oldRel.createdAt, req.createdAt),
        updatedAt: coalesce(oldRel.updatedAt, req.updatedAt)
      }]->(req)
      DELETE oldRel
    `);

    // Phase 2: Migrate DocumentSection -> Info relationships
    console.log("[Migration 001] Phase 2: Migrating DocumentSection-[:CONTAINS_INFO]->Info");
    await session.run(`
      MATCH (section:DocumentSection)-[oldRel:CONTAINS_INFO]->(info:Info)
      WITH section, info, oldRel, coalesce(info.order, 999999) AS orderValue
      CREATE (section)-[:CONTAINS {
        order: orderValue,
        createdAt: coalesce(oldRel.createdAt, info.createdAt),
        updatedAt: coalesce(oldRel.updatedAt, info.updatedAt)
      }]->(info)
      DELETE oldRel
    `);

    // Phase 3: Migrate DocumentSection -> SurrogateReference relationships
    console.log("[Migration 001] Phase 3: Migrating DocumentSection-[:CONTAINS_SURROGATE_REFERENCE]->SurrogateReference");
    await session.run(`
      MATCH (section:DocumentSection)-[oldRel:CONTAINS_SURROGATE_REFERENCE]->(surrogate:SurrogateReference)
      WITH section, surrogate, oldRel, coalesce(surrogate.order, 999999) AS orderValue
      CREATE (section)-[:CONTAINS {
        order: orderValue,
        createdAt: coalesce(oldRel.createdAt, surrogate.createdAt),
        updatedAt: coalesce(oldRel.updatedAt, surrogate.updatedAt)
      }]->(surrogate)
      DELETE oldRel
    `);

    // Phase 4: Remove `order` property from content nodes (now on relationships)
    console.log("[Migration 001] Phase 4: Removing order properties from nodes");
    await session.run(`
      MATCH (content)
      WHERE content:Requirement OR content:Info OR content:SurrogateReference
      REMOVE content.order
    `);

    console.log("[Migration 001] Migration completed successfully");
  } catch (error) {
    console.error("[Migration 001] Migration failed:", error);
    throw error;
  } finally {
    await session.close();
  }
}

export async function migrate001Down(): Promise<void> {
  const session = getSession();

  try {
    console.log("[Migration 001] Starting rollback: Restore original relationships");

    // Phase 1: Restore DocumentSection -> Requirement relationships
    console.log("[Migration 001] Rollback Phase 1: Restoring DocumentSection-[:HAS_REQUIREMENT]->Requirement");
    await session.run(`
      MATCH (section:DocumentSection)-[rel:CONTAINS]->(req:Requirement)
      WITH section, req, rel
      CREATE (section)-[:HAS_REQUIREMENT {
        createdAt: rel.createdAt,
        updatedAt: rel.updatedAt
      }]->(req)
      SET req.order = rel.order
      DELETE rel
    `);

    // Phase 2: Restore DocumentSection -> Info relationships
    console.log("[Migration 001] Rollback Phase 2: Restoring DocumentSection-[:CONTAINS_INFO]->Info");
    await session.run(`
      MATCH (section:DocumentSection)-[rel:CONTAINS]->(info:Info)
      WITH section, info, rel
      CREATE (section)-[:CONTAINS_INFO {
        createdAt: rel.createdAt,
        updatedAt: rel.updatedAt
      }]->(info)
      SET info.order = rel.order
      DELETE rel
    `);

    // Phase 3: Restore DocumentSection -> SurrogateReference relationships
    console.log("[Migration 001] Rollback Phase 3: Restoring DocumentSection-[:CONTAINS_SURROGATE_REFERENCE]->SurrogateReference");
    await session.run(`
      MATCH (section:DocumentSection)-[rel:CONTAINS]->(surrogate:SurrogateReference)
      WITH section, surrogate, rel
      CREATE (section)-[:CONTAINS_SURROGATE_REFERENCE {
        createdAt: rel.createdAt,
        updatedAt: rel.updatedAt
      }]->(surrogate)
      SET surrogate.order = rel.order
      DELETE rel
    `);

    console.log("[Migration 001] Rollback completed successfully");
  } catch (error) {
    console.error("[Migration 001] Rollback failed:", error);
    throw error;
  } finally {
    await session.close();
  }
}

export const migration001 = {
  id: "001-unify-containment-relationships",
  description: "Unify HAS_REQUIREMENT, CONTAINS_INFO, CONTAINS_SURROGATE_REFERENCE into single CONTAINS pattern",
  up: migrate001Up,
  down: migrate001Down
};
