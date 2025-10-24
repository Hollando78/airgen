/**
 * Cleanup script to remove duplicate requirements
 *
 * This script finds requirements with duplicate refs and keeps only the first one (by createdAt)
 */

import { initGraph, getSession } from "../services/graph/driver.js";

async function cleanupDuplicates() {
  await initGraph();
  const session = getSession();

  try {
    console.log("\n=== Finding duplicate requirements ===\n");

    // Find all requirements with duplicate refs
    const dupResult = await session.run(`
      MATCH (req:Requirement)
      WHERE req.tenant = 'airgen-meta' AND req.projectKey = 'airgen-requirements'
        AND (req.deleted IS NULL OR req.deleted = false)
      WITH req.ref as ref, collect(req) as reqs, count(*) as cnt
      WHERE cnt > 1
      RETURN ref, cnt,
             [r IN reqs | {id: r.id, ref: r.ref, text: substring(r.text, 0, 50), createdAt: r.createdAt}] as details
      ORDER BY cnt DESC
    `);

    if (dupResult.records.length === 0) {
      console.log("✅ No duplicate requirements found");
      return;
    }

    console.log(`Found ${dupResult.records.length} requirement refs with duplicates:\n`);

    let totalDuplicates = 0;
    dupResult.records.forEach(record => {
      const ref = record.get('ref');
      const cnt = record.get('cnt').toNumber();
      const details = record.get('details');

      console.log(`  ${ref}: ${cnt} copies`);
      console.log(`    Text: ${details[0].text}...`);
      totalDuplicates += cnt - 1; // All but one are duplicates
    });

    console.log(`\nTotal duplicates to remove: ${totalDuplicates}`);

    console.log("\n=== Removing duplicates (keeping oldest by createdAt) ===\n");

    // For each duplicate ref, keep the oldest and delete the rest
    const cleanupResult = await session.executeWrite(async tx => {
      let deletedCount = 0;

      for (const record of dupResult.records) {
        const ref = record.get('ref');

        // Find all requirements with this ref, ordered by createdAt
        const reqs = await tx.run(`
          MATCH (req:Requirement {tenant: 'airgen-meta', projectKey: 'airgen-requirements', ref: $ref})
          WHERE (req.deleted IS NULL OR req.deleted = false)
          RETURN req
          ORDER BY req.createdAt ASC
        `, { ref });

        if (reqs.records.length <= 1) continue;

        // Keep the first (oldest), delete the rest
        const toDelete = reqs.records.slice(1);

        for (const reqRecord of toDelete) {
          const req = reqRecord.get('req');
          const reqId = req.properties.id;

          await tx.run(`
            MATCH (req:Requirement {id: $reqId})
            DETACH DELETE req
          `, { reqId });

          deletedCount++;
          console.log(`  Deleted duplicate: ${ref} (${reqId})`);
        }
      }

      return deletedCount;
    });

    console.log(`\n✅ Cleanup complete! Removed ${cleanupResult} duplicate requirements`);

  } catch (error) {
    console.error("Error:", error);
    throw error;
  } finally {
    await session.close();
  }

  process.exit(0);
}

cleanupDuplicates();
