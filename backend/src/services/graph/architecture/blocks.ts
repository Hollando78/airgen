import { ManagedTransaction, Node as Neo4jNode, Relationship as Neo4jRelationship } from "neo4j-driver";
import { slugify } from "../../workspace.js";
import { getSession } from "../driver.js";
import {
  ArchitectureBlockRecord,
  ArchitectureBlockLibraryRecord,
  BlockKind,
  BlockPortRecord
} from "./types.js";
import { mapBlockWithPlacement, mapBlockLibraryEntry, toNumber } from "./mappers.js";
import { getCached, CacheKeys, CacheInvalidation } from "../../lib/cache.js";

export async function createArchitectureBlock(params: {
  tenant: string;
  projectKey: string;
  diagramId: string;
  positionX: number;
  positionY: number;
  sizeWidth?: number;
  sizeHeight?: number;
  name?: string;
  kind?: BlockKind;
  stereotype?: string;
  description?: string;
  ports?: BlockPortRecord[];
  documentIds?: string[];
  existingBlockId?: string;
}): Promise<ArchitectureBlockRecord> {
  const tenantSlug = slugify(params.tenant);
  const projectSlug = slugify(params.projectKey);
  const now = new Date().toISOString();
  const positionX = params.positionX;
  const positionY = params.positionY;
  const sizeWidth = params.sizeWidth ?? 220;
  const sizeHeight = params.sizeHeight ?? 140;

  const session = getSession();
  try {
    const record = await session.executeWrite(async (tx: ManagedTransaction) => {
      if (params.existingBlockId) {
        const reuseResult = await tx.run(
          `
            MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project {slug: $projectSlug})-[:HAS_ARCHITECTURE_DIAGRAM]->(diagram:ArchitectureDiagram {id: $diagramId})
            MATCH (project)-[:HAS_ARCHITECTURE_BLOCK]->(block:ArchitectureBlock {id: $existingBlockId})
            MERGE (diagram)-[rel:HAS_BLOCK]->(block)
            SET rel.diagramId = $diagramId,
                rel.positionX = $positionX,
                rel.positionY = $positionY,
                rel.sizeWidth = $sizeWidth,
                rel.sizeHeight = $sizeHeight,
                rel.updatedAt = $now,
                rel.createdAt = coalesce(rel.createdAt, $now)
            WITH block, rel
            OPTIONAL MATCH (block)-[:LINKED_DOCUMENT]->(document:Document)
            RETURN block, rel, collect(document.id) AS documentIds
          `,
          {
            tenantSlug,
            projectSlug,
            diagramId: params.diagramId,
            existingBlockId: params.existingBlockId,
            positionX,
            positionY,
            sizeWidth,
            sizeHeight,
            now
          }
        );

        if (reuseResult.records.length === 0) {
          throw new Error("Architecture block definition not found");
        }

        return reuseResult.records[0];
      }

      if (!params.name || !params.kind) {
        throw new Error("Block name and kind are required when creating a new block definition");
      }

      const blockId = `block-${Date.now()}`;
      const createResult = await tx.run(
        `
          MERGE (tenant:Tenant {slug: $tenantSlug})
            ON CREATE SET tenant.createdAt = $now
          MERGE (project:Project {slug: $projectSlug, tenantSlug: $tenantSlug})
            ON CREATE SET project.projectKey = $projectKey, project.createdAt = $now
          MERGE (tenant)-[:OWNS]->(project)
          WITH project
          MATCH (project)-[:HAS_ARCHITECTURE_DIAGRAM]->(diagram:ArchitectureDiagram {id: $diagramId})
          CREATE (block:ArchitectureBlock {
            id: $blockId,
            name: $name,
            kind: $kind,
            stereotype: $stereotype,
            description: $description,
            tenant: $tenant,
            projectKey: $projectKey,
            ports: $ports,
            createdAt: $now,
            updatedAt: $now
          })
          MERGE (project)-[:HAS_ARCHITECTURE_BLOCK]->(block)
          MERGE (diagram)-[rel:HAS_BLOCK]->(block)
          SET rel.diagramId = $diagramId,
              rel.positionX = $positionX,
              rel.positionY = $positionY,
              rel.sizeWidth = $sizeWidth,
              rel.sizeHeight = $sizeHeight,
              rel.createdAt = $now,
              rel.updatedAt = $now
          WITH block, rel, $documentIds AS documentIds
          OPTIONAL MATCH (block)-[existing:LINKED_DOCUMENT]->(:Document)
          DELETE existing
          WITH block, rel, documentIds
          CALL {
            WITH block, documentIds
            UNWIND documentIds AS documentId
            MATCH (document:Document {id: documentId})
            MERGE (block)-[:LINKED_DOCUMENT]->(document)
            RETURN count(*) AS linked
          }
          WITH block, rel
          OPTIONAL MATCH (block)-[:LINKED_DOCUMENT]->(document:Document)
          RETURN block, rel, collect(DISTINCT document.id) AS documentIds
        `,
        {
          tenantSlug,
          projectSlug,
          projectKey: params.projectKey,
          diagramId: params.diagramId,
          blockId,
          name: params.name,
          kind: params.kind,
          stereotype: params.stereotype ?? null,
          description: params.description ?? null,
          tenant: params.tenant,
          ports: JSON.stringify(params.ports ?? []),
          positionX,
          positionY,
          sizeWidth,
          sizeHeight,
          now,
          documentIds: params.documentIds ?? []
        }
      );

      if (createResult.records.length === 0) {
        throw new Error("Failed to create architecture block definition");
      }

      return createResult.records[0];
    });

    const blockNode = record.get("block") as Neo4jNode;
    const rel = record.get("rel") as Neo4jRelationship | undefined;
    const documentIds = (record.get("documentIds") as unknown[] | undefined)?.map(String) ?? [];

    // Invalidate architecture cache
    const tenantSlug = slugify(params.tenant);
    const projectSlug = slugify(params.projectKey);
    await CacheInvalidation.invalidateArchitecture(tenantSlug, projectSlug, params.diagramId);

    return mapBlockWithPlacement(blockNode, rel, params.diagramId, documentIds);
  } finally {
    await session.close();
  }
}

