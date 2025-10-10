import { initGraph, getSession, closeGraph } from "./src/services/graph/driver.js";

async function repairRequirementSections() {
  await initGraph();
  const session = getSession();

  try {
    console.log("Repairing requirement section assignments...\n");

    // Get all requirements in "Unsectioned Requirements" sections
    const reqsResult = await session.run(`
      MATCH (doc:Document)-[:HAS_SECTION]->(unsectionedSection:DocumentSection)
      WHERE doc.tenant = 'hollando' AND doc.projectKey = 'main-battle-tank'
        AND unsectionedSection.name = 'Unsectioned Requirements'
      MATCH (unsectionedSection)-[:CONTAINS]->(req:Requirement)
      RETURN req.id as reqId,
             req.ref as reqRef,
             doc.slug as docSlug,
             doc.shortCode as docCode,
             unsectionedSection.id as currentSectionId
      ORDER BY req.ref
    `);

    console.log(`Found ${reqsResult.records.length} requirements to reassign:\n`);

    let moved = 0;
    let notFound = 0;
    const notFoundList: string[] = [];

    for (const record of reqsResult.records) {
      const reqId = record.get("reqId");
      const reqRef = record.get("reqRef");
      const docSlug = record.get("docSlug");
      const docCode = record.get("docCode");
      const currentSectionId = record.get("currentSectionId");

      // Parse the section code from the requirement ref
      // Format: {DOC_CODE}-{SECTION_CODE}-{NUMBER}
      const refParts = reqRef.split('-');
      if (refParts.length >= 3) {
        const sectionCode = refParts[1]; // e.g., "ARCH", "KEY", "FUN"

        // Find the target section
        const sectionResult = await session.run(`
          MATCH (doc:Document {slug: $docSlug})-[:HAS_SECTION]->(section:DocumentSection)
          WHERE doc.tenant = 'hollando' AND doc.projectKey = 'main-battle-tank'
            AND section.shortCode = $sectionCode
          RETURN section.id as sectionId, section.name as sectionName
        `, { docSlug, sectionCode });

        if (sectionResult.records.length > 0) {
          const targetSectionId = sectionResult.records[0].get("sectionId");
          const targetSectionName = sectionResult.records[0].get("sectionName");

          // Move the requirement
          await session.run(`
            MATCH (currentSection:DocumentSection {id: $currentSectionId})-[oldRel:CONTAINS]->(req:Requirement {id: $reqId})
            MATCH (targetSection:DocumentSection {id: $targetSectionId})
            DELETE oldRel
            CREATE (targetSection)-[:CONTAINS]->(req)
          `, { currentSectionId, reqId, targetSectionId });

          console.log(`✓ Moved ${reqRef} to ${sectionCode} (${targetSectionName})`);
          moved++;
        } else {
          console.log(`✗ ${reqRef}: No section found with code "${sectionCode}" in ${docSlug}`);
          notFound++;
          notFoundList.push(`${reqRef} (looking for section code: ${sectionCode})`);
        }
      } else {
        console.log(`⚠ ${reqRef}: Cannot parse section code from ref`);
        notFound++;
        notFoundList.push(`${reqRef} (unparseable ref format)`);
      }
    }

    console.log("\n" + "=".repeat(80));
    console.log("SUMMARY");
    console.log("=".repeat(80));
    console.log(`Total requirements: ${reqsResult.records.length}`);
    console.log(`Moved to proper sections: ${moved}`);
    console.log(`Not found / could not move: ${notFound}`);

    if (notFoundList.length > 0) {
      console.log("\nRequirements that could not be moved:");
      notFoundList.forEach(item => console.log(`  - ${item}`));
    }

    // Verify the results
    console.log("\n" + "=".repeat(80));
    console.log("VERIFICATION");
    console.log("=".repeat(80) + "\n");

    const verifyResult = await session.run(`
      MATCH (doc:Document)-[:HAS_SECTION]->(section:DocumentSection)
      WHERE doc.tenant = 'hollando' AND doc.projectKey = 'main-battle-tank'
      OPTIONAL MATCH (section)-[:CONTAINS]->(req:Requirement)
      WITH doc.slug as docSlug,
           section.name as sectionName,
           section.shortCode as shortCode,
           section.order as sectionOrder,
           count(req) as reqCount
      WHERE reqCount > 0 OR sectionName = 'Unsectioned Requirements'
      RETURN docSlug, sectionName, shortCode, reqCount, sectionOrder
      ORDER BY docSlug, sectionOrder
    `);

    let currentDoc = '';
    for (const record of verifyResult.records) {
      const docSlug = record.get("docSlug");
      const sectionName = record.get("sectionName");
      const shortCode = record.get("shortCode");
      const reqCount = record.get("reqCount").toInt();
      const sectionOrder = record.get("sectionOrder");

      if (docSlug !== currentDoc) {
        console.log(`\n${docSlug}:`);
        currentDoc = docSlug;
      }

      const codeDisplay = shortCode || 'NO-CODE';
      const unsectionedMarker = sectionName === 'Unsectioned Requirements' ? ' ⚠️' : '';
      console.log(`  [${sectionOrder}] ${codeDisplay}: ${sectionName} (${reqCount} reqs)${unsectionedMarker}`);
    }

    console.log("\n✓ Repair complete!");

  } catch (error) {
    console.error("Error:", error);
  } finally {
    await session.close();
    await closeGraph();
  }
}

repairRequirementSections().catch(console.error);
