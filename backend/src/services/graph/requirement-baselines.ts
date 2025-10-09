import type { ManagedTransaction, Node as Neo4jNode } from "neo4j-driver";
import type { BaselineRecord, RequirementVersionRecord } from "../workspace.js";
import { slugify } from "../workspace.js";
import { getSession } from "./driver.js";
import type { InfoVersionRecord } from "./infos-versions.js";
import type { SurrogateReferenceVersionRecord } from "./surrogates-versions.js";
import type { DocumentVersionRecord } from "./documents/documents-versions.js";
import type { DocumentSectionVersionRecord } from "./documents/sections-versions.js";
import type { TraceLinkVersionRecord } from "./trace-versions.js";
import type { DocumentLinksetVersionRecord } from "./linksets-versions.js";
import type { ArchitectureDiagramVersionRecord } from "./architecture/diagrams-versions.js";
import type { ArchitectureBlockVersionRecord } from "./architecture/blocks-versions.js";
import type { ArchitectureConnectorVersionRecord } from "./architecture/connectors-versions.js";
import { toNumber } from "../../lib/neo4j-utils.js";

function mapBaseline(node: Neo4jNode): BaselineRecord {
  const props = node.properties as Record<string, unknown>;
  return {
    id: String(props.id),
    ref: String(props.ref),
    tenant: String(props.tenant),
    projectKey: String(props.projectKey),
    createdAt: String(props.createdAt),
    author: props.author ? String(props.author) : null,
    label: props.label ? String(props.label) : null,
    requirementRefs: Array.isArray(props.requirementRefs)
      ? (props.requirementRefs as string[])
      : [],
    // Version snapshot counts (using != null to handle 0 values correctly)
    requirementVersionCount: props.requirementVersionCount != null ? (typeof props.requirementVersionCount === 'number' ? props.requirementVersionCount : (props.requirementVersionCount as any).toNumber()) : undefined,
    documentVersionCount: props.documentVersionCount != null ? (typeof props.documentVersionCount === 'number' ? props.documentVersionCount : (props.documentVersionCount as any).toNumber()) : undefined,
    documentSectionVersionCount: props.documentSectionVersionCount != null ? (typeof props.documentSectionVersionCount === 'number' ? props.documentSectionVersionCount : (props.documentSectionVersionCount as any).toNumber()) : undefined,
    infoVersionCount: props.infoVersionCount != null ? (typeof props.infoVersionCount === 'number' ? props.infoVersionCount : (props.infoVersionCount as any).toNumber()) : undefined,
    surrogateVersionCount: props.surrogateVersionCount != null ? (typeof props.surrogateVersionCount === 'number' ? props.surrogateVersionCount : (props.surrogateVersionCount as any).toNumber()) : undefined,
    traceLinkVersionCount: props.traceLinkVersionCount != null ? (typeof props.traceLinkVersionCount === 'number' ? props.traceLinkVersionCount : (props.traceLinkVersionCount as any).toNumber()) : undefined,
    linksetVersionCount: props.linksetVersionCount != null ? (typeof props.linksetVersionCount === 'number' ? props.linksetVersionCount : (props.linksetVersionCount as any).toNumber()) : undefined,
    diagramVersionCount: props.diagramVersionCount != null ? (typeof props.diagramVersionCount === 'number' ? props.diagramVersionCount : (props.diagramVersionCount as any).toNumber()) : undefined,
    blockVersionCount: props.blockVersionCount != null ? (typeof props.blockVersionCount === 'number' ? props.blockVersionCount : (props.blockVersionCount as any).toNumber()) : undefined,
    connectorVersionCount: props.connectorVersionCount != null ? (typeof props.connectorVersionCount === 'number' ? props.connectorVersionCount : (props.connectorVersionCount as any).toNumber()) : undefined
  };
}

// Comprehensive baseline snapshot with all version data
export type BaselineSnapshot = {
  baseline: BaselineRecord;
  requirementVersions: RequirementVersionRecord[];
  documentVersions: DocumentVersionRecord[];
  documentSectionVersions: DocumentSectionVersionRecord[];
  infoVersions: InfoVersionRecord[];
  surrogateReferenceVersions: SurrogateReferenceVersionRecord[];
  traceLinkVersions: TraceLinkVersionRecord[];
  linksetVersions: DocumentLinksetVersionRecord[];
  diagramVersions: ArchitectureDiagramVersionRecord[];
  blockVersions: ArchitectureBlockVersionRecord[];
  connectorVersions: ArchitectureConnectorVersionRecord[];
};