export interface ListOptions {
  limit?: number;     // Default 100, max 1000
  offset?: number;    // Default 0
}

export async function getArchitectureBlocks(params: {
  tenant: string;
  projectKey: string;
  diagramId: string;
  options?: ListOptions;
}): Promise<ArchitectureBlockRecord[]> {
  const tenantSlug = slugify(params.tenant);
  const projectSlug = slugify(params.projectKey);
  const limit = Math.min(params.options?.limit ?? 100, 1000);
  const offset = params.options?.offset ?? 0;

  // Cache for 10 minutes (600 seconds)
  const cacheKey = CacheKeys.architectureBlocks(
    tenantSlug,
    projectSlug,
    params.diagramId,
    limit,
    offset
  );

  return getCached(
    cacheKey,
    async () => {
      const session = getSession();
      try {
        // QUERY PROFILE: expected <100ms with pagination
        const result = await session.run(
          `
            MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project {slug: $projectSlug})-[:HAS_ARCHITECTURE_DIAGRAM]->(diagram:ArchitectureDiagram {id: $diagramId})
            MATCH (diagram)-[rel:HAS_BLOCK]->(block:ArchitectureBlock)
            OPTIONAL MATCH (block)-[:LINKED_DOCUMENT]->(document:Document)
            RETURN block, rel, collect(DISTINCT document.id) AS documentIds
            ORDER BY rel.createdAt, block.createdAt
            SKIP $offset
            LIMIT $limit
          `,
          {
            tenantSlug,
            projectSlug,
            diagramId: params.diagramId,
            offset,
            limit
          }
        );

        return result.records.map(record => {
          const blockNode = record.get("block") as Neo4jNode;
          const rel = record.get("rel") as Neo4jRelationship | undefined;
          const documentIds = (record.get("documentIds") as unknown[] | undefined)?.map(String) ?? [];
          return mapBlockWithPlacement(blockNode, rel, params.diagramId, documentIds);
        });
      } finally {
        await session.close();
      }
    },
    600 // 10 minutes TTL
  );
}

export async function getArchitectureBlockLibrary(params: {
  tenant: string;
  projectKey: string;
}): Promise<ArchitectureBlockLibraryRecord[]> {
  const tenantSlug = slugify(params.tenant);
  const projectSlug = slugify(params.projectKey);

  const session = getSession();
  try {
    const result = await session.run(
      `
        MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project {slug: $projectSlug})-[:HAS_ARCHITECTURE_BLOCK]->(block:ArchitectureBlock)
        OPTIONAL MATCH (diagram:ArchitectureDiagram)-[rel:HAS_BLOCK]->(block)
        OPTIONAL MATCH (block)-[:LINKED_DOCUMENT]->(document:Document)
        WITH block, collect(DISTINCT { id: rel.diagramId, name: diagram.name }) AS diagrams, collect(DISTINCT document.id) AS documentIds
        RETURN block, diagrams, documentIds
        ORDER BY block.name
      `,
      { tenantSlug, projectSlug }
    );

    return result.records.map(record => {
      const blockNode = record.get("block") as Neo4jNode;
      const diagrams = record.get("diagrams") as Array<{ id?: unknown; name?: unknown }>;
      const documentIds = (record.get("documentIds") as unknown[] | undefined)?.map(String) ?? [];
      return mapBlockLibraryEntry(blockNode, diagrams, documentIds);
    });
  } finally {
    await session.close();
  }
}

