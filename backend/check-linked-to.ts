import { getSession, initGraph, closeGraph } from './src/services/graph/driver.js';

(async () => {
  initGraph();
  const session = getSession();

  const result = await session.run(`
    MATCH (doc1:Document)-[r:LINKED_TO]->(doc2:Document)
    RETURN doc1.slug as source, doc2.slug as target, r.linksetId as linksetId
    LIMIT 10
  `);

  console.log('Document LINKED_TO relationships:');
  if (result.records.length === 0) {
    console.log('  (none found)');
  } else {
    result.records.forEach(record => {
      console.log(`  ${record.get('source')} -> ${record.get('target')} (linkset: ${record.get('linksetId')})`);
    });
  }

  await session.close();
  await closeGraph();
})();
