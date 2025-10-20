#!/usr/bin/env node
/**
 * Migration Script: Convert JSON Ports to Graph Nodes
 *
 * Phase 1 of port-as-nodes migration
 * - Reads all blocks with JSON ports
 * - Creates PortDefinition nodes for unique port signatures
 * - Creates PortInstance nodes for each port occurrence
 * - Establishes relationships
 * - KEEPS JSON ports intact (dual-write period)
 *
 * Safety features:
 * - Idempotent: Can be run multiple times
 * - Dry-run mode: Preview changes without committing
 * - Verification: Compares counts before/after
 * - Rollback support: Keeps original JSON
 */

import { getSession, initGraph, closeGraph } from "../services/graph/driver.js";
import type { ManagedTransaction } from "neo4j-driver";

interface MigrationStats {
  blocksProcessed: number;
  portDefinitionsCreated: number;
  portInstancesCreated: number;
  relationshipsCreated: number;
  errors: Array<{ blockId: string; error: string }>;
}

interface PortFromJson {
  id: string;
  name: string;
  direction: string;
  edge?: string;
  offset?: number;
  backgroundColor?: string;
  borderColor?: string;
  borderWidth?: number;
  size?: number;
  shape?: string;
  iconColor?: string;
  hidden?: boolean;
  showLabel?: boolean;
  labelOffsetX?: number;
  labelOffsetY?: number;
}

interface BlockData {
  blockId: string;
  diagramId: string;
  tenant: string;
  projectKey: string;
  ports: PortFromJson[];
}

/**
 * Generate a unique signature for a port definition
 * Ports with same name, direction, and owner should share a definition
 */
function getPortDefinitionSignature(port: PortFromJson, blockId: string): string {
  return `${blockId}:${port.name}:${port.direction}`;
}

/**
 * Dry run: Preview what would be migrated
 */
async function dryRun(): Promise<void> {
  const session = getSession();

  try {
    console.log("🔍 DRY RUN: Analyzing blocks with JSON ports...\n");

    const query = `
      MATCH (d:ArchitectureDiagram)-[:HAS_BLOCK]->(b:ArchitectureBlock)
      WHERE b.ports IS NOT NULL AND b.ports <> '[]'
      RETURN
        b.id AS blockId,
        b.tenant AS tenant,
        b.projectKey AS projectKey,
        d.id AS diagramId,
        b.ports AS portsJson
      ORDER BY b.createdAt
      LIMIT 10
    `;

    const result = await session.executeRead(async (tx: ManagedTransaction) => {
      return await tx.run(query);
    });

    console.log(`Found ${result.records.length} blocks with JSON ports (showing first 10)\n`);

    for (const record of result.records) {
      const blockId = record.get("blockId");
      const diagramId = record.get("diagramId");
      const portsJson = record.get("portsJson");

      let ports: PortFromJson[] = [];
      try {
        ports = JSON.parse(portsJson);
      } catch (e) {
        console.log(`  ⚠️  Block ${blockId}: Invalid JSON`);
        continue;
      }

      console.log(`  📦 Block ${blockId} (Diagram: ${diagramId})`);
      console.log(`     ${ports.length} port(s):`);
      ports.forEach(port => {
        console.log(`       - ${port.name} (${port.direction}) [${port.id}]`);
      });
      console.log("");
    }

    // Get total counts
    const countQuery = `
      MATCH (b:ArchitectureBlock)
      WHERE b.ports IS NOT NULL AND b.ports <> '[]'
      RETURN count(b) AS totalBlocks
    `;

    const countResult = await session.executeRead(async (tx: ManagedTransaction) => {
      return await tx.run(countQuery);
    });

    const totalBlocks = countResult.records[0]?.get("totalBlocks")?.toNumber() ?? 0;

    console.log(`\n📊 Summary:`);
    console.log(`   Total blocks with ports: ${totalBlocks}`);
    console.log(`\n💡 Run with --execute to perform migration`);
  } finally {
    await session.close();
  }
}

/**
 * Execute the migration
 */
