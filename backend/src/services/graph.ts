import neo4j, { Driver, Session, ManagedTransaction, Node as Neo4jNode } from "neo4j-driver";
import { randomBytes, randomUUID } from "node:crypto";
import { config } from "../config.js";
import {
  RequirementRecord,
  BaselineRecord,
  RequirementPattern,
  VerificationMethod,
  slugify,
  TenantRecord,
  ProjectRecord
} from "./workspace.js";

let driver: Driver | null = null;

function getEncryption(): "ENCRYPTION_ON" | "ENCRYPTION_OFF" {
  return config.graph.encrypted ? "ENCRYPTION_ON" : "ENCRYPTION_OFF";
}

export async function initGraph(): Promise<void> {
  if (!driver) {
    driver = neo4j.driver(
      config.graph.url,
      neo4j.auth.basic(config.graph.username, config.graph.password),
      { encrypted: getEncryption() }
    );
  }

  await driver.verifyConnectivity();
}

export async function closeGraph(): Promise<void> {
  if (driver) {
    await driver.close();
    driver = null;
  }
}

function getSession(): Session {
  if (!driver) {
    throw new Error("Graph driver not initialized. Call initGraph() first.");
  }
  return driver.session({ database: config.graph.database });
}

export type RequirementInput = {
  tenant: string;
  projectKey: string;
  documentSlug?: string;
  sectionId?: string;
  title: string;
  text: string;
  pattern?: RequirementPattern;
  verification?: VerificationMethod;
  qaScore?: number;
  qaVerdict?: string;
  suggestions?: string[];
  tags?: string[];
};

export type RequirementCandidateStatus = "pending" | "accepted" | "rejected";

export type RequirementCandidateInput = {
  tenant: string;
  projectKey: string;
  text: string;
  qaScore?: number;
  qaVerdict?: string;
  suggestions?: string[];
  prompt?: string;
  source?: string;
  querySessionId?: string;
};

export type RequirementCandidateRecord = {
  id: string;
  tenant: string;
  projectKey: string;
  text: string;
  status: RequirementCandidateStatus;
  qaScore?: number;
  qaVerdict?: string;
  suggestions: string[];
  prompt?: string | null;
  source?: string | null;
  querySessionId?: string | null;
  requirementId?: string | null;
  requirementRef?: string | null;
  documentSlug?: string | null;
  sectionId?: string | null;
  createdAt: string;
  updatedAt: string;
};

function mapRequirement(node: Neo4jNode): RequirementRecord {
  const props = node.properties as Record<string, unknown>;
  return {
    id: String(props.id),
    ref: String(props.ref),
    tenant: String(props.tenant),
    projectKey: String(props.projectKey),
    title: String(props.title),
    text: String(props.text),
    pattern: props.pattern ? (props.pattern as RequirementPattern) : undefined,
    verification: props.verification ? (props.verification as VerificationMethod) : undefined,
    qaScore: props.qaScore !== null && props.qaScore !== undefined ? Number(props.qaScore) : undefined,
    qaVerdict: props.qaVerdict ? String(props.qaVerdict) : undefined,
    suggestions: Array.isArray(props.suggestions)
      ? (props.suggestions as string[])
      : undefined,
    tags: Array.isArray(props.tags) ? (props.tags as string[]) : undefined,
    path: String(props.path),
    createdAt: String(props.createdAt),
    updatedAt: String(props.updatedAt),
    deleted: props.deleted ? Boolean(props.deleted) : undefined
  };
}

function mapRequirementCandidate(node: Neo4jNode): RequirementCandidateRecord {
  const props = node.properties as Record<string, unknown>;
  return {
    id: String(props.id),
    tenant: String(props.tenant),
    projectKey: String(props.projectKey),
    text: String(props.text),
    status: String(props.status) as RequirementCandidateStatus,
    qaScore:
      props.qaScore !== null && props.qaScore !== undefined
        ? Number(props.qaScore)
        : undefined,
    qaVerdict: props.qaVerdict ? String(props.qaVerdict) : undefined,
    suggestions: Array.isArray(props.suggestions)
      ? (props.suggestions as string[])
      : [],
    prompt: props.prompt ? String(props.prompt) : null,
    source: props.source ? String(props.source) : null,
    querySessionId: props.querySessionId ? String(props.querySessionId) : null,
    requirementId: props.requirementId ? String(props.requirementId) : null,
    requirementRef: props.requirementRef ? String(props.requirementRef) : null,
    documentSlug: props.documentSlug ? String(props.documentSlug) : null,
    sectionId: props.sectionId ? String(props.sectionId) : null,
    createdAt: String(props.createdAt),
    updatedAt: String(props.updatedAt)
  };
}

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
      : []
  };
}

function mapTenant(node: Neo4jNode, projectCount: number): TenantRecord {
  const props = node.properties as Record<string, unknown>;
  return {
    slug: String(props.slug),
    name: props.name ? String(props.name) : null,
    createdAt: props.createdAt ? String(props.createdAt) : null,
    projectCount
  };
}

function mapProject(node: Neo4jNode, requirementCount: number): ProjectRecord {
  const props = node.properties as Record<string, unknown>;
  return {
    slug: String(props.slug),
    tenantSlug: String(props.tenantSlug),
    key: props.key ? String(props.key) : null,
    createdAt: props.createdAt ? String(props.createdAt) : null,
    requirementCount
  };
}

export type DocumentRecord = {
  id: string;
  slug: string;
  name: string;
  description?: string | null;
  tenant: string;
  projectKey: string;
  parentFolder?: string | null;
  createdAt: string;
  updatedAt: string;
  requirementCount?: number;
};

export type FolderRecord = {
  id: string;
  slug: string;
  name: string;
  description?: string | null;
  tenant: string;
  projectKey: string;
  parentFolder?: string | null;
  createdAt: string;
  updatedAt: string;
  documentCount?: number;
  folderCount?: number;
};

export type DocumentSectionRecord = {
  id: string;
  name: string;
  description?: string | null;
  documentSlug: string;
  tenant: string;
  projectKey: string;
  order: number;
  createdAt: string;
  updatedAt: string;
};

export type BlockKind = "system" | "subsystem" | "component" | "actor" | "external" | "interface";

export type BlockPortRecord = {
  id: string;
  name: string;
  direction: "in" | "out" | "inout";
};

export type ArchitectureBlockRecord = {
  id: string;
  name: string;
  kind: BlockKind;
  stereotype?: string | null;
  description?: string | null;
  tenant: string;
  projectKey: string;
  positionX: number;
  positionY: number;
  sizeWidth: number;
  sizeHeight: number;
  ports: BlockPortRecord[];
  documentIds: string[];
  createdAt: string;
  updatedAt: string;
};

export type ConnectorKind = "association" | "flow" | "dependency" | "composition";

export type ArchitectureConnectorRecord = {
  id: string;
  source: string;
  target: string;
  kind: ConnectorKind;
  label?: string | null;
  sourcePortId?: string | null;
  targetPortId?: string | null;
  tenant: string;
  projectKey: string;
  createdAt: string;
  updatedAt: string;
};

function mapDocument(node: Neo4jNode, requirementCount?: number): DocumentRecord {
  const props = node.properties as Record<string, unknown>;
  return {
    id: String(props.id),
    slug: String(props.slug),
    name: String(props.name),
    description: props.description ? String(props.description) : null,
    tenant: String(props.tenant),
    projectKey: String(props.projectKey),
    parentFolder: props.parentFolder ? String(props.parentFolder) : null,
    createdAt: String(props.createdAt),
    updatedAt: String(props.updatedAt),
    requirementCount: requirementCount ?? 0
  };
}

function mapFolder(node: Neo4jNode, documentCount?: number, folderCount?: number): FolderRecord {
  const props = node.properties as Record<string, unknown>;
  return {
    id: String(props.id),
    slug: String(props.slug),
    name: String(props.name),
    description: props.description ? String(props.description) : null,
    tenant: String(props.tenant),
    projectKey: String(props.projectKey),
    parentFolder: props.parentFolder ? String(props.parentFolder) : null,
    createdAt: String(props.createdAt),
    updatedAt: String(props.updatedAt),
    documentCount: documentCount ?? 0,
    folderCount: folderCount ?? 0
  };
}

function mapDocumentSection(node: Neo4jNode): DocumentSectionRecord {
  const props = node.properties as Record<string, unknown>;
  return {
    id: String(props.id),
    name: String(props.name),
    description: props.description ? String(props.description) : null,
    documentSlug: String(props.documentSlug),
    tenant: String(props.tenant),
    projectKey: String(props.projectKey),
    order: Number(props.order),
    createdAt: String(props.createdAt),
    updatedAt: String(props.updatedAt)
  };
}

function transformDocumentRecord(node: Neo4jNode | null): DocumentRecord | null {
  if (!node) return null;
  const props = node.properties as Record<string, unknown>;
  const requirementCount = props.requirementCount !== undefined ? Number(props.requirementCount) : undefined;
  return mapDocument(node, requirementCount);
}

