#!/usr/bin/env node
/**
 * Migration Script: Create Connector-Port Relationships
 *
 * Phase 2 of port-as-nodes migration
 * - Reads all connectors with sourcePortId/targetPortId
 * - Creates FROM_PORT and TO_PORT relationships to PortInstance nodes
 * - KEEPS string properties for rollback safety
 * - Handles missing/invalid port references gracefully
 *
 * Safety features:
 * - Idempotent: Can be run multiple times
 * - Dry-run mode: Preview changes without committing
 * - Verification: Reports missing ports and invalid references
 * - Rollback support: Keeps original string properties
 */

import { getSession, initGraph, closeGraph } from "../services/graph/driver.js";
import type { ManagedTransaction } from "neo4j-driver";

interface MigrationStats {
  connectorsProcessed: number;
  fromPortRelationshipsCreated: number;
  toPortRelationshipsCreated: number;
  missingPorts: Array<{ connectorId: string; portId: string; type: "source" | "target" }>;
  errors: Array<{ connectorId: string; error: string }>;
}

interface ConnectorData {
  connectorId: string;
  sourcePortId?: string;
  targetPortId?: string;
  tenant: string;
  projectKey: string;
}

/**
 * Dry run: Analyze connectors that will be migrated
 */
async function dryRun(): Promise<void> {
  const session = getSession();

  try {
    console.log("🔍 DRY RUN: Analyzing connectors with port references...\n");

    // Find all connectors with port IDs
    const query = `
      MATCH (c:ArchitectureConnector)
      WHERE c.sourcePortId IS NOT NULL OR c.targetPortId IS NOT NULL
      RETURN
        c.id AS connectorId,
        c.sourcePortId AS sourcePortId,
        c.targetPortId AS targetPortId,
        c.tenant AS tenant,
        c.projectKey AS projectKey
      LIMIT 100
    `;

    const result = await session.executeRead(async (tx: ManagedTransaction) => {
      return await tx.run(query);
    });

    const connectors = result.records.map(record => ({
      connectorId: record.get("connectorId"),
      sourcePortId: record.get("sourcePortId"),
      targetPortId: record.get("targetPortId"),
      tenant: record.get("tenant"),
      projectKey: record.get("projectKey")
    }));

    console.log(`Found ${result.records.length} connectors with port references\n`);

    // Check which ports exist
    for (const conn of connectors.slice(0, 10)) {
      console.log(`  🔗 Connector ${conn.connectorId}`);
      if (conn.sourcePortId) {
        const portExists = await checkPortExists(session, conn.sourcePortId);
        console.log(`     Source port: ${conn.sourcePortId} ${portExists ? "✅" : "❌ (missing)"}`);
      }
      if (conn.targetPortId) {
        const portExists = await checkPortExists(session, conn.targetPortId);
        console.log(`     Target port: ${conn.targetPortId} ${portExists ? "✅" : "❌ (missing)"}`);
      }
      console.log();
    }

    if (result.records.length > 10) {
      console.log(`  ... and ${result.records.length - 10} more connectors\n`);
    }

    console.log("📊 Summary:");
    console.log(`   Total connectors to process: ${result.records.length}`);
    console.log("\n💡 Run with --execute to perform migration\n");
  } finally {
    await session.close();
  }
}

/**
 * Check if a port instance exists
 */
async function checkPortExists(session: ReturnType<typeof getSession>, portId: string): Promise<boolean> {
  const query = `
    MATCH (pi:PortInstance {id: $portId})
    RETURN count(pi) > 0 AS exists
  `;

  const result = await session.executeRead(async (tx: ManagedTransaction) => {
    return await tx.run(query, { portId });
  });

  return result.records[0]?.get("exists") ?? false;
}

/**
 * Execute the migration
 */
