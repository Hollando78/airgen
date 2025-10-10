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
    console.log('\n🔍 CHECKING REQUIREMENTS STRUCTURE');
    console.log('━'.repeat(70));

    // Check Requirements and their connections
    const reqResult = await session.run(`
      MATCH (r:Requirement)
      WHERE r.deletedAt IS NULL
      OPTIONAL MATCH (doc:Document)-[:HAS_REQUIREMENT]->(r)
      OPTIONAL MATCH (p:Project)-[:HAS_DOCUMENT]->(doc)
      RETURN
        r.reqId as reqId,
        r.text as text,
        r.tenant as tenant,
        r.projectKey as projectKey,
        doc.slug as docSlug,
        doc.name as docName,
        p.slug as projectSlug,
        exists((r)<-[:FROM_REQUIREMENT]-(:TraceLink)) as hasOutgoingLinks,
        exists((r)<-[:TO_REQUIREMENT]-(:TraceLink)) as hasIncomingLinks
      ORDER BY r.reqId
    `);

    console.log(`\nFound ${reqResult.records.length} Requirement(s):\n`);

    let connectedToDoc = 0;
    let hasLinks = 0;

    reqResult.records.forEach((record, index) => {
      const docSlug = record.get('docSlug');
      const hasOut = record.get('hasOutgoingLinks');
      const hasIn = record.get('hasIncomingLinks');

      if (docSlug) connectedToDoc++;
      if (hasOut || hasIn) hasLinks++;

      console.log(`${index + 1}. ${record.get('reqId')}:`);
      console.log(`   Tenant: ${record.get('tenant')}`);
      console.log(`   Project: ${record.get('projectKey')} (${record.get('projectSlug')})`);
      console.log(`   Document: ${docSlug || 'NOT CONNECTED'} (${record.get('docName') || 'N/A'})`);
      console.log(`   Has Links: OUT=${hasOut}, IN=${hasIn}`);
      console.log(`   Text: ${record.get('text')?.substring(0, 60)}...`);
      console.log('');
    });

    console.log('\n📊 SUMMARY');
    console.log('━'.repeat(70));
    console.log(`Total Requirements: ${reqResult.records.length}`);
    console.log(`Connected to Documents: ${connectedToDoc}`);
    console.log(`Have TraceLinks: ${hasLinks}`);
    console.log(`Orphaned (no doc): ${reqResult.records.length - connectedToDoc}`);
    console.log(`No links: ${reqResult.records.length - hasLinks}`);

    // Check TraceLink relationships specifically
    console.log('\n🔗 CHECKING TRACELINK RELATIONSHIPS');
    console.log('━'.repeat(70));

    const linkRelResult = await session.run(`
      MATCH (tl:TraceLink)
      RETURN
        tl.id as linkId,
        exists((tl)-[:FROM_REQUIREMENT]->(:Requirement)) as hasFromRel,
        exists((tl)-[:TO_REQUIREMENT]->(:Requirement)) as hasToRel
    `);

    linkRelResult.records.forEach((record, index) => {
      console.log(`${index + 1}. ${record.get('linkId')}:`);
      console.log(`   FROM_REQUIREMENT exists: ${record.get('hasFromRel')}`);
      console.log(`   TO_REQUIREMENT exists: ${record.get('hasToRel')}`);
    });

    console.log('\n━'.repeat(70));
    console.log('✅ CHECK COMPLETE\n');

  } catch (error) {
    console.error('❌ Error checking requirements:', error);
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
