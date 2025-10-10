#!/usr/bin/env tsx
/**
 * Post-Restore Data Verification Script
 *
 * Verifies that all expected node types and critical relationships exist
 * after a database restore operation. Helps detect incomplete or corrupted backups.
 *
 * Usage:
 *   npx tsx verify-restore-data.ts [--strict] [--json]
 *
 * Options:
 *   --strict    Fail if any critical node type is missing
 *   --json      Output results in JSON format
 */

import neo4j from 'neo4j-driver';

const driver = neo4j.driver(
  process.env.GRAPH_URL || 'bolt://localhost:17687',
  neo4j.auth.basic(
    process.env.GRAPH_USERNAME || 'neo4j',
    process.env.GRAPH_PASSWORD || 'airgen-graph'
  )
);

// Expected node types in a healthy AirGen database
const EXPECTED_NODE_TYPES = {
  core: [
    'Tenant',
    'Project',
    'Document',
    'DocumentSection',
    'DocumentContentBlock',
    'Requirement',
    'Folder',
  ],
  traceability: [
    'TraceLink',
    'DocumentLinkset',
  ],
  versioning: [
    'RequirementVersion',
    'DocumentVersion',
    'DocumentSectionVersion',
    'TraceLinkVersion',
    'DocumentLinksetVersion',
  ],
  architecture: [
    'ArchitectureDiagram',
    'ArchitectureBlock',
    'ArchitectureConnector',
    'ArchitectureDiagramVersion',
    'ArchitectureBlockVersion',
    'ArchitectureConnectorVersion',
  ],
  candidates: [
    'RequirementCandidate',
    'DiagramCandidate',
  ],
};

// Critical relationships that must exist
const EXPECTED_RELATIONSHIPS = [
  'OWNS',               // Tenant owns Projects
  'HAS_DOCUMENT',       // Project has Documents
  'HAS_SECTION',        // Document has Sections
  'HAS_CONTENT_BLOCK',  // Document/Section has Content Blocks
  'CONTAINS',           // Document contains Requirements
  'HAS_REQUIREMENT',    // Section has Requirements
  'FROM_REQUIREMENT',   // TraceLink from Requirement
  'TO_REQUIREMENT',     // TraceLink to Requirement
  'LINKS_FROM',         // DocumentLinkset links from Document
  'LINKS_TO',           // DocumentLinkset links to Document
  'HAS_VERSION',        // Entity has Version history
  'PREVIOUS_VERSION',   // Version chain
];

interface NodeTypeInfo {
  label: string;
  count: number;
  category: string;
}

interface RelationshipTypeInfo {
  type: string;
  count: number;
}

interface VerificationResult {
  success: boolean;
  timestamp: string;
  nodeTypes: {
    expected: number;
    found: number;
    missing: string[];
    present: NodeTypeInfo[];
  };
  relationships: {
    expected: number;
    found: number;
    missing: string[];
    present: RelationshipTypeInfo[];
  };
  warnings: string[];
  errors: string[];
  totalNodes: number;
  totalRelationships: number;
}