async function executeMigration(): Promise<MigrationStats> {
  const session = getSession();

  const stats: MigrationStats = {
    connectorsProcessed: 0,
    fromPortRelationshipsCreated: 0,
    toPortRelationshipsCreated: 0,
    missingPorts: [],
    errors: []
  };

  try {
    console.log("🚀 Starting connector-port relationship migration...\n");

    // Fetch all connectors with port references
    const fetchQuery = `
      MATCH (c:ArchitectureConnector)
      WHERE c.sourcePortId IS NOT NULL OR c.targetPortId IS NOT NULL
      RETURN
        c.id AS connectorId,
        c.sourcePortId AS sourcePortId,
        c.targetPortId AS targetPortId,
        c.tenant AS tenant,
        c.projectKey AS projectKey
    `;

    const fetchResult = await session.executeRead(async (tx: ManagedTransaction) => {
      return await tx.run(fetchQuery);
    });

    const connectors: ConnectorData[] = fetchResult.records.map(record => ({
      connectorId: record.get("connectorId"),
      sourcePortId: record.get("sourcePortId"),
      targetPortId: record.get("targetPortId"),
      tenant: record.get("tenant"),
      projectKey: record.get("projectKey")
    }));

    console.log(`📦 Found ${connectors.length} connectors to process\n`);

    // Process each connector
    for (const conn of connectors) {
      try {
        // Create FROM_PORT relationship if sourcePortId exists
        if (conn.sourcePortId) {
          const fromPortCreated = await createFromPortRelationship(
            session,
            conn.connectorId,
            conn.sourcePortId
          );

          if (fromPortCreated) {
            stats.fromPortRelationshipsCreated++;
          } else {
            stats.missingPorts.push({
              connectorId: conn.connectorId,
              portId: conn.sourcePortId,
              type: "source"
            });
          }
        }

        // Create TO_PORT relationship if targetPortId exists
        if (conn.targetPortId) {
          const toPortCreated = await createToPortRelationship(
            session,
            conn.connectorId,
            conn.targetPortId
          );

          if (toPortCreated) {
            stats.toPortRelationshipsCreated++;
          } else {
            stats.missingPorts.push({
              connectorId: conn.connectorId,
              portId: conn.targetPortId,
              type: "target"
            });
          }
        }

        stats.connectorsProcessed++;

        if (stats.connectorsProcessed % 10 === 0) {
          console.log(`   Processed ${stats.connectorsProcessed}/${connectors.length} connectors...`);
        }
      } catch (error) {
        stats.errors.push({
          connectorId: conn.connectorId,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    console.log("\n✨ Migration complete!\n");
    return stats;
  } finally {
    await session.close();
  }
}

/**
 * Create FROM_PORT relationship
 */
async function createFromPortRelationship(
  session: ReturnType<typeof getSession>,
  connectorId: string,
  portId: string
): Promise<boolean> {
  const query = `
    MATCH (c:ArchitectureConnector {id: $connectorId})
    MATCH (pi:PortInstance {id: $portId})
    MERGE (c)-[:FROM_PORT]->(pi)
    RETURN count(pi) > 0 AS created
  `;

  const result = await session.executeWrite(async (tx: ManagedTransaction) => {
    return await tx.run(query, { connectorId, portId });
  });

  return result.records[0]?.get("created") ?? false;
}

/**
 * Create TO_PORT relationship
 */
async function createToPortRelationship(
  session: ReturnType<typeof getSession>,
  connectorId: string,
  portId: string
): Promise<boolean> {
  const query = `
    MATCH (c:ArchitectureConnector {id: $connectorId})
    MATCH (pi:PortInstance {id: $portId})
    MERGE (c)-[:TO_PORT]->(pi)
    RETURN count(pi) > 0 AS created
  `;

  const result = await session.executeWrite(async (tx: ManagedTransaction) => {
    return await tx.run(query, { connectorId, portId });
  });

  return result.records[0]?.get("created") ?? false;
}

/**
 * Verify migration results
 */
async function verify(): Promise<void> {
  const session = getSession();

  try {
    console.log("🔍 Verifying connector-port relationships...\n");

    // Count connectors with string properties
    const stringQuery = `
      MATCH (c:ArchitectureConnector)
      WHERE c.sourcePortId IS NOT NULL OR c.targetPortId IS NOT NULL
      RETURN count(c) AS withStringProps
    `;

    const stringResult = await session.executeRead(async (tx: ManagedTransaction) => {
      return await tx.run(stringQuery);
    });

    const withStringProps = stringResult.records[0]?.get("withStringProps")?.toNumber() ?? 0;

    // Count connectors with FROM_PORT relationships
    const fromPortQuery = `
      MATCH (c:ArchitectureConnector)-[:FROM_PORT]->(:PortInstance)
      RETURN count(DISTINCT c) AS withFromPort
    `;

    const fromPortResult = await session.executeRead(async (tx: ManagedTransaction) => {
      return await tx.run(fromPortQuery);
    });

    const withFromPort = fromPortResult.records[0]?.get("withFromPort")?.toNumber() ?? 0;

    // Count connectors with TO_PORT relationships
    const toPortQuery = `
      MATCH (c:ArchitectureConnector)-[:TO_PORT]->(:PortInstance)
      RETURN count(DISTINCT c) AS withToPort
    `;

    const toPortResult = await session.executeRead(async (tx: ManagedTransaction) => {
      return await tx.run(toPortQuery);
    });

    const withToPort = toPortResult.records[0]?.get("withToPort")?.toNumber() ?? 0;

    // Check for connectors without relationships but with string props
    const orphanQuery = `
      MATCH (c:ArchitectureConnector)
      WHERE (c.sourcePortId IS NOT NULL OR c.targetPortId IS NOT NULL)
        AND NOT (c)-[:FROM_PORT]->()
        AND NOT (c)-[:TO_PORT]->()
      RETURN c.id AS connectorId, c.sourcePortId, c.targetPortId
      LIMIT 10
    `;

    const orphanResult = await session.executeRead(async (tx: ManagedTransaction) => {
      return await tx.run(orphanQuery);
    });

    console.log("📊 Verification Results:");
    console.log(`   Connectors with port string properties: ${withStringProps}`);
    console.log(`   Connectors with FROM_PORT relationships: ${withFromPort}`);
    console.log(`   Connectors with TO_PORT relationships: ${withToPort}`);

    if (orphanResult.records.length > 0) {
      console.log(`\n⚠️  Connectors with string properties but no relationships: ${orphanResult.records.length}`);
      orphanResult.records.forEach(record => {
        console.log(`   - ${record.get("connectorId")}: source=${record.get("c.sourcePortId")}, target=${record.get("c.targetPortId")}`);
      });
    } else {
      console.log("\n✅ All connectors with port properties have relationships!");
    }
  } finally {
    await session.close();
  }
}

/**
 * Main entry point
 */
async function main() {
  const args = process.argv.slice(2);
  const isDryRun = !args.includes("--execute");
  const shouldVerify = args.includes("--verify");

  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  PHASE 2: Connector-Port Relationships");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  // Initialize graph driver
  await initGraph();

  if (shouldVerify) {
    await verify();
    await closeGraph();
    return;
  }

  if (isDryRun) {
    await dryRun();
  } else {
    const stats = await executeMigration();

    console.log("📊 Migration Statistics:");
    console.log(`   Connectors processed: ${stats.connectorsProcessed}`);
    console.log(`   FROM_PORT relationships created: ${stats.fromPortRelationshipsCreated}`);
    console.log(`   TO_PORT relationships created: ${stats.toPortRelationshipsCreated}`);

    if (stats.missingPorts.length > 0) {
      console.log(`\n⚠️  Missing ports: ${stats.missingPorts.length}`);
      stats.missingPorts.slice(0, 10).forEach(mp => {
        console.log(`   - Connector ${mp.connectorId}: ${mp.type} port ${mp.portId} not found`);
      });
      if (stats.missingPorts.length > 10) {
        console.log(`   ... and ${stats.missingPorts.length - 10} more`);
      }
    }

    if (stats.errors.length > 0) {
      console.log(`\n❌ Errors encountered: ${stats.errors.length}`);
      stats.errors.forEach(err => {
        console.log(`   - Connector ${err.connectorId}: ${err.error}`);
      });
    } else {
      console.log("\n✅ No errors!");
    }

    console.log("\n💡 Run with --verify to check migration results");
  }

  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  // Close graph driver
  await closeGraph();
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
}

export { executeMigration, dryRun, verify };
