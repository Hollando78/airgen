#!/usr/bin/env node
/**
 * Port Migration Verification Script
 *
 * Comprehensive validation of port-as-nodes migration
 * - Data integrity checks
 * - Performance comparisons
 * - Relationship validation
 * - Orphan detection
 */

import { getSession, initGraph, closeGraph } from "../services/graph/driver.js";
import type { ManagedTransaction } from "neo4j-driver";

interface VerificationReport {
  summary: {
    totalBlocks: number;
    blocksWithJsonPorts: number;
    blocksWithPortNodes: number;
    totalPortDefinitions: number;
    totalPortInstances: number;
    totalConnectorsWithPorts: number;
  };
  issues: {
    orphanedJsonPorts: Array<{ blockId: string; portCount: number }>;
    orphanedPortNodes: string[];
    missingDefinitions: string[];
    connectorsWithInvalidPorts: Array<{ connectorId: string; issue: string }>;
  };
  performance: {
    jsonQueryMs: number;
    nodeQueryMs: number;
    improvement: string;
  };
}

async function runVerification(): Promise<VerificationReport> {
  const session = getSession();
  const report: VerificationReport = {
    summary: {
      totalBlocks: 0,
      blocksWithJsonPorts: 0,
      blocksWithPortNodes: 0,
      totalPortDefinitions: 0,
      totalPortInstances: 0,
      totalConnectorsWithPorts: 0
    },
    issues: {
      orphanedJsonPorts: [],
      orphanedPortNodes: [],
      missingDefinitions: [],
      connectorsWithInvalidPorts: []
    },
    performance: {
      jsonQueryMs: 0,
      nodeQueryMs: 0,
      improvement: ""
    }
  };

  try {
    console.log("🔍 Running comprehensive verification...\n");

    // ========================================================================
    // SUMMARY STATISTICS
    // ========================================================================

    console.log("📊 Gathering statistics...");

    // Total blocks
    const blockCountQuery = `
      MATCH (b:ArchitectureBlock)
      RETURN count(b) AS total
    `;
    const blockCountResult = await session.executeRead(async (tx: ManagedTransaction) => {
      return await tx.run(blockCountQuery);
    });
    report.summary.totalBlocks = blockCountResult.records[0]?.get("total")?.toNumber() ?? 0;

    // Blocks with JSON ports
    const jsonPortsQuery = `
      MATCH (b:ArchitectureBlock)
      WHERE b.ports IS NOT NULL AND b.ports <> '[]'
      RETURN count(b) AS total
    `;
    const jsonPortsResult = await session.executeRead(async (tx: ManagedTransaction) => {
      return await tx.run(jsonPortsQuery);
    });
    report.summary.blocksWithJsonPorts = jsonPortsResult.records[0]?.get("total")?.toNumber() ?? 0;

    // Blocks with port nodes
    const nodePortsQuery = `
      MATCH (b:ArchitectureBlock)-[:HAS_PORT]->(:PortInstance)
      RETURN count(DISTINCT b) AS total
    `;
    const nodePortsResult = await session.executeRead(async (tx: ManagedTransaction) => {
      return await tx.run(nodePortsQuery);
    });
    report.summary.blocksWithPortNodes = nodePortsResult.records[0]?.get("total")?.toNumber() ?? 0;

    // Port definitions
    const defQuery = `
      MATCH (pd:PortDefinition)
      RETURN count(pd) AS total
    `;
    const defResult = await session.executeRead(async (tx: ManagedTransaction) => {
      return await tx.run(defQuery);
    });
    report.summary.totalPortDefinitions = defResult.records[0]?.get("total")?.toNumber() ?? 0;

    // Port instances
    const instQuery = `
      MATCH (pi:PortInstance)
      RETURN count(pi) AS total
    `;
    const instResult = await session.executeRead(async (tx: ManagedTransaction) => {
      return await tx.run(instQuery);
    });
    report.summary.totalPortInstances = instResult.records[0]?.get("total")?.toNumber() ?? 0;

    // Connectors with ports
    const connQuery = `
      MATCH (c:ArchitectureConnector)
      WHERE c.sourcePortId IS NOT NULL OR c.targetPortId IS NOT NULL
      RETURN count(c) AS total
    `;
    const connResult = await session.executeRead(async (tx: ManagedTransaction) => {
      return await tx.run(connQuery);
    });
    report.summary.totalConnectorsWithPorts = connResult.records[0]?.get("total")?.toNumber() ?? 0;

    console.log("✅ Statistics gathered\n");

    // ========================================================================
    // ISSUE DETECTION
    // ========================================================================

    console.log("🔎 Checking for issues...");

    // Orphaned JSON ports (blocks with JSON but no nodes)
    const orphanJsonQuery = `
      MATCH (b:ArchitectureBlock)
      WHERE b.ports IS NOT NULL AND b.ports <> '[]'
      AND NOT (b)-[:HAS_PORT]->(:PortInstance)
      RETURN b.id AS blockId, size([p IN [b.ports] | p]) AS portCount
      LIMIT 100
    `;
    const orphanJsonResult = await session.executeRead(async (tx: ManagedTransaction) => {
      return await tx.run(orphanJsonQuery);
    });
    report.issues.orphanedJsonPorts = orphanJsonResult.records.map(r => ({
      blockId: r.get("blockId"),
      portCount: r.get("portCount")?.toNumber() ?? 0
    }));

    // Orphaned port nodes (no block relationship)
    const orphanNodeQuery = `
      MATCH (pi:PortInstance)
      WHERE NOT (pi)-[:BELONGS_TO_BLOCK]->(:ArchitectureBlock)
      RETURN pi.id AS portId
      LIMIT 100
    `;
    const orphanNodeResult = await session.executeRead(async (tx: ManagedTransaction) => {
      return await tx.run(orphanNodeQuery);
    });
    report.issues.orphanedPortNodes = orphanNodeResult.records.map(r => r.get("portId"));

    // Port instances without definitions
    const noDefQuery = `
      MATCH (pi:PortInstance)
      WHERE NOT (:PortDefinition)-[:INSTANTIATED_AS]->(pi)
      RETURN pi.id AS portId
      LIMIT 100
    `;
    const noDefResult = await session.executeRead(async (tx: ManagedTransaction) => {
      return await tx.run(noDefQuery);
    });
    report.issues.missingDefinitions = noDefResult.records.map(r => r.get("portId"));

    // Connectors with invalid port references
    const invalidConnQuery = `
      MATCH (c:ArchitectureConnector)
      WHERE c.sourcePortId IS NOT NULL OR c.targetPortId IS NOT NULL
      OPTIONAL MATCH (sourcePort:PortInstance {id: c.sourcePortId})
      OPTIONAL MATCH (targetPort:PortInstance {id: c.targetPortId})
      WHERE (c.sourcePortId IS NOT NULL AND sourcePort IS NULL)
         OR (c.targetPortId IS NOT NULL AND targetPort IS NULL)
      RETURN c.id AS connectorId,
             CASE
               WHEN c.sourcePortId IS NOT NULL AND sourcePort IS NULL THEN 'Missing source port: ' + c.sourcePortId
               WHEN c.targetPortId IS NOT NULL AND targetPort IS NULL THEN 'Missing target port: ' + c.targetPortId
               ELSE 'Unknown issue'
             END AS issue
      LIMIT 100
    `;
    const invalidConnResult = await session.executeRead(async (tx: ManagedTransaction) => {
      return await tx.run(invalidConnQuery);
    });
    report.issues.connectorsWithInvalidPorts = invalidConnResult.records.map(r => ({
      connectorId: r.get("connectorId"),
      issue: r.get("issue")
    }));

    console.log("✅ Issue detection complete\n");

    // ========================================================================
    // PERFORMANCE COMPARISON
    // ========================================================================

    console.log("⚡ Running performance tests...");

    // Test 1: Find all ports for a block (JSON approach)
    const testBlockQuery = `
      MATCH (b:ArchitectureBlock)-[:HAS_PORT]->(:PortInstance)
      RETURN b.id AS blockId
      LIMIT 1
    `;
    const testBlockResult = await session.executeRead(async (tx: ManagedTransaction) => {
      return await tx.run(testBlockQuery);
    });

    if (testBlockResult.records.length > 0) {
      const testBlockId = testBlockResult.records[0].get("blockId");

      // JSON approach
      const jsonStart = Date.now();
      await session.executeRead(async (tx: ManagedTransaction) => {
        return await tx.run(`
          MATCH (b:ArchitectureBlock {id: $blockId})
          RETURN b.ports
        `, { blockId: testBlockId });
      });
      report.performance.jsonQueryMs = Date.now() - jsonStart;

      // Node approach
      const nodeStart = Date.now();
      await session.executeRead(async (tx: ManagedTransaction) => {
        return await tx.run(`
          MATCH (b:ArchitectureBlock {id: $blockId})-[:HAS_PORT]->(pi:PortInstance)
          RETURN pi
        `, { blockId: testBlockId });
      });
      report.performance.nodeQueryMs = Date.now() - nodeStart;

      const improvement = ((report.performance.jsonQueryMs - report.performance.nodeQueryMs) / report.performance.jsonQueryMs * 100);
      report.performance.improvement = improvement > 0
        ? `${improvement.toFixed(1)}% faster`
        : `${Math.abs(improvement).toFixed(1)}% slower`;
    }

    console.log("✅ Performance tests complete\n");

    return report;
  } finally {
    await session.close();
  }
}

