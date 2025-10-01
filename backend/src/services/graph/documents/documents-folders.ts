import type { ManagedTransaction, Node as Neo4jNode } from "neo4j-driver";
import { slugify } from "../../workspace.js";
import { getSession } from "../driver.js";
import { mapFolder, type FolderRecord, type ListOptions } from "./documents-crud.js";

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
  projectKey: string,
  options?: ListOptions
): Promise<FolderRecord[]> {
  const tenantSlug = slugify(tenant);
  const projectSlug = slugify(projectKey);
  const limit = Math.min(options?.limit ?? 100, 1000);
  const offset = options?.offset ?? 0;
  const session = getSession();

  try {
    // QUERY PROFILE: expected <50ms with pagination
    const result = await session.run(
      `
        MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project {slug: $projectSlug})-[:HAS_FOLDER]->(folder:Folder)
        OPTIONAL MATCH (folder)-[:CONTAINS_DOCUMENT]->(document:Document)
        OPTIONAL MATCH (folder)-[:CONTAINS_FOLDER]->(subFolder:Folder)
        RETURN folder, count(DISTINCT document) AS documentCount, count(DISTINCT subFolder) AS folderCount
        ORDER BY folder.name
        SKIP $offset
        LIMIT $limit
      `,
      { tenantSlug, projectSlug, offset, limit }
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
