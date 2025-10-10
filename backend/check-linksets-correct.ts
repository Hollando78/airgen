#!/usr/bin/env tsx
import neo4j from 'neo4j-driver';

const driver = neo4j.driver(
  process.env.GRAPH_URL || 'bolt://localhost:17687',
  neo4j.auth.basic(
    process.env.GRAPH_USERNAME || 'neo4j',
    process.env.GRAPH_PASSWORD || 'airgen-graph'
  )
);

async function main() {
  const session = driver.session({ database: process.env.GRAPH_DATABASE || 'neo4j' });

  try {
    console.log('\n📊 CHECKING LINKSETS (CORRECTED QUERY)');
    console.log('━'.repeat(70));

    // Check for DocumentLinkset nodes
    const linksetResult = await session.run(`
      MATCH (ls:DocumentLinkset)
      OPTIONAL MATCH (ls)-[:LINKS_FROM]->(sourceDoc:Document)
      OPTIONAL MATCH (ls)-[:LINKS_TO]->(targetDoc:Document)
      RETURN
        ls.id as linksetId,
        ls.tenant as tenant,
        ls.projectKey as projectKey,
        ls.defaultLinkType as defaultLinkType,
        ls.createdAt as createdAt,
        sourceDoc.slug as sourceSlug,
        targetDoc.slug as targetSlug,
        sourceDoc.name as sourceName,
        targetDoc.name as targetName
      ORDER BY ls.createdAt DESC
    `);

    console.log(`\nFound ${linksetResult.records.length} DocumentLinkset(s):\\n`);

    if (linksetResult.records.length === 0) {
      console.log('⚠️  NO LINKSETS FOUND IN DATABASE');
    } else {
      linksetResult.records.forEach((record, index) => {
        console.log(`${index + 1}. Linkset:`);
        console.log(`   ID: ${record.get('linksetId')}`);
        console.log(`   Tenant: ${record.get('tenant')}`);
        console.log(`   Project: ${record.get('projectKey')}`);
        console.log(`   Source: ${record.get('sourceSlug')} (${record.get('sourceName') || 'N/A'})`);
        console.log(`   Target: ${record.get('targetSlug')} (${record.get('targetName') || 'N/A'})`);
        console.log(`   Link Type: ${record.get('defaultLinkType')}`);
        console.log(`   Created: ${record.get('createdAt')}`);
        console.log('');
      });
    }

    // Check for TraceLink nodes WITH CORRECT QUERIES
    console.log('\\n📊 CHECKING TRACE LINKS (CORRECTED)');
    console.log('━'.repeat(70));

    const traceLinksResult = await session.run(`
      MATCH (tl:TraceLink)
      OPTIONAL MATCH (tl)-[:FROM_REQUIREMENT]->(source:Requirement)
      OPTIONAL MATCH (tl)-[:TO_REQUIREMENT]->(target:Requirement)
      OPTIONAL MATCH (sourceDoc:Document)-[:CONTAINS]->(source)
      OPTIONAL MATCH (targetDoc:Document)-[:CONTAINS]->(target)
      RETURN
        tl.id as linkId,
        tl.tenant as tenant,
        tl.projectKey as projectKey,
        tl.linkType as linkType,
        source.ref as sourceRef,
        target.ref as targetRef,
        sourceDoc.slug as sourceDocSlug,
        sourceDoc.name as sourceDocName,
        targetDoc.slug as targetDocSlug,
        targetDoc.name as targetDocName
      ORDER BY tl.createdAt DESC
    `);

    console.log(`\\nFound ${traceLinksResult.records.length} TraceLink(s):\\n`);

    const linksByDocPair = new Map<string, any[]>();

    traceLinksResult.records.forEach((record, index) => {
      const sourceDoc = record.get('sourceDocSlug');
      const targetDoc = record.get('targetDocSlug');
      const linkType = record.get('linkType');
      const sourceRef = record.get('sourceRef');
      const targetRef = record.get('targetRef');

      console.log(`${index + 1}. TraceLink ${record.get('linkId')}:`);
      console.log(`   ${sourceRef} (${sourceDoc}) --[${linkType}]--> ${targetRef} (${targetDoc})`);
      console.log(`   Tenant: ${record.get('tenant')}, Project: ${record.get('projectKey')}`);
      console.log('');

      // Group by document pair for linkset analysis
      if (sourceDoc && targetDoc) {
        const pairKey = `${sourceDoc}→${targetDoc}`;
        if (!linksByDocPair.has(pairKey)) {
          linksByDocPair.set(pairKey, []);
        }
        linksByDocPair.get(pairKey)!.push({
          linkType,
          tenant: record.get('tenant'),
          projectKey: record.get('projectKey'),
          sourceDoc,
          targetDoc,
          sourceDocName: record.get('sourceDocName'),
          targetDocName: record.get('targetDocName'),
        });
      }
    });

    console.log('\\n📊 DOCUMENT PAIR ANALYSIS');
    console.log('━'.repeat(70));
    console.log(`\\nDocument pairs with TraceLinks: ${linksByDocPair.size}\\n`);

    linksByDocPair.forEach((links, pairKey) => {
      const firstLink = links[0];
      console.log(`${pairKey}:`);
      console.log(`  ${firstLink.sourceDocName} → ${firstLink.targetDocName}`);
      console.log(`  Tenant: ${firstLink.tenant}, Project: ${firstLink.projectKey}`);
      console.log(`  TraceLinks: ${links.length}`);
      console.log(`  Link Types: ${[...new Set(links.map(l => l.linkType))].join(', ')}`);
      console.log('');
    });

    // Summary
    console.log('\\n📊 SUMMARY');
    console.log('━'.repeat(70));
    console.log(`DocumentLinksets: ${linksetResult.records.length}`);
    console.log(`TraceLinks: ${traceLinksResult.records.length}`);
    console.log(`Document pairs: ${linksByDocPair.size}`);

    if (linksetResult.records.length === 0 && linksByDocPair.size > 0) {
      console.log('\\n⚠️  ISSUE: TraceLinks exist but DocumentLinksets are missing');
      console.log('   DocumentLinksets should be created for these document pairs.');
    } else if (linksetResult.records.length > 0 && linksByDocPair.size > 0) {
      console.log('\\n✅ Both linksets and trace links are present');
    }

    console.log('\\n━'.repeat(70));
    console.log('✅ CHECK COMPLETE\\n');

  } catch (error) {
    console.error('❌ Error checking linksets:', error);
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
