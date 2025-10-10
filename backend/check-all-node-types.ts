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
    console.log('\n📊 ANALYZING ALL NODE TYPES IN DATABASE');
    console.log('━'.repeat(70));

    // Get all node labels and counts
    const labelResult = await session.run(`
      CALL db.labels() YIELD label
      CALL {
        WITH label
        MATCH (n)
        WHERE label IN labels(n)
        RETURN count(n) as count
      }
      RETURN label, count
      ORDER BY count DESC, label ASC
    `);

    console.log('\nNode Types (Labels) in Database:\n');

    const nodeTypes: Array<{label: string, count: number}> = [];
    let totalNodes = 0;

    labelResult.records.forEach((record) => {
      const label = record.get('label');
      const count = record.get('count').toNumber();
      nodeTypes.push({ label, count });
      totalNodes += count;

      console.log(`  ${label.padEnd(30)} ${count.toString().padStart(6)} node(s)`);
    });

    // Get relationship types
    console.log('\n\n📊 RELATIONSHIP TYPES IN DATABASE');
    console.log('━'.repeat(70));

    const relResult = await session.run(`
      CALL db.relationshipTypes() YIELD relationshipType
      CALL {
        WITH relationshipType
        MATCH ()-[r]->()
        WHERE type(r) = relationshipType
        RETURN count(r) as count
      }
      RETURN relationshipType, count
      ORDER BY count DESC, relationshipType ASC
    `);

    console.log('\nRelationship Types:\n');

    let totalRels = 0;
    const relTypes: Array<{type: string, count: number}> = [];

    relResult.records.forEach((record) => {
      const relType = record.get('relationshipType');
      const count = record.get('count').toNumber();
      relTypes.push({ type: relType, count });
      totalRels += count;

      console.log(`  ${relType.padEnd(30)} ${count.toString().padStart(6)} relationship(s)`);
    });

    // Summary
    console.log('\n\n📊 DATABASE SUMMARY');
    console.log('━'.repeat(70));
    console.log(`Total Node Labels: ${nodeTypes.length}`);
    console.log(`Total Nodes: ${totalNodes}`);
    console.log(`Total Relationship Types: ${relTypes.length}`);
    console.log(`Total Relationships: ${totalRels}`);

    // Generate expected node types for verification
    console.log('\n\n📋 EXPECTED NODE TYPES (for verification)');
    console.log('━'.repeat(70));
    console.log('\nCritical node types that should exist after restore:\n');

    const criticalTypes = [
      'Tenant',
      'Project',
      'Document',
      'DocumentSection',
      'DocumentContentBlock',
      'Requirement',
      'Folder',
      'TraceLink',
      'DocumentLinkset',
      'Baseline',
      'BaselineRequirement',
      'ArchitectureNode',
      'ArchitectureEdge',
      'User',
    ];

    criticalTypes.forEach(type => {
      const found = nodeTypes.find(nt => nt.label === type);
      if (found) {
        console.log(`  ✓ ${type.padEnd(30)} ${found.count.toString().padStart(6)} node(s)`);
      } else {
        console.log(`  ✗ ${type.padEnd(30)} MISSING`);
      }
    });

    // Check for soft-deleted nodes
    console.log('\n\n🗑️  SOFT-DELETED NODES');
    console.log('━'.repeat(70));

    const deletedResult = await session.run(`
      MATCH (n)
      WHERE n.deletedAt IS NOT NULL OR n.deleted = true
      RETURN labels(n)[0] as label, count(n) as count
      ORDER BY count DESC, label ASC
    `);

    if (deletedResult.records.length === 0) {
      console.log('\nNo soft-deleted nodes found.');
    } else {
      console.log('\nSoft-deleted nodes by type:\n');
      deletedResult.records.forEach((record) => {
        const label = record.get('label');
        const count = record.get('count').toNumber();
        console.log(`  ${label.padEnd(30)} ${count.toString().padStart(6)} deleted`);
      });
    }

    console.log('\n━'.repeat(70));
    console.log('✅ ANALYSIS COMPLETE\n');

  } catch (error) {
    console.error('❌ Error analyzing database:', error);
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
