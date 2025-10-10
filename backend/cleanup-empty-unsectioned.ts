import { initGraph, getSession, closeGraph } from "./src/services/graph/driver.js";

async function cleanupEmptyUnsectioned() {
  await initGraph();
  const session = getSession();

  try {
    console.log("Cleaning up empty 'Unsectioned Requirements' sections...\n");

    // Find all empty "Unsectioned Requirements" sections
    const findResult = await session.run(`
      MATCH (doc:Document)-[:HAS_SECTION]->(section:DocumentSection)
      WHERE doc.tenant = 'hollando' AND doc.projectKey = 'main-battle-tank'
        AND section.name = 'Unsectioned Requirements'
      OPTIONAL MATCH (section)-[:CONTAINS]->(req:Requirement)
      WITH section, doc.slug as docSlug, count(req) as reqCount
      WHERE reqCount = 0
      RETURN section.id as sectionId, docSlug, reqCount
    `);

    console.log(`Found ${findResult.records.length} empty 'Unsectioned Requirements' sections:\n`);

    const sectionsToDelete: string[] = [];
    for (const record of findResult.records) {
      const sectionId = record.get("sectionId");
      const docSlug = record.get("docSlug");
      const reqCount = record.get("reqCount").toInt();

      console.log(`  ${sectionId} (${docSlug}) - ${reqCount} requirements`);
      sectionsToDelete.push(sectionId);
    }

    if (sectionsToDelete.length === 0) {
      console.log("\nNo empty sections to delete.");
      return;
    }

    console.log(`\nDeleting ${sectionsToDelete.length} empty sections...\n`);

    const deleteResult = await session.run(`
      MATCH (section:DocumentSection)
      WHERE section.id IN $sectionIds
      DETACH DELETE section
      RETURN count(section) as deletedCount
    `, { sectionIds: sectionsToDelete });

    const deletedCount = deleteResult.records[0].get("deletedCount").toInt();
    console.log(`✓ Deleted ${deletedCount} empty 'Unsectioned Requirements' section(s)`);

    // Verify all documents still have proper sections
    console.log("\n" + "=".repeat(80));
    console.log("VERIFICATION: Document section structure");
    console.log("=".repeat(80) + "\n");

    const verifyResult = await session.run(`
      MATCH (doc:Document)-[:HAS_SECTION]->(section:DocumentSection)
      WHERE doc.tenant = 'hollando' AND doc.projectKey = 'main-battle-tank'
      OPTIONAL MATCH (section)-[:CONTAINS]->(req:Requirement)
      WITH doc.slug as docSlug,
           count(DISTINCT section) as sectionCount,
           count(req) as reqCount
      RETURN docSlug, sectionCount, reqCount
      ORDER BY docSlug
    `);

    for (const record of verifyResult.records) {
      const docSlug = record.get("docSlug");
      const sectionCount = record.get("sectionCount").toInt();
      const reqCount = record.get("reqCount").toInt();

      console.log(`${docSlug}:`);
      console.log(`  Sections: ${sectionCount}`);
      console.log(`  Requirements: ${reqCount}`);
    }

    console.log("\n✓ Cleanup complete!");

  } catch (error) {
    console.error("Error:", error);
  } finally {
    await session.close();
    await closeGraph();
  }
}

cleanupEmptyUnsectioned().catch(console.error);
