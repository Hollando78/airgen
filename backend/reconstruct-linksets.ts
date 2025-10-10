#!/usr/bin/env tsx
import neo4j from 'neo4j-driver';

const driver = neo4j.driver(
  process.env.GRAPH_URL || 'bolt://localhost:17687',
  neo4j.auth.basic(
    process.env.GRAPH_USERNAME || 'neo4j',
    process.env.GRAPH_PASSWORD || 'airgen-graph'
  )
);

// Generate a timestamp-based ID similar to TraceLink format
function generateLinksetId(): string {
  return `linkset-${Date.now()}`;
}

async function main() {
  const session = driver.session({ database: process.env.GRAPH_DATABASE || 'neo4j' });

  try {
    console.log('\n🔧 RECONSTRUCTING DOCUMENT LINKSETS');
    console.log('━'.repeat(70));

    // Find all document pairs that have TraceLinks but no DocumentLinkset
    const pairsResult = await session.run(`
      MATCH (tl:TraceLink)
      MATCH (tl)-[:FROM_REQUIREMENT]->(source:Requirement)
      MATCH (tl)-[:TO_REQUIREMENT]->(target:Requirement)
      MATCH (sourceDoc:Document)-[:CONTAINS]->(source)
      MATCH (targetDoc:Document)-[:CONTAINS]->(target)
      WITH sourceDoc, targetDoc, collect(DISTINCT tl.linkType) as linkTypes, collect(tl) as links, tl.tenant as tenant, tl.projectKey as projectKey
      WHERE NOT exists((sourceDoc)<-[:LINKS_FROM]-(:DocumentLinkset)-[:LINKS_TO]->(targetDoc))
      RETURN
        sourceDoc.slug as sourceSlug,
        sourceDoc.name as sourceName,
        targetDoc.slug as targetSlug,
        targetDoc.name as targetName,
        linkTypes,
        size(links) as linkCount,
        tenant,
        projectKey
    `);

    console.log(`\nFound ${pairsResult.records.length} document pair(s) needing DocumentLinksets:\n`);

    if (pairsResult.records.length === 0) {
      console.log('✅ No reconstruction needed - all document pairs have linksets');
      return;
    }

    const createdLinksets: any[] = [];

    for (const record of pairsResult.records) {
      const sourceSlug = record.get('sourceSlug');
      const targetSlug = record.get('targetSlug');
      const sourceName = record.get('sourceName');
      const targetName = record.get('targetName');
      const linkTypes = record.get('linkTypes');
      const linkCount = record.get('linkCount').toNumber();
      const tenant = record.get('tenant');
      const projectKey = record.get('projectKey');

      // Use the most common link type as default
      const defaultLinkType = linkTypes[0];

      console.log(`Creating DocumentLinkset:`);
      console.log(`  ${sourceSlug} (${sourceName})`);
      console.log(`  → ${targetSlug} (${targetName})`);
      console.log(`  Tenant: ${tenant}, Project: ${projectKey}`);
      console.log(`  TraceLinks: ${linkCount}, Default type: ${defaultLinkType}`);

      // Create the DocumentLinkset
      const linksetId = generateLinksetId();
      const now = new Date().toISOString();

      await session.run(`
        MATCH (sourceDoc:Document {slug: $sourceSlug})
        MATCH (targetDoc:Document {slug: $targetSlug})
        CREATE (ls:DocumentLinkset {
          id: $linksetId,
          tenant: $tenant,
          projectKey: $projectKey,
          defaultLinkType: $defaultLinkType,
          createdAt: $now,
          updatedAt: $now
        })
        CREATE (ls)-[:LINKS_FROM]->(sourceDoc)
        CREATE (ls)-[:LINKS_TO]->(targetDoc)
        RETURN ls.id as createdId
      `, {
        sourceSlug,
        targetSlug,
        linksetId,
        tenant,
        projectKey,
        defaultLinkType,
        now
      });

      createdLinksets.push({
        id: linksetId,
        source: `${sourceSlug} (${sourceName})`,
        target: `${targetSlug} (${targetName})`,
        linkType: defaultLinkType,
        linkCount
      });

      console.log(`  ✅ Created DocumentLinkset: ${linksetId}\n`);
    }

    // Verify reconstruction
    console.log('\n📊 VERIFICATION');
    console.log('━'.repeat(70));

    const verifyResult = await session.run(`
      MATCH (ls:DocumentLinkset)
      OPTIONAL MATCH (ls)-[:LINKS_FROM]->(sourceDoc:Document)
      OPTIONAL MATCH (ls)-[:LINKS_TO]->(targetDoc:Document)
      RETURN count(ls) as linksetCount,
             collect({
               source: sourceDoc.slug,
               target: targetDoc.slug,
               type: ls.defaultLinkType
             }) as linksets
    `);

    const linksetCount = verifyResult.records[0]?.get('linksetCount').toNumber() || 0;
    const linksets = verifyResult.records[0]?.get('linksets') || [];

    console.log(`\nTotal DocumentLinksets in database: ${linksetCount}`);
    console.log('\nAll linksets:');
    linksets.forEach((ls: any, index: number) => {
      console.log(`  ${index + 1}. ${ls.source} → ${ls.target} [${ls.type}]`);
    });

    console.log('\n━'.repeat(70));
    console.log(`✅ RECONSTRUCTION COMPLETE - Created ${createdLinksets.length} linkset(s)\n`);

  } catch (error) {
    console.error('❌ Error reconstructing linksets:', error);
    throw error;
  } finally {
    await session.close();
    await driver.close();
  }
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
