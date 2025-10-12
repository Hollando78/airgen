#!/usr/bin/env tsx
/**
 * Post-Restore Cleanup Script
 *
 * This script runs after a backup restore to detect and fix common data integrity issues:
 * 1. Duplicate Project nodes (from manual recovery attempts before restore)
 * 2. Orphaned relationships pointing to deleted nodes
 * 3. Incorrect Tenant → Project connections
 *
 * Usage: npx tsx scripts/post-restore-cleanup.ts [--dry-run]
 */

import neo4j from 'neo4j-driver';

const driver = neo4j.driver(
  process.env.GRAPH_URL || 'bolt://localhost:17687',
  neo4j.auth.basic(
    process.env.GRAPH_USERNAME || 'neo4j',
    process.env.GRAPH_PASSWORD || 'airgen-graph'
  )
);

interface DuplicateProject {
  slug: string;
  projects: Array<{
    id: number;
    key: string;
    documentCount: number;
    requirementCount: number;
    tenantConnected: boolean;
  }>;
}

const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  const session = driver.session({ database: process.env.GRAPH_DATABASE || 'neo4j' });

  try {
    console.log('\n🔍 POST-RESTORE CLEANUP');
    console.log('━'.repeat(70));
    console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no changes)' : 'LIVE (will make changes)'}`);
    console.log('━'.repeat(70));

    // Step 1: Detect duplicate Project nodes
    console.log('\n📊 Step 1: Detecting duplicate Project nodes...');
    const duplicates = await detectDuplicateProjects(session);

    if (duplicates.length === 0) {
      console.log('✅ No duplicate projects found.');
    } else {
      console.log(`⚠️  Found ${duplicates.length} project(s) with duplicates:\n`);

      for (const dup of duplicates) {
        console.log(`   Project slug: "${dup.slug}"`);
        for (const proj of dup.projects) {
          console.log(`     - ID ${proj.id}, key="${proj.key}": ${proj.documentCount} docs, ${proj.requirementCount} reqs, tenant=${proj.tenantConnected ? 'YES' : 'NO'}`);
        }
        console.log('');
      }

      // Step 2: Fix each duplicate
      for (const dup of duplicates) {
        await fixDuplicateProject(session, dup);
      }
    }

    // Step 3: Verify all Tenants are connected to valid Projects
    console.log('\n📊 Step 3: Verifying Tenant → Project connections...');
    await verifyTenantConnections(session);

    // Step 4: Detect orphaned relationships
    console.log('\n📊 Step 4: Checking for orphaned relationships...');
    await detectOrphanedRelationships(session);

    console.log('\n━'.repeat(70));
    console.log('✅ POST-RESTORE CLEANUP COMPLETE');
    console.log('━'.repeat(70));

    if (DRY_RUN) {
      console.log('\n⚠️  This was a DRY RUN - no changes were made.');
      console.log('   Run without --dry-run to apply fixes.');
    }

  } catch (error) {
    console.error('\n❌ Error during cleanup:', error);
    throw error;
  } finally {
    await session.close();
    await driver.close();
  }
}

async function detectDuplicateProjects(session: any): Promise<DuplicateProject[]> {
  const result = await session.run(`
    MATCH (p:Project)
    WITH p.slug as slug, collect(p) as projects
    WHERE size(projects) > 1
    UNWIND projects as proj
    OPTIONAL MATCH (proj)-[:HAS_DOCUMENT]->(doc:Document)
    WHERE doc.deletedAt IS NULL
    OPTIONAL MATCH (proj)-[:CONTAINS]->(req:Requirement)
    WHERE (req.archived IS NULL OR req.archived = false)
    OPTIONAL MATCH (t:Tenant)-[:OWNS]->(proj)
    WITH slug,
         id(proj) as projectId,
         proj.key as projectKey,
         count(DISTINCT doc) as docCount,
         count(DISTINCT req) as reqCount,
         count(DISTINCT t) > 0 as hasTenant
    RETURN slug,
           collect({
             id: projectId,
             key: projectKey,
             documentCount: docCount,
             requirementCount: reqCount,
             tenantConnected: hasTenant
           }) as projects
  `);

  return result.records.map(record => ({
    slug: record.get('slug'),
    projects: record.get('projects')
  }));
}