// Helper functions to map version nodes to records
function mapRequirementVersion(node: Neo4jNode): RequirementVersionRecord {
  const v = node.properties;
  return {
    versionId: String(v.versionId),
    requirementId: String(v.requirementId),
    versionNumber: toNumber(v.versionNumber, 0),
    timestamp: String(v.timestamp),
    changedBy: String(v.changedBy),
    changeType: String(v.changeType) as "created" | "updated" | "archived" | "restored" | "deleted",
    changeDescription: v.changeDescription ? String(v.changeDescription) : undefined,
    text: String(v.text),
    pattern: v.pattern ? String(v.pattern) as any : undefined,
    verification: v.verification ? String(v.verification) as any : undefined,
    rationale: v.rationale ? String(v.rationale) : undefined,
    complianceStatus: v.complianceStatus ? String(v.complianceStatus) : undefined,
    complianceRationale: v.complianceRationale ? String(v.complianceRationale) : undefined,
    qaScore: v.qaScore !== null && v.qaScore !== undefined ? toNumber(v.qaScore, 0) : undefined,
    qaVerdict: v.qaVerdict ? String(v.qaVerdict) : undefined,
    suggestions: Array.isArray(v.suggestions) ? v.suggestions.map(String) : undefined,
    tags: Array.isArray(v.tags) ? v.tags.map(String) : undefined,
    attributes: v.attributes ? (v.attributes as Record<string, any>) : undefined,
    contentHash: String(v.contentHash)
  };
}

function mapDocumentVersion(node: Neo4jNode): DocumentVersionRecord {
  const v = node.properties;
  return {
    versionId: String(v.versionId),
    documentId: String(v.documentId),
    versionNumber: toNumber(v.versionNumber, 0),
    timestamp: String(v.timestamp),
    changedBy: String(v.changedBy),
    changeType: String(v.changeType) as "created" | "updated" | "deleted",
    changeDescription: v.changeDescription ? String(v.changeDescription) : undefined,
    slug: String(v.slug),
    name: String(v.name),
    description: v.description ? String(v.description) : undefined,
    contentHash: String(v.contentHash)
  };
}

function mapDocumentSectionVersion(node: Neo4jNode): DocumentSectionVersionRecord {
  const v = node.properties;
  return {
    versionId: String(v.versionId),
    sectionId: String(v.sectionId),
    versionNumber: toNumber(v.versionNumber, 0),
    timestamp: String(v.timestamp),
    changedBy: String(v.changedBy),
    changeType: String(v.changeType) as "created" | "updated" | "deleted",
    changeDescription: v.changeDescription ? String(v.changeDescription) : undefined,
    name: String(v.name),
    description: v.description ? String(v.description) : undefined,
    order: v.order !== null && v.order !== undefined ? toNumber(v.order, 0) : undefined,
    contentHash: String(v.contentHash)
  };
}

function mapInfoVersion(node: Neo4jNode): InfoVersionRecord {
  const v = node.properties;
  return {
    versionId: String(v.versionId),
    infoId: String(v.infoId),
    versionNumber: toNumber(v.versionNumber, 0),
    timestamp: String(v.timestamp),
    changedBy: String(v.changedBy),
    changeType: String(v.changeType) as "created" | "updated" | "deleted",
    changeDescription: v.changeDescription ? String(v.changeDescription) : undefined,
    ref: String(v.ref),
    text: String(v.text),
    title: v.title ? String(v.title) : undefined,
    sectionId: v.sectionId ? String(v.sectionId) : undefined,
    order: v.order !== null && v.order !== undefined ? toNumber(v.order, 0) : undefined,
    contentHash: String(v.contentHash)
  };
}

function mapSurrogateReferenceVersion(node: Neo4jNode): SurrogateReferenceVersionRecord {
  const v = node.properties;
  return {
    versionId: String(v.versionId),
    surrogateId: String(v.surrogateId),
    versionNumber: toNumber(v.versionNumber, 0),
    timestamp: String(v.timestamp),
    changedBy: String(v.changedBy),
    changeType: String(v.changeType) as "created" | "updated" | "deleted",
    changeDescription: v.changeDescription ? String(v.changeDescription) : undefined,
    slug: String(v.slug),
    caption: v.caption ? String(v.caption) : undefined,
    sectionId: v.sectionId ? String(v.sectionId) : undefined,
    order: v.order !== null && v.order !== undefined ? toNumber(v.order, 0) : undefined,
    contentHash: String(v.contentHash)
  };
}

function mapTraceLinkVersion(node: Neo4jNode): TraceLinkVersionRecord {
  const v = node.properties;
  return {
    versionId: String(v.versionId),
    traceLinkId: String(v.traceLinkId),
    versionNumber: toNumber(v.versionNumber, 0),
    timestamp: String(v.timestamp),
    changedBy: String(v.changedBy),
    changeType: String(v.changeType) as "created" | "updated" | "deleted",
    changeDescription: v.changeDescription ? String(v.changeDescription) : undefined,
    fromRequirementId: String(v.fromRequirementId),
    toRequirementId: String(v.toRequirementId),
    linkType: String(v.linkType),
    rationale: v.rationale ? String(v.rationale) : undefined,
    contentHash: String(v.contentHash)
  };
}