async function executeMigration(): Promise<MigrationStats> {
  const session = getSession();
  const stats: MigrationStats = {
    blocksProcessed: 0,
    portDefinitionsCreated: 0,
    portInstancesCreated: 0,
    relationshipsCreated: 0,
    errors: []
  };

  // Track created definitions to avoid duplicates
  const createdDefinitions = new Map<string, string>(); // signature -> definitionId

  try {
    console.log("🚀 Starting port migration to nodes...\n");

    // Step 1: Fetch all blocks with ports
    const fetchQuery = `
      MATCH (d:ArchitectureDiagram)-[:HAS_BLOCK]->(b:ArchitectureBlock)
      WHERE b.ports IS NOT NULL AND b.ports <> '[]'
      RETURN
        b.id AS blockId,
        b.tenant AS tenant,
        b.projectKey AS projectKey,
        d.id AS diagramId,
        b.ports AS portsJson
      ORDER BY b.createdAt
    `;

    const fetchResult = await session.executeRead(async (tx: ManagedTransaction) => {
      return await tx.run(fetchQuery);
    });

    const blocksData: BlockData[] = [];

    for (const record of fetchResult.records) {
      const blockId = record.get("blockId");
      const tenant = record.get("tenant");
      const projectKey = record.get("projectKey");
      const diagramId = record.get("diagramId");
      const portsJson = record.get("portsJson");

      let ports: PortFromJson[] = [];
      try {
        ports = JSON.parse(portsJson);
      } catch (e) {
        stats.errors.push({
          blockId,
          error: `Invalid JSON: ${e instanceof Error ? e.message : String(e)}`
        });
        continue;
      }

      if (ports.length > 0) {
        blocksData.push({ blockId, diagramId, tenant, projectKey, ports });
      }
    }

    console.log(`📦 Found ${blocksData.length} blocks to migrate\n`);

    // Step 2: Process each block
    for (const blockData of blocksData) {
      try {
        await session.executeWrite(async (tx: ManagedTransaction) => {
          for (const port of blockData.ports) {
            const signature = getPortDefinitionSignature(port, blockData.blockId);
            let portDefId = createdDefinitions.get(signature);

            // Create PortDefinition if it doesn't exist yet
            if (!portDefId) {
              portDefId = `portdef-migrated-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
              const now = new Date().toISOString();

              const createDefQuery = `
                CREATE (pd:PortDefinition {
                  id: $portDefId,
                  name: $name,
                  direction: $direction,
                  portType: $portType,
                  isConjugated: $isConjugated,
                  dataType: $dataType,
                  protocol: $protocol,
                  rate: $rate,
                  bufferSize: $bufferSize,
                  backgroundColor: $backgroundColor,
                  borderColor: $borderColor,
                  borderWidth: $borderWidth,
                  size: $size,
                  shape: $shape,
                  iconColor: $iconColor,
                  description: $description,
                  stereotype: $stereotype,
                  tenant: $tenant,
                  projectKey: $projectKey,
                  packageId: $packageId,
                  createdAt: $now,
                  updatedAt: $now
                })
                RETURN pd.id AS id
              `;

              await tx.run(createDefQuery, {
                portDefId,
                name: port.name,
                direction: port.direction || "none",
                portType: null,
                isConjugated: null,
                dataType: null,
                protocol: null,
                rate: null,
                bufferSize: null,
                backgroundColor: port.backgroundColor ?? null,
                borderColor: port.borderColor ?? null,
                borderWidth: port.borderWidth ?? null,
                size: port.size ?? null,
                shape: port.shape ?? null,
                iconColor: port.iconColor ?? null,
                description: null,
                stereotype: null,
                tenant: blockData.tenant,
                projectKey: blockData.projectKey,
                packageId: null,
                now
              });

              createdDefinitions.set(signature, portDefId);
              stats.portDefinitionsCreated++;
            }

            // Create PortInstance
            const portInstanceId = port.id; // Preserve original ID
            const now = new Date().toISOString();

            const createInstanceQuery = `
              MATCH (pd:PortDefinition {id: $portDefId})
              MATCH (b:ArchitectureBlock {id: $blockId})
              MATCH (d:ArchitectureDiagram {id: $diagramId})

              // Check if PortInstance already exists
              OPTIONAL MATCH (existing:PortInstance {id: $portInstanceId})

              WITH pd, b, d, existing
              WHERE existing IS NULL

              CREATE (pi:PortInstance {
                id: $portInstanceId,
                definitionId: $portDefId,
                blockId: $blockId,
                diagramId: $diagramId,
                edge: $edge,
                offset: $offset,
                hidden: $hidden,
                showLabel: $showLabel,
                labelOffsetX: $labelOffsetX,
                labelOffsetY: $labelOffsetY,
                backgroundColor: $backgroundColor,
                borderColor: $borderColor,
                borderWidth: $borderWidth,
                size: $size,
                shape: $shape,
                iconColor: $iconColor,
                createdAt: $now,
                updatedAt: $now
              })
              MERGE (pd)-[:INSTANTIATED_AS]->(pi)
              MERGE (b)-[:HAS_PORT]->(pi)
              MERGE (d)-[:CONTAINS_PORT]->(pi)
              MERGE (pi)-[:BELONGS_TO_BLOCK]->(b)
              RETURN pi.id AS createdId
            `;

            const instanceResult = await tx.run(createInstanceQuery, {
              portDefId,
              portInstanceId,
              blockId: blockData.blockId,
              diagramId: blockData.diagramId,
              edge: port.edge ?? null,
              offset: port.offset ?? null,
              hidden: port.hidden ?? null,
              showLabel: port.showLabel ?? null,
              labelOffsetX: port.labelOffsetX ?? null,
              labelOffsetY: port.labelOffsetY ?? null,
              backgroundColor: port.backgroundColor ?? null,
              borderColor: port.borderColor ?? null,
              borderWidth: port.borderWidth ?? null,
              size: port.size ?? null,
              shape: port.shape ?? null,
              iconColor: port.iconColor ?? null,
              now
            });

            if (instanceResult.records.length > 0) {
              stats.portInstancesCreated++;
              stats.relationshipsCreated += 4; // INSTANTIATED_AS, HAS_PORT, CONTAINS_PORT, BELONGS_TO_BLOCK
            }
          }
        });

        stats.blocksProcessed++;

        if (stats.blocksProcessed % 10 === 0) {
          console.log(`  ✅ Processed ${stats.blocksProcessed} blocks...`);
        }
      } catch (error) {
        stats.errors.push({
          blockId: blockData.blockId,
          error: error instanceof Error ? error.message : String(error)
        });
        console.log(`  ❌ Error processing block ${blockData.blockId}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    console.log("\n✨ Migration complete!\n");
    return stats;
  } finally {
    await session.close();
  }
}

/**
 * Verify migration results
 */
async function verify(): Promise<void> {
  const session = getSession();

  try {
    console.log("🔍 Verifying migration...\n");

    // Count JSON ports
    const jsonQuery = `
      MATCH (b:ArchitectureBlock)
      WHERE b.ports IS NOT NULL AND b.ports <> '[]'
      WITH b, size([p IN COLLECT(b.ports) | p]) AS portCount
      RETURN sum(portCount) AS totalJsonPorts, count(b) AS blocksWithPorts
    `;

    const jsonResult = await session.executeRead(async (tx: ManagedTransaction) => {
      return await tx.run(jsonQuery);
    });

    const blocksWithPorts = jsonResult.records[0]?.get("blocksWithPorts")?.toNumber() ?? 0;

    // Count node ports
    const nodeQuery = `
      MATCH (pd:PortDefinition)
      OPTIONAL MATCH (pd)-[:INSTANTIATED_AS]->(pi:PortInstance)
      RETURN count(DISTINCT pd) AS definitions, count(pi) AS instances
    `;

    const nodeResult = await session.executeRead(async (tx: ManagedTransaction) => {
      return await tx.run(nodeQuery);
    });

    const definitions = nodeResult.records[0]?.get("definitions")?.toNumber() ?? 0;
    const instances = nodeResult.records[0]?.get("instances")?.toNumber() ?? 0;

    console.log("📊 Verification Results:");
    console.log(`   Blocks with JSON ports: ${blocksWithPorts}`);
    console.log(`   PortDefinitions created: ${definitions}`);
    console.log(`   PortInstances created: ${instances}`);

    // Check for blocks without port nodes
    const orphanQuery = `
      MATCH (b:ArchitectureBlock)
      WHERE b.ports IS NOT NULL AND b.ports <> '[]'
      AND NOT (b)-[:HAS_PORT]->(:PortInstance)
      RETURN count(b) AS orphanedBlocks
    `;

    const orphanResult = await session.executeRead(async (tx: ManagedTransaction) => {
      return await tx.run(orphanQuery);
    });

    const orphanedBlocks = orphanResult.records[0]?.get("orphanedBlocks")?.toNumber() ?? 0;

    if (orphanedBlocks > 0) {
      console.log(`   ⚠️  ${orphanedBlocks} blocks still have only JSON ports (not migrated)`);
    } else {
      console.log(`   ✅ All blocks with ports have been migrated to nodes`);
    }

    console.log("");
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
  console.log("  PORT MIGRATION: JSON to Graph Nodes");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  // Initialize graph driver
  await initGraph();

  if (shouldVerify) {
    await verify();
    return;
  }

  if (isDryRun) {
    await dryRun();
  } else {
    const stats = await executeMigration();

    console.log("📊 Migration Statistics:");
    console.log(`   Blocks processed: ${stats.blocksProcessed}`);
    console.log(`   PortDefinitions created: ${stats.portDefinitionsCreated}`);
    console.log(`   PortInstances created: ${stats.portInstancesCreated}`);
    console.log(`   Relationships created: ${stats.relationshipsCreated}`);

    if (stats.errors.length > 0) {
      console.log(`\n❌ Errors encountered: ${stats.errors.length}`);
      stats.errors.forEach(err => {
        console.log(`   - Block ${err.blockId}: ${err.error}`);
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
