#!/usr/bin/env tsx
import type { Node as Neo4jNode, Relationship as Neo4jRelationship } from "neo4j-driver";
import { initGraph, closeGraph, getSession } from "../services/graph/driver.js";
import { toNumber } from "../lib/neo4j-utils.js";
import {
  createRequirementVersion,
  generateRequirementContentHash
} from "../services/graph/requirements/requirements-versions.js";
import {
  createDocumentVersion,
  generateDocumentContentHash
} from "../services/graph/documents/documents-versions.js";
import {
  createDocumentSectionVersion,
  generateDocumentSectionContentHash
} from "../services/graph/documents/sections-versions.js";
import {
  createInfoVersion,
  generateInfoContentHash
} from "../services/graph/infos-versions.js";
import {
  createSurrogateReferenceVersion,
  generateSurrogateContentHash
} from "../services/graph/surrogates-versions.js";
import {
  createTraceLinkVersion,
  generateTraceLinkContentHash
} from "../services/graph/trace-versions.js";
import {
  createDocumentLinksetVersion,
  generateDocumentLinksetContentHash
} from "../services/graph/linksets-versions.js";
import {
  createArchitectureDiagramVersion,
  generateArchitectureDiagramContentHash
} from "../services/graph/architecture/diagrams-versions.js";
import {
  createArchitectureBlockVersion,
  generateArchitectureBlockContentHash
} from "../services/graph/architecture/blocks-versions.js";
import {
  createArchitectureConnectorVersion,
  generateArchitectureConnectorContentHash
} from "../services/graph/architecture/connectors-versions.js";
import type { BlockPortRecord, BlockPortOverrideRecord } from "../services/graph/architecture/types.js";

const BACKFILL_USER = "version-history-backfill";

type RequirementRow = {
  node: Neo4jNode;
  tenantSlug: string;
  projectSlug: string;
};

type DocumentRow = {
  node: Neo4jNode;
  tenantSlug: string;
  projectSlug: string;
};

type SectionRow = DocumentRow & {
  documentSlug?: string;
  relationship?: Neo4jRelationship;
};

type InfoRow = {
  node: Neo4jNode;
  tenantSlug: string;
  projectSlug: string;
  sectionId: string;
  relOrder?: number;
};

type SurrogateRow = InfoRow;

type TraceLinkRow = {
  node: Neo4jNode;
  tenantSlug: string;
  projectSlug: string;
};

type LinksetRow = TraceLinkRow;

type DiagramRow = TraceLinkRow;

type BlockRow = {
  block: Neo4jNode;
  rel?: Neo4jRelationship | null;
  tenantSlug: string;
  projectSlug: string;
  diagramId: string;
  diagramName?: string;
  documentIds: string[];
};

type ConnectorRow = {
  node: Neo4jNode;
  tenantSlug: string;
  projectSlug: string;
  diagramId: string;
  documentIds: string[];
};

function parseStringArray(value: unknown): string[] {
  if (!value) {return [];} // null/undefined -> []
  if (Array.isArray(value)) {
    return value.map(String);
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed.map((entry: unknown) => String(entry));
      }
    } catch {
      return value.length ? value.split(",").map(entry => entry.trim()).filter(Boolean) : [];
    }
  }
  return [];
}