function mapDocumentLinksetVersion(node: Neo4jNode): DocumentLinksetVersionRecord {
  const v = node.properties;
  return {
    versionId: String(v.versionId),
    linksetId: String(v.linksetId),
    versionNumber: toNumber(v.versionNumber, 0),
    timestamp: String(v.timestamp),
    changedBy: String(v.changedBy),
    changeType: String(v.changeType) as "created" | "updated" | "deleted",
    changeDescription: v.changeDescription ? String(v.changeDescription) : undefined,
    fromDocumentSlug: String(v.fromDocumentSlug),
    toDocumentSlug: String(v.toDocumentSlug),
    linkType: String(v.linkType),
    description: v.description ? String(v.description) : undefined,
    contentHash: String(v.contentHash)
  };
}

function mapArchitectureDiagramVersion(node: Neo4jNode): ArchitectureDiagramVersionRecord {
  const v = node.properties;
  return {
    versionId: String(v.versionId),
    diagramId: String(v.diagramId),
    versionNumber: toNumber(v.versionNumber, 0),
    timestamp: String(v.timestamp),
    changedBy: String(v.changedBy),
    changeType: String(v.changeType) as "created" | "updated" | "deleted",
    changeDescription: v.changeDescription ? String(v.changeDescription) : undefined,
    name: String(v.name),
    description: v.description ? String(v.description) : undefined,
    view: String(v.view) as any,
    contentHash: String(v.contentHash)
  };
}

function mapArchitectureBlockVersion(node: Neo4jNode): ArchitectureBlockVersionRecord {
  const v = node.properties;
  return {
    versionId: String(v.versionId),
    blockId: String(v.blockId),
    versionNumber: toNumber(v.versionNumber, 0),
    timestamp: String(v.timestamp),
    changedBy: String(v.changedBy),
    changeType: String(v.changeType) as "created" | "updated" | "deleted",
    changeDescription: v.changeDescription ? String(v.changeDescription) : undefined,
    label: String(v.label),
    description: v.description ? String(v.description) : undefined,
    blockType: v.blockType ? String(v.blockType) : undefined,
    x: v.x !== null && v.x !== undefined ? toNumber(v.x, 0) : undefined,
    y: v.y !== null && v.y !== undefined ? toNumber(v.y, 0) : undefined,
    width: v.width !== null && v.width !== undefined ? toNumber(v.width, 0) : undefined,
    height: v.height !== null && v.height !== undefined ? toNumber(v.height, 0) : undefined,
    contentHash: String(v.contentHash)
  };
}

function mapArchitectureConnectorVersion(node: Neo4jNode): ArchitectureConnectorVersionRecord {
  const v = node.properties;
  return {
    versionId: String(v.versionId),
    connectorId: String(v.connectorId),
    versionNumber: toNumber(v.versionNumber, 0),
    timestamp: String(v.timestamp),
    changedBy: String(v.changedBy),
    changeType: String(v.changeType) as "created" | "updated" | "deleted",
    changeDescription: v.changeDescription ? String(v.changeDescription) : undefined,
    fromBlockId: String(v.fromBlockId),
    toBlockId: String(v.toBlockId),
    label: v.label ? String(v.label) : undefined,
    connectorType: v.connectorType ? String(v.connectorType) : undefined,
    contentHash: String(v.contentHash)
  };
}

