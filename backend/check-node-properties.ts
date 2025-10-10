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
    console.log('\n🔍 CHECKING NODE PROPERTIES');
    console.log('━'.repeat(70));

    // Check Requirement properties
    console.log('\n📝 SAMPLE REQUIREMENT PROPERTIES:');
    const reqSample = await session.run(`
      MATCH (r:Requirement)
      RETURN properties(r) as props, labels(r) as labels
      LIMIT 3
    `);

    reqSample.records.forEach((record, index) => {
      console.log(`\nRequirement ${index + 1}:`);
      console.log(JSON.stringify(record.get('props'), null, 2));
      console.log(`Labels: ${record.get('labels').join(', ')}`);
    });

    // Check Document properties and their expected relationships
    console.log('\n\n📄 DOCUMENT STRUCTURE:');
    const docResult = await session.run(`
      MATCH (d:Document)
      WHERE d.deletedAt IS NULL
      OPTIONAL MATCH (p:Project)-[:HAS_DOCUMENT]->(d)
      OPTIONAL MATCH (d)-[:HAS_REQUIREMENT]->(r:Requirement)
      WITH d, p, count(r) as reqCount
      RETURN
        d.slug as slug,
        d.name as name,
        d.kind as kind,
        p.slug as projectSlug,
        p.name as projectName,
        reqCount
      ORDER BY d.slug
    `);

    docResult.records.forEach((record) => {
      console.log(`\n${record.get('slug')}:`);
      console.log(`  Name: ${record.get('name')}`);
      console.log(`  Kind: ${record.get('kind')}`);
      console.log(`  Project: ${record.get('projectSlug')} (${record.get('projectName')})`);
      console.log(`  Requirements: ${record.get('reqCount').toNumber()}`);
    });

    // Check if requirements have alternative ID fields
    console.log('\n\n🔑 CHECKING FOR ALTERNATIVE ID FIELDS:');
    const idCheck = await session.run(`
      MATCH (r:Requirement)
      WHERE r.deletedAt IS NULL
      RETURN
        r.id as id,
        r.reqId as reqId,
        r.uuid as uuid,
        r.text as text
      LIMIT 5
    `);

    idCheck.records.forEach((record, index) => {
      console.log(`\n${index + 1}.`);
      console.log(`  id: ${record.get('id')}`);
      console.log(`  reqId: ${record.get('reqId')}`);
      console.log(`  uuid: ${record.get('uuid')}`);
      console.log(`  text: ${record.get('text')?.substring(0, 50)}...`);
    });

    // Check relationship types from Documents
    console.log('\n\n🔗 RELATIONSHIP PATTERNS FROM DOCUMENTS:');
    const relResult = await session.run(`
      MATCH (d:Document)-[r]->(target)
      WHERE d.deletedAt IS NULL
      RETURN DISTINCT type(r) as relType, labels(target)[0] as targetLabel, count(*) as count
      ORDER BY relType, targetLabel
    `);

    relResult.records.forEach((record) => {
      console.log(`  ${record.get('relType')} -> ${record.get('targetLabel')}: ${record.get('count').toNumber()}`);
    });

    console.log('\n━'.repeat(70));
    console.log('✅ CHECK COMPLETE\n');

  } catch (error) {
    console.error('❌ Error checking properties:', error);
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
