import { getSession } from "./driver.js";

/**
 * Creates database indexes and constraints for optimal query performance
 * This should be run once during initial setup or migrations
 *
 * Performance: All index/constraint operations are batched into a single transaction
 * to minimize database round-trips (28+ operations → 1 transaction)
 */
export async function createDatabaseIndexes(): Promise<void> {
  const session = getSession();

  try {
    await session.executeWrite(async (tx) => {
      // Define all index and constraint operations
      const operations = [
        // Tenant indexes
        'CREATE INDEX tenant_slug IF NOT EXISTS FOR (t:Tenant) ON (t.slug)',

        // Project indexes
        'CREATE INDEX project_slug IF NOT EXISTS FOR (p:Project) ON (p.slug)',
        'CREATE INDEX project_tenant_slug IF NOT EXISTS FOR (p:Project) ON (p.tenantSlug)',

        // Requirement indexes
        'CREATE INDEX requirement_ref IF NOT EXISTS FOR (r:Requirement) ON (r.ref)',
        'CREATE INDEX requirement_tenant_project IF NOT EXISTS FOR (r:Requirement) ON (r.tenant, r.projectKey)',
        'CREATE INDEX requirement_document IF NOT EXISTS FOR (r:Requirement) ON (r.documentSlug)',
        'CREATE INDEX requirement_created_at IF NOT EXISTS FOR (r:Requirement) ON (r.createdAt)',

        // Document indexes
        'CREATE INDEX document_slug IF NOT EXISTS FOR (d:Document) ON (d.slug)',
        'CREATE INDEX document_tenant_project IF NOT EXISTS FOR (d:Document) ON (d.tenant, d.projectKey)',
        'CREATE INDEX content_block_document IF NOT EXISTS FOR (cb:DocumentContentBlock) ON (cb.documentSlug)',
        'CREATE INDEX content_block_tenant_project IF NOT EXISTS FOR (cb:DocumentContentBlock) ON (cb.tenant, cb.projectKey)',

        // RequirementCandidate indexes
        'CREATE INDEX candidate_tenant_project IF NOT EXISTS FOR (rc:RequirementCandidate) ON (rc.tenant, rc.projectKey)',
        'CREATE INDEX candidate_status IF NOT EXISTS FOR (rc:RequirementCandidate) ON (rc.status)',
        'CREATE INDEX candidate_session IF NOT EXISTS FOR (rc:RequirementCandidate) ON (rc.querySessionId)',

        // Architecture Block indexes
        'CREATE INDEX block_definition_id IF NOT EXISTS FOR (b:ArchitectureBlockDefinition) ON (b.id)',
        'CREATE INDEX block_tenant_project IF NOT EXISTS FOR (b:ArchitectureBlockDefinition) ON (b.tenant, b.projectKey)',

        // Architecture Diagram indexes
        'CREATE INDEX diagram_id IF NOT EXISTS FOR (d:ArchitectureDiagram) ON (d.id)',
        'CREATE INDEX diagram_tenant_project IF NOT EXISTS FOR (d:ArchitectureDiagram) ON (d.tenant, d.projectKey)',

        // Baseline indexes
        'CREATE INDEX baseline_ref IF NOT EXISTS FOR (b:Baseline) ON (b.ref)',
        'CREATE INDEX baseline_tenant_project IF NOT EXISTS FOR (b:Baseline) ON (b.tenant, b.projectKey)',

        // Uniqueness constraints (these also create indexes)
        'CREATE CONSTRAINT tenant_slug_unique IF NOT EXISTS FOR (t:Tenant) REQUIRE t.slug IS UNIQUE',
        'CREATE CONSTRAINT project_composite_unique IF NOT EXISTS FOR (p:Project) REQUIRE (p.tenantSlug, p.slug) IS UNIQUE',
        'CREATE CONSTRAINT requirement_id_unique IF NOT EXISTS FOR (r:Requirement) REQUIRE r.id IS UNIQUE',
        'CREATE CONSTRAINT document_id_unique IF NOT EXISTS FOR (d:Document) REQUIRE d.id IS UNIQUE',
        'CREATE CONSTRAINT content_block_id_unique IF NOT EXISTS FOR (cb:DocumentContentBlock) REQUIRE cb.id IS UNIQUE',
        'CREATE CONSTRAINT baseline_id_unique IF NOT EXISTS FOR (b:Baseline) REQUIRE b.id IS UNIQUE',
      ];

      // Execute all operations in a single transaction
      for (const operation of operations) {
        await tx.run(operation);
      }
    });

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