export async function updateArchitectureBlock(params: {
  tenant: string;
  projectKey: string;
  blockId: string;
  diagramId: string;
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
  // Styling properties
  backgroundColor?: string;
  borderColor?: string;
  borderWidth?: number;
  borderStyle?: string;
  textColor?: string;
  fontSize?: number;
  fontWeight?: string;
  borderRadius?: number;
}): Promise<ArchitectureBlockRecord> {
  const tenantSlug = slugify(params.tenant);
  const projectSlug = slugify(params.projectKey);
  const now = new Date().toISOString();

  const session = getSession();
  try {
    const record = await session.executeWrite(async (tx: ManagedTransaction) => {
      const nodeUpdates: string[] = [];
      const nodeParams: Record<string, unknown> = {
        tenantSlug,
        projectSlug,
        blockId: params.blockId,
        now
      };

      if (params.name !== undefined) {
        nodeUpdates.push("block.name = $name");
        nodeParams.name = params.name;
      }
      if (params.kind !== undefined) {
        nodeUpdates.push("block.kind = $kind");
        nodeParams.kind = params.kind;
      }
      if (params.stereotype !== undefined) {
        nodeUpdates.push("block.stereotype = $stereotype");
        nodeParams.stereotype = params.stereotype;
      }
      if (params.description !== undefined) {
        nodeUpdates.push("block.description = $description");
        nodeParams.description = params.description;
      }
      if (params.ports !== undefined) {
        nodeUpdates.push("block.ports = $ports");
        nodeParams.ports = JSON.stringify(params.ports);
      }
      if (nodeUpdates.length > 0) {
        nodeUpdates.push("block.updatedAt = $now");
        const nodeQuery = `
          MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project {slug: $projectSlug})-[:HAS_ARCHITECTURE_BLOCK]->(block:ArchitectureBlock {id: $blockId})
          SET ${nodeUpdates.join(", ")}
          RETURN block
        `;

        const nodeResult = await tx.run(nodeQuery, nodeParams);
        if (nodeResult.records.length === 0) {
          throw new Error("Architecture block not found");
        }
      }

      const relUpdates: string[] = [];
      const relParams: Record<string, unknown> = {
        tenantSlug,
        projectSlug,
        diagramId: params.diagramId,
        blockId: params.blockId,
        now
      };

      if (params.positionX !== undefined) {
        relUpdates.push("rel.positionX = $positionX");
        relParams.positionX = params.positionX;
      }
      if (params.positionY !== undefined) {
        relUpdates.push("rel.positionY = $positionY");
        relParams.positionY = params.positionY;
      }
      if (params.sizeWidth !== undefined) {
        relUpdates.push("rel.sizeWidth = $sizeWidth");
        relParams.sizeWidth = params.sizeWidth;
      }
      if (params.sizeHeight !== undefined) {
        relUpdates.push("rel.sizeHeight = $sizeHeight");
        relParams.sizeHeight = params.sizeHeight;
      }
      if (params.backgroundColor !== undefined) {
        relUpdates.push("rel.backgroundColor = $backgroundColor");
        relParams.backgroundColor = params.backgroundColor;
      }
      if (params.borderColor !== undefined) {
        relUpdates.push("rel.borderColor = $borderColor");
        relParams.borderColor = params.borderColor;
      }
      if (params.borderWidth !== undefined) {
        relUpdates.push("rel.borderWidth = $borderWidth");
        relParams.borderWidth = params.borderWidth;
      }
      if (params.borderStyle !== undefined) {
        relUpdates.push("rel.borderStyle = $borderStyle");
        relParams.borderStyle = params.borderStyle;
      }
      if (params.textColor !== undefined) {
        relUpdates.push("rel.textColor = $textColor");
        relParams.textColor = params.textColor;
      }
      if (params.fontSize !== undefined) {
        relUpdates.push("rel.fontSize = $fontSize");
        relParams.fontSize = params.fontSize;
      }
      if (params.fontWeight !== undefined) {
        relUpdates.push("rel.fontWeight = $fontWeight");
        relParams.fontWeight = params.fontWeight;
      }
      if (params.borderRadius !== undefined) {
        relUpdates.push("rel.borderRadius = $borderRadius");
        relParams.borderRadius = params.borderRadius;
      }

      if (relUpdates.length > 0) {
        relUpdates.push("rel.updatedAt = $now");
        const relQuery = `
          MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project {slug: $projectSlug})-[:HAS_ARCHITECTURE_DIAGRAM]->(diagram:ArchitectureDiagram {id: $diagramId})-[rel:HAS_BLOCK]->(block:ArchitectureBlock {id: $blockId})
          SET ${relUpdates.join(", ")}
          RETURN rel
        `;

        const relResult = await tx.run(relQuery, relParams);
        if (relResult.records.length === 0) {
          throw new Error("Architecture block placement not found");
        }
      }

      if (params.documentIds !== undefined) {
        const documentQuery = `
          MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project {slug: $projectSlug})-[:HAS_ARCHITECTURE_BLOCK]->(block:ArchitectureBlock {id: $blockId})
          OPTIONAL MATCH (block)-[existing:LINKED_DOCUMENT]->(:Document)
          DELETE existing
          WITH block, $documentIds AS documentIds
          CALL {
            WITH block, documentIds
            UNWIND documentIds AS documentId
            MATCH (document:Document {id: documentId})
            MERGE (block)-[:LINKED_DOCUMENT]->(document)
            RETURN count(*) AS _linked
          }
          RETURN block
        `;

        const documentResult = await tx.run(documentQuery, {
          tenantSlug,
          projectSlug,
          blockId: params.blockId,
          documentIds: params.documentIds
        });

        if (documentResult.records.length === 0) {
          throw new Error("Architecture block not found when updating documents");
        }
      }

      const finalResult = await tx.run(
        `
          MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project {slug: $projectSlug})-[:HAS_ARCHITECTURE_DIAGRAM]->(diagram:ArchitectureDiagram {id: $diagramId})-[rel:HAS_BLOCK]->(block:ArchitectureBlock {id: $blockId})
          OPTIONAL MATCH (block)-[:LINKED_DOCUMENT]->(document:Document)
          RETURN block, rel, collect(DISTINCT document.id) AS documentIds
        `,
        {
          tenantSlug,
          projectSlug,
          diagramId: params.diagramId,
          blockId: params.blockId
        }
      );

      if (finalResult.records.length === 0) {
        throw new Error("Architecture block not found");
      }

      return finalResult.records[0];
    });

    const blockNode = record.get("block") as Neo4jNode;
    const rel = record.get("rel") as Neo4jRelationship | undefined;
    const documentIds = (record.get("documentIds") as unknown[] | undefined)?.map(String) ?? [];

    // Invalidate architecture cache
    const tenantSlug = slugify(params.tenant);
    const projectSlug = slugify(params.projectKey);
    await CacheInvalidation.invalidateArchitecture(tenantSlug, projectSlug, params.diagramId);

    return mapBlockWithPlacement(blockNode, rel, params.diagramId, documentIds);
  } finally {
    await session.close();
  }
}

