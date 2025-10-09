/**
 * Migration 005: Upgrade Existing Baselines to Include Version Snapshots
 *
 * This migration upgrades existing baseline nodes to work with the comprehensive
 * version history system by:
 * 1. Adding version count properties to existing baselines
 * 2. Creating SNAPSHOT_OF relationships to appropriate version nodes
 * 3. Finding the latest versions at baseline creation time
 *
 * Note: This migration should be run after version history has been created for
 * existing entities. If version history doesn't exist yet, this migration will
 * simply set all counts to 0.
 */

import { getSession } from "../driver.js";

export async function migrate005Up(): Promise<void> {
  const session = getSession();

  try {
    console.log("[Migration 005] Starting: Upgrade existing baselines with version snapshots");

    // Get all existing baselines
    const baselinesResult = await session.run(`
      MATCH (baseline:Baseline)
      RETURN baseline.id AS id, baseline.ref AS ref, baseline.createdAt AS createdAt,
             baseline.tenant AS tenant, baseline.projectKey AS projectKey
      ORDER BY baseline.createdAt
    `);

    const baselines = baselinesResult.records.map(r => ({
      id: String(r.get("id")),
      ref: String(r.get("ref")),
      createdAt: String(r.get("createdAt")),
      tenant: String(r.get("tenant")),
      projectKey: String(r.get("projectKey"))
    }));

    console.log(`[Migration 005] Found ${baselines.length} existing baseline(s) to upgrade`);

    for (const baseline of baselines) {
      console.log(`[Migration 005] Upgrading baseline: ${baseline.ref}`);

      // For each baseline, find all versions that existed at the time of baseline creation
      // and link the latest version of each entity
      await session.run(
        `
          MATCH (baseline:Baseline {id: $baselineId})

          // Find all requirements that existed at baseline creation time
          OPTIONAL MATCH (project:Project {slug: $projectSlug, tenantSlug: $tenantSlug})-[:CONTAINS]->(req:Requirement)
          WHERE req.createdAt <= $baselineCreatedAt
          OPTIONAL MATCH (req)-[:HAS_VERSION]->(reqVer:RequirementVersion)
          WHERE reqVer.timestamp <= $baselineCreatedAt
          WITH baseline, req, reqVer
          ORDER BY reqVer.versionNumber DESC
          WITH baseline, req, collect(reqVer)[0] AS latestReqVer
          WITH baseline, collect({req: req, ver: latestReqVer}) AS reqVersions

          // Find all documents
          OPTIONAL MATCH (project:Project {slug: $projectSlug, tenantSlug: $tenantSlug})-[:HAS_DOCUMENT]->(doc:Document)
          WHERE doc.createdAt <= $baselineCreatedAt
          OPTIONAL MATCH (doc)-[:HAS_VERSION]->(docVer:DocumentVersion)
          WHERE docVer.timestamp <= $baselineCreatedAt
          WITH baseline, reqVersions, doc, docVer
          ORDER BY docVer.versionNumber DESC
          WITH baseline, reqVersions, doc, collect(docVer)[0] AS latestDocVer
          WITH baseline, reqVersions, collect({doc: doc, ver: latestDocVer}) AS docVersions

          // Find all document sections
          OPTIONAL MATCH (project:Project {slug: $projectSlug, tenantSlug: $tenantSlug})-[:HAS_DOCUMENT]->(:Document)-[:HAS_SECTION]->(sec:DocumentSection)
          WHERE sec.createdAt <= $baselineCreatedAt
          OPTIONAL MATCH (sec)-[:HAS_VERSION]->(secVer:DocumentSectionVersion)
          WHERE secVer.timestamp <= $baselineCreatedAt
          WITH baseline, reqVersions, docVersions, sec, secVer
          ORDER BY secVer.versionNumber DESC
          WITH baseline, reqVersions, docVersions, sec, collect(secVer)[0] AS latestSecVer
          WITH baseline, reqVersions, docVersions, collect({sec: sec, ver: latestSecVer}) AS secVersions

          // Find all info nodes
          OPTIONAL MATCH (project:Project {slug: $projectSlug, tenantSlug: $tenantSlug})-[:HAS_DOCUMENT]->(:Document)-[:HAS_SECTION]->(:DocumentSection)-[:CONTAINS]->(info:Info)
          WHERE info.createdAt <= $baselineCreatedAt
          OPTIONAL MATCH (info)-[:HAS_VERSION]->(infoVer:InfoVersion)
          WHERE infoVer.timestamp <= $baselineCreatedAt
          WITH baseline, reqVersions, docVersions, secVersions, info, infoVer
          ORDER BY infoVer.versionNumber DESC
          WITH baseline, reqVersions, docVersions, secVersions, info, collect(infoVer)[0] AS latestInfoVer
          WITH baseline, reqVersions, docVersions, secVersions, collect({info: info, ver: latestInfoVer}) AS infoVersions

          // Find all surrogate references
          OPTIONAL MATCH (project:Project {slug: $projectSlug, tenantSlug: $tenantSlug})-[:HAS_DOCUMENT]->(:Document)-[:HAS_SECTION]->(:DocumentSection)-[:CONTAINS]->(sur:SurrogateReference)
          WHERE sur.createdAt <= $baselineCreatedAt
          OPTIONAL MATCH (sur)-[:HAS_VERSION]->(surVer:SurrogateReferenceVersion)
          WHERE surVer.timestamp <= $baselineCreatedAt
          WITH baseline, reqVersions, docVersions, secVersions, infoVersions, sur, surVer
          ORDER BY surVer.versionNumber DESC
          WITH baseline, reqVersions, docVersions, secVersions, infoVersions, sur, collect(surVer)[0] AS latestSurVer
          WITH baseline, reqVersions, docVersions, secVersions, infoVersions, collect({sur: sur, ver: latestSurVer}) AS surVersions

          // Find all trace links
          OPTIONAL MATCH (project:Project {slug: $projectSlug, tenantSlug: $tenantSlug})-[:HAS_TRACE_LINK]->(link:TraceLink)
          WHERE link.createdAt <= $baselineCreatedAt
          OPTIONAL MATCH (link)-[:HAS_VERSION]->(linkVer:TraceLinkVersion)
          WHERE linkVer.timestamp <= $baselineCreatedAt
          WITH baseline, reqVersions, docVersions, secVersions, infoVersions, surVersions, link, linkVer
          ORDER BY linkVer.versionNumber DESC
          WITH baseline, reqVersions, docVersions, secVersions, infoVersions, surVersions, link, collect(linkVer)[0] AS latestLinkVer
          WITH baseline, reqVersions, docVersions, secVersions, infoVersions, surVersions, collect({link: link, ver: latestLinkVer}) AS linkVersions

          // Find all linksets
          OPTIONAL MATCH (project:Project {slug: $projectSlug, tenantSlug: $tenantSlug})-[:HAS_LINKSET]->(linkset:DocumentLinkset)
          WHERE linkset.createdAt <= $baselineCreatedAt
          OPTIONAL MATCH (linkset)-[:HAS_VERSION]->(linksetVer:DocumentLinksetVersion)
          WHERE linksetVer.timestamp <= $baselineCreatedAt
          WITH baseline, reqVersions, docVersions, secVersions, infoVersions, surVersions, linkVersions, linkset, linksetVer
          ORDER BY linksetVer.versionNumber DESC
          WITH baseline, reqVersions, docVersions, secVersions, infoVersions, surVersions, linkVersions, linkset, collect(linksetVer)[0] AS latestLinksetVer
          WITH baseline, reqVersions, docVersions, secVersions, infoVersions, surVersions, linkVersions, collect({linkset: linkset, ver: latestLinksetVer}) AS linksetVersions

          // Find all architecture diagrams
          OPTIONAL MATCH (project:Project {slug: $projectSlug, tenantSlug: $tenantSlug})-[:HAS_ARCHITECTURE_DIAGRAM]->(diag:ArchitectureDiagram)
          WHERE diag.createdAt <= $baselineCreatedAt
          OPTIONAL MATCH (diag)-[:HAS_VERSION]->(diagVer:ArchitectureDiagramVersion)
          WHERE diagVer.timestamp <= $baselineCreatedAt
          WITH baseline, reqVersions, docVersions, secVersions, infoVersions, surVersions, linkVersions, linksetVersions, diag, diagVer
          ORDER BY diagVer.versionNumber DESC
          WITH baseline, reqVersions, docVersions, secVersions, infoVersions, surVersions, linkVersions, linksetVersions, diag, collect(diagVer)[0] AS latestDiagVer
          WITH baseline, reqVersions, docVersions, secVersions, infoVersions, surVersions, linkVersions, linksetVersions, collect({diag: diag, ver: latestDiagVer}) AS diagVersions

          // Find all architecture blocks
          OPTIONAL MATCH (project:Project {slug: $projectSlug, tenantSlug: $tenantSlug})-[:HAS_ARCHITECTURE_BLOCK]->(block:ArchitectureBlock)
          WHERE block.createdAt <= $baselineCreatedAt
          OPTIONAL MATCH (block)-[:HAS_VERSION]->(blockVer:ArchitectureBlockVersion)
          WHERE blockVer.timestamp <= $baselineCreatedAt
          WITH baseline, reqVersions, docVersions, secVersions, infoVersions, surVersions, linkVersions, linksetVersions, diagVersions, block, blockVer
          ORDER BY blockVer.versionNumber DESC
          WITH baseline, reqVersions, docVersions, secVersions, infoVersions, surVersions, linkVersions, linksetVersions, diagVersions, block, collect(blockVer)[0] AS latestBlockVer
          WITH baseline, reqVersions, docVersions, secVersions, infoVersions, surVersions, linkVersions, linksetVersions, diagVersions, collect({block: block, ver: latestBlockVer}) AS blockVersions

          // Find all architecture connectors
          OPTIONAL MATCH (project:Project {slug: $projectSlug, tenantSlug: $tenantSlug})-[:HAS_ARCHITECTURE_CONNECTOR]->(conn:ArchitectureConnector)
          WHERE conn.createdAt <= $baselineCreatedAt
          OPTIONAL MATCH (conn)-[:HAS_VERSION]->(connVer:ArchitectureConnectorVersion)
          WHERE connVer.timestamp <= $baselineCreatedAt
          WITH baseline, reqVersions, docVersions, secVersions, infoVersions, surVersions, linkVersions, linksetVersions, diagVersions, blockVersions, conn, connVer
          ORDER BY connVer.versionNumber DESC
          WITH baseline, reqVersions, docVersions, secVersions, infoVersions, surVersions, linkVersions, linksetVersions, diagVersions, blockVersions, conn, collect(connVer)[0] AS latestConnVer
          WITH baseline, reqVersions, docVersions, secVersions, infoVersions, surVersions, linkVersions, linksetVersions, diagVersions, blockVersions, collect({conn: conn, ver: latestConnVer}) AS connVersions

          // Filter out null versions
          WITH baseline,
               [item IN reqVersions WHERE item.ver IS NOT NULL | item.ver] AS reqVers,
               [item IN docVersions WHERE item.ver IS NOT NULL | item.ver] AS docVers,
               [item IN secVersions WHERE item.ver IS NOT NULL | item.ver] AS secVers,
               [item IN infoVersions WHERE item.ver IS NOT NULL | item.ver] AS infoVers,
               [item IN surVersions WHERE item.ver IS NOT NULL | item.ver] AS surVers,
               [item IN linkVersions WHERE item.ver IS NOT NULL | item.ver] AS linkVers,
               [item IN linksetVersions WHERE item.ver IS NOT NULL | item.ver] AS linksetVers,
               [item IN diagVersions WHERE item.ver IS NOT NULL | item.ver] AS diagVers,
               [item IN blockVersions WHERE item.ver IS NOT NULL | item.ver] AS blockVers,
               [item IN connVersions WHERE item.ver IS NOT NULL | item.ver] AS connVers

          // Update baseline with version counts
          SET baseline.requirementVersionCount = size(reqVers),
              baseline.documentVersionCount = size(docVers),
              baseline.documentSectionVersionCount = size(secVers),
              baseline.infoVersionCount = size(infoVers),
              baseline.surrogateVersionCount = size(surVers),
              baseline.traceLinkVersionCount = size(linkVers),
              baseline.linksetVersionCount = size(linksetVers),
              baseline.diagramVersionCount = size(diagVers),
              baseline.blockVersionCount = size(blockVers),
              baseline.connectorVersionCount = size(connVers)

          // Create SNAPSHOT_OF relationships
          WITH baseline, reqVers, docVers, secVers, infoVers, surVers, linkVers, linksetVers, diagVers, blockVers, connVers

          FOREACH (reqVer IN reqVers | MERGE (baseline)-[:SNAPSHOT_OF_REQUIREMENT]->(reqVer))
          FOREACH (docVer IN docVers | MERGE (baseline)-[:SNAPSHOT_OF_DOCUMENT]->(docVer))
          FOREACH (secVer IN secVers | MERGE (baseline)-[:SNAPSHOT_OF_SECTION]->(secVer))
          FOREACH (infoVer IN infoVers | MERGE (baseline)-[:SNAPSHOT_OF_INFO]->(infoVer))
          FOREACH (surVer IN surVers | MERGE (baseline)-[:SNAPSHOT_OF_SURROGATE]->(surVer))
          FOREACH (linkVer IN linkVers | MERGE (baseline)-[:SNAPSHOT_OF_TRACE_LINK]->(linkVer))
          FOREACH (linksetVer IN linksetVers | MERGE (baseline)-[:SNAPSHOT_OF_LINKSET]->(linksetVer))
          FOREACH (diagVer IN diagVers | MERGE (baseline)-[:SNAPSHOT_OF_DIAGRAM]->(diagVer))
          FOREACH (blockVer IN blockVers | MERGE (baseline)-[:SNAPSHOT_OF_BLOCK]->(blockVer))
          FOREACH (connVer IN connVers | MERGE (baseline)-[:SNAPSHOT_OF_CONNECTOR]->(connVer))

          RETURN baseline.ref AS ref,
                 size(reqVers) AS reqCount,
                 size(docVers) AS docCount,
                 size(secVers) AS secCount,
                 size(infoVers) AS infoCount,
                 size(surVers) AS surCount,
                 size(linkVers) AS linkCount,
                 size(linksetVers) AS linksetCount,
                 size(diagVers) AS diagCount,
                 size(blockVers) AS blockCount,
                 size(connVers) AS connCount
        `,
        {
          baselineId: baseline.id,
          baselineCreatedAt: baseline.createdAt,
          tenantSlug: baseline.tenant,
          projectSlug: baseline.projectKey
        }
      );

      console.log(`[Migration 005] ✓ Upgraded baseline: ${baseline.ref}`);
    }

    console.log("[Migration 005] Migration completed successfully");
    console.log(`[Migration 005] Upgraded ${baselines.length} baseline(s) with version snapshots`);
  } catch (error) {
    console.error("[Migration 005] Migration failed:", error);
    throw error;
  } finally {
    await session.close();
  }
}