export async function createBaseline(params: {
  tenant: string;
  projectKey: string;
  label?: string;
  author?: string;
}): Promise<BaselineRecord> {
  const tenantSlug = slugify(params.tenant);
  const projectSlug = slugify(params.projectKey);
  const now = new Date().toISOString();

  // Step 1: Generate baseline ref (needs write transaction to increment counter)
  let ref: string;
  {
    const refSession = getSession();
    try {
      ref = await refSession.executeWrite(async (tx: ManagedTransaction) => {
        const refQuery = `
          MERGE (tenant:Tenant {slug: $tenantSlug})
            ON CREATE SET tenant.createdAt = $now
          MERGE (project:Project {slug: $projectSlug, tenantSlug: $tenantSlug})
            ON CREATE SET project.key = $projectKey, project.createdAt = $now
          SET project.baselineCounter = coalesce(project.baselineCounter, 0) + 1
          WITH project, project.baselineCounter AS counter
          WITH counter,
               right('000' + toString(counter), 3) AS padded,
               toUpper(replace($projectSlug, '-', '')) AS upper
          RETURN 'BL-' + upper + '-' + padded AS ref
        `;

        const refRes = await tx.run(refQuery, {
          tenantSlug,
          projectSlug,
          projectKey: params.projectKey,
          now
        });

        if (refRes.records.length === 0) {
          throw new Error("Failed to generate baseline ref");
        }

        return refRes.records[0].get("ref");
      });
    } finally {
      await refSession.close();
    }
  }

  // Step 2: Collect all version data (read-only queries - NO transaction needed)
  // Helper function to run a query with its own session
  async function runQueryWithOwnSession(query: string, params: any): Promise<any> {
    const session = getSession();
    try {
      return await session.run(query, params);
    } finally {
      await session.close();
    }
  }

  // Query 2: Get all requirements (for backward compatibility)
  const reqQuery = `
      MATCH (project:Project {slug: $projectSlug, tenantSlug: $tenantSlug})
      OPTIONAL MATCH (project)-[:CONTAINS]->(directReq:Requirement)
      OPTIONAL MATCH (project)-[:HAS_DOCUMENT]->(:Document)-[:CONTAINS]->(docReq:Requirement)
      WITH collect(DISTINCT directReq) + collect(DISTINCT docReq) AS reqs
    RETURN [req IN reqs WHERE req IS NOT NULL] AS requirements
  `;

  // Declare variables outside so they're accessible in write transaction
  let requirements: any[];
  let reqVers: any[], docVers: any[], secVers: any[], infoVers: any[];
  let surVers: any[], linkVers: any[], linksetVers: any[];
  let diagVers: any[], blockVers: any[], connVers: any[];

  const reqRes = await runQueryWithOwnSession(reqQuery, { tenantSlug, projectSlug });
  requirements = reqRes.records[0]?.get("requirements") || [];

  // Query 3a: Get latest requirement versions (direct project requirements) - using MAX aggregation
  const reqVersDirectQuery = `
    MATCH (project:Project {slug: $projectSlug, tenantSlug: $tenantSlug})-[:CONTAINS]->(req:Requirement)-[:HAS_VERSION]->(ver:RequirementVersion)
    WITH req, max(ver.versionNumber) AS maxVer
    MATCH (req)-[:HAS_VERSION]->(latestVer:RequirementVersion)
    WHERE latestVer.versionNumber = maxVer
    RETURN collect(latestVer) AS versions
  `;

  // Query 3b: Get latest requirement versions (document requirements) - using MAX aggregation
  const reqVersDocQuery = `
    MATCH (project:Project {slug: $projectSlug, tenantSlug: $tenantSlug})-[:HAS_DOCUMENT]->(:Document)-[:CONTAINS]->(req:Requirement)-[:HAS_VERSION]->(ver:RequirementVersion)
    WITH req, max(ver.versionNumber) AS maxVer
    MATCH (req)-[:HAS_VERSION]->(latestVer:RequirementVersion)
    WHERE latestVer.versionNumber = maxVer
    RETURN collect(latestVer) AS versions
  `;

  // Define all version queries
  const docVersQuery = `
    MATCH (project:Project {slug: $projectSlug, tenantSlug: $tenantSlug})-[:HAS_DOCUMENT]->(doc:Document)-[:HAS_VERSION]->(ver:DocumentVersion)
    WITH doc, max(ver.versionNumber) AS maxVer
    MATCH (doc)-[:HAS_VERSION]->(latestVer:DocumentVersion)
    WHERE latestVer.versionNumber = maxVer
    RETURN collect(latestVer) AS versions
  `;

  const secVersQuery = `
    MATCH (project:Project {slug: $projectSlug, tenantSlug: $tenantSlug})-[:HAS_DOCUMENT]->(:Document)-[:HAS_SECTION]->(sec:DocumentSection)-[:HAS_VERSION]->(ver:DocumentSectionVersion)
    WITH sec, max(ver.versionNumber) AS maxVer
    MATCH (sec)-[:HAS_VERSION]->(latestVer:DocumentSectionVersion)
    WHERE latestVer.versionNumber = maxVer
    RETURN collect(latestVer) AS versions
  `;

  const infoVersQuery = `
    MATCH (project:Project {slug: $projectSlug, tenantSlug: $tenantSlug})-[:HAS_DOCUMENT]->(:Document)-[:HAS_SECTION]->(:DocumentSection)-[:CONTAINS]->(info:Info)-[:HAS_VERSION]->(ver:InfoVersion)
    WITH info, max(ver.versionNumber) AS maxVer
    MATCH (info)-[:HAS_VERSION]->(latestVer:InfoVersion)
    WHERE latestVer.versionNumber = maxVer
    RETURN collect(latestVer) AS versions
  `;

  const surVersQuery = `
    MATCH (project:Project {slug: $projectSlug, tenantSlug: $tenantSlug})-[:HAS_DOCUMENT]->(:Document)-[:HAS_SECTION]->(:DocumentSection)-[:CONTAINS]->(sur:SurrogateReference)-[:HAS_VERSION]->(ver:SurrogateReferenceVersion)
    WITH sur, max(ver.versionNumber) AS maxVer
    MATCH (sur)-[:HAS_VERSION]->(latestVer:SurrogateReferenceVersion)
    WHERE latestVer.versionNumber = maxVer
    RETURN collect(latestVer) AS versions
  `;

  const linkVersQuery = `
    MATCH (project:Project {slug: $projectSlug, tenantSlug: $tenantSlug})-[:HAS_TRACE_LINK]->(link:TraceLink)-[:HAS_VERSION]->(ver:TraceLinkVersion)
    WITH link, max(ver.versionNumber) AS maxVer
    MATCH (link)-[:HAS_VERSION]->(latestVer:TraceLinkVersion)
    WHERE latestVer.versionNumber = maxVer
    RETURN collect(latestVer) AS versions
  `;

  const linksetVersQuery = `
    MATCH (project:Project {slug: $projectSlug, tenantSlug: $tenantSlug})-[:HAS_LINKSET]->(linkset:DocumentLinkset)-[:HAS_VERSION]->(ver:DocumentLinksetVersion)
    WITH linkset, max(ver.versionNumber) AS maxVer
    MATCH (linkset)-[:HAS_VERSION]->(latestVer:DocumentLinksetVersion)
    WHERE latestVer.versionNumber = maxVer
    RETURN collect(latestVer) AS versions
  `;

  const diagVersQuery = `
    MATCH (project:Project {slug: $projectSlug, tenantSlug: $tenantSlug})-[:HAS_ARCHITECTURE_DIAGRAM]->(diag:ArchitectureDiagram)-[:HAS_VERSION]->(ver:ArchitectureDiagramVersion)
    WITH diag, max(ver.versionNumber) AS maxVer
    MATCH (diag)-[:HAS_VERSION]->(latestVer:ArchitectureDiagramVersion)
    WHERE latestVer.versionNumber = maxVer
    RETURN collect(latestVer) AS versions
  `;

  const blockVersQuery = `
    MATCH (project:Project {slug: $projectSlug, tenantSlug: $tenantSlug})-[:HAS_ARCHITECTURE_BLOCK]->(block:ArchitectureBlock)-[:HAS_VERSION]->(ver:ArchitectureBlockVersion)
    WITH block, max(ver.versionNumber) AS maxVer
    MATCH (block)-[:HAS_VERSION]->(latestVer:ArchitectureBlockVersion)
    WHERE latestVer.versionNumber = maxVer
    RETURN collect(latestVer) AS versions
  `;

  const connVersQuery = `
    MATCH (project:Project {slug: $projectSlug, tenantSlug: $tenantSlug})-[:HAS_ARCHITECTURE_CONNECTOR]->(conn:ArchitectureConnector)-[:HAS_VERSION]->(ver:ArchitectureConnectorVersion)
    WITH conn, max(ver.versionNumber) AS maxVer
    MATCH (conn)-[:HAS_VERSION]->(latestVer:ArchitectureConnectorVersion)
    WHERE latestVer.versionNumber = maxVer
    RETURN collect(latestVer) AS versions
  `;

  // Run version queries sequentially
  const reqVersDirectRes = await runQueryWithOwnSession(reqVersDirectQuery, { tenantSlug, projectSlug });
  const reqVersDocRes = await runQueryWithOwnSession(reqVersDocQuery, { tenantSlug, projectSlug });
  const docVersRes = await runQueryWithOwnSession(docVersQuery, { tenantSlug, projectSlug });
  const secVersRes = await runQueryWithOwnSession(secVersQuery, { tenantSlug, projectSlug });
  const infoVersRes = await runQueryWithOwnSession(infoVersQuery, { tenantSlug, projectSlug });
  const surVersRes = await runQueryWithOwnSession(surVersQuery, { tenantSlug, projectSlug });
  const linkVersRes = await runQueryWithOwnSession(linkVersQuery, { tenantSlug, projectSlug });
  const linksetVersRes = await runQueryWithOwnSession(linksetVersQuery, { tenantSlug, projectSlug });
  const diagVersRes = await runQueryWithOwnSession(diagVersQuery, { tenantSlug, projectSlug });
  const blockVersRes = await runQueryWithOwnSession(blockVersQuery, { tenantSlug, projectSlug });
  const connVersRes = await runQueryWithOwnSession(connVersQuery, { tenantSlug, projectSlug });

  const reqVersDirect = reqVersDirectRes.records[0]?.get("versions") || [];
  const reqVersDoc = reqVersDocRes.records[0]?.get("versions") || [];

  // Combine and deduplicate requirement versions by versionId
  const reqVersMap = new Map();
  [...reqVersDirect, ...reqVersDoc].forEach((v: any) => {
    const versionId = v.properties.versionId;
    if (!reqVersMap.has(versionId)) {
      reqVersMap.set(versionId, v);
    }
  });
  reqVers = Array.from(reqVersMap.values());

  docVers = docVersRes.records[0]?.get("versions") || [];
  secVers = secVersRes.records[0]?.get("versions") || [];
  infoVers = infoVersRes.records[0]?.get("versions") || [];
  surVers = surVersRes.records[0]?.get("versions") || [];
  linkVers = linkVersRes.records[0]?.get("versions") || [];
  linksetVers = linksetVersRes.records[0]?.get("versions") || [];
  diagVers = diagVersRes.records[0]?.get("versions") || [];
  blockVers = blockVersRes.records[0]?.get("versions") || [];
  connVers = connVersRes.records[0]?.get("versions") || [];

  // Step 3: Create baseline node (without version links yet)
  const writeSession = getSession();
  try {
    const baselineId = `${tenantSlug}:${projectSlug}:${ref}`;

    // Create baseline node only (no version links yet - they cause memory issues)
    await writeSession.executeWrite(async (tx: ManagedTransaction) => {
      const createQuery = `
        MATCH (project:Project {slug: $projectSlug, tenantSlug: $tenantSlug})
        CREATE (baseline:Baseline {
          id: $baselineId,
          ref: $ref,
          tenant: $tenantSlug,
          projectKey: $projectSlug,
          createdAt: $now,
          author: $author,
          label: $label,
          requirementRefs: $requirementRefs,
          requirementVersionCount: $requirementVersionCount,
          documentVersionCount: $documentVersionCount,
          documentSectionVersionCount: $documentSectionVersionCount,
          infoVersionCount: $infoVersionCount,
          surrogateVersionCount: $surrogateVersionCount,
          traceLinkVersionCount: $traceLinkVersionCount,
          linksetVersionCount: $linksetVersionCount,
          diagramVersionCount: $diagramVersionCount,
          blockVersionCount: $blockVersionCount,
          connectorVersionCount: $connectorVersionCount
        })
        MERGE (project)-[:HAS_BASELINE]->(baseline)
        RETURN baseline
      `;

      const createRes = await tx.run(createQuery, {
        tenantSlug,
        projectSlug,
        baselineId,
        ref: String(ref),
        author: params.author ?? null,
        label: params.label ?? null,
        requirementRefs: requirements.map((r: any) => String(r.properties.ref)),
        requirementVersionCount: reqVers.length,
        documentVersionCount: docVers.length,
        documentSectionVersionCount: secVers.length,
        infoVersionCount: infoVers.length,
        surrogateVersionCount: surVers.length,
        traceLinkVersionCount: linkVers.length,
        linksetVersionCount: linksetVers.length,
        diagramVersionCount: diagVers.length,
        blockVersionCount: blockVers.length,
        connectorVersionCount: connVers.length,
        now
      });

      if (createRes.records.length === 0) {
        throw new Error("Failed to create baseline node");
      }
    });

    // Step 4: Link versions in small batches to avoid memory issues
    // Helper to link versions
    async function linkVersions(versionIds: string[], relType: string) {
      if (versionIds.length === 0) return;

      await writeSession.executeWrite(async (tx: ManagedTransaction) => {
        await tx.run(`
          MATCH (baseline:Baseline {id: $baselineId})
          UNWIND $versionIds AS versionId
          MATCH (ver {versionId: versionId})
          MERGE (baseline)-[:${relType}]->(ver)
        `, { baselineId, versionIds });
      });
    }

    await linkVersions(reqVers.map((v: any) => String(v.properties.versionId)), "SNAPSHOT_OF_REQUIREMENT");
    await linkVersions(docVers.map((v: any) => String(v.properties.versionId)), "SNAPSHOT_OF_DOCUMENT");
    await linkVersions(secVers.map((v: any) => String(v.properties.versionId)), "SNAPSHOT_OF_SECTION");
    await linkVersions(infoVers.map((v: any) => String(v.properties.versionId)), "SNAPSHOT_OF_INFO");
    await linkVersions(surVers.map((v: any) => String(v.properties.versionId)), "SNAPSHOT_OF_SURROGATE");
    await linkVersions(linkVers.map((v: any) => String(v.properties.versionId)), "SNAPSHOT_OF_TRACE_LINK");
    await linkVersions(linksetVers.map((v: any) => String(v.properties.versionId)), "SNAPSHOT_OF_LINKSET");
    await linkVersions(diagVers.map((v: any) => String(v.properties.versionId)), "SNAPSHOT_OF_DIAGRAM");
    await linkVersions(blockVers.map((v: any) => String(v.properties.versionId)), "SNAPSHOT_OF_BLOCK");
    await linkVersions(connVers.map((v: any) => String(v.properties.versionId)), "SNAPSHOT_OF_CONNECTOR");

    // Fetch and return the created baseline
    const result = await writeSession.executeRead(async (tx: ManagedTransaction) => {
      const res = await tx.run(`
        MATCH (baseline:Baseline {id: $baselineId})
        RETURN baseline
      `, { baselineId });

      if (res.records.length === 0) {
        throw new Error("Baseline was created but could not be retrieved");
      }

      const node = res.records[0].get("baseline") as Neo4jNode;
      return mapBaseline(node);
    });

    return result;
  } finally {
    await writeSession.close();
  }
}

