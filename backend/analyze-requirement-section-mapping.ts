import { initGraph, getSession, closeGraph } from "./src/services/graph/driver.js";

async function analyzeRequirementSectionMapping() {
  await initGraph();
  const session = getSession();

  try {
    console.log("Analyzing requirements to find section mapping clues...\n");

    // Get all requirements and their properties
    const reqsResult = await session.run(`
      MATCH (doc:Document)-[:CONTAINS]->(req:Requirement)
      WHERE doc.tenant = 'hollando' AND doc.projectKey = 'main-battle-tank'
      RETURN req.id as reqId,
             req.ref as reqRef,
             req.title as reqTitle,
             doc.slug as docSlug,
             keys(req) as allKeys
      ORDER BY doc.slug, req.ref
      LIMIT 5
    `);

    console.log("Sample requirements with all properties:\n");
    for (const record of reqsResult.records) {
      const reqId = record.get("reqId");
      const reqRef = record.get("reqRef");
      const docSlug = record.get("docSlug");
      const allKeys = record.get("allKeys");

      console.log(`${reqRef} (${docSlug}):`);
      console.log(`  ID: ${reqId}`);
      console.log(`  Properties: ${allKeys.join(', ')}`);
      console.log();
    }

    // Get one full requirement node to see all properties
    const fullReqResult = await session.run(`
      MATCH (doc:Document {slug: 'user-requirements-document'})-[:CONTAINS]->(req:Requirement)
      WHERE doc.tenant = 'hollando' AND doc.projectKey = 'main-battle-tank'
      RETURN req LIMIT 1
    `);

    if (fullReqResult.records.length > 0) {
      const req = fullReqResult.records[0].get("req");
      console.log("\n" + "=".repeat(80));
      console.log("Full requirement node properties:");
      console.log("=".repeat(80));
      console.log(JSON.stringify(req.properties, null, 2));
    }

    // Check if sections have meaningful properties that can help
    console.log("\n" + "=".repeat(80));
    console.log("Empty sections with metadata:");
    console.log("=".repeat(80) + "\n");

    const sectionsResult = await session.run(`
      MATCH (doc:Document)-[:HAS_SECTION]->(section:DocumentSection)
      WHERE doc.tenant = 'hollando' AND doc.projectKey = 'main-battle-tank'
        AND section.name <> 'Unsectioned Requirements'
      OPTIONAL MATCH (section)-[:CONTAINS]->(req:Requirement)
      WITH doc, section, count(req) as reqCount
      RETURN doc.slug as docSlug,
             section.id as sectionId,
             section.name as sectionName,
             section.shortCode as shortCode,
             section.order as order,
             reqCount
      ORDER BY doc.slug, section.order
    `);

    let currentDoc = '';
    for (const record of sectionsResult.records) {
      const docSlug = record.get("docSlug");
      const sectionId = record.get("sectionId");
      const sectionName = record.get("sectionName");
      const shortCode = record.get("shortCode");
      const order = record.get("order");
      const reqCount = record.get("reqCount").toInt();

      if (docSlug !== currentDoc) {
        console.log(`\n${docSlug}:`);
        currentDoc = docSlug;
      }

      console.log(`  [${order}] ${shortCode || 'NO-CODE'}: ${sectionName} (${reqCount} reqs)`);
      console.log(`      ID: ${sectionId}`);
    }

    // Try to match requirements to sections by shortCode
    console.log("\n" + "=".repeat(80));
    console.log("MATCHING ATTEMPT: Req prefix to section shortCode");
    console.log("=".repeat(80) + "\n");

    const matchResult = await session.run(`
      MATCH (doc:Document)-[:CONTAINS]->(req:Requirement)
      WHERE doc.tenant = 'hollando' AND doc.projectKey = 'main-battle-tank'
      MATCH (doc)-[:HAS_SECTION]->(section:DocumentSection)
      WHERE section.shortCode IS NOT NULL
        AND req.ref STARTS WITH (doc.shortCode + '-' + section.shortCode + '-')
      RETURN doc.slug as docSlug,
             section.shortCode as sectionCode,
             section.name as sectionName,
             collect(req.ref) as matchedReqs,
             count(req) as count
      ORDER BY doc.slug, section.order
    `);

    console.log("Potential matches based on ref prefix:\n");
    for (const record of matchResult.records) {
      const docSlug = record.get("docSlug");
      const sectionCode = record.get("sectionCode");
      const sectionName = record.get("sectionName");
      const matchedReqs = record.get("matchedReqs");
      const count = record.get("count").toInt();

      console.log(`${docSlug} -> ${sectionCode} (${sectionName}):`);
      console.log(`  ${count} matches: ${matchedReqs.join(', ')}`);
      console.log();
    }

  } catch (error) {
    console.error("Error:", error);
  } finally {
    await session.close();
    await closeGraph();
  }
}

analyzeRequirementSectionMapping().catch(console.error);