function printReport(report: VerificationReport): void {
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  VERIFICATION REPORT");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  // Summary
  console.log("📊 SUMMARY\n");
  console.log(`   Total Blocks:                ${report.summary.totalBlocks}`);
  console.log(`   Blocks with JSON Ports:      ${report.summary.blocksWithJsonPorts}`);
  console.log(`   Blocks with Port Nodes:      ${report.summary.blocksWithPortNodes}`);
  console.log(`   Port Definitions:            ${report.summary.totalPortDefinitions}`);
  console.log(`   Port Instances:              ${report.summary.totalPortInstances}`);
  console.log(`   Connectors with Ports:       ${report.summary.totalConnectorsWithPorts}`);

  // Migration status
  const migrationComplete = report.summary.blocksWithJsonPorts === report.summary.blocksWithPortNodes;
  if (migrationComplete && report.summary.blocksWithJsonPorts > 0) {
    console.log("\n   ✅ All blocks with ports have been migrated!");
  } else if (report.summary.blocksWithPortNodes === 0 && report.summary.blocksWithJsonPorts > 0) {
    console.log("\n   ⚠️  Migration not started yet");
  } else if (report.summary.blocksWithPortNodes < report.summary.blocksWithJsonPorts) {
    console.log(`\n   🔄 Migration in progress (${((report.summary.blocksWithPortNodes / report.summary.blocksWithJsonPorts) * 100).toFixed(1)}% complete)`);
  }

  // Issues
  console.log("\n\n🔎 ISSUES\n");

  if (report.issues.orphanedJsonPorts.length > 0) {
    console.log(`   ⚠️  Blocks with JSON but no nodes: ${report.issues.orphanedJsonPorts.length}`);
    report.issues.orphanedJsonPorts.slice(0, 5).forEach(orphan => {
      console.log(`      - Block ${orphan.blockId} (${orphan.portCount} ports)`);
    });
    if (report.issues.orphanedJsonPorts.length > 5) {
      console.log(`      ... and ${report.issues.orphanedJsonPorts.length - 5} more`);
    }
  } else {
    console.log("   ✅ No orphaned JSON ports");
  }

  if (report.issues.orphanedPortNodes.length > 0) {
    console.log(`\n   ⚠️  Orphaned port nodes: ${report.issues.orphanedPortNodes.length}`);
    report.issues.orphanedPortNodes.slice(0, 5).forEach(portId => {
      console.log(`      - ${portId}`);
    });
    if (report.issues.orphanedPortNodes.length > 5) {
      console.log(`      ... and ${report.issues.orphanedPortNodes.length - 5} more`);
    }
  } else {
    console.log("   ✅ No orphaned port nodes");
  }

  if (report.issues.missingDefinitions.length > 0) {
    console.log(`\n   ⚠️  Port instances without definitions: ${report.issues.missingDefinitions.length}`);
  } else {
    console.log("   ✅ All port instances have definitions");
  }

  if (report.issues.connectorsWithInvalidPorts.length > 0) {
    console.log(`\n   ⚠️  Connectors with invalid ports: ${report.issues.connectorsWithInvalidPorts.length}`);
    report.issues.connectorsWithInvalidPorts.slice(0, 5).forEach(conn => {
      console.log(`      - ${conn.connectorId}: ${conn.issue}`);
    });
    if (report.issues.connectorsWithInvalidPorts.length > 5) {
      console.log(`      ... and ${report.issues.connectorsWithInvalidPorts.length - 5} more`);
    }
  } else {
    console.log("   ✅ All connector port references are valid");
  }

  // Performance
  console.log("\n\n⚡ PERFORMANCE\n");
  if (report.performance.jsonQueryMs > 0) {
    console.log(`   JSON Query:    ${report.performance.jsonQueryMs}ms`);
    console.log(`   Node Query:    ${report.performance.nodeQueryMs}ms`);
    console.log(`   Improvement:   ${report.performance.improvement}`);
  } else {
    console.log("   ℹ️  No blocks with ports to test");
  }

  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
}

async function main() {
  // Initialize graph driver
  await initGraph();

  const report = await runVerification();
  printReport(report);

  // Close graph driver
  await closeGraph();

  // Exit code based on critical issues
  const hasCriticalIssues =
    report.issues.orphanedPortNodes.length > 0 ||
    report.issues.missingDefinitions.length > 0;

  if (hasCriticalIssues) {
    console.log("❌ Critical issues found!\n");
    process.exit(1);
  } else {
    console.log("✅ No critical issues found!\n");
    process.exit(0);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
}

export { runVerification, printReport };