export async function listBaselines(tenant: string, projectKey: string): Promise<BaselineRecord[]> {
  const tenantSlug = slugify(tenant);
  const projectSlug = slugify(projectKey);
  const session = getSession();

  try {
    const result = await session.run(
      `
        MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project {slug: $projectSlug})-[:HAS_BASELINE]->(baseline:Baseline)
        RETURN baseline
        ORDER BY baseline.createdAt DESC
      `,
      { tenantSlug, projectSlug }
    );

    const baselines: BaselineRecord[] = [];
    for (const record of result.records) {
      const node = record.get("baseline") as Neo4jNode;
      baselines.push(mapBaseline(node));
    }

    return baselines;
  } finally {
    await session.close();
  }
}

/**
 * Get complete baseline snapshot including all version data
 */
export async function getBaselineDetails(
  tenant: string,
  projectKey: string,
  baselineRef: string
): Promise<BaselineSnapshot> {
  const tenantSlug = slugify(tenant);
  const projectSlug = slugify(projectKey);
  const session = getSession();

  try {
    const result = await session.run(
      `
        MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project {slug: $projectSlug})-[:HAS_BASELINE]->(baseline:Baseline {ref: $baselineRef})

        // Get all version snapshots
        OPTIONAL MATCH (baseline)-[:SNAPSHOT_OF_REQUIREMENT]->(reqVer:RequirementVersion)
        OPTIONAL MATCH (baseline)-[:SNAPSHOT_OF_DOCUMENT]->(docVer:DocumentVersion)
        OPTIONAL MATCH (baseline)-[:SNAPSHOT_OF_SECTION]->(secVer:DocumentSectionVersion)
        OPTIONAL MATCH (baseline)-[:SNAPSHOT_OF_INFO]->(infoVer:InfoVersion)
        OPTIONAL MATCH (baseline)-[:SNAPSHOT_OF_SURROGATE]->(surVer:SurrogateReferenceVersion)
        OPTIONAL MATCH (baseline)-[:SNAPSHOT_OF_TRACE_LINK]->(linkVer:TraceLinkVersion)
        OPTIONAL MATCH (baseline)-[:SNAPSHOT_OF_LINKSET]->(linksetVer:DocumentLinksetVersion)
        OPTIONAL MATCH (baseline)-[:SNAPSHOT_OF_DIAGRAM]->(diagVer:ArchitectureDiagramVersion)
        OPTIONAL MATCH (baseline)-[:SNAPSHOT_OF_BLOCK]->(blockVer:ArchitectureBlockVersion)
        OPTIONAL MATCH (baseline)-[:SNAPSHOT_OF_CONNECTOR]->(connVer:ArchitectureConnectorVersion)

        RETURN baseline,
               collect(DISTINCT reqVer) AS requirementVersions,
               collect(DISTINCT docVer) AS documentVersions,
               collect(DISTINCT secVer) AS documentSectionVersions,
               collect(DISTINCT infoVer) AS infoVersions,
               collect(DISTINCT surVer) AS surrogateReferenceVersions,
               collect(DISTINCT linkVer) AS traceLinkVersions,
               collect(DISTINCT linksetVer) AS linksetVersions,
               collect(DISTINCT diagVer) AS diagramVersions,
               collect(DISTINCT blockVer) AS blockVersions,
               collect(DISTINCT connVer) AS connectorVersions
      `,
      { tenantSlug, projectSlug, baselineRef }
    );

    if (result.records.length === 0) {
      throw new Error(`Baseline not found: ${baselineRef}`);
    }

    const record = result.records[0];
    const baselineNode = record.get("baseline") as Neo4jNode;
    const baseline = mapBaseline(baselineNode);

    // Map all version nodes
    const requirementVersions = (record.get("requirementVersions") as Neo4jNode[])
      .filter(node => node !== null)
      .map(mapRequirementVersion);

    const documentVersions = (record.get("documentVersions") as Neo4jNode[])
      .filter(node => node !== null)
      .map(mapDocumentVersion);

    const documentSectionVersions = (record.get("documentSectionVersions") as Neo4jNode[])
      .filter(node => node !== null)
      .map(mapDocumentSectionVersion);

    const infoVersions = (record.get("infoVersions") as Neo4jNode[])
      .filter(node => node !== null)
      .map(mapInfoVersion);

    const surrogateReferenceVersions = (record.get("surrogateReferenceVersions") as Neo4jNode[])
      .filter(node => node !== null)
      .map(mapSurrogateReferenceVersion);

    const traceLinkVersions = (record.get("traceLinkVersions") as Neo4jNode[])
      .filter(node => node !== null)
      .map(mapTraceLinkVersion);

    const linksetVersions = (record.get("linksetVersions") as Neo4jNode[])
      .filter(node => node !== null)
      .map(mapDocumentLinksetVersion);

    const diagramVersions = (record.get("diagramVersions") as Neo4jNode[])
      .filter(node => node !== null)
      .map(mapArchitectureDiagramVersion);

    const blockVersions = (record.get("blockVersions") as Neo4jNode[])
      .filter(node => node !== null)
      .map(mapArchitectureBlockVersion);

    const connectorVersions = (record.get("connectorVersions") as Neo4jNode[])
      .filter(node => node !== null)
      .map(mapArchitectureConnectorVersion);

    return {
      baseline,
      requirementVersions,
      documentVersions,
      documentSectionVersions,
      infoVersions,
      surrogateReferenceVersions,
      traceLinkVersions,
      linksetVersions,
      diagramVersions,
      blockVersions,
      connectorVersions
    };
  } finally {
    await session.close();
  }
}