function mapArchitectureBlock(node: Neo4jNode): ArchitectureBlockRecord {
  const props = node.properties as Record<string, unknown>;
  const ports = props.ports ? JSON.parse(String(props.ports)) : [];
  const documentIds = props.documentIds ? JSON.parse(String(props.documentIds)) : [];
  
  return {
    id: String(props.id),
    name: String(props.name),
    kind: String(props.kind) as BlockKind,
    stereotype: props.stereotype ? String(props.stereotype) : null,
    description: props.description ? String(props.description) : null,
    tenant: String(props.tenant),
    projectKey: String(props.projectKey),
    positionX: Number(props.positionX) || 0,
    positionY: Number(props.positionY) || 0,
    sizeWidth: Number(props.sizeWidth) || 220,
    sizeHeight: Number(props.sizeHeight) || 140,
    ports,
    documentIds,
    createdAt: String(props.createdAt),
    updatedAt: String(props.updatedAt)
  };
}

function mapArchitectureConnector(node: Neo4jNode): ArchitectureConnectorRecord {
  const props = node.properties as Record<string, unknown>;
  
  return {
    id: String(props.id),
    source: String(props.source),
    target: String(props.target),
    kind: String(props.kind) as ConnectorKind,
    label: props.label ? String(props.label) : null,
    sourcePortId: props.sourcePortId ? String(props.sourcePortId) : null,
    targetPortId: props.targetPortId ? String(props.targetPortId) : null,
    tenant: String(props.tenant),
    projectKey: String(props.projectKey),
    createdAt: String(props.createdAt),
    updatedAt: String(props.updatedAt)
  };
}

export async function createDocumentSection(params: {
  tenant: string;
  projectKey: string;
  documentSlug: string;
  name: string;
  description?: string;
  shortCode?: string;
  order: number;
}): Promise<DocumentSectionRecord> {
  const tenantSlug = slugify(params.tenant);
  const projectSlug = slugify(params.projectKey);
  const now = new Date().toISOString();
  const sectionId = `section-${Date.now()}`;

  const session = getSession();
  try {
    const result = await session.executeWrite(async (tx: ManagedTransaction) => {
      const query = `
        MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project {slug: $projectSlug})-[:HAS_DOCUMENT]->(document:Document {slug: $documentSlug})
        CREATE (section:DocumentSection {
          id: $sectionId,
          name: $name,
          description: $description,
          shortCode: $shortCode,
          documentSlug: $documentSlug,
          tenant: $tenant,
          projectKey: $projectKey,
          order: $order,
          createdAt: $now,
          updatedAt: $now
        })
        MERGE (document)-[:HAS_SECTION]->(section)
        RETURN section
      `;

      const res = await tx.run(query, {
        tenantSlug,
        projectSlug,
        documentSlug: params.documentSlug,
        sectionId,
        name: params.name,
        description: params.description ?? null,
        shortCode: params.shortCode ?? null,
        tenant: params.tenant,
        projectKey: params.projectKey,
        order: params.order,
        now
      });

      return res.records[0].get("section");
    });

    return mapDocumentSection(result);
  } finally {
    await session.close();
  }
}

export async function listDocumentSections(tenant: string, projectKey: string, documentSlug: string): Promise<DocumentSectionRecord[]> {
  const tenantSlug = slugify(tenant);
  const projectSlug = slugify(projectKey);
  const session = getSession();

  try {
    const result = await session.run(
      `
        MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project {slug: $projectSlug})-[:HAS_DOCUMENT]->(document:Document {slug: $documentSlug})-[:HAS_SECTION]->(section:DocumentSection)
        RETURN section
        ORDER BY section.order, section.createdAt
      `,
      { tenantSlug, projectSlug, documentSlug }
    );

    return result.records.map(record => mapDocumentSection(record.get("section")));
  } finally {
    await session.close();
  }
}

export async function updateDocumentSection(sectionId: string, params: {
  name?: string;
  description?: string;
  order?: number;
  shortCode?: string;
}): Promise<DocumentSectionRecord> {
  const now = new Date().toISOString();
  const session = getSession();

  try {
    const result = await session.executeWrite(async (tx: ManagedTransaction) => {
      const updateClauses = [];
      const queryParams: Record<string, unknown> = { sectionId, now };

      if (params.name !== undefined) {
        updateClauses.push('section.name = $name');
        queryParams.name = params.name;
      }
      if (params.description !== undefined) {
        updateClauses.push('section.description = $description');
        queryParams.description = params.description;
      }
      if (params.order !== undefined) {
        updateClauses.push('section.order = $order');
        queryParams.order = params.order;
      }
      if (params.shortCode !== undefined) {
        updateClauses.push('section.shortCode = $shortCode');
        queryParams.shortCode = params.shortCode;
      }

      if (updateClauses.length === 0) {
        throw new Error('No fields to update');
      }

      const query = `
        MATCH (section:DocumentSection {id: $sectionId})
        SET ${updateClauses.join(', ')}, section.updatedAt = $now
        RETURN section
      `;

      const res = await tx.run(query, queryParams);
      
      if (res.records.length === 0) {
        throw new Error('Section not found');
      }

      // If shortCode or name is being updated, update all related requirement references
      if (params.shortCode !== undefined || params.name !== undefined) {
        await updateRequirementRefsForSection(tx, sectionId);
      }

      return res.records[0].get("section");
    });

    return mapDocumentSection(result);
  } finally {
    await session.close();
  }
}

export async function deleteDocumentSection(sectionId: string): Promise<void> {
  const session = getSession();

  try {
    await session.executeWrite(async (tx: ManagedTransaction) => {
      const query = `
        MATCH (section:DocumentSection {id: $sectionId})
        DETACH DELETE section
      `;

      await tx.run(query, { sectionId });
    });
  } finally {
    await session.close();
  }
}

export async function createRequirement(input: RequirementInput): Promise<RequirementRecord> {
  const tenantSlug = slugify(input.tenant || config.defaultTenant);
  const projectSlug = slugify(input.projectKey);
  const now = new Date().toISOString();
  
  // Generate unique hash ID for this requirement
  const hashId = randomBytes(8).toString("hex");

  const session = getSession();
  try {
    const result = await session.executeWrite(async (tx: ManagedTransaction) => {
      const query = `
        MERGE (tenant:Tenant {slug: $tenantSlug})
          ON CREATE SET tenant.name = $tenantName, tenant.createdAt = $now
        MERGE (project:Project {slug: $projectSlug, tenantSlug: $tenantSlug})
          ON CREATE SET project.key = $projectKey, project.createdAt = $now
        
        // Get document and section if specified
        WITH tenant, project, $documentSlug AS documentSlugParam, $sectionId AS sectionIdParam
        OPTIONAL MATCH (project)-[:HAS_DOCUMENT]->(document:Document {slug: documentSlugParam})
        OPTIONAL MATCH (section:DocumentSection {id: sectionIdParam})
        
        // Increment appropriate counter and generate ref
        WITH tenant, project, document, section,
             CASE 
               WHEN document IS NOT NULL THEN 
                 CASE WHEN section IS NOT NULL THEN
                   // Document + Section: use both short codes with intelligent defaults
                   coalesce(document.shortCode, toUpper(document.slug)) + '-' + coalesce(section.shortCode, toUpper(replace(section.name, ' ', '')))
                 ELSE
                   // Document only: use document short code with intelligent default
                   coalesce(document.shortCode, toUpper(document.slug))
                 END
               ELSE
                 // No document: use project prefix
                 'REQ-' + toUpper(replace($projectSlug, '-', ''))
             END AS prefix
        
        // Set counter on appropriate entity
        FOREACH (doc IN CASE WHEN document IS NOT NULL THEN [document] ELSE [] END |
          SET doc.requirementCounter = coalesce(doc.requirementCounter, 0) + 1
        )
        FOREACH (proj IN CASE WHEN document IS NULL THEN [project] ELSE [] END |
          SET proj.requirementCounter = coalesce(proj.requirementCounter, 0) + 1
        )
        
        WITH tenant, project, document, section, prefix,
             CASE WHEN document IS NOT NULL 
               THEN document.requirementCounter
               ELSE project.requirementCounter
             END AS counter
        
        WITH tenant, project, document, section, prefix, counter,
             right('000' + toString(counter), 3) AS padded
        WITH tenant, project, document, section, prefix, counter, padded,
             prefix + '-' + padded AS ref
        
        // Find the next available reference number by checking existing refs with this prefix
        OPTIONAL MATCH (existingReq:Requirement)
        WHERE existingReq.ref STARTS WITH prefix + '-' AND existingReq.ref =~ (prefix + '-[0-9]{3}')
        WITH tenant, project, document, section, prefix, counter, padded, ref,
             max(toInteger(split(existingReq.ref, '-')[size(split(existingReq.ref, '-'))-1])) AS maxExisting
        
        WITH tenant, project, document, section, prefix, counter, padded, ref,
             CASE WHEN maxExisting IS NOT NULL AND maxExisting >= counter 
               THEN maxExisting + 1
               ELSE counter
             END AS safeCounter
             
        WITH tenant, project, document, section, prefix, safeCounter,
             prefix + '-' + right('000' + toString(safeCounter), 3) AS finalRef
        
        CREATE (requirement:Requirement {
          id: $tenantSlug + ':' + $projectSlug + ':' + finalRef,
          hashId: $hashId,
          ref: finalRef,
          tenant: $tenantSlug,
          projectKey: $projectSlug,
          title: $title,
          text: $text,
          pattern: $pattern,
          verification: $verification,
          qaScore: $qaScore,
          qaVerdict: $qaVerdict,
          suggestions: $suggestions,
          tags: $tags,
          path: $tenantSlug + '/' + $projectSlug + '/requirements/' + finalRef + '.md',
          createdAt: $now,
          updatedAt: $now
        })
        MERGE (tenant)-[:OWNS]->(project)
        WITH tenant, project, requirement, document, section
        FOREACH (doc IN CASE WHEN document IS NOT NULL THEN [document] ELSE [] END |
          MERGE (doc)-[:CONTAINS]->(requirement)
        )
        FOREACH (proj IN CASE WHEN document IS NULL THEN [project] ELSE [] END |
          MERGE (proj)-[:CONTAINS]->(requirement)
        )
        FOREACH (sec IN CASE WHEN section IS NOT NULL THEN [section] ELSE [] END |
          MERGE (sec)-[:HAS_REQUIREMENT]->(requirement)
        )
        RETURN requirement
      `;

      const res = await tx.run(query, {
        tenantSlug,
        tenantName: input.tenant,
        projectSlug,
        projectKey: input.projectKey,
        hashId,
        title: input.title,
        text: input.text,
        pattern: input.pattern ?? null,
        verification: input.verification ?? null,
        qaScore: input.qaScore ?? null,
        qaVerdict: input.qaVerdict ?? null,
        suggestions: input.suggestions ?? [],
        tags: input.tags ?? [],
        documentSlug: input.documentSlug ?? null,
        sectionId: input.sectionId ?? null,
        now
      });

      if (res.records.length === 0) {
        throw new Error("Failed to create requirement node");
      }

      const node = res.records[0].get("requirement") as Neo4jNode;
      return mapRequirement(node);
    });

    return result;
  } finally {
    await session.close();
  }
}

