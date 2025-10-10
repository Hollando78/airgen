import { initGraph, getSession, closeGraph } from "./src/services/graph/driver.js";

async function checkRequirementSections() {
  await initGraph();
  const session = getSession();

  try {
    console.log("Investigating requirement section relationships...\n");

    // Check all requirements and their section connections
    const result = await session.run(`
      MATCH (project:Project {slug: 'main-battle-tank', tenantSlug: 'hollando'})

      // Get requirements from new structure (via sections)
      OPTIONAL MATCH (project)-[:HAS_DOCUMENT]->(doc:Document)-[:HAS_SECTION]->(section:DocumentSection)-[:CONTAINS]->(sectionReq:Requirement)

      // Get requirements from old structure (direct)
      OPTIONAL MATCH (project)-[:CONTAINS]->(directReq:Requirement)

      WITH project,
           collect(DISTINCT sectionReq) as sectionReqs,
           collect(DISTINCT directReq) as directReqs

      // Get all unique requirements
      WITH project, sectionReqs + directReqs as allReqs
      UNWIND allReqs as req
      WITH DISTINCT req
      WHERE req IS NOT NULL

      // Check if this requirement has a section
      OPTIONAL MATCH (section:DocumentSection)-[:CONTAINS]->(req)
      OPTIONAL MATCH (section)<-[:HAS_SECTION]-(doc:Document)

      // Check if requirement is directly connected to project
      OPTIONAL MATCH (project)-[:CONTAINS]->(req)
      WHERE project.slug = 'main-battle-tank'

      RETURN req.id as reqId,
             req.ref as reqRef,
             req.title as reqTitle,
             section.id as sectionId,
             section.heading as sectionHeading,
             doc.slug as docSlug,
             CASE WHEN project IS NOT NULL THEN true ELSE false END as hasDirectProjectLink
      ORDER BY req.ref
    `);

    console.log(`Found ${result.records.length} requirements:\n`);

    let withSections = 0;
    let withoutSections = 0;
    let sectionIdFormat = 0;
    let orphanedReqs: any[] = [];

    for (const record of result.records) {
      const reqId = record.get("reqId");
      const reqRef = record.get("reqRef");
      const reqTitle = record.get("reqTitle");
      const sectionId = record.get("sectionId");
      const sectionHeading = record.get("sectionHeading");
      const docSlug = record.get("docSlug");
      const hasDirectProjectLink = record.get("hasDirectProjectLink");

      // Check if ID has section format (contains section reference)
      const hasSectionInId = reqId && reqId.includes('-section-');

      if (hasSectionInId) {
        sectionIdFormat++;
      }

      if (sectionId) {
        withSections++;
        console.log(`✓ ${reqRef}: HAS SECTION`);
        console.log(`  ID: ${reqId}`);
        console.log(`  Section: ${sectionHeading} (${sectionId})`);
        console.log(`  Document: ${docSlug}`);
        console.log(`  Direct link: ${hasDirectProjectLink}`);
      } else {
        withoutSections++;
        console.log(`✗ ${reqRef}: NO SECTION`);
        console.log(`  ID: ${reqId}`);
        console.log(`  Has section format in ID: ${hasSectionInId}`);
        console.log(`  Direct link: ${hasDirectProjectLink}`);

        if (hasSectionInId) {
          orphanedReqs.push({
            reqId,
            reqRef,
            reqTitle,
            hasDirectProjectLink
          });
        }
      }
      console.log();
    }

    console.log("\n" + "=".repeat(80));
    console.log("SUMMARY");
    console.log("=".repeat(80));
    console.log(`Total requirements: ${result.records.length}`);
    console.log(`With sections: ${withSections}`);
    console.log(`Without sections: ${withoutSections}`);
    console.log(`With section format in ID: ${sectionIdFormat}`);
    console.log(`Orphaned (section format ID but no section): ${orphanedReqs.length}`);

    if (orphanedReqs.length > 0) {
      console.log("\n⚠️  ORPHANED REQUIREMENTS (have section-based IDs but no section):");
      for (const req of orphanedReqs) {
        console.log(`  ${req.reqRef}: ${req.reqId}`);
        console.log(`    Direct project link: ${req.hasDirectProjectLink}`);
      }
    }

    // Check if sections exist without requirements
    console.log("\n" + "=".repeat(80));
    console.log("CHECKING FOR EMPTY SECTIONS");
    console.log("=".repeat(80));

    const sectionsResult = await session.run(`
      MATCH (project:Project {slug: 'main-battle-tank', tenantSlug: 'hollando'})-[:HAS_DOCUMENT]->(doc:Document)-[:HAS_SECTION]->(section:DocumentSection)
      OPTIONAL MATCH (section)-[:CONTAINS]->(req:Requirement)
      WITH doc, section, count(req) as reqCount
      WHERE reqCount = 0
      RETURN doc.slug as docSlug,
             section.id as sectionId,
             section.heading as sectionHeading,
             section.sectionNumber as sectionNumber
      ORDER BY doc.slug, section.sectionNumber
    `);

    console.log(`\nFound ${sectionsResult.records.length} empty sections:\n`);
    for (const record of sectionsResult.records) {
      const docSlug = record.get("docSlug");
      const sectionId = record.get("sectionId");
      const sectionHeading = record.get("sectionHeading");
      const sectionNumber = record.get("sectionNumber");

      console.log(`  ${docSlug} - Section ${sectionNumber}: ${sectionHeading}`);
      console.log(`    ID: ${sectionId}`);
    }

    // Try to parse section IDs from requirement IDs to find matches
    if (orphanedReqs.length > 0 && sectionsResult.records.length > 0) {
      console.log("\n" + "=".repeat(80));
      console.log("ANALYZING SECTION ID PATTERNS");
      console.log("=".repeat(80));

      console.log("\nOrphaned requirement ID patterns:");
      orphanedReqs.forEach(req => {
        const parts = req.reqId.split('-section-');
        if (parts.length === 2) {
          const docPart = parts[0]; // e.g., "hollando:main-battle-tank:user-requirements-document"
          const sectionPart = parts[1].split(':')[0]; // e.g., "1.2.3"
          console.log(`  ${req.reqRef}: document part = ${docPart}, section = ${sectionPart}`);
        }
      });

      console.log("\nExisting section ID patterns:");
      sectionsResult.records.forEach(record => {
        console.log(`  ${record.get("sectionId")}`);
      });
    }

  } catch (error) {
    console.error("Error:", error);
  } finally {
    await session.close();
    await closeGraph();
  }
}

checkRequirementSections().catch(console.error);