/**
 * Comparison result for a single entity type
 */
export type EntityComparison<T> = {
  added: T[];      // Entities in 'to' but not in 'from'
  removed: T[];    // Entities in 'from' but not in 'to'
  modified: T[];   // Entities with different contentHash
  unchanged: T[];  // Entities with same contentHash
};

/**
 * Complete baseline comparison across all entity types
 */
export type BaselineComparison = {
  fromBaseline: BaselineRecord;
  toBaseline: BaselineRecord;
  requirements: EntityComparison<RequirementVersionRecord>;
  documents: EntityComparison<DocumentVersionRecord>;
  documentSections: EntityComparison<DocumentSectionVersionRecord>;
  infos: EntityComparison<InfoVersionRecord>;
  surrogateReferences: EntityComparison<SurrogateReferenceVersionRecord>;
  traceLinks: EntityComparison<TraceLinkVersionRecord>;
  linksets: EntityComparison<DocumentLinksetVersionRecord>;
  diagrams: EntityComparison<ArchitectureDiagramVersionRecord>;
  blocks: EntityComparison<ArchitectureBlockVersionRecord>;
  connectors: EntityComparison<ArchitectureConnectorVersionRecord>;
};

/**
 * Helper function to compare entity arrays by entity ID and content hash
 */
function compareEntities<T extends { contentHash: string }>(
  fromEntities: T[],
  toEntities: T[],
  getEntityId: (entity: T) => string
): EntityComparison<T> {
  const fromMap = new Map<string, T>();
  const toMap = new Map<string, T>();

  fromEntities.forEach(e => fromMap.set(getEntityId(e), e));
  toEntities.forEach(e => toMap.set(getEntityId(e), e));

  const added: T[] = [];
  const removed: T[] = [];
  const modified: T[] = [];
  const unchanged: T[] = [];

  // Find added and modified/unchanged
  toEntities.forEach(toEntity => {
    const id = getEntityId(toEntity);
    const fromEntity = fromMap.get(id);

    if (!fromEntity) {
      added.push(toEntity);
    } else if (fromEntity.contentHash !== toEntity.contentHash) {
      modified.push(toEntity);
    } else {
      unchanged.push(toEntity);
    }
  });

  // Find removed
  fromEntities.forEach(fromEntity => {
    const id = getEntityId(fromEntity);
    if (!toMap.has(id)) {
      removed.push(fromEntity);
    }
  });

  return { added, removed, modified, unchanged };
}