export async function createRequirementCandidates(
  inputs: RequirementCandidateInput[]
): Promise<RequirementCandidateRecord[]> {
  if (inputs.length === 0) return [];

  const rows = inputs.map(input => {
    const tenantSlug = slugify(input.tenant || config.defaultTenant);
    const projectSlug = slugify(input.projectKey);
    const timestamp = new Date().toISOString();
    return {
      id: `cand-${randomUUID()}`,
      tenantSlug,
      tenantName: input.tenant,
      projectSlug,
      projectKey: input.projectKey,
      text: input.text,
      status: "pending" as RequirementCandidateStatus,
      qaScore: input.qaScore ?? null,
      qaVerdict: input.qaVerdict ?? null,
      suggestions: input.suggestions ?? [],
      prompt: input.prompt ?? null,
      source: input.source ?? "llm",
      querySessionId: input.querySessionId ?? null,
      createdAt: timestamp,
      updatedAt: timestamp
    };
  });

  const session = getSession();

  try {
    const created = await session.executeWrite(async (tx: ManagedTransaction) => {
      const res = await tx.run(
        `
          UNWIND $rows AS row
          MERGE (tenant:Tenant {slug: row.tenantSlug})
            ON CREATE SET tenant.name = row.tenantName, tenant.createdAt = row.createdAt
          MERGE (project:Project {slug: row.projectSlug, tenantSlug: row.tenantSlug})
            ON CREATE SET project.key = row.projectKey, project.createdAt = row.createdAt
          CREATE (candidate:RequirementCandidate {
            id: row.id,
            tenant: row.tenantSlug,
            projectKey: row.projectSlug,
            text: row.text,
            status: row.status,
            qaScore: row.qaScore,
            qaVerdict: row.qaVerdict,
            suggestions: row.suggestions,
            prompt: row.prompt,
            source: row.source,
            querySessionId: row.querySessionId,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt
          })
          MERGE (project)-[:HAS_CANDIDATE]->(candidate)
          RETURN candidate
        `,
        { rows }
      );

      return res.records.map(record => mapRequirementCandidate(record.get("candidate")));
    });

    return created;
  } finally {
    await session.close();
  }
}

export async function listRequirementCandidates(
  tenant: string,
  projectKey: string
): Promise<RequirementCandidateRecord[]> {
  const tenantSlug = slugify(tenant || config.defaultTenant);
  const projectSlug = slugify(projectKey);

  const session = getSession();
  try {
    const records = await session.executeRead(async (tx: ManagedTransaction) => {
      const res = await tx.run(
        `
          MATCH (candidate:RequirementCandidate {tenant: $tenantSlug, projectKey: $projectSlug})
          RETURN candidate
          ORDER BY candidate.updatedAt DESC
        `,
        { tenantSlug, projectSlug }
      );

      return res.records.map(record => mapRequirementCandidate(record.get("candidate")));
    });

    return records;
  } finally {
    await session.close();
  }
}

export async function getRequirementCandidate(id: string): Promise<RequirementCandidateRecord | null> {
  const session = getSession();
  try {
    const record = await session.executeRead(async (tx: ManagedTransaction) => {
      const res = await tx.run(
        `
          MATCH (candidate:RequirementCandidate {id: $id})
          RETURN candidate
        `,
        { id }
      );

      if (res.records.length === 0) {
        return null;
      }

      return mapRequirementCandidate(res.records[0].get("candidate"));
    });

    return record;
  } finally {
    await session.close();
  }
}

export async function updateRequirementCandidate(
  id: string,
  updates: {
    status?: RequirementCandidateStatus;
    requirementId?: string | null;
    requirementRef?: string | null;
    documentSlug?: string | null;
    sectionId?: string | null;
  }
): Promise<RequirementCandidateRecord | null> {
  const setClauses: string[] = [];
  const params: Record<string, unknown> = { id, now: new Date().toISOString() };

  if (updates.status) {
    setClauses.push("candidate.status = $status");
    params.status = updates.status;
  }
  if ("requirementId" in updates) {
    setClauses.push("candidate.requirementId = $requirementId");
    params.requirementId = updates.requirementId ?? null;
  }
  if ("requirementRef" in updates) {
    setClauses.push("candidate.requirementRef = $requirementRef");
    params.requirementRef = updates.requirementRef ?? null;
  }
  if ("documentSlug" in updates) {
    setClauses.push("candidate.documentSlug = $documentSlug");
    params.documentSlug = updates.documentSlug ?? null;
  }
  if ("sectionId" in updates) {
    setClauses.push("candidate.sectionId = $sectionId");
    params.sectionId = updates.sectionId ?? null;
  }

  if (setClauses.length === 0) {
    return getRequirementCandidate(id);
  }

  const session = getSession();
  try {
    const record = await session.executeWrite(async (tx: ManagedTransaction) => {
      const res = await tx.run(
        `
          MATCH (candidate:RequirementCandidate {id: $id})
          SET ${setClauses.join(", ")}, candidate.updatedAt = $now
          RETURN candidate
        `,
        params
      );

      if (res.records.length === 0) {
        return null;
      }

      return mapRequirementCandidate(res.records[0].get("candidate"));
    });

    return record;
  } finally {
    await session.close();
  }
}

export async function listRequirements(tenant: string, projectKey: string): Promise<RequirementRecord[]> {
  const tenantSlug = slugify(tenant);
  const projectSlug = slugify(projectKey);

  const session = getSession();
  try {
    const result = await session.run(
      `
        MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project {slug: $projectSlug})
        OPTIONAL MATCH (project)-[:CONTAINS]->(direct:Requirement)
        OPTIONAL MATCH (project)-[:HAS_DOCUMENT]->(:Document)-[:CONTAINS]->(docReq:Requirement)
        WITH project, collect(DISTINCT direct) + collect(DISTINCT docReq) AS reqs
        UNWIND reqs AS requirement
        WITH DISTINCT requirement
        WHERE requirement IS NOT NULL AND (requirement.deleted IS NULL OR requirement.deleted = false)
        RETURN requirement
        ORDER BY requirement.ref
      `,
      { tenantSlug, projectSlug }
    );

    return result.records.map(record => {
      const node = record.get("requirement") as Neo4jNode;
      return mapRequirement(node);
    });
  } finally {
    await session.close();
  }
}

export async function listSectionRequirements(sectionId: string): Promise<RequirementRecord[]> {
  const session = getSession();
  try {
    const result = await session.run(
      `
        MATCH (section:DocumentSection {id: $sectionId})-[:HAS_REQUIREMENT]->(requirement:Requirement)
        WHERE requirement.deleted IS NULL OR requirement.deleted = false
        RETURN requirement
        ORDER BY requirement.ref
      `,
      { sectionId }
    );

    const items: RequirementRecord[] = [];
    for (const record of result.records) {
      const node = record.get("requirement") as Neo4jNode;
      items.push(mapRequirement(node));
    }

    return items;
  } finally {
    await session.close();
  }
}

export async function listTenants(): Promise<TenantRecord[]> {
  const session = getSession();

  try {
    const result = await session.run(
      `
        MATCH (tenant:Tenant)
        OPTIONAL MATCH (tenant)-[:OWNS]->(project:Project)
        RETURN tenant, count(project) AS projectCount
        ORDER BY tenant.slug
      `
    );

    const tenants: TenantRecord[] = [];
    for (const record of result.records) {
      const node = record.get("tenant") as Neo4jNode;
      const projectCount = Number(record.get("projectCount")) || 0;
      tenants.push(mapTenant(node, projectCount));
    }

    return tenants;
  } finally {
    await session.close();
  }
}

