import { initGraph, getSession, closeGraph } from "./src/services/graph/driver.js";

function generateLinksetId(): string {
  return `linkset-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

async function reconstructAllLinksets() {
  await initGraph();
  const session = getSession();

  try {
    console.log("Finding all TraceLinks without DocumentLinksets...\n");

    // Find all document pairs that need linksets
    const pairsResult = await session.run(`
      MATCH (project:Project {slug: 'main-battle-tank', tenantSlug: 'hollando'})-[:HAS_TRACE_LINK]->(tl:TraceLink)
      MATCH (tl)-[:FROM_REQUIREMENT]->(fromReq:Requirement)
      MATCH (tl)-[:TO_REQUIREMENT]->(toReq:Requirement)
      MATCH (sourceDoc:Document)-[:CONTAINS]->(fromReq)
      MATCH (targetDoc:Document)-[:CONTAINS]->(toReq)

      WITH DISTINCT sourceDoc.slug as sourceSlug, targetDoc.slug as targetSlug,
           collect(tl.linkType) as linkTypes
      RETURN sourceSlug, targetSlug, linkTypes
      ORDER BY sourceSlug, targetSlug
    `);

    console.log(`Found ${pairsResult.records.length} document pairs needing DocumentLinksets:\n`);

    for (const record of pairsResult.records) {
      const sourceSlug = record.get("sourceSlug");
      const targetSlug = record.get("targetSlug");
      const linkTypes = record.get("linkTypes");

      console.log(`  ${sourceSlug} <-> ${targetSlug}`);
      console.log(`    Link types: ${linkTypes.join(', ')}`);
    }

    console.log(`\nCreating DocumentLinksets...\n`);

    let created = 0;
    for (const record of pairsResult.records) {
      const sourceSlug = record.get("sourceSlug");
      const targetSlug = record.get("targetSlug");
      const linkTypes = record.get("linkTypes");

      // Use the most common link type, or first one if all equal
      const linkTypeCount: Record<string, number> = {};
      linkTypes.forEach((lt: string) => {
        linkTypeCount[lt] = (linkTypeCount[lt] || 0) + 1;
      });

      const defaultLinkType = Object.entries(linkTypeCount)
        .sort(([, a], [, b]) => b - a)[0][0];

      const linksetId = generateLinksetId();
      const now = new Date().toISOString();

      const createResult = await session.run(`
        MATCH (sourceDoc:Document {slug: $sourceSlug})
        MATCH (targetDoc:Document {slug: $targetSlug})
        CREATE (ls:DocumentLinkset {
          id: $linksetId,
          tenant: 'hollando',
          projectKey: 'main-battle-tank',
          defaultLinkType: $defaultLinkType,
          createdAt: $now,
          updatedAt: $now
        })
        CREATE (ls)-[:LINKS_FROM]->(sourceDoc)
        CREATE (ls)-[:LINKS_TO]->(targetDoc)
        RETURN ls.id as createdId
      `, { sourceSlug, targetSlug, linksetId, defaultLinkType, now });

      const createdId = createResult.records[0].get("createdId");
      console.log(`  ✓ Created ${createdId}`);
      console.log(`    ${sourceSlug} -> ${targetSlug}`);
      console.log(`    Default link type: ${defaultLinkType}`);
      console.log();

      created++;
    }

    console.log(`\n✓ Created ${created} DocumentLinkset(s)`);

    // Verify
    console.log("\nVerification:");
    const verifyResult = await session.run(`
      MATCH (project:Project {slug: 'main-battle-tank', tenantSlug: 'hollando'})-[:HAS_TRACE_LINK]->(tl:TraceLink)
      MATCH (tl)-[:FROM_REQUIREMENT]->(fromReq:Requirement)
      MATCH (tl)-[:TO_REQUIREMENT]->(toReq:Requirement)
      MATCH (sourceDoc:Document)-[:CONTAINS]->(fromReq)
      MATCH (targetDoc:Document)-[:CONTAINS]->(toReq)

      OPTIONAL MATCH (sourceDoc)<-[:LINKS_FROM]-(ls:DocumentLinkset)-[:LINKS_TO]->(targetDoc)
      WHERE ls.tenant = 'hollando' AND ls.projectKey = 'main-battle-tank'

      RETURN count(tl) as totalLinks,
             count(ls) as linksWithLinkset
    `);

    const totalLinks = verifyResult.records[0].get("totalLinks").toInt();
    const linksWithLinkset = verifyResult.records[0].get("linksWithLinkset").toInt();

    console.log(`  Total TraceLinks: ${totalLinks}`);
    console.log(`  TraceLinks with DocumentLinkset: ${linksWithLinkset}`);

    if (totalLinks === linksWithLinkset) {
      console.log(`\n✓ All TraceLinks now have proper DocumentLinksets!`);
    } else {
      console.log(`\n⚠ Warning: ${totalLinks - linksWithLinkset} TraceLinks still missing DocumentLinksets`);
    }

  } catch (error) {
    console.error("Error:", error);
  } finally {
    await session.close();
    await closeGraph();
  }
}

reconstructAllLinksets().catch(console.error);
