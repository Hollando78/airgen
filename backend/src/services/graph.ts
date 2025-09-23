import neo4j, { Driver, Session, ManagedTransaction, Node as Neo4jNode } from "neo4j-driver";
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

export async function createDocumentSection(params: {
  tenant: string;
  projectKey: string;
  documentSlug: string;
  name: string;
  description?: string;
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
        OPTIONAL MATCH (section)-[:HAS_REQUIREMENT]->(req:Requirement)
        DETACH DELETE section, req
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

  const session = getSession();
  try {
    const result = await session.executeWrite(async (tx: ManagedTransaction) => {
      const query = `
        MERGE (tenant:Tenant {slug: $tenantSlug})
          ON CREATE SET tenant.name = $tenantName, tenant.createdAt = $now
        MERGE (project:Project {slug: $projectSlug, tenantSlug: $tenantSlug})
          ON CREATE SET project.key = $projectKey, project.createdAt = $now
        SET project.requirementCounter = coalesce(project.requirementCounter, 0) + 1
        WITH tenant, project, project.requirementCounter AS counter
        WITH tenant, project, counter,
             right('000' + toString(counter), 3) AS padded,
             toUpper(replace($projectSlug, '-', '')) AS upper
        WITH tenant, project, counter, padded, upper,
             'REQ-' + upper + '-' + padded AS ref
        CREATE (requirement:Requirement {
          id: $tenantSlug + ':' + $projectSlug + ':' + ref,
          ref: ref,
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
          path: $tenantSlug + '/' + $projectSlug + '/requirements/' + ref + '.md',
          createdAt: $now,
          updatedAt: $now
        })
        MERGE (tenant)-[:OWNS]->(project)
        WITH tenant, project, requirement
        OPTIONAL MATCH (project)-[:HAS_DOCUMENT]->(document:Document {slug: $documentSlug})
        OPTIONAL MATCH (section:DocumentSection {id: $sectionId})
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

export async function listRequirements(tenant: string, projectKey: string): Promise<RequirementRecord[]> {
  const tenantSlug = slugify(tenant);
  const projectSlug = slugify(projectKey);

  const session = getSession();
  try {
    const result = await session.run(
      `
        MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project {slug: $projectSlug})-[:CONTAINS]->(requirement:Requirement)
        RETURN requirement
        ORDER BY requirement.ref
      `,
      { tenantSlug, projectSlug }
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

export async function listSectionRequirements(sectionId: string): Promise<RequirementRecord[]> {
  const session = getSession();
  try {
    const result = await session.run(
      `
        MATCH (section:DocumentSection {id: $sectionId})-[:HAS_REQUIREMENT]->(requirement:Requirement)
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
        MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project {slug: $projectSlug})-[:CONTAINS]->(requirement:Requirement {ref: $ref})
        RETURN requirement
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
        MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project {slug: $projectSlug})-[:CONTAINS]->(requirement:Requirement {ref: $ref})
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
          tenant: $tenantSlug,
          projectKey: $projectSlug,
          parentFolder: $parentFolder,
          createdAt: $now,
          updatedAt: $now
        })
        MERGE (project)-[:HAS_DOCUMENT]->(document)
        WITH document
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
    return mapFolder(node, folderCount, documentCount);
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
        WITH folder
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