export async function listProjects(tenant: string): Promise<ProjectRecord[]> {
  const tenantSlug = slugify(tenant);
  const session = getSession();

  try {
    const result = await session.run(
      `
        MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project)
        OPTIONAL MATCH (project)-[:CONTAINS]->(requirement:Requirement)
        RETURN project, count(requirement) AS requirementCount
        ORDER BY project.slug
      `,
      { tenantSlug }
    );

    const projects: ProjectRecord[] = [];
    for (const record of result.records) {
      const node = record.get("project") as Neo4jNode;
      const requirementCount = Number(record.get("requirementCount")) || 0;
      projects.push(mapProject(node, requirementCount));
    }

    return projects;
  } finally {
    await session.close();
  }
}

export async function getRequirement(tenant: string, projectKey: string, ref: string): Promise<RequirementRecord | null> {
  const tenantSlug = slugify(tenant);
  const projectSlug = slugify(projectKey);

  const session = getSession();
  try {
    const result = await session.run(
      `
        MATCH (project:Project {slug: $projectSlug, tenantSlug: $tenantSlug})
        OPTIONAL MATCH (project)-[:CONTAINS]->(direct:Requirement {ref: $ref})
        OPTIONAL MATCH (project)-[:HAS_DOCUMENT]->(:Document)-[:CONTAINS]->(docReq:Requirement {ref: $ref})
        WITH coalesce(direct, docReq) AS requirement
        WHERE requirement IS NOT NULL
        RETURN requirement
        LIMIT 1
      `,
      { tenantSlug, projectSlug, ref }
    );

    if (result.records.length === 0) return null;
    const node = result.records[0].get("requirement") as Neo4jNode;
    return mapRequirement(node);
  } finally {
    await session.close();
  }
}

