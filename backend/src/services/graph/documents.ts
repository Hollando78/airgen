import { ManagedTransaction, Node as Neo4jNode } from "neo4j-driver";
import { slugify } from "../workspace.js";
import { getSession } from "./driver.js";
import {
  updateRequirementRefsForDocument,
  updateRequirementRefsForSection
} from "./requirements.js";

export type DocumentKind = "structured" | "surrogate";

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
  kind: DocumentKind;
  originalFileName?: string | null;
  storedFileName?: string | null;
  mimeType?: string | null;
  fileSize?: number | null;
  storagePath?: string | null;
  previewPath?: string | null;
  previewMimeType?: string | null;
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
    requirementCount: requirementCount ?? 0,
    kind: (props.kind ? String(props.kind) : "structured") as DocumentKind,
    originalFileName: props.originalFileName ? String(props.originalFileName) : null,
    storedFileName: props.storedFileName ? String(props.storedFileName) : null,
    mimeType: props.mimeType ? String(props.mimeType) : null,
    fileSize:
      props.fileSize !== undefined && props.fileSize !== null
        ? Number(props.fileSize)
        : null,
    storagePath: props.storagePath ? String(props.storagePath) : null,
    previewPath: props.previewPath ? String(props.previewPath) : null,
    previewMimeType: props.previewMimeType ? String(props.previewMimeType) : null
  };
}

function mapFolder(
  node: Neo4jNode,
  documentCount?: number,
  folderCount?: number
): FolderRecord {
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
  const requirementCount =
    props.requirementCount !== undefined ? Number(props.requirementCount) : undefined;
  return mapDocument(node, requirementCount);
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

      return res.records[0].get("section") as Neo4jNode;
    });

    return mapDocumentSection(result);
  } finally {
    await session.close();
  }
}