export async function migrate005Down(): Promise<void> {
  const session = getSession();

  try {
    console.log("[Migration 005] Starting rollback: Remove version snapshot properties and relationships from baselines");

    // Remove version count properties
    console.log("[Migration 005] Rollback Phase 1: Removing version count properties");
    await session.run(`
      MATCH (baseline:Baseline)
      REMOVE baseline.requirementVersionCount,
             baseline.documentVersionCount,
             baseline.documentSectionVersionCount,
             baseline.infoVersionCount,
             baseline.surrogateVersionCount,
             baseline.traceLinkVersionCount,
             baseline.linksetVersionCount,
             baseline.diagramVersionCount,
             baseline.blockVersionCount,
             baseline.connectorVersionCount
    `);

    // Remove all SNAPSHOT_OF relationships
    console.log("[Migration 005] Rollback Phase 2: Removing SNAPSHOT_OF relationships");
    await session.run(`
      MATCH (baseline:Baseline)-[rel:SNAPSHOT_OF_REQUIREMENT|SNAPSHOT_OF_DOCUMENT|SNAPSHOT_OF_SECTION|SNAPSHOT_OF_INFO|SNAPSHOT_OF_SURROGATE|SNAPSHOT_OF_TRACE_LINK|SNAPSHOT_OF_LINKSET|SNAPSHOT_OF_DIAGRAM|SNAPSHOT_OF_BLOCK|SNAPSHOT_OF_CONNECTOR]->()
      DELETE rel
    `);

    console.log("[Migration 005] Rollback completed successfully");
  } catch (error) {
    console.error("[Migration 005] Rollback failed:", error);
    throw error;
  } finally {
    await session.close();
  }
}

export const migration005 = {
  id: "005-upgrade-existing-baselines",
  description: "Upgrade existing baselines to include version snapshots and counts for comprehensive version history",
  up: migrate005Up,
  down: migrate005Down
};