async function fixDuplicateProject(session: any, duplicate: DuplicateProject) {
  console.log(`\n🔧 Fixing duplicate project: "${duplicate.slug}"`);

  // Identify the "real" project (has data) vs empty duplicates
  const realProject = duplicate.projects.reduce((best, current) => {
    const bestScore = best.documentCount + best.requirementCount;
    const currentScore = current.documentCount + current.requirementCount;
    return currentScore > bestScore ? current : best;
  });

  const emptyDuplicates = duplicate.projects.filter(p => p.id !== realProject.id);

  console.log(`   Real project: ID ${realProject.id} (key="${realProject.key}")`);
  console.log(`   Empty duplicates: ${emptyDuplicates.map(p => `ID ${p.id}`).join(', ')}`);

  if (DRY_RUN) {
    console.log('   [DRY RUN] Would move relationships and delete duplicates');
    return;
  }

  // For each empty duplicate
  for (const emptyDup of emptyDuplicates) {
    console.log(`   Moving relationships from ID ${emptyDup.id}...`);

    // Move all outgoing relationships to real project
    await session.run(`
      MATCH (empty:Project)-[r]->(target)
      WHERE id(empty) = $emptyId
      MATCH (real:Project)
      WHERE id(real) = $realId

      // Create equivalent relationship from real project
      CREATE (real)-[newRel:\${type(r)}]->(target)
      SET newRel = properties(r)

      // Delete old relationship
      DELETE r

      RETURN count(*) as movedOut
    `, { emptyId: emptyDup.id, realId: realProject.id });

    // Move all incoming relationships to real project
    await session.run(`
      MATCH (source)-[r]->(empty:Project)
      WHERE id(empty) = $emptyId
      MATCH (real:Project)
      WHERE id(real) = $realId

      // For OWNS relationships, use MERGE to avoid duplicates
      FOREACH (_ IN CASE WHEN type(r) = 'OWNS' THEN [1] ELSE [] END |
        MERGE (source)-[:OWNS]->(real)
      )

      // For other relationships, create new ones
      FOREACH (_ IN CASE WHEN type(r) <> 'OWNS' THEN [1] ELSE [] END |
        CREATE (source)-[newRel:\${type(r)}]->(real)
        SET newRel = properties(r)
      )

      // Delete old relationship
      DELETE r

      RETURN count(*) as movedIn
    `, { emptyId: emptyDup.id, realId: realProject.id });

    // Delete the empty duplicate node
    await session.run(`
      MATCH (p:Project)
      WHERE id(p) = $emptyId
      DETACH DELETE p
    `, { emptyId: emptyDup.id });

    console.log(`   ✅ Deleted duplicate ID ${emptyDup.id}`);
  }

  // Ensure Tenant is connected to real project
  const tenantConnectedToReal = realProject.tenantConnected;
  const anyDuplicateHadTenant = duplicate.projects.some(p => p.tenantConnected);

  if (anyDuplicateHadTenant && !tenantConnectedToReal) {
    console.log(`   Reconnecting Tenant to real project...`);
    await session.run(`
      MATCH (t:Tenant), (p:Project)
      WHERE id(p) = $realId
      MERGE (t)-[:OWNS]->(p)
    `, { realId: realProject.id });
    console.log(`   ✅ Tenant reconnected`);
  }

  console.log(`✅ Fixed duplicate project "${duplicate.slug}"`);
}

async function verifyTenantConnections(session: any) {
  const result = await session.run(`
    MATCH (t:Tenant)-[:OWNS]->(p:Project)
    OPTIONAL MATCH (p)-[:HAS_DOCUMENT]->(doc:Document)
    WHERE doc.deletedAt IS NULL
    OPTIONAL MATCH (p)-[:CONTAINS]->(req:Requirement)
    WHERE (req.archived IS NULL OR req.archived = false)
    WITH t, p,
         count(DISTINCT doc) as docCount,
         count(DISTINCT req) as reqCount
    RETURN t.slug as tenant,
           p.slug as project,
           id(p) as projectId,
           docCount,
           reqCount
    ORDER BY t.slug, p.slug
  `);

  if (result.records.length === 0) {
    console.log('⚠️  No Tenant → Project connections found!');
    return;
  }

  console.log('   Tenant → Project connections:');
  for (const record of result.records) {
    const tenant = record.get('tenant');
    const project = record.get('project');
    const projectId = record.get('projectId').toNumber();
    const docCount = record.get('docCount').toNumber();
    const reqCount = record.get('reqCount').toNumber();

    const status = (docCount === 0 && reqCount === 0) ? '⚠️ ' : '✅';
    console.log(`   ${status} ${tenant} → ${project} (ID ${projectId}): ${docCount} docs, ${reqCount} reqs`);
  }
}

async function detectOrphanedRelationships(session: any) {
  const result = await session.run(`
    MATCH ()-[r]->()
    WHERE startNode(r) IS NULL OR endNode(r) IS NULL
    RETURN count(r) as orphanedCount
  `);

  const orphanedCount = result.records[0]?.get('orphanedCount').toNumber() || 0;

  if (orphanedCount > 0) {
    console.log(`⚠️  Found ${orphanedCount} orphaned relationships`);

    if (!DRY_RUN) {
      console.log('   Cleaning up orphaned relationships...');
      await session.run(`
        MATCH ()-[r]->()
        WHERE startNode(r) IS NULL OR endNode(r) IS NULL
        DELETE r
      `);
      console.log('   ✅ Orphaned relationships cleaned up');
    } else {
      console.log('   [DRY RUN] Would clean up orphaned relationships');
    }
  } else {
    console.log('✅ No orphaned relationships found');
  }
}

// Run main function
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
