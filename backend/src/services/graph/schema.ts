import { getSession } from "./driver.js";

/**
 * Creates database indexes and constraints for optimal query performance
 * This should be run once during initial setup or migrations
 */
export async function createDatabaseIndexes(): Promise<void> {
  const session = getSession();

  try {
    // Tenant indexes
    await session.run(`
      CREATE INDEX tenant_slug IF NOT EXISTS
      FOR (t:Tenant) ON (t.slug)
    `);

    // Project indexes
    await session.run(`
      CREATE INDEX project_slug IF NOT EXISTS
      FOR (p:Project) ON (p.slug)
    `);

    await session.run(`
      CREATE INDEX project_tenant_slug IF NOT EXISTS
      FOR (p:Project) ON (p.tenantSlug)
    `);

    // Requirement indexes
    await session.run(`
      CREATE INDEX requirement_ref IF NOT EXISTS
      FOR (r:Requirement) ON (r.ref)
    `);

    await session.run(`
      CREATE INDEX requirement_tenant_project IF NOT EXISTS
      FOR (r:Requirement) ON (r.tenant, r.projectKey)
    `);

    await session.run(`
      CREATE INDEX requirement_document IF NOT EXISTS
      FOR (r:Requirement) ON (r.documentSlug)
    `);

    await session.run(`
      CREATE INDEX requirement_created_at IF NOT EXISTS
      FOR (r:Requirement) ON (r.createdAt)
    `);

    // Document indexes
    await session.run(`
      CREATE INDEX document_slug IF NOT EXISTS
      FOR (d:Document) ON (d.slug)
    `);

    await session.run(`
      CREATE INDEX document_tenant_project IF NOT EXISTS
      FOR (d:Document) ON (d.tenant, d.projectKey)
    `);

    // RequirementCandidate indexes
    await session.run(`
      CREATE INDEX candidate_tenant_project IF NOT EXISTS
      FOR (rc:RequirementCandidate) ON (rc.tenant, rc.projectKey)
    `);

    await session.run(`
      CREATE INDEX candidate_status IF NOT EXISTS
      FOR (rc:RequirementCandidate) ON (rc.status)
    `);

    await session.run(`
      CREATE INDEX candidate_session IF NOT EXISTS
      FOR (rc:RequirementCandidate) ON (rc.querySessionId)
    `);

    // Architecture Block indexes
    await session.run(`
      CREATE INDEX block_definition_id IF NOT EXISTS
      FOR (b:ArchitectureBlockDefinition) ON (b.id)
    `);

    await session.run(`
      CREATE INDEX block_tenant_project IF NOT EXISTS
      FOR (b:ArchitectureBlockDefinition) ON (b.tenant, b.projectKey)
    `);

    // Architecture Diagram indexes
    await session.run(`
      CREATE INDEX diagram_id IF NOT EXISTS
      FOR (d:ArchitectureDiagram) ON (d.id)
    `);

    await session.run(`
      CREATE INDEX diagram_tenant_project IF NOT EXISTS
      FOR (d:ArchitectureDiagram) ON (d.tenant, d.projectKey)
    `);

    // Baseline indexes
    await session.run(`
      CREATE INDEX baseline_ref IF NOT EXISTS
      FOR (b:Baseline) ON (b.ref)
    `);

    await session.run(`
      CREATE INDEX baseline_tenant_project IF NOT EXISTS
      FOR (b:Baseline) ON (b.tenant, b.projectKey)
    `);

    // Uniqueness constraints (these also create indexes)
    await session.run(`
      CREATE CONSTRAINT tenant_slug_unique IF NOT EXISTS
      FOR (t:Tenant) REQUIRE t.slug IS UNIQUE
    `);

    await session.run(`
      CREATE CONSTRAINT project_composite_unique IF NOT EXISTS
      FOR (p:Project) REQUIRE (p.tenantSlug, p.slug) IS UNIQUE
    `);

    await session.run(`
      CREATE CONSTRAINT requirement_id_unique IF NOT EXISTS
      FOR (r:Requirement) REQUIRE r.id IS UNIQUE
    `);

    await session.run(`
      CREATE CONSTRAINT document_id_unique IF NOT EXISTS
      FOR (d:Document) REQUIRE d.id IS UNIQUE
    `);

    await session.run(`
      CREATE CONSTRAINT baseline_id_unique IF NOT EXISTS
      FOR (b:Baseline) REQUIRE b.id IS UNIQUE
    `);

    console.log("✓ Database indexes and constraints created successfully");
  } catch (error) {
    console.error("Failed to create database indexes:", error);
    throw error;
  } finally {
    await session.close();
  }
}

/**
 * Lists all indexes in the database for verification
 */
export async function listDatabaseIndexes(): Promise<Array<{ name: string; labelsOrTypes: string[]; properties: string[] }>> {
  const session = getSession();

  try {
    const result = await session.run("SHOW INDEXES");

    return result.records.map(record => ({
      name: record.get("name") as string,
      labelsOrTypes: record.get("labelsOrTypes") as string[],
      properties: record.get("properties") as string[]
    }));
  } finally {
    await session.close();
  }
}

/**
 * Lists all constraints in the database for verification
 */
export async function listDatabaseConstraints(): Promise<Array<{ name: string; type: string }>> {
  const session = getSession();

  try {
    const result = await session.run("SHOW CONSTRAINTS");

    return result.records.map(record => ({
      name: record.get("name") as string,
      type: record.get("type") as string
    }));
  } finally {
    await session.close();
  }
}