function parseJsonObject<T>(value: unknown): T | undefined {
  if (!value) {return undefined;}
  if (typeof value === "object" && !Array.isArray(value)) {
    return value as T;
  }
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function asString(value: unknown, fallback = ""): string {
  if (value === null || value === undefined) {return fallback;}
  if (typeof value === "string") {return value;}
  return String(value);
}

function asNumber(value: unknown, fallback = 0): number {
  if (value === null || value === undefined) {return fallback;}
  if (typeof value === "number") {return value;}
  if (typeof value === "bigint") {return Number(value);
  }
  if (typeof value === "object" && value && "toNumber" in value && typeof (value as any).toNumber === "function") {
    return Number((value as any).toNumber());
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function fetchRequirementRows(): Promise<RequirementRow[]> {
  const session = getSession();
  try {
    const result = await session.run(`
      MATCH (tenant:Tenant)-[:OWNS]->(project:Project)
      MATCH (req:Requirement)
      WHERE NOT (req)-[:HAS_VERSION]->(:RequirementVersion)
        AND ((project)-[:CONTAINS]->(req) OR EXISTS {
          MATCH (project)-[:HAS_DOCUMENT]->(:Document)-[:CONTAINS]->(req)
        })
      RETURN req, tenant.slug AS tenantSlug, project.slug AS projectSlug
    `);
    const seen = new Map<string, RequirementRow>();
    for (const record of result.records) {
      const node = record.get("req") as Neo4jNode;
      if (!node) {continue;}
      const id = asString(node.properties.id);
      if (!id) {continue;}
      if (!seen.has(id)) {
        seen.set(id, {
          node,
          tenantSlug: asString(record.get("tenantSlug")),
          projectSlug: asString(record.get("projectSlug"))
        });
      }
    }
    return Array.from(seen.values());
  } finally {
    await session.close();
  }
}

async function fetchDocumentRows(): Promise<DocumentRow[]> {
  const session = getSession();
  try {
    const result = await session.run(`
      MATCH (tenant:Tenant)-[:OWNS]->(project:Project)-[:HAS_DOCUMENT]->(doc:Document)
      WHERE NOT (doc)-[:HAS_VERSION]->(:DocumentVersion)
      RETURN doc, tenant.slug AS tenantSlug, project.slug AS projectSlug
    `);
    return result.records.map(record => ({
      node: record.get("doc") as Neo4jNode,
      tenantSlug: asString(record.get("tenantSlug")),
      projectSlug: asString(record.get("projectSlug"))
    })).filter(row => row.node);
  } finally {
    await session.close();
  }
}

async function fetchSectionRows(): Promise<SectionRow[]> {
  const session = getSession();
  try {
    const result = await session.run(`
      MATCH (tenant:Tenant)-[:OWNS]->(project:Project)-[:HAS_DOCUMENT]->(doc:Document)-[rel:HAS_SECTION]->(section:DocumentSection)
      WHERE NOT (section)-[:HAS_VERSION]->(:DocumentSectionVersion)
      RETURN section, rel, tenant.slug AS tenantSlug, project.slug AS projectSlug, doc.slug AS documentSlug
    `);
    return result.records.map(record => ({
      node: record.get("section") as Neo4jNode,
      relationship: record.get("rel") as Neo4jRelationship,
      tenantSlug: asString(record.get("tenantSlug")),
      projectSlug: asString(record.get("projectSlug")),
      documentSlug: asString(record.get("documentSlug"))
    })).filter(row => row.node);
  } finally {
    await session.close();
  }
}

async function fetchInfoRows(): Promise<InfoRow[]> {
  const session = getSession();
  try {
    const result = await session.run(`
      MATCH (tenant:Tenant)-[:OWNS]->(project:Project)-[:HAS_DOCUMENT]->(:Document)-[:HAS_SECTION]->(section:DocumentSection)-[rel:CONTAINS]->(info:Info)
      WHERE NOT (info)-[:HAS_VERSION]->(:InfoVersion)
      RETURN info, rel, section.id AS sectionId, tenant.slug AS tenantSlug, project.slug AS projectSlug
    `);
    return result.records.map(record => ({
      node: record.get("info") as Neo4jNode,
      sectionId: asString(record.get("sectionId")),
      tenantSlug: asString(record.get("tenantSlug")),
      projectSlug: asString(record.get("projectSlug")),
      relOrder: record.get("rel") ? asNumber((record.get("rel") as Neo4jRelationship).properties?.order) : undefined
    })).filter(row => row.node);
  } finally {
    await session.close();
  }
}

async function fetchSurrogateRows(): Promise<SurrogateRow[]> {
  const session = getSession();
  try {
    const result = await session.run(`
      MATCH (tenant:Tenant)-[:OWNS]->(project:Project)-[:HAS_DOCUMENT]->(:Document)-[:HAS_SECTION]->(section:DocumentSection)-[rel:CONTAINS]->(sur:SurrogateReference)
      WHERE NOT (sur)-[:HAS_VERSION]->(:SurrogateReferenceVersion)
      RETURN sur, rel, section.id AS sectionId, tenant.slug AS tenantSlug, project.slug AS projectSlug
    `);
    return result.records.map(record => ({
      node: record.get("sur") as Neo4jNode,
      sectionId: asString(record.get("sectionId")),
      tenantSlug: asString(record.get("tenantSlug")),
      projectSlug: asString(record.get("projectSlug")),
      relOrder: record.get("rel") ? asNumber((record.get("rel") as Neo4jRelationship).properties?.order) : undefined
    })).filter(row => row.node);
  } finally {
    await session.close();
  }
}

async function fetchTraceLinkRows(): Promise<TraceLinkRow[]> {
  const session = getSession();
  try {
    const result = await session.run(`
      MATCH (tenant:Tenant)-[:OWNS]->(project:Project)-[:HAS_TRACE_LINK]->(link:TraceLink)
      WHERE NOT (link)-[:HAS_VERSION]->(:TraceLinkVersion)
      RETURN link, tenant.slug AS tenantSlug, project.slug AS projectSlug
    `);
    return result.records.map(record => ({
      node: record.get("link") as Neo4jNode,
      tenantSlug: asString(record.get("tenantSlug")),
      projectSlug: asString(record.get("projectSlug"))
    })).filter(row => row.node);
  } finally {
    await session.close();
  }
}

async function fetchLinksetRows(): Promise<LinksetRow[]> {
  const session = getSession();
  try {
    const result = await session.run(`
      MATCH (tenant:Tenant)-[:OWNS]->(project:Project)-[:HAS_LINKSET]->(linkset:DocumentLinkset)
      WHERE NOT (linkset)-[:HAS_VERSION]->(:DocumentLinksetVersion)
      RETURN linkset, tenant.slug AS tenantSlug, project.slug AS projectSlug
    `);
    return result.records.map(record => ({
      node: record.get("linkset") as Neo4jNode,
      tenantSlug: asString(record.get("tenantSlug")),
      projectSlug: asString(record.get("projectSlug"))
    })).filter(row => row.node);
  } finally {
    await session.close();
  }
}

async function fetchDiagramRows(): Promise<DiagramRow[]> {
  const session = getSession();
  try {
    const result = await session.run(`
      MATCH (tenant:Tenant)-[:OWNS]->(project:Project)-[:HAS_ARCHITECTURE_DIAGRAM]->(diagram:ArchitectureDiagram)
      WHERE NOT (diagram)-[:HAS_VERSION]->(:ArchitectureDiagramVersion)
      RETURN diagram, tenant.slug AS tenantSlug, project.slug AS projectSlug
    `);
    return result.records.map(record => ({
      node: record.get("diagram") as Neo4jNode,
      tenantSlug: asString(record.get("tenantSlug")),
      projectSlug: asString(record.get("projectSlug"))
    })).filter(row => row.node);
  } finally {
    await session.close();
  }
}

async function fetchBlockRows(): Promise<BlockRow[]> {
  const session = getSession();
  try {
    const result = await session.run(`
      MATCH (tenant:Tenant)-[:OWNS]->(project:Project)-[:HAS_ARCHITECTURE_DIAGRAM]->(diagram:ArchitectureDiagram)-[rel:HAS_BLOCK]->(block:ArchitectureBlock)
      WHERE NOT EXISTS {
        MATCH (block)-[:HAS_VERSION]->(blockVer:ArchitectureBlockVersion)
        WHERE blockVer.diagramId = diagram.id
      }
      OPTIONAL MATCH (block)-[:LINKED_DOCUMENT]->(doc:Document)
      WITH tenant, project, diagram, rel, block, collect(DISTINCT doc.id) AS documentIds
      RETURN block, rel, diagram, tenant.slug AS tenantSlug, project.slug AS projectSlug, documentIds
    `);
    return result.records.map(record => ({
      block: record.get("block") as Neo4jNode,
      rel: record.get("rel") as Neo4jRelationship,
      tenantSlug: asString(record.get("tenantSlug")),
      projectSlug: asString(record.get("projectSlug")),
      diagramId: asString((record.get("diagram") as Neo4jNode)?.properties?.id),
      diagramName: asString((record.get("diagram") as Neo4jNode)?.properties?.name),
      documentIds: parseStringArray(record.get("documentIds"))
    })).filter(row => row.block && row.diagramId);
  } finally {
    await session.close();
  }
}

async function fetchConnectorRows(): Promise<ConnectorRow[]> {
  const session = getSession();
  try {
    const result = await session.run(`
      MATCH (tenant:Tenant)-[:OWNS]->(project:Project)-[:HAS_ARCHITECTURE_DIAGRAM]->(diagram:ArchitectureDiagram)-[:HAS_CONNECTOR]->(connector:ArchitectureConnector)
      WHERE NOT (connector)-[:HAS_VERSION]->(:ArchitectureConnectorVersion)
      OPTIONAL MATCH (connector)-[:LINKED_DOCUMENT]->(doc:Document)
      WITH tenant, project, diagram, connector, collect(DISTINCT doc.id) AS documentIds
      RETURN connector, diagram.id AS diagramId, tenant.slug AS tenantSlug, project.slug AS projectSlug, documentIds
    `);
    return result.records.map(record => ({
      node: record.get("connector") as Neo4jNode,
      diagramId: asString(record.get("diagramId")),
      tenantSlug: asString(record.get("tenantSlug")),
      projectSlug: asString(record.get("projectSlug")),
      documentIds: parseStringArray(record.get("documentIds"))
    })).filter(row => row.node && row.diagramId);
  } finally {
    await session.close();
  }
}

async function backfillRequirements(): Promise<number> {
  const rows = await fetchRequirementRows();
  if (!rows.length) {return 0;}
  const session = getSession();
  try {
    await session.executeWrite(async tx => {
      for (const row of rows) {
        const props = row.node.properties as Record<string, unknown>;
        const text = asString(props.text);
        const pattern = props.pattern ? asString(props.pattern) : undefined;
        const verification = props.verification ? asString(props.verification) : undefined;
        const rationale = props.rationale ? asString(props.rationale) : undefined;
        const complianceStatus = props.complianceStatus ? asString(props.complianceStatus) : undefined;
        const complianceRationale = props.complianceRationale ? asString(props.complianceRationale) : undefined;
        const qaScore = props.qaScore !== undefined ? asNumber(props.qaScore) : undefined;
        const qaVerdict = props.qaVerdict ? asString(props.qaVerdict) : undefined;
        const suggestions = parseStringArray(props.suggestions);
        const tags = parseStringArray(props.tags);
        const attributes = parseJsonObject<Record<string, unknown>>(props.attributes);
        const contentHash = generateRequirementContentHash({
          text,
          pattern,
          verification,
          rationale,
          complianceStatus,
          complianceRationale,
          qaScore,
          qaVerdict,
          suggestions,
          tags,
          attributes: attributes as Record<string, unknown> | undefined
        });
        await createRequirementVersion(tx, {
          requirementId: asString(props.id),
          tenantSlug: row.tenantSlug,
          projectSlug: row.projectSlug,
          changedBy: props.updatedBy ? asString(props.updatedBy) : props.createdBy ? asString(props.createdBy) : BACKFILL_USER,
          changeType: "created",
          changeDescription: "Backfilled initial version",
          text,
          pattern: (pattern ?? null) as any,
          verification: (verification ?? null) as any,
          rationale: rationale ?? null,
          complianceStatus: complianceStatus ?? null,
          complianceRationale: complianceRationale ?? null,
          qaScore: qaScore ?? null,
          qaVerdict: qaVerdict ?? null,
          suggestions: suggestions.length ? suggestions : null,
          tags: tags.length ? tags : null,
          attributes: attributes ?? null,
          contentHash
        });
      }
    });
  } finally {
    await session.close();
  }
  return rows.length;
}

async function backfillDocuments(): Promise<number> {
  const rows = await fetchDocumentRows();
  if (!rows.length) {return 0;}
  const session = getSession();
  try {
    await session.executeWrite(async tx => {
      for (const row of rows) {
        const props = row.node.properties as Record<string, unknown>;
        const name = asString(props.name);
        const description = props.description ? asString(props.description) : undefined;
        const shortCode = props.shortCode ? asString(props.shortCode) : undefined;
        const kind = (props.kind ? asString(props.kind) : "structured") as import("../services/graph/documents/documents-crud.js").DocumentKind;
        const contentHash = generateDocumentContentHash({
          name,
          description,
          shortCode,
          kind
        });
        await createDocumentVersion(tx, {
          documentId: asString(props.id),
          tenantSlug: row.tenantSlug,
          projectSlug: row.projectSlug,
          changedBy: props.updatedBy ? asString(props.updatedBy) : BACKFILL_USER,
          changeType: "created",
          changeDescription: "Backfilled initial version",
          slug: asString(props.slug),
          name,
          description: description ?? null,
          shortCode: shortCode ?? null,
          kind,
          originalFileName: props.originalFileName ? asString(props.originalFileName) : null,
          storedFileName: props.storedFileName ? asString(props.storedFileName) : null,
          mimeType: props.mimeType ? asString(props.mimeType) : null,
          fileSize: props.fileSize !== undefined ? asNumber(props.fileSize) : null,
          storagePath: props.storagePath ? asString(props.storagePath) : null,
          previewPath: props.previewPath ? asString(props.previewPath) : null,
          previewMimeType: props.previewMimeType ? asString(props.previewMimeType) : null,
          contentHash
        });
      }
    });
  } finally {
    await session.close();
  }
  return rows.length;
}

async function backfillSections(): Promise<number> {
  const rows = await fetchSectionRows();
  if (!rows.length) {return 0;}
  const session = getSession();
  try {
    await session.executeWrite(async tx => {
      for (const row of rows) {
        const props = row.node.properties as Record<string, unknown>;
        const name = asString(props.name);
        const description = props.description ? asString(props.description) : undefined;
        const shortCode = props.shortCode ? asString(props.shortCode) : undefined;
        const order = props.order !== undefined ? asNumber(props.order) : undefined;
        const contentHash = generateDocumentSectionContentHash({
          name,
          description,
          shortCode,
          order: order ?? 0
        });
        await createDocumentSectionVersion(tx, {
          sectionId: asString(props.id),
          tenantSlug: row.tenantSlug,
          projectSlug: row.projectSlug,
          changedBy: props.updatedBy ? asString(props.updatedBy) : BACKFILL_USER,
          changeType: "created",
          changeDescription: "Backfilled initial version",
          name,
          description: description ?? null,
          shortCode: shortCode ?? null,
          order: order ?? 0,
          contentHash
        });
      }
    });
  } finally {
    await session.close();
  }
  return rows.length;
}

async function backfillInfos(): Promise<number> {
  const rows = await fetchInfoRows();
  if (!rows.length) {return 0;}
  const session = getSession();
  try {
    await session.executeWrite(async tx => {
      for (const row of rows) {
        const props = row.node.properties as Record<string, unknown>;
        const text = asString(props.text);
        const title = props.title ? asString(props.title) : undefined;
        const order = row.relOrder ?? (props.order !== undefined ? asNumber(props.order) : undefined);
        const contentHash = generateInfoContentHash({
          text,
          title
        });
        await createInfoVersion(tx, {
          infoId: asString(props.id),
          tenantSlug: row.tenantSlug,
          projectSlug: row.projectSlug,
          changedBy: props.updatedBy ? asString(props.updatedBy) : BACKFILL_USER,
          changeType: "created",
          changeDescription: "Backfilled initial version",
          ref: props.ref ? asString(props.ref) : asString(props.id),
          text,
          title: title ?? null,
          sectionId: row.sectionId || null,
          order: order ?? null,
          contentHash
        });
      }
    });
  } finally {
    await session.close();
  }
  return rows.length;
}

async function backfillSurrogates(): Promise<number> {
  const rows = await fetchSurrogateRows();
  if (!rows.length) {return 0;}
  const session = getSession();
  try {
    await session.executeWrite(async tx => {
      for (const row of rows) {
        const props = row.node.properties as Record<string, unknown>;
        const slug = asString(props.slug);
        const caption = props.caption ? asString(props.caption) : undefined;
        const order = row.relOrder ?? (props.order !== undefined ? asNumber(props.order) : undefined);
        const contentHash = generateSurrogateContentHash({
          slug,
          caption
        });
        await createSurrogateReferenceVersion(tx, {
          surrogateId: asString(props.id),
          tenantSlug: row.tenantSlug,
          projectSlug: row.projectSlug,
          changedBy: props.updatedBy ? asString(props.updatedBy) : BACKFILL_USER,
          changeType: "created",
          changeDescription: "Backfilled initial version",
          slug,
          caption: caption ?? null,
          sectionId: row.sectionId || null,
          order: order ?? null,
          contentHash
        });
      }
    });
  } finally {
    await session.close();
  }
  return rows.length;
}

async function backfillTraceLinks(): Promise<number> {
  const rows = await fetchTraceLinkRows();
  if (!rows.length) {return 0;}
  const session = getSession();
  try {
    await session.executeWrite(async tx => {
      for (const row of rows) {
        const props = row.node.properties as Record<string, unknown>;
        const sourceRequirementId = asString(props.sourceRequirementId);
        const targetRequirementId = asString(props.targetRequirementId);
        const linkType = asString(props.linkType || "satisfies");
        const description = props.description ? asString(props.description) : undefined;
        const contentHash = generateTraceLinkContentHash({
          sourceRequirementId,
          targetRequirementId,
          linkType,
          description
        });
        await createTraceLinkVersion(tx, {
          traceLinkId: asString(props.id),
          tenantSlug: row.tenantSlug,
          projectSlug: row.projectSlug,
          changedBy: props.updatedBy ? asString(props.updatedBy) : BACKFILL_USER,
          changeType: "created",
          changeDescription: "Backfilled initial version",
          sourceRequirementId,
          targetRequirementId,
          linkType: linkType as "satisfies" | "derives" | "verifies" | "implements" | "refines" | "conflicts",
          description: description ?? null,
          contentHash
        });
      }
    });
  } finally {
    await session.close();
  }
  return rows.length;
}

async function backfillLinksets(): Promise<number> {
  const rows = await fetchLinksetRows();
  if (!rows.length) {return 0;}
  const session = getSession();
  try {
    await session.executeWrite(async tx => {
      for (const row of rows) {
        const props = row.node.properties as Record<string, unknown>;
        const sourceDocumentSlug = asString(props.sourceDocumentSlug);
        const targetDocumentSlug = asString(props.targetDocumentSlug);
        const defaultLinkType = props.defaultLinkType ? asString(props.defaultLinkType) : undefined;
        const contentHash = generateDocumentLinksetContentHash({
          sourceDocumentSlug,
          targetDocumentSlug,
          defaultLinkType
        });
        await createDocumentLinksetVersion(tx, {
          linksetId: asString(props.id),
          tenantSlug: row.tenantSlug,
          projectSlug: row.projectSlug,
          changedBy: props.updatedBy ? asString(props.updatedBy) : BACKFILL_USER,
          changeType: "created",
          changeDescription: "Backfilled initial version",
          sourceDocumentSlug,
          targetDocumentSlug,
          defaultLinkType: defaultLinkType ?? null,
          contentHash
        });
      }
    });
  } finally {
    await session.close();
  }
  return rows.length;
}

async function backfillDiagrams(): Promise<number> {
  const rows = await fetchDiagramRows();
  if (!rows.length) {return 0;}
  const session = getSession();
  try {
    await session.executeWrite(async tx => {
      for (const row of rows) {
        const props = row.node.properties as Record<string, unknown>;
        const name = asString(props.name);
        const description = props.description ? asString(props.description) : undefined;
        const view = props.view ? asString(props.view) : "block";
        const contentHash = generateArchitectureDiagramContentHash({
          name,
          description,
          view
        });
        await createArchitectureDiagramVersion(tx, {
          diagramId: asString(props.id),
          tenantSlug: row.tenantSlug,
          projectSlug: row.projectSlug,
          changedBy: props.updatedBy ? asString(props.updatedBy) : BACKFILL_USER,
          changeType: "created",
          changeDescription: "Backfilled initial version",
          name,
          description: description ?? null,
          view: view as "block" | "internal" | "deployment" | "requirements_schema",
          contentHash
        });
      }
    });
  } finally {
    await session.close();
  }
  return rows.length;
}

function parsePorts(value: unknown): BlockPortRecord[] | undefined {
  const parsed = parseStringArray(value);
  if (parsed.length && typeof parsed[0] === "string") {
    try {
      // Attempt to parse first entry as JSON to detect serialized arrays
      JSON.parse(parsed[0]);
    } catch {
      // Fall through
    }
  }
  if (!value) {return undefined;}
  if (Array.isArray(value)) {
    return value as BlockPortRecord[];
  }
  if (typeof value === "string" && value.trim().length) {
    try {
      const arr = JSON.parse(value);
      if (Array.isArray(arr)) {
        return arr as BlockPortRecord[];
      }
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function parsePortOverrides(value: unknown): Record<string, BlockPortOverrideRecord> | undefined {
  if (!value) {return undefined;}
  if (typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, BlockPortOverrideRecord>;
  }
  if (typeof value === "string" && value.trim().length) {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === "object") {
        return parsed as Record<string, BlockPortOverrideRecord>;
      }
    } catch {
      return undefined;
    }
  }
  return undefined;
}

async function backfillBlocks(): Promise<number> {
  const rows = await fetchBlockRows();
  if (!rows.length) {return 0;}
  const session = getSession();
  try {
    await session.executeWrite(async tx => {
      for (const row of rows) {
        const props = row.block.properties as Record<string, unknown>;
        const relProps = row.rel?.properties as Record<string, unknown> | undefined;
        const name = asString(props.name || row.diagramName || "Block");
        const kind = asString(props.kind || "component");
        const stereotype = props.stereotype ? asString(props.stereotype) : undefined;
        const description = props.description ? asString(props.description) : undefined;
        const ports = parsePorts(props.ports);
        const portOverrides = parsePortOverrides(relProps?.portOverrides);
        const positionX = relProps?.positionX !== undefined ? asNumber(relProps.positionX) : 0;
        const positionY = relProps?.positionY !== undefined ? asNumber(relProps.positionY) : 0;
        const sizeWidth = relProps?.sizeWidth !== undefined ? asNumber(relProps.sizeWidth, 220) : 220;
        const sizeHeight = relProps?.sizeHeight !== undefined ? asNumber(relProps.sizeHeight, 140) : 140;
        const contentHash = generateArchitectureBlockContentHash({
          name,
          kind,
          stereotype,
          description,
          ports: ports ?? null,
          documentIds: row.documentIds,
          positionX,
          positionY,
          sizeWidth,
          sizeHeight,
          backgroundColor: relProps?.backgroundColor ? asString(relProps.backgroundColor) : null,
          borderColor: relProps?.borderColor ? asString(relProps.borderColor) : null,
          borderWidth: relProps?.borderWidth !== undefined ? asNumber(relProps.borderWidth) : null,
          borderStyle: relProps?.borderStyle ? asString(relProps.borderStyle) : null,
          textColor: relProps?.textColor ? asString(relProps.textColor) : null,
          fontSize: relProps?.fontSize !== undefined ? asNumber(relProps.fontSize) : null,
          fontWeight: relProps?.fontWeight ? asString(relProps.fontWeight) : null,
          borderRadius: relProps?.borderRadius !== undefined ? asNumber(relProps.borderRadius) : null,
          portOverrides: portOverrides ?? null
        });
        await createArchitectureBlockVersion(tx, {
          blockId: asString(props.id),
          diagramId: row.diagramId,
          tenantSlug: row.tenantSlug,
          projectSlug: row.projectSlug,
          changedBy: props.updatedBy ? asString(props.updatedBy) : BACKFILL_USER,
          changeType: "created",
          changeDescription: "Backfilled initial version",
          name,
          kind: kind as import("../services/graph/architecture/types.js").BlockKind,
          stereotype: stereotype ?? null,
          description: description ?? null,
          ports: ports ?? null,
          documentIds: row.documentIds.length ? row.documentIds : null,
          positionX,
          positionY,
          sizeWidth,
          sizeHeight,
          backgroundColor: relProps?.backgroundColor ? asString(relProps.backgroundColor) : null,
          borderColor: relProps?.borderColor ? asString(relProps.borderColor) : null,
          borderWidth: relProps?.borderWidth !== undefined ? asNumber(relProps.borderWidth) : null,
          borderStyle: relProps?.borderStyle ? asString(relProps.borderStyle) : null,
          textColor: relProps?.textColor ? asString(relProps.textColor) : null,
          fontSize: relProps?.fontSize !== undefined ? asNumber(relProps.fontSize) : null,
          fontWeight: relProps?.fontWeight ? asString(relProps.fontWeight) : null,
          borderRadius: relProps?.borderRadius !== undefined ? asNumber(relProps.borderRadius) : null,
          portOverrides: portOverrides ?? null,
          contentHash
        });
      }
    });
  } finally {
    await session.close();
  }
  return rows.length;
}

async function backfillConnectors(): Promise<number> {
  const rows = await fetchConnectorRows();
  if (!rows.length) {return 0;}
  const session = getSession();
  try {
    await session.executeWrite(async tx => {
      for (const row of rows) {
        const props = row.node.properties as Record<string, unknown>;
        const source = asString(props.source || props.fromBlockId);
        const target = asString(props.target || props.toBlockId);
        const kind = asString(props.kind || "association");
        const label = props.label ? asString(props.label) : undefined;
        const sourcePortId = props.sourcePortId ? asString(props.sourcePortId) : props.sourcePort ? asString(props.sourcePort) : undefined;
        const targetPortId = props.targetPortId ? asString(props.targetPortId) : props.targetPort ? asString(props.targetPort) : undefined;
        const documentIds = row.documentIds.length ? row.documentIds : undefined;
        const lineStyle = props.lineStyle ? asString(props.lineStyle) : undefined;
        const markerStart = props.markerStart ? asString(props.markerStart) : undefined;
        const markerEnd = props.markerEnd ? asString(props.markerEnd) : undefined;
        const linePattern = props.linePattern ? asString(props.linePattern) : undefined;
        const color = props.color ? asString(props.color) : undefined;
        const strokeWidth = props.strokeWidth !== undefined ? asNumber(props.strokeWidth) : undefined;
        const labelOffsetX = props.labelOffsetX !== undefined ? asNumber(props.labelOffsetX) : undefined;
        const labelOffsetY = props.labelOffsetY !== undefined ? asNumber(props.labelOffsetY) : undefined;
        const controlPoints = props.controlPoints
          ? (() => {
              try {
                const parsed = JSON.parse(String(props.controlPoints));
                if (!Array.isArray(parsed)) {
                  return undefined;
                }
                return parsed
                  .map((point: any) => ({
                    x: typeof point.x === "number" ? point.x : Number(point.x),
                    y: typeof point.y === "number" ? point.y : Number(point.y)
                  }))
                  .filter(point => Number.isFinite(point.x) && Number.isFinite(point.y));
              } catch {
                return undefined;
              }
            })()
          : undefined;
        const contentHash = generateArchitectureConnectorContentHash({
          source,
          target,
          kind,
          label,
          sourcePortId,
          targetPortId,
          documentIds,
          lineStyle,
          markerStart,
          markerEnd,
          linePattern,
          color,
          strokeWidth,
          labelOffsetX,
          labelOffsetY,
          controlPoints: controlPoints ?? null
        });
        await createArchitectureConnectorVersion(tx, {
          connectorId: asString(props.id),
          tenantSlug: row.tenantSlug,
          projectSlug: row.projectSlug,
          changedBy: props.updatedBy ? asString(props.updatedBy) : BACKFILL_USER,
          changeType: "created",
          changeDescription: "Backfilled initial version",
          source,
          target,
          kind: kind as import("../services/graph/architecture/types.js").ConnectorKind,
          label: label ?? null,
          sourcePortId: sourcePortId ?? null,
          targetPortId: targetPortId ?? null,
          diagramId: row.diagramId,
          documentIds: documentIds ?? null,
          lineStyle: lineStyle ?? null,
          markerStart: markerStart ?? null,
          markerEnd: markerEnd ?? null,
          linePattern: linePattern ?? null,
          color: color ?? null,
          strokeWidth: strokeWidth ?? null,
          labelOffsetX: labelOffsetX ?? null,
          labelOffsetY: labelOffsetY ?? null,
          controlPoints: controlPoints ?? null,
          contentHash
        });
      }
    });
  } finally {
    await session.close();
  }
  return rows.length;
}

async function main() {
  await initGraph();
  try {
    const results: Array<[string, number]> = [];
    results.push(["requirements", await backfillRequirements()]);
    results.push(["documents", await backfillDocuments()]);
    results.push(["sections", await backfillSections()]);
    results.push(["infos", await backfillInfos()]);
    results.push(["surrogates", await backfillSurrogates()]);
    results.push(["traceLinks", await backfillTraceLinks()]);
    results.push(["linksets", await backfillLinksets()]);
    results.push(["diagrams", await backfillDiagrams()]);
    results.push(["architectureBlocks", await backfillBlocks()]);
    results.push(["architectureConnectors", await backfillConnectors()]);

    console.log("Version history backfill complete:\n");
    for (const [label, count] of results) {
      console.log(`${label}: ${count}`);
    }
  } catch (error) {
    console.error("Backfill failed", error);
    process.exitCode = 1;
  } finally {
    await closeGraph();
  }
}

await main();
