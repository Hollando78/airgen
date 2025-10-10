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
    console.log('\n🔍 ANALYZING TRACE LINKS IN DETAIL');
    console.log('━'.repeat(70));

    // Get detailed TraceLink information with source and target requirements
    const result = await session.run(`
      MATCH (tl:TraceLink)
      OPTIONAL MATCH (tl)-[:FROM_REQUIREMENT]->(source:Requirement)
      OPTIONAL MATCH (tl)-[:TO_REQUIREMENT]->(target:Requirement)
      OPTIONAL MATCH (sourceDoc:Document)-[:HAS_REQUIREMENT]->(source)
      OPTIONAL MATCH (targetDoc:Document)-[:HAS_REQUIREMENT]->(target)
      OPTIONAL MATCH (p:Project)-[:HAS_DOCUMENT]->(sourceDoc)
      RETURN
        tl.id as linkId,
        tl.tenant as tenant,
        tl.projectKey as projectKey,
        tl.linkType as linkType,
        tl.createdAt as createdAt,
        source.reqId as sourceReqId,
        source.text as sourceText,
        target.reqId as targetReqId,
        target.text as targetText,
        sourceDoc.slug as sourceDocSlug,
        sourceDoc.name as sourceDocName,
        targetDoc.slug as targetDocSlug,
        targetDoc.name as targetDocName,
        p.slug as projectSlug
      ORDER BY tl.createdAt DESC
    `);

    console.log(`\nFound ${result.records.length} TraceLink(s):\n`);

    const linksByDocPair = new Map<string, any[]>();

    result.records.forEach((record, index) => {
      const sourceDoc = record.get('sourceDocSlug');
      const targetDoc = record.get('targetDocSlug');
      const linkType = record.get('linkType');

      console.log(`${index + 1}. TraceLink:`);
      console.log(`   UUID: ${record.get('linkId')}`);
      console.log(`   Tenant: ${record.get('tenant')}`);
      console.log(`   Project: ${record.get('projectKey')} (${record.get('projectSlug')})`);
      console.log(`   Link Type: ${linkType}`);
      console.log(`   From: ${record.get('sourceReqId')} (${sourceDoc}/${record.get('sourceDocName')})`);
      console.log(`   To: ${record.get('targetReqId')} (${targetDoc}/${record.get('targetDocName')})`);
      console.log(`   Source Text: ${record.get('sourceText')?.substring(0, 60)}...`);
      console.log(`   Target Text: ${record.get('targetText')?.substring(0, 60)}...`);
      console.log(`   Created: ${record.get('createdAt')}`);
      console.log('');

      // Group by document pair for linkset reconstruction
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

    console.log('\n📊 LINKSET RECONSTRUCTION ANALYSIS');
    console.log('━'.repeat(70));
    console.log(`\nDocument pairs that need DocumentLinksets: ${linksByDocPair.size}\n`);

    linksByDocPair.forEach((links, pairKey) => {
      const firstLink = links[0];
      console.log(`${pairKey}:`);
      console.log(`  Tenant: ${firstLink.tenant}`);
      console.log(`  Project: ${firstLink.projectKey}`);
      console.log(`  Source Doc: ${firstLink.sourceDoc} (${firstLink.sourceDocName})`);
      console.log(`  Target Doc: ${firstLink.targetDoc} (${firstLink.targetDocName})`);
      console.log(`  Link Count: ${links.length}`);
      console.log(`  Link Types: ${[...new Set(links.map(l => l.linkType))].join(', ')}`);
      console.log('');
    });

    if (linksByDocPair.size > 0) {
      console.log('✅ DocumentLinksets can be reconstructed from existing TraceLinks');
      console.log('   Recommended action: Create a reconstruction script');
    } else {
      console.log('⚠️  No document pair relationships found');
      console.log('   TraceLinks may not be properly connected to documents');
    }

    console.log('\n━'.repeat(70));
    console.log('✅ ANALYSIS COMPLETE\n');

  } catch (error) {
    console.error('❌ Error analyzing trace links:', error);
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