export async function updateRequirementTimestamp(tenant: string, projectKey: string, ref: string): Promise<void> {
  const tenantSlug = slugify(tenant);
  const projectSlug = slugify(projectKey);
  const session = getSession();
  const now = new Date().toISOString();

  try {
    await session.run(
      `
        MATCH (project:Project {slug: $projectSlug, tenantSlug: $tenantSlug})
        OPTIONAL MATCH (project)-[:CONTAINS]->(direct:Requirement {ref: $ref})
        OPTIONAL MATCH (project)-[:HAS_DOCUMENT]->(:Document)-[:CONTAINS]->(docReq:Requirement {ref: $ref})
        WITH coalesce(direct, docReq) AS requirement
        WHERE requirement IS NOT NULL
        SET requirement.updatedAt = $now
      `,
      { tenantSlug, projectSlug, ref, now }
    );
  } finally {
    await session.close();
  }
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

  const session = getSession();
  try {
    const result = await session.executeWrite(async (tx: ManagedTransaction) => {
      const query = `
        MERGE (tenant:Tenant {slug: $tenantSlug})
          ON CREATE SET tenant.createdAt = $now
        MERGE (project:Project {slug: $projectSlug, tenantSlug: $tenantSlug})
          ON CREATE SET project.key = $projectKey, project.createdAt = $now
        SET project.baselineCounter = coalesce(project.baselineCounter, 0) + 1
        WITH tenant, project, project.baselineCounter AS counter
        WITH tenant, project, counter,
             right('000' + toString(counter), 3) AS padded,
             toUpper(replace($projectSlug, '-', '')) AS upper
        WITH tenant, project, padded, upper,
             'BL-' + upper + '-' + padded AS ref
        MATCH (project)-[:CONTAINS]->(requirement:Requirement)
        WITH tenant, project, ref, collect(requirement) AS requirements
        CREATE (baseline:Baseline {
          id: $tenantSlug + ':' + $projectSlug + ':' + ref,
          ref: ref,
          tenant: $tenantSlug,
          projectKey: $projectSlug,
          createdAt: $now,
          author: $author,
          label: $label,
          requirementRefs: [req IN requirements | req.ref]
        })
        MERGE (project)-[:HAS_BASELINE]->(baseline)
        FOREACH (req IN requirements | MERGE (baseline)-[:SNAPSHOT_OF]->(req))
        RETURN baseline
      `;

      const res = await tx.run(query, {
        tenantSlug,
        projectSlug,
        projectKey: params.projectKey,
        author: params.author ?? null,
        label: params.label ?? null,
        now
      });

      if (res.records.length === 0) {
        throw new Error("Failed to create baseline node");
      }

      const node = res.records[0].get("baseline") as Neo4jNode;
      return mapBaseline(node);
    });

    return result;
  } finally {
    await session.close();
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

export async function suggestLinks(params: {
  tenant: string;
  projectKey: string;
  text: string;
  limit?: number;
}): Promise<Array<{ ref: string; title: string; path: string }>> {
  const tenantSlug = slugify(params.tenant);
  const projectSlug = slugify(params.projectKey);
  const limit = params.limit ?? 3;
  const needle = params.text.split(/\s+/)[0]?.toLowerCase() ?? "";

  if (!needle) return [];

  const session = getSession();
  try {
    const result = await session.run(
      `
        MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project {slug: $projectSlug})-[:CONTAINS]->(requirement:Requirement)
        WHERE toLower(requirement.text) CONTAINS $needle
        RETURN requirement.ref AS ref, requirement.title AS title, requirement.path AS path
        LIMIT $limit
      `,
      { tenantSlug, projectSlug, needle, limit }
    );

    const suggestions: Array<{ ref: string; title: string; path: string }> = [];
    for (const record of result.records) {
      suggestions.push({
        ref: String(record.get("ref")),
        title: String(record.get("title")),
        path: String(record.get("path"))
      });
    }

    return suggestions;
  } finally {
    await session.close();
  }
}

export async function createDocument(params: {
  tenant: string;
  projectKey: string;
  name: string;
  description?: string;
  shortCode?: string;
  parentFolder?: string;
}): Promise<DocumentRecord> {
  const tenantSlug = slugify(params.tenant);
  const projectSlug = slugify(params.projectKey);
  const documentSlug = slugify(params.name);
  const now = new Date().toISOString();
  const session = getSession();

  try {
    const result = await session.executeWrite(async (tx: ManagedTransaction) => {
      const query = `
        MERGE (tenant:Tenant {slug: $tenantSlug})
          ON CREATE SET tenant.name = $tenantName, tenant.createdAt = $now
        MERGE (project:Project {slug: $projectSlug, tenantSlug: $tenantSlug})
          ON CREATE SET project.key = $projectKey, project.createdAt = $now
        MERGE (tenant)-[:OWNS]->(project)
        CREATE (document:Document {
          id: $tenantSlug + ':' + $projectSlug + ':' + $documentSlug,
          slug: $documentSlug,
          name: $name,
          description: $description,
          shortCode: $shortCode,
          tenant: $tenantSlug,
          projectKey: $projectSlug,
          parentFolder: $parentFolder,
          createdAt: $now,
          updatedAt: $now
        })
        MERGE (project)-[:HAS_DOCUMENT]->(document)
        WITH project, document
        OPTIONAL MATCH (project)-[:HAS_FOLDER]->(parent:Folder {slug: $parentFolder})
        FOREACH (p IN CASE WHEN parent IS NOT NULL THEN [parent] ELSE [] END |
          MERGE (p)-[:CONTAINS_DOCUMENT]->(document)
        )
        RETURN document
      `;

      const res = await tx.run(query, {
        tenantSlug,
        tenantName: params.tenant,
        projectSlug,
        projectKey: params.projectKey,
        documentSlug,
        name: params.name,
        description: params.description ?? null,
        shortCode: params.shortCode ?? null,
        parentFolder: params.parentFolder ?? null,
        now
      });

      return res.records[0].get("document");
    });

    return mapDocument(result);
  } finally {
    await session.close();
  }
}

export async function listDocuments(tenant: string, projectKey: string): Promise<DocumentRecord[]> {
  const tenantSlug = slugify(tenant);
  const projectSlug = slugify(projectKey);
  const session = getSession();

  try {
    const result = await session.run(
      `
        MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project {slug: $projectSlug})-[:HAS_DOCUMENT]->(document:Document)
        WHERE document.deletedAt IS NULL
        OPTIONAL MATCH (document)-[:CONTAINS]->(requirement:Requirement)
        RETURN document, count(requirement) AS requirementCount
        ORDER BY document.name
      `,
      { tenantSlug, projectSlug }
    );

    const documents: DocumentRecord[] = [];
    for (const record of result.records) {
      const node = record.get("document");
      const count = record.get("requirementCount").toNumber();
      documents.push(mapDocument(node, count));
    }

    return documents;
  } finally {
    await session.close();
  }
}

export async function getDocument(tenant: string, projectKey: string, documentSlug: string): Promise<DocumentRecord | null> {
  const tenantSlug = slugify(tenant);
  const projectSlug = slugify(projectKey);
  const session = getSession();

  try {
    const result = await session.run(
      `
        MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project {slug: $projectSlug})-[:HAS_DOCUMENT]->(document:Document {slug: $documentSlug})
        OPTIONAL MATCH (document)-[:CONTAINS]->(requirement:Requirement)
        RETURN document, count(requirement) AS requirementCount
      `,
      { tenantSlug, projectSlug, documentSlug }
    );

    if (result.records.length === 0) {
      return null;
    }

    const node = result.records[0].get("document");
    const count = result.records[0].get("requirementCount").toNumber();
    return mapDocument(node, count);
  } finally {
    await session.close();
  }
}

async function updateRequirementRefsForDocument(tx: ManagedTransaction, tenantSlug: string, projectSlug: string, documentSlug: string): Promise<void> {
  // Update requirement references for all requirements in this document
  const updateQuery = `
    MATCH (project:Project {slug: $projectSlug, tenantSlug: $tenantSlug})-[:HAS_DOCUMENT]->(document:Document {slug: $documentSlug})
    MATCH (document)-[:CONTAINS]->(requirement:Requirement)
    OPTIONAL MATCH (requirement)<-[:HAS_REQUIREMENT]-(section:DocumentSection)
    WITH requirement, document, section,
         CASE 
           WHEN section IS NOT NULL THEN
             coalesce(document.shortCode, toUpper(document.slug)) + '-' + coalesce(section.shortCode, toUpper(replace(section.name, ' ', '')))
           ELSE
             coalesce(document.shortCode, toUpper(document.slug))
         END AS newPrefix,
         split(requirement.ref, '-') AS refParts
    WITH requirement, newPrefix, 
         newPrefix + '-' + refParts[size(refParts)-1] AS newRef
    SET requirement.ref = newRef, requirement.updatedAt = $now
  `;
  await tx.run(updateQuery, { tenantSlug, projectSlug, documentSlug, now: new Date().toISOString() });
}

async function updateRequirementRefsForSection(tx: ManagedTransaction, sectionId: string): Promise<void> {
  // Update requirement references for all requirements in this section
  const updateQuery = `
    MATCH (section:DocumentSection {id: $sectionId})<-[:HAS_SECTION]-(document:Document)<-[:HAS_DOCUMENT]-(project:Project)
    MATCH (section)-[:HAS_REQUIREMENT]->(requirement:Requirement)
    WITH requirement, document, section,
         coalesce(document.shortCode, toUpper(document.slug)) + '-' + coalesce(section.shortCode, toUpper(replace(section.name, ' ', ''))) AS newPrefix,
         split(requirement.ref, '-') AS refParts
    WITH requirement, newPrefix,
         newPrefix + '-' + refParts[size(refParts)-1] AS newRef
    SET requirement.ref = newRef, requirement.updatedAt = $now
  `;
  await tx.run(updateQuery, { sectionId, now: new Date().toISOString() });
}

export async function updateDocument(tenant: string, projectKey: string, documentSlug: string, updates: {
  name?: string;
  description?: string;
  shortCode?: string;
}): Promise<DocumentRecord | null> {
  const tenantSlug = slugify(tenant);
  const projectSlug = slugify(projectKey);
  const session = getSession();

  try {
    const result = await session.executeWrite(async (tx: ManagedTransaction) => {
      const setClause = Object.entries(updates)
        .filter(([_, value]) => value !== undefined)
        .map(([key, _]) => `document.${key} = $${key}`)
        .join(', ');

      if (!setClause) {
        throw new Error("No valid updates provided");
      }

      const query = `
        MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project {slug: $projectSlug})-[:HAS_DOCUMENT]->(document:Document {slug: $documentSlug})
        SET ${setClause}, document.updatedAt = $now
        RETURN document
      `;

      const res = await tx.run(query, {
        tenantSlug,
        projectSlug,
        documentSlug,
        ...updates,
        now: new Date().toISOString()
      });

      // If shortCode is being updated, update all related requirement references
      if (updates.shortCode !== undefined) {
        await updateRequirementRefsForDocument(tx, tenantSlug, projectSlug, documentSlug);
      }

      return res.records.length > 0 ? res.records[0].get("document") : null;
    });

    return result ? transformDocumentRecord(result) : null;
  } finally {
    await session.close();
  }
}

export async function updateDocumentFolder(tenant: string, projectKey: string, documentSlug: string, parentFolder?: string | null): Promise<DocumentRecord | null> {
  const tenantSlug = slugify(tenant);
  const projectSlug = slugify(projectKey);
  const session = getSession();

  try {
    const result = await session.executeWrite(async (tx: ManagedTransaction) => {
      // First remove any existing parent folder relationship
      await tx.run(
        `
          MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project {slug: $projectSlug})-[:HAS_DOCUMENT]->(document:Document {slug: $documentSlug})
          OPTIONAL MATCH (document)-[r:IN_FOLDER]->(:Folder)
          DELETE r
          RETURN document
        `,
        { tenantSlug, projectSlug, documentSlug }
      );

      // If parentFolder is specified, create the relationship
      if (parentFolder) {
        const parentFolderSlug = slugify(parentFolder);
        return await tx.run(
          `
            MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project {slug: $projectSlug})-[:HAS_DOCUMENT]->(document:Document {slug: $documentSlug})
            MATCH (project)-[:HAS_FOLDER]->(folder:Folder {slug: $parentFolderSlug})
            MERGE (document)-[:IN_FOLDER]->(folder)
            SET document.parentFolder = $parentFolder, document.updatedAt = $now
            WITH document
            OPTIONAL MATCH (document)-[:CONTAINS]->(requirement:Requirement)
            RETURN document, count(requirement) AS requirementCount
          `,
          { tenantSlug, projectSlug, documentSlug, parentFolderSlug, parentFolder, now: new Date().toISOString() }
        );
      } else {
        return await tx.run(
          `
            MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project {slug: $projectSlug})-[:HAS_DOCUMENT]->(document:Document {slug: $documentSlug})
            SET document.parentFolder = null, document.updatedAt = $now
            WITH document
            OPTIONAL MATCH (document)-[:CONTAINS]->(requirement:Requirement)
            RETURN document, count(requirement) AS requirementCount
          `,
          { tenantSlug, projectSlug, documentSlug, now: new Date().toISOString() }
        );
      }
    });

    if (result.records.length === 0) {
      return null;
    }

    const node = result.records[0].get("document");
    const count = result.records[0].get("requirementCount").toNumber();
    return mapDocument(node, count);
  } finally {
    await session.close();
  }
}

export async function softDeleteDocument(tenant: string, projectKey: string, documentSlug: string): Promise<DocumentRecord | null> {
  const tenantSlug = slugify(tenant);
  const projectSlug = slugify(projectKey);
  const session = getSession();

  try {
    const result = await session.executeWrite(async (tx: ManagedTransaction) => {
      return await tx.run(
        `
          MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project {slug: $projectSlug})-[:HAS_DOCUMENT]->(document:Document {slug: $documentSlug})
          WHERE document.deletedAt IS NULL
          SET document.deletedAt = $now, document.updatedAt = $now
          WITH document
          OPTIONAL MATCH (document)-[:CONTAINS]->(requirement:Requirement)
          RETURN document, count(requirement) AS requirementCount
        `,
        { tenantSlug, projectSlug, documentSlug, now: new Date().toISOString() }
      );
    });

    if (result.records.length === 0) {
      return null;
    }

    const node = result.records[0].get("document");
    const count = result.records[0].get("requirementCount").toNumber();
    return mapDocument(node, count);
  } finally {
    await session.close();
  }
}

export async function softDeleteFolder(tenant: string, projectKey: string, folderSlug: string): Promise<FolderRecord | null> {
  const tenantSlug = slugify(tenant);
  const projectSlug = slugify(projectKey);
  const session = getSession();

  try {
    const result = await session.executeWrite(async (tx: ManagedTransaction) => {
      return await tx.run(
        `
          MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project {slug: $projectSlug})-[:HAS_FOLDER]->(folder:Folder {slug: $folderSlug})
          WHERE folder.deletedAt IS NULL
          SET folder.deletedAt = $now, folder.updatedAt = $now
          WITH folder
          OPTIONAL MATCH (folder)-[:CONTAINS_FOLDER]->(subfolder:Folder)
          WHERE subfolder.deletedAt IS NULL
          OPTIONAL MATCH (folder)-[:CONTAINS_DOCUMENT]->(document:Document)
          WHERE document.deletedAt IS NULL
          RETURN folder, count(DISTINCT subfolder) AS folderCount, count(DISTINCT document) AS documentCount
        `,
        { tenantSlug, projectSlug, folderSlug, now: new Date().toISOString() }
      );
    });

    if (result.records.length === 0) {
      return null;
    }

    const node = result.records[0].get("folder");
    const folderCount = result.records[0].get("folderCount").toNumber();
    const documentCount = result.records[0].get("documentCount").toNumber();
    return mapFolder(node, documentCount, folderCount);
  } finally {
    await session.close();
  }
}

export async function createFolder(params: {
  tenant: string;
  projectKey: string;
  name: string;
  description?: string;
  parentFolder?: string;
}): Promise<FolderRecord> {
  const tenantSlug = slugify(params.tenant);
  const projectSlug = slugify(params.projectKey);
  const folderSlug = slugify(params.name);
  const now = new Date().toISOString();
  const session = getSession();

  try {
    const result = await session.executeWrite(async (tx: ManagedTransaction) => {
      const query = `
        MERGE (tenant:Tenant {slug: $tenantSlug})
          ON CREATE SET tenant.name = $tenantName, tenant.createdAt = $now
        MERGE (project:Project {slug: $projectSlug, tenantSlug: $tenantSlug})
          ON CREATE SET project.key = $projectKey, project.createdAt = $now
        MERGE (tenant)-[:OWNS]->(project)
        CREATE (folder:Folder {
          id: $tenantSlug + ':' + $projectSlug + ':' + $folderSlug,
          slug: $folderSlug,
          name: $name,
          description: $description,
          tenant: $tenantSlug,
          projectKey: $projectSlug,
          parentFolder: $parentFolder,
          createdAt: $now,
          updatedAt: $now
        })
        MERGE (project)-[:HAS_FOLDER]->(folder)
        WITH project, folder
        OPTIONAL MATCH (project)-[:HAS_FOLDER]->(parent:Folder {slug: $parentFolder})
        FOREACH (p IN CASE WHEN parent IS NOT NULL THEN [parent] ELSE [] END |
          MERGE (p)-[:CONTAINS_FOLDER]->(folder)
        )
        RETURN folder
      `;

      const res = await tx.run(query, {
        tenantSlug,
        tenantName: params.tenant,
        projectSlug,
        projectKey: params.projectKey,
        folderSlug,
        name: params.name,
        description: params.description ?? null,
        parentFolder: params.parentFolder ?? null,
        now
      });

      return res.records[0].get("folder");
    });

    return mapFolder(result);
  } finally {
    await session.close();
  }
}

export async function listFolders(tenant: string, projectKey: string): Promise<FolderRecord[]> {
  const tenantSlug = slugify(tenant);
  const projectSlug = slugify(projectKey);
  const session = getSession();

  try {
    const result = await session.run(
      `
        MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project {slug: $projectSlug})-[:HAS_FOLDER]->(folder:Folder)
        WHERE folder.deletedAt IS NULL
        OPTIONAL MATCH (folder)-[:CONTAINS_FOLDER]->(subfolder:Folder)
        WHERE subfolder.deletedAt IS NULL
        OPTIONAL MATCH (folder)-[:CONTAINS_DOCUMENT]->(document:Document)
        WHERE document.deletedAt IS NULL
        RETURN folder, count(DISTINCT subfolder) AS folderCount, count(DISTINCT document) AS documentCount
        ORDER BY folder.name
      `,
      { tenantSlug, projectSlug }
    );

    const folders: FolderRecord[] = [];
    for (const record of result.records) {
      const node = record.get("folder");
      const folderCount = record.get("folderCount").toNumber();
      const documentCount = record.get("documentCount").toNumber();
      folders.push(mapFolder(node, documentCount, folderCount));
    }

    return folders;
  } finally {
    await session.close();
  }
}

export async function updateFolder(tenant: string, projectKey: string, folderSlug: string, updates: {
  name?: string;
  description?: string;
}): Promise<FolderRecord | null> {
  const tenantSlug = slugify(tenant);
  const projectSlug = slugify(projectKey);
  const session = getSession();
  try {
    const result = await session.executeWrite(async (tx: ManagedTransaction) => {
      const setClause = Object.entries(updates)
        .filter(([_, value]) => value !== undefined)
        .map(([key, _]) => `folder.${key} = $${key}`)
        .join(', ');
      
      if (!setClause) {
        throw new Error("No valid updates provided");
      }

      const query = `
        MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project {slug: $projectSlug})-[:HAS_FOLDER]->(folder:Folder {slug: $folderSlug})
        WHERE folder.deletedAt IS NULL
        SET ${setClause}, folder.updatedAt = $now
        OPTIONAL MATCH (folder)-[:CONTAINS_FOLDER]->(subfolder:Folder)
        WHERE subfolder.deletedAt IS NULL
        OPTIONAL MATCH (folder)-[:CONTAINS_DOCUMENT]->(document:Document)
        WHERE document.deletedAt IS NULL
        RETURN folder, count(DISTINCT subfolder) AS folderCount, count(DISTINCT document) AS documentCount
      `;

      return await tx.run(query, {
        tenantSlug,
        projectSlug,
        folderSlug,
        now: new Date().toISOString(),
        ...updates
      });
    });

    if (result.records.length === 0) {
      return null;
    }

    const record = result.records[0];
    const node = record.get("folder");
    const folderCount = record.get("folderCount").toNumber();
    const documentCount = record.get("documentCount").toNumber();
    return mapFolder(node, documentCount, folderCount);
  } finally {
    await session.close();
  }
}

export async function updateRequirement(tenant: string, projectKey: string, requirementId: string, updates: {
  title?: string;
  text?: string;
  pattern?: RequirementPattern;
  verification?: VerificationMethod;
}): Promise<RequirementRecord | null> {
  const tenantSlug = slugify(tenant);
  const projectSlug = slugify(projectKey);
  const session = getSession();
  try {
    const result = await session.executeWrite(async (tx: ManagedTransaction) => {
      const setClause = Object.entries(updates)
        .filter(([_, value]) => value !== undefined)
        .map(([key, _]) => `requirement.${key} = $${key}`)
        .join(', ');
      
      if (!setClause) {
        throw new Error("No valid updates provided");
      }

      const query = `
        MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project {slug: $projectSlug})
        MATCH (requirement:Requirement {id: $requirementId})
        WHERE requirement.tenant = $tenantSlug AND requirement.projectKey = $projectSlug
        SET ${setClause}, requirement.updatedAt = $now
        RETURN requirement
      `;

      return await tx.run(query, {
        tenantSlug,
        projectSlug,
        requirementId,
        now: new Date().toISOString(),
        ...updates
      });
    });

    if (result.records.length === 0) {
      return null;
    }

    const record = result.records[0];
    const node = record.get("requirement");
    return mapRequirement(node);
  } finally {
    await session.close();
  }
}

export async function softDeleteRequirement(tenant: string, projectKey: string, requirementId: string): Promise<RequirementRecord | null> {
  const tenantSlug = slugify(tenant);
  const projectSlug = slugify(projectKey);
  const session = getSession();
  try {
    const result = await session.executeWrite(async (tx: ManagedTransaction) => {
      const query = `
        MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project {slug: $projectSlug})
        MATCH (requirement:Requirement {id: $requirementId})
        WHERE requirement.tenant = $tenantSlug AND requirement.projectKey = $projectSlug
        SET requirement.deleted = true, requirement.updatedAt = $now
        RETURN requirement
      `;

      return await tx.run(query, {
        tenantSlug,
        projectSlug,
        requirementId,
        now: new Date().toISOString()
      });
    });

    if (result.records.length === 0) {
      return null;
    }

    const record = result.records[0];
    const node = record.get("requirement");
    return mapRequirement(node);
  } finally {
    await session.close();
  }
}

export async function findDuplicateRequirementRefs(tenant: string, projectKey: string): Promise<{ ref: string; count: number; requirements: RequirementRecord[] }[]> {
  const tenantSlug = slugify(tenant);
  const projectSlug = slugify(projectKey);
  const session = getSession();

  try {
    const result = await session.run(
      `
        MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project {slug: $projectSlug})
        OPTIONAL MATCH (project)-[:CONTAINS]->(direct:Requirement)
        OPTIONAL MATCH (project)-[:HAS_DOCUMENT]->(:Document)-[:CONTAINS]->(docReq:Requirement)
        WITH project, collect(DISTINCT direct) + collect(DISTINCT docReq) AS reqs
        UNWIND reqs AS requirement
        WITH DISTINCT requirement
        WHERE requirement IS NOT NULL AND (requirement.deleted IS NULL OR requirement.deleted = false)
        WITH requirement.ref AS ref, collect(requirement) AS requirements
        WHERE size(requirements) > 1
        RETURN ref, size(requirements) AS count, requirements
        ORDER BY ref
      `,
      { tenantSlug, projectSlug }
    );

    return result.records.map(record => ({
      ref: record.get("ref"),
      count: Number(record.get("count")),
      requirements: record.get("requirements").map((node: any) => mapRequirement(node))
    }));
  } finally {
    await session.close();
  }
}

export async function fixDuplicateRequirementRefs(tenant: string, projectKey: string): Promise<{ fixed: number; changes: Array<{ oldRef: string; newRef: string; requirementId: string }> }> {
  const tenantSlug = slugify(tenant);
  const projectSlug = slugify(projectKey);
  const session = getSession();

  try {
    const result = await session.executeWrite(async (tx: ManagedTransaction) => {
      const now = new Date().toISOString();
      const changes: Array<{ oldRef: string; newRef: string; requirementId: string }> = [];
      
      // Find all duplicates
      const duplicateQuery = `
        MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project {slug: $projectSlug})
        OPTIONAL MATCH (project)-[:CONTAINS]->(direct:Requirement)
        OPTIONAL MATCH (project)-[:HAS_DOCUMENT]->(:Document)-[:CONTAINS]->(docReq:Requirement)
        WITH project, collect(DISTINCT direct) + collect(DISTINCT docReq) AS reqs
        UNWIND reqs AS requirement
        WITH DISTINCT requirement
        WHERE requirement IS NOT NULL AND (requirement.deleted IS NULL OR requirement.deleted = false)
        WITH requirement.ref AS ref, collect(requirement) AS requirements
        WHERE size(requirements) > 1
        RETURN ref, requirements
        ORDER BY ref
      `;
      
      const duplicateResult = await tx.run(duplicateQuery, { tenantSlug, projectSlug });
      
      for (const record of duplicateResult.records) {
        const duplicateRef = record.get("ref");
        const requirements = record.get("requirements");
        
        // Extract prefix from the duplicate ref (e.g., "URD-USER" from "URD-USER-002")
        const refParts = duplicateRef.split('-');
        const prefix = refParts.slice(0, -1).join('-');
        
        // Find the highest number already used for this prefix
        const maxQuery = `
          MATCH (req:Requirement)
          WHERE req.ref STARTS WITH $prefix + '-' AND req.ref =~ ($prefix + '-[0-9]{3}')
          WITH max(toInteger(split(req.ref, '-')[size(split(req.ref, '-'))-1])) AS maxExisting
          RETURN maxExisting
        `;
        
        const maxResult = await tx.run(maxQuery, { prefix });
        const maxExisting = maxResult.records[0]?.get("maxExisting");
        let nextNumber = (maxExisting ? Number(maxExisting) : 0) + 1;
        
        // Keep the first requirement with the original ref, renumber the others
        for (let i = 1; i < requirements.length; i++) {
          const requirement = requirements[i];
          const newRef = prefix + '-' + String(nextNumber).padStart(3, '0');
          
          // Update the requirement with new ref
          const updateQuery = `
            MATCH (requirement:Requirement {id: $requirementId})
            SET requirement.ref = $newRef, 
                requirement.updatedAt = $now,
                requirement.path = $tenantSlug + '/' + $projectSlug + '/requirements/' + $newRef + '.md'
            RETURN requirement.id AS id
          `;
          
          await tx.run(updateQuery, {
            requirementId: requirement.properties.id,
            newRef,
            now,
            tenantSlug,
            projectSlug
          });
          
          changes.push({
            oldRef: duplicateRef,
            newRef,
            requirementId: requirement.properties.id
          });
          
          nextNumber++;
        }
      }
      
      return changes;
    });

    return {
      fixed: result.length,
      changes: result
    };
  } finally {
    await session.close();
  }
}

// Architecture Block Functions

export async function createArchitectureBlock(params: {
  tenant: string;
  projectKey: string;
  name: string;
  kind: BlockKind;
  stereotype?: string;
  description?: string;
  positionX: number;
  positionY: number;
  sizeWidth?: number;
  sizeHeight?: number;
  ports?: BlockPortRecord[];
}): Promise<ArchitectureBlockRecord> {
  const tenantSlug = slugify(params.tenant);
  const projectSlug = slugify(params.projectKey);
  const now = new Date().toISOString();
  const blockId = `block-${Date.now()}`;

  const session = getSession();
  try {
    const result = await session.executeWrite(async (tx: ManagedTransaction) => {
      const query = `
        MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project {slug: $projectSlug})
        CREATE (block:ArchitectureBlock {
          id: $blockId,
          name: $name,
          kind: $kind,
          stereotype: $stereotype,
          description: $description,
          tenant: $tenant,
          projectKey: $projectKey,
          positionX: $positionX,
          positionY: $positionY,
          sizeWidth: $sizeWidth,
          sizeHeight: $sizeHeight,
          ports: $ports,
          documentIds: "[]",
          createdAt: $now,
          updatedAt: $now
        })
        MERGE (project)-[:HAS_ARCHITECTURE_BLOCK]->(block)
        RETURN block
      `;

      const queryResult = await tx.run(query, {
        tenantSlug,
        projectSlug,
        blockId,
        name: params.name,
        kind: params.kind,
        stereotype: params.stereotype || null,
        description: params.description || null,
        tenant: params.tenant,
        projectKey: params.projectKey,
        positionX: params.positionX,
        positionY: params.positionY,
        sizeWidth: params.sizeWidth || 220,
        sizeHeight: params.sizeHeight || 140,
        ports: JSON.stringify(params.ports || []),
        now
      });

      if (queryResult.records.length === 0) {
        throw new Error("Failed to create architecture block");
      }

      return queryResult.records[0].get("block");
    });

    return mapArchitectureBlock(result);
  } finally {
    await session.close();
  }
}

export async function getArchitectureBlocks(params: {
  tenant: string;
  projectKey: string;
}): Promise<ArchitectureBlockRecord[]> {
  const tenantSlug = slugify(params.tenant);
  const projectSlug = slugify(params.projectKey);

  const session = getSession();
  try {
    const result = await session.executeRead(async (tx: ManagedTransaction) => {
      const query = `
        MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project {slug: $projectSlug})-[:HAS_ARCHITECTURE_BLOCK]->(block:ArchitectureBlock)
        RETURN block
        ORDER BY block.createdAt ASC
      `;

      return await tx.run(query, { tenantSlug, projectSlug });
    });

    return result.records.map(record => mapArchitectureBlock(record.get("block")));
  } finally {
    await session.close();
  }
}

export async function updateArchitectureBlock(params: {
  tenant: string;
  projectKey: string;
  blockId: string;
  name?: string;
  kind?: BlockKind;
  stereotype?: string;
  description?: string;
  positionX?: number;
  positionY?: number;
  sizeWidth?: number;
  sizeHeight?: number;
  ports?: BlockPortRecord[];
  documentIds?: string[];
}): Promise<ArchitectureBlockRecord> {
  const tenantSlug = slugify(params.tenant);
  const projectSlug = slugify(params.projectKey);
  const now = new Date().toISOString();

  const session = getSession();
  try {
    const result = await session.executeWrite(async (tx: ManagedTransaction) => {
      const updates = [];
      const queryParams: Record<string, any> = {
        tenantSlug,
        projectSlug,
        blockId: params.blockId,
        updatedAt: now
      };

      if (params.name !== undefined) {
        updates.push("block.name = $name");
        queryParams.name = params.name;
      }
      if (params.kind !== undefined) {
        updates.push("block.kind = $kind");
        queryParams.kind = params.kind;
      }
      if (params.stereotype !== undefined) {
        updates.push("block.stereotype = $stereotype");
        queryParams.stereotype = params.stereotype;
      }
      if (params.description !== undefined) {
        updates.push("block.description = $description");
        queryParams.description = params.description;
      }
      if (params.positionX !== undefined) {
        updates.push("block.positionX = $positionX");
        queryParams.positionX = params.positionX;
      }
      if (params.positionY !== undefined) {
        updates.push("block.positionY = $positionY");
        queryParams.positionY = params.positionY;
      }
      if (params.sizeWidth !== undefined) {
        updates.push("block.sizeWidth = $sizeWidth");
        queryParams.sizeWidth = params.sizeWidth;
      }
      if (params.sizeHeight !== undefined) {
        updates.push("block.sizeHeight = $sizeHeight");
        queryParams.sizeHeight = params.sizeHeight;
      }
      if (params.ports !== undefined) {
        updates.push("block.ports = $ports");
        queryParams.ports = JSON.stringify(params.ports);
      }
      if (params.documentIds !== undefined) {
        updates.push("block.documentIds = $documentIds");
        queryParams.documentIds = JSON.stringify(params.documentIds);
      }

      updates.push("block.updatedAt = $updatedAt");

      const query = `
        MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project {slug: $projectSlug})-[:HAS_ARCHITECTURE_BLOCK]->(block:ArchitectureBlock {id: $blockId})
        SET ${updates.join(", ")}
        RETURN block
      `;

      const queryResult = await tx.run(query, queryParams);

      if (queryResult.records.length === 0) {
        throw new Error("Architecture block not found");
      }

      return queryResult.records[0].get("block");
    });

    return mapArchitectureBlock(result);
  } finally {
    await session.close();
  }
}

export async function deleteArchitectureBlock(params: {
  tenant: string;
  projectKey: string;
  blockId: string;
}): Promise<void> {
  const tenantSlug = slugify(params.tenant);
  const projectSlug = slugify(params.projectKey);

  const session = getSession();
  try {
    await session.executeWrite(async (tx: ManagedTransaction) => {
      const query = `
        MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project {slug: $projectSlug})-[:HAS_ARCHITECTURE_BLOCK]->(block:ArchitectureBlock {id: $blockId})
        DETACH DELETE block
      `;

      await tx.run(query, { tenantSlug, projectSlug, blockId: params.blockId });
    });
  } finally {
    await session.close();
  }
}

// Architecture Connector Functions

export async function createArchitectureConnector(params: {
  tenant: string;
  projectKey: string;
  source: string;
  target: string;
  kind: ConnectorKind;
  label?: string;
  sourcePortId?: string;
  targetPortId?: string;
}): Promise<ArchitectureConnectorRecord> {
  const tenantSlug = slugify(params.tenant);
  const projectSlug = slugify(params.projectKey);
  const now = new Date().toISOString();
  const connectorId = `connector-${Date.now()}`;

  const session = getSession();
  try {
    const result = await session.executeWrite(async (tx: ManagedTransaction) => {
      const query = `
        MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project {slug: $projectSlug})
        CREATE (connector:ArchitectureConnector {
          id: $connectorId,
          source: $source,
          target: $target,
          kind: $kind,
          label: $label,
          sourcePortId: $sourcePortId,
          targetPortId: $targetPortId,
          tenant: $tenant,
          projectKey: $projectKey,
          createdAt: $now,
          updatedAt: $now
        })
        MERGE (project)-[:HAS_ARCHITECTURE_CONNECTOR]->(connector)
        RETURN connector
      `;

      const queryResult = await tx.run(query, {
        tenantSlug,
        projectSlug,
        connectorId,
        source: params.source,
        target: params.target,
        kind: params.kind,
        label: params.label || null,
        sourcePortId: params.sourcePortId || null,
        targetPortId: params.targetPortId || null,
        tenant: params.tenant,
        projectKey: params.projectKey,
        now
      });

      if (queryResult.records.length === 0) {
        throw new Error("Failed to create architecture connector");
      }

      return queryResult.records[0].get("connector");
    });

    return mapArchitectureConnector(result);
  } finally {
    await session.close();
  }
}

export async function getArchitectureConnectors(params: {
  tenant: string;
  projectKey: string;
}): Promise<ArchitectureConnectorRecord[]> {
  const tenantSlug = slugify(params.tenant);
  const projectSlug = slugify(params.projectKey);

  const session = getSession();
  try {
    const result = await session.executeRead(async (tx: ManagedTransaction) => {
      const query = `
        MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project {slug: $projectSlug})-[:HAS_ARCHITECTURE_CONNECTOR]->(connector:ArchitectureConnector)
        RETURN connector
        ORDER BY connector.createdAt ASC
      `;

      return await tx.run(query, { tenantSlug, projectSlug });
    });

    return result.records.map(record => mapArchitectureConnector(record.get("connector")));
  } finally {
    await session.close();
  }
}

export async function deleteArchitectureConnector(params: {
  tenant: string;
  projectKey: string;
  connectorId: string;
}): Promise<void> {
  const tenantSlug = slugify(params.tenant);
  const projectSlug = slugify(params.projectKey);

  const session = getSession();
  try {
    await session.executeWrite(async (tx: ManagedTransaction) => {
      const query = `
        MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project {slug: $projectSlug})-[:HAS_ARCHITECTURE_CONNECTOR]->(connector:ArchitectureConnector {id: $connectorId})
        DETACH DELETE connector
      `;

      await tx.run(query, { tenantSlug, projectSlug, connectorId: params.connectorId });
    });
  } finally {
    await session.close();
  }
}

// Trace Links functionality
export type TraceLinkType = "satisfies" | "derives" | "verifies" | "implements" | "refines" | "conflicts";

export type TraceLinkRecord = {
  id: string;
  sourceRequirementId: string;
  sourceRequirement: RequirementRecord;
  targetRequirementId: string;
  targetRequirement: RequirementRecord;
  linkType: TraceLinkType;
  description?: string;
  tenant: string;
  projectKey: string;
  createdAt: string;
  updatedAt: string;
};

function mapTraceLink(node: Neo4jNode, sourceReq: RequirementRecord, targetReq: RequirementRecord): TraceLinkRecord {
  const props = node.properties;
  return {
    id: props.id,
    sourceRequirementId: props.sourceRequirementId,
    sourceRequirement: sourceReq,
    targetRequirementId: props.targetRequirementId,
    targetRequirement: targetReq,
    linkType: props.linkType as TraceLinkType,
    description: props.description || undefined,
    tenant: props.tenant,
    projectKey: props.projectKey,
    createdAt: props.createdAt,
    updatedAt: props.updatedAt
  };
}

export async function createTraceLink(params: {
  tenant: string;
  projectKey: string;
  sourceRequirementId: string;
  targetRequirementId: string;
  linkType: TraceLinkType;
  description?: string;
}): Promise<TraceLinkRecord> {
  const tenantSlug = slugify(params.tenant);
  const projectSlug = slugify(params.projectKey);
  const linkId = randomUUID();
  const now = new Date().toISOString();

  const session = getSession();
  try {
    const result = await session.executeWrite(async (tx: ManagedTransaction) => {
      const query = `
        MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project {slug: $projectSlug})
        OPTIONAL MATCH (project)-[:CONTAINS]->(directSource:Requirement {id: $sourceRequirementId})
        OPTIONAL MATCH (project)-[:HAS_DOCUMENT]->(:Document)-[:CONTAINS]->(docSource:Requirement {id: $sourceRequirementId})
        WITH project, coalesce(directSource, docSource) AS sourceReq
        WHERE sourceReq IS NOT NULL
        
        OPTIONAL MATCH (project)-[:CONTAINS]->(directTarget:Requirement {id: $targetRequirementId})
        OPTIONAL MATCH (project)-[:HAS_DOCUMENT]->(:Document)-[:CONTAINS]->(docTarget:Requirement {id: $targetRequirementId})
        WITH project, sourceReq, coalesce(directTarget, docTarget) AS targetReq
        WHERE targetReq IS NOT NULL
        
        CREATE (link:TraceLink {
          id: $linkId,
          sourceRequirementId: $sourceRequirementId,
          targetRequirementId: $targetRequirementId,
          linkType: $linkType,
          description: $description,
          tenant: $tenant,
          projectKey: $projectKey,
          createdAt: $createdAt,
          updatedAt: $updatedAt
        })
        
        CREATE (project)-[:HAS_TRACE_LINK]->(link)
        CREATE (sourceReq)-[:LINKS_TO {type: $linkType}]->(targetReq)
        CREATE (link)-[:FROM_REQUIREMENT]->(sourceReq)
        CREATE (link)-[:TO_REQUIREMENT]->(targetReq)
        
        RETURN link, sourceReq, targetReq
      `;

      return await tx.run(query, {
        tenantSlug,
        projectSlug,
        sourceRequirementId: params.sourceRequirementId,
        targetRequirementId: params.targetRequirementId,
        linkId,
        linkType: params.linkType,
        description: params.description || null,
        tenant: params.tenant,
        projectKey: params.projectKey,
        createdAt: now,
        updatedAt: now
      });
    });

    if (result.records.length === 0) {
      throw new Error('Failed to create trace link - requirements not found');
    }

    const record = result.records[0];
    const sourceReq = mapRequirement(record.get("sourceReq"));
    const targetReq = mapRequirement(record.get("targetReq"));
    
    return mapTraceLink(record.get("link"), sourceReq, targetReq);
  } finally {
    await session.close();
  }
}

export async function listTraceLinks(params: {
  tenant: string;
  projectKey: string;
}): Promise<TraceLinkRecord[]> {
  const tenantSlug = slugify(params.tenant);
  const projectSlug = slugify(params.projectKey);

  const session = getSession();
  try {
    const result = await session.executeRead(async (tx: ManagedTransaction) => {
      const query = `
        MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project {slug: $projectSlug})-[:HAS_TRACE_LINK]->(link:TraceLink)
        MATCH (link)-[:FROM_REQUIREMENT]->(sourceReq:Requirement)
        MATCH (link)-[:TO_REQUIREMENT]->(targetReq:Requirement)
        
        RETURN link, sourceReq, targetReq
        ORDER BY link.createdAt DESC
      `;

      return await tx.run(query, { tenantSlug, projectSlug });
    });

    return result.records.map(record => {
      const sourceReq = mapRequirement(record.get("sourceReq"));
      const targetReq = mapRequirement(record.get("targetReq"));
      return mapTraceLink(record.get("link"), sourceReq, targetReq);
    });
  } finally {
    await session.close();
  }
}

export async function listTraceLinksByRequirement(params: {
  tenant: string;
  projectKey: string;
  requirementId: string;
}): Promise<TraceLinkRecord[]> {
  const tenantSlug = slugify(params.tenant);
  const projectSlug = slugify(params.projectKey);

  const session = getSession();
  try {
    const result = await session.executeRead(async (tx: ManagedTransaction) => {
      const query = `
        MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project {slug: $projectSlug})-[:HAS_TRACE_LINK]->(link:TraceLink)
        MATCH (link)-[:FROM_REQUIREMENT]->(sourceReq:Requirement)
        MATCH (link)-[:TO_REQUIREMENT]->(targetReq:Requirement)
        
        WHERE sourceReq.id = $requirementId OR targetReq.id = $requirementId
        
        RETURN link, sourceReq, targetReq
        ORDER BY link.createdAt DESC
      `;

      return await tx.run(query, { 
        tenantSlug, 
        projectSlug, 
        requirementId: params.requirementId 
      });
    });

    return result.records.map(record => {
      const sourceReq = mapRequirement(record.get("sourceReq"));
      const targetReq = mapRequirement(record.get("targetReq"));
      return mapTraceLink(record.get("link"), sourceReq, targetReq);
    });
  } finally {
    await session.close();
  }
}

export async function deleteTraceLink(params: {
  tenant: string;
  projectKey: string;
  linkId: string;
}): Promise<void> {
  const tenantSlug = slugify(params.tenant);
  const projectSlug = slugify(params.projectKey);

  const session = getSession();
  try {
    await session.executeWrite(async (tx: ManagedTransaction) => {
      const query = `
        MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project {slug: $projectSlug})-[:HAS_TRACE_LINK]->(link:TraceLink {id: $linkId})
        MATCH (link)-[:FROM_REQUIREMENT]->(sourceReq:Requirement)
        MATCH (link)-[:TO_REQUIREMENT]->(targetReq:Requirement)
        MATCH (sourceReq)-[rel:LINKS_TO]->(targetReq)
        
        DELETE rel
        DETACH DELETE link
      `;

      const result = await tx.run(query, { 
        tenantSlug, 
        projectSlug, 
        linkId: params.linkId 
      });
      
      if (result.summary.counters.nodesDeleted() === 0) {
        throw new Error('Trace link not found');
      }
    });
  } finally {
    await session.close();
  }
}
