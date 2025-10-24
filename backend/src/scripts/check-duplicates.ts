/**
 * Diagnostic script to check for duplicate documents and requirements
 */

import { initGraph, getSession } from "../services/graph/driver.js";

async function checkDuplicates() {
  await initGraph();
  const session = getSession();

  try {
    console.log("\n=== Checking for duplicate documents ===\n");

    const docsResult = await session.run(`
      MATCH (doc:Document {slug: 'airgen-system-requirements'})
      WHERE doc.tenant = 'airgen-meta' AND doc.projectKey = 'airgen-requirements'
      RETURN doc.slug, doc.name, doc.deletedAt, doc.createdAt, doc.id
      ORDER BY doc.createdAt
    `);

    console.log(`Found ${docsResult.records.length} documents with slug 'airgen-system-requirements':`);
    docsResult.records.forEach((record, i) => {
      const deletedAt = record.get('doc.deletedAt');
      const createdAt = record.get('doc.createdAt');
      console.log(`  [${i+1}] ${deletedAt ? '❌ DELETED' : '✅ ACTIVE'} - created: ${createdAt}`);
    });

    if (docsResult.records.length > 1) {
      console.log("\n⚠️  WARNING: Multiple documents found with the same slug!");
    }

    console.log("\n=== Checking sections for each document ===\n");

    for (let i = 0; i < docsResult.records.length; i++) {
      const docId = docsResult.records[i].get('doc.id');
      const deletedAt = docsResult.records[i].get('doc.deletedAt');

      const sectionsResult = await session.run(`
        MATCH (doc:Document {id: $docId})-[:HAS_SECTION]->(section:DocumentSection)
        RETURN count(section) as sectionCount
      `, { docId });

      const sectionCount = sectionsResult.records[0]?.get('sectionCount')?.toNumber() || 0;
      console.log(`  Document [${i+1}] ${deletedAt ? '(deleted)' : '(active)'}: ${sectionCount} sections`);
    }

    console.log("\n=== Checking requirements via active document query ===\n");

    const reqsResult = await session.run(`
      MATCH (doc:Document {slug: 'airgen-system-requirements'})-[:HAS_SECTION]->(section:DocumentSection)-[:CONTAINS]->(req:Requirement)
      WHERE doc.tenant = 'airgen-meta' AND doc.projectKey = 'airgen-requirements'
        AND (doc.deletedAt IS NULL)
        AND (req.deleted IS NULL OR req.deleted = false)
      RETURN section.name as sectionName, count(req) as reqCount, collect(DISTINCT req.ref) as refs
      ORDER BY sectionName
    `);

    let totalReqs = 0;
    console.log("Requirements per section (via active document):");
    reqsResult.records.forEach(record => {
      const sectionName = record.get('sectionName');
      const reqCount = record.get('reqCount').toNumber();
      const refs = record.get('refs');
      totalReqs += reqCount;
      console.log(`  ${sectionName}: ${reqCount} requirements`);
      if (reqCount > 0 && reqCount <= 5) {
        console.log(`    Refs: ${refs.join(', ')}`);
      }
    });
    console.log(`\nTotal: ${totalReqs} requirements`);

    console.log("\n=== Checking for duplicate requirement refs ===\n");

    const dupRefsResult = await session.run(`
      MATCH (req:Requirement)
      WHERE req.tenant = 'airgen-meta' AND req.projectKey = 'airgen-requirements'
        AND (req.deleted IS NULL OR req.deleted = false)
      WITH req.ref as ref, collect(req.id) as ids, count(*) as cnt
      WHERE cnt > 1
      RETURN ref, cnt, ids
      ORDER BY cnt DESC
      LIMIT 10
    `);

    if (dupRefsResult.records.length === 0) {
      console.log("✅ No duplicate requirement refs found");
    } else {
      console.log(`⚠️  Found ${dupRefsResult.records.length} duplicate refs:`);
      dupRefsResult.records.forEach(record => {
        const ref = record.get('ref');
        const cnt = record.get('cnt').toNumber();
        console.log(`  ${ref}: ${cnt} copies`);
      });
    }

  } catch (error) {
    console.error("Error:", error);
  } finally {
    await session.close();
  }

  process.exit(0);
}

checkDuplicates();
