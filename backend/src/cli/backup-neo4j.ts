#!/usr/bin/env node
/**
 * Backup Neo4j database to Cypher script
 * This can be used to restore the database if migration fails
 */

import { getSession } from "../services/graph/driver.js";
import { promises as fs } from "node:fs";
import { join } from "node:path";

async function backupDatabase() {
  const session = getSession();
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupDir = join(process.cwd(), "backups");
  const backupFile = join(backupDir, `neo4j-backup-${timestamp}.cypher`);

  try {
    console.log("Creating backup directory...");
    await fs.mkdir(backupDir, { recursive: true });

    console.log("Exporting database to Cypher...");

    let cypherScript = "// Neo4j Database Backup\n";
    cypherScript += `// Created: ${new Date().toISOString()}\n`;
    cypherScript += "// This script can be used to restore the database\n\n";
    cypherScript += "// Step 1: Clear existing data (WARNING: This deletes everything)\n";
    cypherScript += "// MATCH (n) DETACH DELETE n;\n\n";
    cypherScript += "// Step 2: Restore data\n\n";

    // Export nodes by label
    const labels = ["Tenant", "Project", "Document", "DocumentSection", "Requirement", "Info", "SurrogateReference", "Folder", "Baseline"];

    for (const label of labels) {
      console.log(`Exporting ${label} nodes...`);
      const result = await session.run(`MATCH (n:${label}) RETURN n LIMIT 10000`);

      for (const record of result.records) {
        const node = record.get("n");
        const props = node.properties;
        const propStrings: string[] = [];

        for (const [key, value] of Object.entries(props)) {
          if (value === null || value === undefined) continue;

          if (typeof value === "string") {
            // Escape quotes and newlines
            const escaped = value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
            propStrings.push(`${key}: "${escaped}"`);
          } else if (typeof value === "number") {
            propStrings.push(`${key}: ${value}`);
          } else if (typeof value === "boolean") {
            propStrings.push(`${key}: ${value}`);
          } else if (Array.isArray(value)) {
            const arrayStr = JSON.stringify(value);
            propStrings.push(`${key}: ${arrayStr}`);
          } else {
            propStrings.push(`${key}: "${String(value)}"`);
          }
        }

        cypherScript += `CREATE (:${label} {${propStrings.join(", ")}});\n`;
      }

      cypherScript += "\n";
    }

    // Export relationships
    console.log("Exporting relationships...");
    const relResult = await session.run(`
      MATCH (a)-[r]->(b)
      RETURN
        id(a) as sourceId,
        labels(a)[0] as sourceLabel,
        a.id as sourceNodeId,
        type(r) as relType,
        properties(r) as relProps,
        id(b) as targetId,
        labels(b)[0] as targetLabel,
        b.id as targetNodeId
      LIMIT 10000
    `);

    cypherScript += "// Relationships\n";
    for (const record of relResult.records) {
      const sourceLabel = record.get("sourceLabel");
      const sourceNodeId = record.get("sourceNodeId");
      const relType = record.get("relType");
      const relProps = record.get("relProps");
      const targetLabel = record.get("targetLabel");
      const targetNodeId = record.get("targetNodeId");

      const propStrings: string[] = [];
      if (relProps && typeof relProps === "object") {
        for (const [key, value] of Object.entries(relProps)) {
          if (value === null || value === undefined) continue;

          if (typeof value === "string") {
            const escaped = value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
            propStrings.push(`${key}: "${escaped}"`);
          } else if (typeof value === "number") {
            propStrings.push(`${key}: ${value}`);
          } else if (typeof value === "boolean") {
            propStrings.push(`${key}: ${value}`);
          }
        }
      }

      const relPropsStr = propStrings.length > 0 ? ` {${propStrings.join(", ")}}` : "";

      cypherScript += `MATCH (a:${sourceLabel} {id: "${sourceNodeId}"}), (b:${targetLabel} {id: "${targetNodeId}"}) CREATE (a)-[:${relType}${relPropsStr}]->(b);\n`;
    }

    await fs.writeFile(backupFile, cypherScript, "utf-8");

    console.log("\n✅ Backup completed successfully!");
    console.log(`📁 Backup file: ${backupFile}`);
    console.log(`📊 File size: ${(await fs.stat(backupFile)).size} bytes`);

    return backupFile;
  } catch (error) {
    console.error("\n❌ Backup failed:");
    console.error(error);
    throw error;
  } finally {
    await session.close();
  }
}

backupDatabase()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