async function verifyRestore(strict: boolean = false): Promise<VerificationResult> {
  const session = driver.session({ database: process.env.GRAPH_DATABASE || 'neo4j' });

  const result: VerificationResult = {
    success: true,
    timestamp: new Date().toISOString(),
    nodeTypes: {
      expected: 0,
      found: 0,
      missing: [],
      present: [],
    },
    relationships: {
      expected: EXPECTED_RELATIONSHIPS.length,
      found: 0,
      missing: [],
      present: [],
    },
    warnings: [],
    errors: [],
    totalNodes: 0,
    totalRelationships: 0,
  };

  try {
    // Count expected node types
    for (const category of Object.keys(EXPECTED_NODE_TYPES)) {
      result.nodeTypes.expected += (EXPECTED_NODE_TYPES as any)[category].length;
    }

    // Check all node labels
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

    const foundLabels = new Map<string, number>();
    labelResult.records.forEach((record) => {
      const label = record.get('label');
      const count = record.get('count').toNumber();
      foundLabels.set(label, count);
      result.totalNodes += count;
    });

    // Check for missing node types
    for (const [category, labels] of Object.entries(EXPECTED_NODE_TYPES)) {
      for (const label of labels) {
        if (foundLabels.has(label)) {
          result.nodeTypes.present.push({
            label,
            count: foundLabels.get(label)!,
            category,
          });
          result.nodeTypes.found++;
        } else {
          result.nodeTypes.missing.push(label);

          // Some types are optional
          if (['Baseline', 'BaselineRequirement', 'User'].includes(label)) {
            result.warnings.push(`Optional node type missing: ${label}`);
          } else if (strict) {
            result.errors.push(`Critical node type missing: ${label}`);
            result.success = false;
          } else {
            result.warnings.push(`Node type missing: ${label} (may not be in use)`);
          }
        }
      }
    }

    // Check relationships
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

    const foundRels = new Map<string, number>();
    relResult.records.forEach((record) => {
      const relType = record.get('relationshipType');
      const count = record.get('count').toNumber();
      foundRels.set(relType, count);
      result.totalRelationships += count;
    });

    // Check for missing relationships
    for (const relType of EXPECTED_RELATIONSHIPS) {
      if (foundRels.has(relType)) {
        result.relationships.present.push({
          type: relType,
          count: foundRels.get(relType)!,
        });
        result.relationships.found++;
      } else {
        result.relationships.missing.push(relType);

        if (strict) {
          result.errors.push(`Critical relationship missing: ${relType}`);
          result.success = false;
        } else {
          result.warnings.push(`Relationship missing: ${relType} (may not be in use)`);
        }
      }
    }

    // Additional data integrity checks

    // Check if tenants have projects
    const tenantCheck = await session.run(`
      MATCH (t:Tenant)
      OPTIONAL MATCH (t)-[:OWNS]->(p:Project)
      WITH t, count(p) as projectCount
      WHERE projectCount = 0
      RETURN count(t) as tenantsWithoutProjects
    `);

    const tenantsWithoutProjects = tenantCheck.records[0]?.get('tenantsWithoutProjects').toNumber() || 0;
    if (tenantsWithoutProjects > 0) {
      result.warnings.push(`${tenantsWithoutProjects} tenant(s) have no projects`);
    }

    // Check if projects have documents
    const projectCheck = await session.run(`
      MATCH (p:Project)
      OPTIONAL MATCH (p)-[:HAS_DOCUMENT]->(d:Document)
      WHERE d.deletedAt IS NULL
      WITH p, count(d) as docCount
      WHERE docCount = 0
      RETURN count(p) as projectsWithoutDocs
    `);

    const projectsWithoutDocs = projectCheck.records[0]?.get('projectsWithoutDocs').toNumber() || 0;
    if (projectsWithoutDocs > 0) {
      result.warnings.push(`${projectsWithoutDocs} project(s) have no documents`);
    }

    // Check for orphaned requirements
    const orphanCheck = await session.run(`
      MATCH (r:Requirement)
      WHERE r.deletedAt IS NULL
      AND NOT ((:Document)-[:CONTAINS]->(r))
      RETURN count(r) as orphanedReqs
    `);

    const orphanedReqs = orphanCheck.records[0]?.get('orphanedReqs').toNumber() || 0;
    if (orphanedReqs > 0) {
      result.warnings.push(`${orphanedReqs} requirement(s) are not connected to documents`);
    }

    // Check if trace links have linksets
    const linksetCheck = await session.run(`
      MATCH (tl:TraceLink)
      MATCH (tl)-[:FROM_REQUIREMENT]->(source:Requirement)
      MATCH (tl)-[:TO_REQUIREMENT]->(target:Requirement)
      MATCH (sourceDoc:Document)-[:CONTAINS]->(source)
      MATCH (targetDoc:Document)-[:CONTAINS]->(target)
      WITH sourceDoc, targetDoc, count(tl) as linkCount
      WHERE NOT exists((sourceDoc)<-[:LINKS_FROM]-(:DocumentLinkset)-[:LINKS_TO]->(targetDoc))
      RETURN count(*) as pairsWithoutLinksets
    `);

    const pairsWithoutLinksets = linksetCheck.records[0]?.get('pairsWithoutLinksets').toNumber() || 0;
    if (pairsWithoutLinksets > 0) {
      result.errors.push(`${pairsWithoutLinksets} document pair(s) have trace links but no DocumentLinkset`);
      result.success = false;
    }

    // Final success determination
    if (result.errors.length > 0) {
      result.success = false;
    }

  } catch (error) {
    result.success = false;
    result.errors.push(`Verification failed: ${error}`);
  } finally {
    await session.close();
  }

  return result;
}

function printResults(result: VerificationResult, jsonOutput: boolean = false) {
  if (jsonOutput) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log('\n📊 POST-RESTORE VERIFICATION REPORT');
  console.log('━'.repeat(70));
  console.log(`Timestamp: ${result.timestamp}`);
  console.log(`Status: ${result.success ? '✅ PASSED' : '❌ FAILED'}`);
  console.log('');

  console.log('📦 NODE TYPES:');
  console.log(`  Expected: ${result.nodeTypes.expected}`);
  console.log(`  Found: ${result.nodeTypes.found}`);
  console.log(`  Missing: ${result.nodeTypes.missing.length}`);
  if (result.nodeTypes.missing.length > 0) {
    console.log(`    ${result.nodeTypes.missing.join(', ')}`);
  }
  console.log('');

  console.log('🔗 RELATIONSHIPS:');
  console.log(`  Expected: ${result.relationships.expected}`);
  console.log(`  Found: ${result.relationships.found}`);
  console.log(`  Missing: ${result.relationships.missing.length}`);
  if (result.relationships.missing.length > 0) {
    console.log(`    ${result.relationships.missing.join(', ')}`);
  }
  console.log('');

  console.log('📊 DATABASE TOTALS:');
  console.log(`  Total Nodes: ${result.totalNodes}`);
  console.log(`  Total Relationships: ${result.totalRelationships}`);
  console.log('');

  if (result.warnings.length > 0) {
    console.log('⚠️  WARNINGS:');
    result.warnings.forEach(w => console.log(`  • ${w}`));
    console.log('');
  }

  if (result.errors.length > 0) {
    console.log('❌ ERRORS:');
    result.errors.forEach(e => console.log(`  • ${e}`));
    console.log('');
  }

  if (result.success) {
    console.log('✅ Restore verification PASSED');
    console.log('   Database structure looks healthy');
  } else {
    console.log('❌ Restore verification FAILED');
    console.log('   Database may be incomplete or corrupted');
  }

  console.log('\n━'.repeat(70));
}

async function main() {
  const args = process.argv.slice(2);
  const strict = args.includes('--strict');
  const jsonOutput = args.includes('--json');

  try {
    const result = await verifyRestore(strict);
    printResults(result, jsonOutput);

    process.exit(result.success ? 0 : 1);
  } catch (error) {
    console.error('❌ Verification failed:', error);
    process.exit(1);
  } finally {
    await driver.close();
  }
}

main();
