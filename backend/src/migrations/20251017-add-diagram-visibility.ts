/**
 * Migration: Add diagram visibility support
 *
 * This migration adds the isVisible property to all existing ArchitectureDiagram nodes.
 * All existing diagrams are set to isVisible=true to maintain backwards compatibility.
 *
 * Run this migration once after deploying the soft delete feature.
 *
 * Usage:
 *   node dist/migrations/20251017-add-diagram-visibility.js
 */

import neo4j from "neo4j-driver";
import { readFileSync, existsSync } from "fs";

// Read secret from Docker secret file or environment variable (same logic as config.ts)
function getSecret(secretName: string, envVarName?: string): string | undefined {
  const secretPath = `/run/secrets/${secretName}`;

  // Try Docker secret file first
  if (existsSync(secretPath)) {
    try {
      const content = readFileSync(secretPath, 'utf8').trim();
      if (content) {
        return content;
      }
    } catch (error) {
      console.warn(`Failed to read Docker secret ${secretName}:`, error);
    }
  }

  // Fallback to environment variable
  if (envVarName) {
    return process.env[envVarName];
  }

  return undefined;
}

const NEO4J_URI = process.env.GRAPH_URL || process.env.NEO4J_URI || "bolt://localhost:7687";
const NEO4J_USER = process.env.GRAPH_USERNAME || process.env.NEO4J_USER || "neo4j";
const NEO4J_PASSWORD = getSecret('neo4j_password', 'GRAPH_PASSWORD') || process.env.NEO4J_PASSWORD || "password";

async function migrate() {
  const driver = neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD));
  const session = driver.session();

  try {
    console.log("🔄 Starting diagram visibility migration...");
    console.log(`📍 Connected to: ${NEO4J_URI}`);

    // Count diagrams without isVisible property
    const countResult = await session.run(`
      MATCH (d:ArchitectureDiagram)
      WHERE d.isVisible IS NULL
      RETURN count(d) as count
    `);

    const diagramCount = countResult.records[0].get("count").toNumber();
    console.log(`📊 Found ${diagramCount} diagrams to migrate`);

    if (diagramCount === 0) {
      console.log("✅ All diagrams already have isVisible property");
      return;
    }

    // Set isVisible=true for all diagrams that don't have it
    const updateResult = await session.run(`
      MATCH (d:ArchitectureDiagram)
      WHERE d.isVisible IS NULL
      SET d.isVisible = true,
          d.updatedAt = datetime()
      RETURN count(d) as updated
    `);

    const updatedCount = updateResult.records[0].get("updated").toNumber();
    console.log(`✅ Updated ${updatedCount} diagrams with isVisible=true`);

    // Verify migration
    const verifyResult = await session.run(`
      MATCH (d:ArchitectureDiagram)
      RETURN
        count(d) as total,
        sum(CASE WHEN d.isVisible = true THEN 1 ELSE 0 END) as visible,
        sum(CASE WHEN d.isVisible = false THEN 1 ELSE 0 END) as hidden,
        sum(CASE WHEN d.isVisible IS NULL THEN 1 ELSE 0 END) as nullCount
    `);

    const stats = verifyResult.records[0];
    console.log("\n📈 Migration Results:");
    console.log(`   Total diagrams: ${stats.get("total").toNumber()}`);
    console.log(`   Visible: ${stats.get("visible").toNumber()}`);
    console.log(`   Hidden: ${stats.get("hidden").toNumber()}`);
    console.log(`   NULL: ${stats.get("nullCount").toNumber()}`);

    if (stats.get("nullCount").toNumber() === 0) {
      console.log("\n✅ Migration completed successfully!");
    } else {
      console.warn("\n⚠️  Warning: Some diagrams still have NULL isVisible property");
    }

  } catch (error) {
    console.error("❌ Migration failed:", error);
    throw error;
  } finally {
    await session.close();
    await driver.close();
    console.log("\n🔌 Database connection closed");
  }
}

// Run migration if called directly
const isMainModule = import.meta.url === `file://${process.argv[1]}`;

if (isMainModule) {
  migrate()
    .then(() => {
      console.log("\n✨ Migration script finished");
      process.exit(0);
    })
    .catch((error) => {
      console.error("\n💥 Migration script failed:", error);
      process.exit(1);
    });
}

export { migrate };