export async function listDocumentSections(
  tenant: string,
  projectKey: string,
  documentSlug: string
): Promise<DocumentSectionRecord[]> {
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

export async function updateDocumentSection(
  sectionId: string,
  params: {
    name?: string;
    description?: string;
    order?: number;
    shortCode?: string;
  }
): Promise<DocumentSectionRecord> {
  const now = new Date().toISOString();
  const session = getSession();

  try {
    const result = await session.executeWrite(async (tx: ManagedTransaction) => {
      const updateClauses: string[] = [];
      const queryParams: Record<string, unknown> = { sectionId, now };

      if (params.name !== undefined) {
        updateClauses.push("section.name = $name");
        queryParams.name = params.name;
      }
      if (params.description !== undefined) {
        updateClauses.push("section.description = $description");
        queryParams.description = params.description;
      }
      if (params.order !== undefined) {
        updateClauses.push("section.order = $order");
        queryParams.order = params.order;
      }
      if (params.shortCode !== undefined) {
        updateClauses.push("section.shortCode = $shortCode");
        queryParams.shortCode = params.shortCode;
      }

      if (updateClauses.length === 0) {
        throw new Error("No fields to update");
      }

      const query = `
        MATCH (section:DocumentSection {id: $sectionId})
        SET ${updateClauses.join(", ")}, section.updatedAt = $now
        RETURN section
      `;

      const res = await tx.run(query, queryParams);

      if (res.records.length === 0) {
        throw new Error("Section not found");
      }

      if (params.shortCode !== undefined || params.name !== undefined) {
        await updateRequirementRefsForSection(tx, sectionId);
      }

      return res.records[0].get("section") as Neo4jNode;
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

export async function createDocument(params: {
  tenant: string;
  projectKey: string;
  name: string;
  description?: string;
  shortCode?: string;
  parentFolder?: string;
  slug?: string;
  kind?: DocumentKind;
  originalFileName?: string;
  storedFileName?: string;
  mimeType?: string;
  fileSize?: number;
  storagePath?: string;
  previewPath?: string;
  previewMimeType?: string;
}): Promise<DocumentRecord> {
  const tenantSlug = slugify(params.tenant);
  const projectSlug = slugify(params.projectKey);
  const now = new Date().toISOString();
  const resolvedSlug = params.slug ? slugify(params.slug) : slugify(params.name);
  const parentFolderSlug = params.parentFolder ? slugify(params.parentFolder) : null;

  const session = getSession();
  try {
    const result = await session.executeWrite(async (tx: ManagedTransaction) => {
      const query = `
        MERGE (tenant:Tenant {slug: $tenantSlug})
          ON CREATE SET tenant.createdAt = $now
        MERGE (project:Project {slug: $projectSlug, tenantSlug: $tenantSlug})
          ON CREATE SET project.key = $projectKey, project.createdAt = $now
        CREATE (document:Document {
          id: $tenantSlug + ':' + $projectSlug + ':' + $slug,
          slug: $slug,
          name: $name,
          description: $description,
          shortCode: $shortCode,
          tenant: $tenantSlug,
          projectKey: $projectKey,
          parentFolder: $parentFolder,
          kind: $kind,
          originalFileName: $originalFileName,
          storedFileName: $storedFileName,
          mimeType: $mimeType,
          fileSize: $fileSize,
          storagePath: $storagePath,
          previewPath: $previewPath,
          previewMimeType: $previewMimeType,
          createdAt: $now,
          updatedAt: $now
        })
        MERGE (project)-[:HAS_DOCUMENT]->(document)
        RETURN document
      `;

      const res = await tx.run(query, {
        tenantSlug,
        projectSlug,
        projectKey: params.projectKey,
        slug: resolvedSlug,
        name: params.name,
        description: params.description ?? null,
        shortCode: params.shortCode ?? null,
        parentFolder: parentFolderSlug,
        kind: params.kind ?? "structured",
        originalFileName: params.originalFileName ?? null,
        storedFileName: params.storedFileName ?? null,
        mimeType: params.mimeType ?? null,
        fileSize: params.fileSize ?? null,
        storagePath: params.storagePath ?? null,
        previewPath: params.previewPath ?? null,
        previewMimeType: params.previewMimeType ?? null,
        now
      });

      if (res.records.length === 0) {
        throw new Error("Failed to create document node");
      }

      const node = res.records[0].get("document") as Neo4jNode;
      return mapDocument(node);
    });

    return result;
  } finally {
    await session.close();
  }
}

export async function listDocuments(
  tenant: string,
  projectKey: string
): Promise<DocumentRecord[]> {
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
      const node = record.get("document") as Neo4jNode;
      const count = record.get("requirementCount").toNumber();
      documents.push(mapDocument(node, count));
    }

    return documents;
  } finally {
    await session.close();
  }
}

export async function getDocument(
  tenant: string,
  projectKey: string,
  documentSlug: string
): Promise<DocumentRecord | null> {
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

    const node = result.records[0].get("document") as Neo4jNode;
    const count = result.records[0].get("requirementCount").toNumber();
    return mapDocument(node, count);
  } finally {
    await session.close();
  }
}

export async function updateDocument(
  tenant: string,
  projectKey: string,
  documentSlug: string,
  updates: {
    name?: string;
    description?: string;
    shortCode?: string;
  }
): Promise<DocumentRecord | null> {
  const tenantSlug = slugify(tenant);
  const projectSlug = slugify(projectKey);
  const session = getSession();

  try {
    const result = await session.executeWrite(async (tx: ManagedTransaction) => {
      const setClause = Object.entries(updates)
        .filter(([_, value]) => value !== undefined)
        .map(([key]) => `document.${key} = $${key}`)
        .join(", ");

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

export async function updateDocumentFolder(
  tenant: string,
  projectKey: string,
  documentSlug: string,
  parentFolder?: string | null
): Promise<DocumentRecord | null> {
  const tenantSlug = slugify(tenant);
  const projectSlug = slugify(projectKey);
  const session = getSession();

  try {
    const result = await session.executeWrite(async (tx: ManagedTransaction) => {
      await tx.run(
        `
          MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project {slug: $projectSlug})-[:HAS_DOCUMENT]->(document:Document {slug: $documentSlug})
          OPTIONAL MATCH (document)-[r:IN_FOLDER]->(:Folder)
          DELETE r
          RETURN document
        `,
        { tenantSlug, projectSlug, documentSlug }
      );

      if (parentFolder) {
        const parentFolderSlug = slugify(parentFolder);
        return tx.run(
          `
            MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project {slug: $projectSlug})-[:HAS_DOCUMENT]->(document:Document {slug: $documentSlug})
            MATCH (project)-[:HAS_FOLDER]->(folder:Folder {slug: $parentFolderSlug})
            MERGE (document)-[:IN_FOLDER]->(folder)
            SET document.parentFolder = $parentFolder, document.updatedAt = $now
            WITH document
            OPTIONAL MATCH (document)-[:CONTAINS]->(requirement:Requirement)
            RETURN document, count(requirement) AS requirementCount
          `,
          {
            tenantSlug,
            projectSlug,
            documentSlug,
            parentFolderSlug,
            parentFolder,
            now: new Date().toISOString()
          }
        );
      }

      return tx.run(
        `
          MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project {slug: $projectSlug})-[:HAS_DOCUMENT]->(document:Document {slug: $documentSlug})
          SET document.parentFolder = null, document.updatedAt = $now
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

    const node = result.records[0].get("document") as Neo4jNode;
    const count = result.records[0].get("requirementCount").toNumber();
    return mapDocument(node, count);
  } finally {
    await session.close();
  }
}

export async function softDeleteDocument(
  tenant: string,
  projectKey: string,
  documentSlug: string
): Promise<DocumentRecord | null> {
  const tenantSlug = slugify(tenant);
  const projectSlug = slugify(projectKey);
  const session = getSession();

  try {
    const result = await session.executeWrite(async (tx: ManagedTransaction) => {
      const query = `
        MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project {slug: $projectSlug})-[:HAS_DOCUMENT]->(document:Document {slug: $documentSlug})
        SET document.deletedAt = $now, document.updatedAt = $now
        RETURN document
      `;

      const res = await tx.run(query, {
        tenantSlug,
        projectSlug,
        documentSlug,
        now: new Date().toISOString()
      });

      return res.records.length ? res.records[0].get("document") : null;
    });

    return result ? transformDocumentRecord(result) : null;
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
  const now = new Date().toISOString();

  const session = getSession();
  try {
    const result = await session.executeWrite(async (tx: ManagedTransaction) => {
      const query = `
        MERGE (tenant:Tenant {slug: $tenantSlug})
          ON CREATE SET tenant.createdAt = $now
        MERGE (project:Project {slug: $projectSlug, tenantSlug: $tenantSlug})
          ON CREATE SET project.key = $projectKey, project.createdAt = $now
        CREATE (folder:Folder {
          id: $tenantSlug + ':' + $projectSlug + ':' + $slug,
          slug: $slug,
          name: $name,
          description: $description,
          tenant: $tenantSlug,
          projectKey: $projectKey,
          parentFolder: $parentFolder,
          createdAt: $now,
          updatedAt: $now
        })
        MERGE (project)-[:HAS_FOLDER]->(folder)
        RETURN folder
      `;

      const res = await tx.run(query, {
        tenantSlug,
        projectSlug,
        projectKey: params.projectKey,
        slug: slugify(params.name),
        name: params.name,
        description: params.description ?? null,
        parentFolder: params.parentFolder ? slugify(params.parentFolder) : null,
        now
      });

      if (res.records.length === 0) {
        throw new Error("Failed to create folder node");
      }

      const node = res.records[0].get("folder") as Neo4jNode;
      return mapFolder(node);
    });

    return result;
  } finally {
    await session.close();
  }
}

export async function listFolders(
  tenant: string,
  projectKey: string
): Promise<FolderRecord[]> {
  const tenantSlug = slugify(tenant);
  const projectSlug = slugify(projectKey);
  const session = getSession();

  try {
    const result = await session.run(
      `
        MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project {slug: $projectSlug})-[:HAS_FOLDER]->(folder:Folder)
        OPTIONAL MATCH (folder)-[:CONTAINS_DOCUMENT]->(document:Document)
        OPTIONAL MATCH (folder)-[:CONTAINS_FOLDER]->(subFolder:Folder)
        RETURN folder, count(DISTINCT document) AS documentCount, count(DISTINCT subFolder) AS folderCount
        ORDER BY folder.name
      `,
      { tenantSlug, projectSlug }
    );

    const folders: FolderRecord[] = [];
    for (const record of result.records) {
      const node = record.get("folder") as Neo4jNode;
      const documentCount = Number(record.get("documentCount")) || 0;
      const folderCount = Number(record.get("folderCount")) || 0;
      folders.push(mapFolder(node, documentCount, folderCount));
    }

    return folders;
  } finally {
    await session.close();
  }
}

export async function updateFolder(
  tenant: string,
  projectKey: string,
  folderSlug: string,
  updates: {
    name?: string;
    description?: string;
  }
): Promise<FolderRecord | null> {
  const tenantSlug = slugify(tenant);
  const projectSlug = slugify(projectKey);
  const session = getSession();

  try {
    const result = await session.executeWrite(async (tx: ManagedTransaction) => {
      const setClause = Object.entries(updates)
        .filter(([_, value]) => value !== undefined)
        .map(([key]) => `folder.${key} = $${key}`)
        .join(", ");

      if (!setClause) {
        throw new Error("No valid updates provided");
      }

      const query = `
        MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project {slug: $projectSlug})-[:HAS_FOLDER]->(folder:Folder {slug: $folderSlug})
        SET ${setClause}, folder.updatedAt = $now
        WITH folder
        OPTIONAL MATCH (folder)-[:CONTAINS_DOCUMENT]->(document:Document)
        OPTIONAL MATCH (folder)-[:CONTAINS_FOLDER]->(subFolder:Folder)
        RETURN folder, count(DISTINCT document) AS documentCount, count(DISTINCT subFolder) AS folderCount
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
    const node = record.get("folder") as Neo4jNode;
    const folderCount = record.get("folderCount").toNumber();
    const documentCount = record.get("documentCount").toNumber();
    return mapFolder(node, documentCount, folderCount);
  } finally {
    await session.close();
  }
}

export async function softDeleteFolder(
  tenant: string,
  projectKey: string,
  folderSlug: string
): Promise<FolderRecord | null> {
  const tenantSlug = slugify(tenant);
  const projectSlug = slugify(projectKey);
  const session = getSession();

  try {
    const result = await session.executeWrite(async (tx: ManagedTransaction) => {
      const query = `
        MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project {slug: $projectSlug})-[:HAS_FOLDER]->(folder:Folder {slug: $folderSlug})
        SET folder.deletedAt = $now, folder.updatedAt = $now
        WITH folder
        OPTIONAL MATCH (folder)-[:CONTAINS_DOCUMENT]->(document:Document)
        OPTIONAL MATCH (folder)-[:CONTAINS_FOLDER]->(subFolder:Folder)
        RETURN folder, count(DISTINCT document) AS documentCount, count(DISTINCT subFolder) AS folderCount
      `;

      return await tx.run(query, {
        tenantSlug,
        projectSlug,
        folderSlug,
        now: new Date().toISOString()
      });
    });

    if (result.records.length === 0) {
      return null;
    }

    const record = result.records[0];
    const node = record.get("folder") as Neo4jNode;
    const folderCount = record.get("folderCount").toNumber();
    const documentCount = record.get("documentCount").toNumber();
    return mapFolder(node, documentCount, folderCount);
  } finally {
    await session.close();
  }
}