/**
 * Compare two baselines and return comprehensive diff
 */
export async function compareBaselines(
  tenant: string,
  projectKey: string,
  fromBaselineRef: string,
  toBaselineRef: string
): Promise<BaselineComparison> {
  // Get both baseline snapshots
  const fromSnapshot = await getBaselineDetails(tenant, projectKey, fromBaselineRef);
  const toSnapshot = await getBaselineDetails(tenant, projectKey, toBaselineRef);

  // Compare each entity type
  const requirements = compareEntities(
    fromSnapshot.requirementVersions,
    toSnapshot.requirementVersions,
    (e) => e.requirementId
  );

  const documents = compareEntities(
    fromSnapshot.documentVersions,
    toSnapshot.documentVersions,
    (e) => e.documentId
  );

  const documentSections = compareEntities(
    fromSnapshot.documentSectionVersions,
    toSnapshot.documentSectionVersions,
    (e) => e.sectionId
  );

  const infos = compareEntities(
    fromSnapshot.infoVersions,
    toSnapshot.infoVersions,
    (e) => e.infoId
  );

  const surrogateReferences = compareEntities(
    fromSnapshot.surrogateReferenceVersions,
    toSnapshot.surrogateReferenceVersions,
    (e) => e.surrogateId
  );

  const traceLinks = compareEntities(
    fromSnapshot.traceLinkVersions,
    toSnapshot.traceLinkVersions,
    (e) => e.traceLinkId
  );

  const linksets = compareEntities(
    fromSnapshot.linksetVersions,
    toSnapshot.linksetVersions,
    (e) => e.linksetId
  );

  const diagrams = compareEntities(
    fromSnapshot.diagramVersions,
    toSnapshot.diagramVersions,
    (e) => e.diagramId
  );

  const blocks = compareEntities(
    fromSnapshot.blockVersions,
    toSnapshot.blockVersions,
    (e) => e.blockId
  );

  const connectors = compareEntities(
    fromSnapshot.connectorVersions,
    toSnapshot.connectorVersions,
    (e) => e.connectorId
  );

  return {
    fromBaseline: fromSnapshot.baseline,
    toBaseline: toSnapshot.baseline,
    requirements,
    documents,
    documentSections,
    infos,
    surrogateReferences,
    traceLinks,
    linksets,
    diagrams,
    blocks,
    connectors
  };
}