export async function deleteArchitectureBlock(params: {
  tenant: string;
  projectKey: string;
  blockId: string;
  diagramId?: string;
}): Promise<void> {
  const tenantSlug = slugify(params.tenant);
  const projectSlug = slugify(params.projectKey);
  const session = getSession();

  try {
    await session.executeWrite(async (tx: ManagedTransaction) => {
      if (params.diagramId) {
        const res = await tx.run(
          `
            MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project {slug: $projectSlug})-[:HAS_ARCHITECTURE_DIAGRAM]->(diagram:ArchitectureDiagram {id: $diagramId})-[rel:HAS_BLOCK]->(block:ArchitectureBlock {id: $blockId})
            OPTIONAL MATCH (diagram)-[:HAS_CONNECTOR]->(connector:ArchitectureConnector)
              WHERE connector.source = $blockId OR connector.target = $blockId
            WITH rel, connector
            DETACH DELETE connector
            DELETE rel
            RETURN COUNT(rel) AS removed
          `,
          {
            tenantSlug,
            projectSlug,
            diagramId: params.diagramId,
            blockId: params.blockId
          }
        );

        const removed = toNumber(res.records[0]?.get("removed"), 0);
        if (removed === 0) {
          throw new Error("Architecture block placement not found");
        }
        return;
      }

      const res = await tx.run(
        `
          MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project {slug: $projectSlug})-[:HAS_ARCHITECTURE_BLOCK]->(block:ArchitectureBlock {id: $blockId})
          OPTIONAL MATCH (diagram:ArchitectureDiagram)-[rel:HAS_BLOCK]->(block)
          OPTIONAL MATCH (diagram)-[:HAS_CONNECTOR]->(connector:ArchitectureConnector)
            WHERE connector.source = $blockId OR connector.target = $blockId
          DETACH DELETE connector
          DELETE rel
          DETACH DELETE block
          RETURN COUNT(block) AS removed
        `,
        {
          tenantSlug,
          projectSlug,
          blockId: params.blockId
        }
      );

      const removed = toNumber(res.records[0]?.get("removed"), 0);
      if (removed === 0) {
        throw new Error("Architecture block not found");
      }
    });

    // Invalidate architecture cache
    const tenantSlug = slugify(params.tenant);
    const projectSlug = slugify(params.projectKey);
    await CacheInvalidation.invalidateArchitecture(tenantSlug, projectSlug, params.diagramId);
  } finally {
    await session.close();
  }
}
