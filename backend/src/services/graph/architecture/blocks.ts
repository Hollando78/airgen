import type { ManagedTransaction, Node as Neo4jNode, Relationship as Neo4jRelationship } from "neo4j-driver";
import { int as neo4jInt } from "neo4j-driver";
import { slugify } from "../../workspace.js";
import { getSession } from "../driver.js";
import type {
  ArchitectureBlockRecord,
  ArchitectureBlockLibraryRecord,
  BlockKind,
  BlockPortRecord,
  BlockPortOverrideRecord
} from "./types.js";
import { mapBlockWithPlacement, mapBlockLibraryEntry, sanitizePortOverrides } from "./mappers.js";
import { getCached, CacheKeys, CacheInvalidation } from "../../../lib/cache.js";
import { toNumber } from "../../../lib/neo4j-utils.js";
import { createArchitectureBlockVersion, generateArchitectureBlockContentHash } from "./blocks-versions.js";

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
  userId: string;
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
                rel.portOverrides = coalesce(rel.portOverrides, '{}'),
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
              rel.portOverrides = '{}',
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

    // Create version 1 for the new block placement
    await session.executeWrite(async (tx: ManagedTransaction) => {
      const blockProps = blockNode.properties;
      const relProps = rel?.properties;

      // Parse ports if they exist
      let ports: BlockPortRecord[] | undefined;
      if (blockProps.ports) {
        try {
          ports = JSON.parse(String(blockProps.ports));
        } catch {
          ports = undefined;
        }
      }

      // Parse portOverrides if they exist
      let portOverrides: Record<string, BlockPortOverrideRecord> | undefined;
      if (relProps?.portOverrides) {
        try {
          portOverrides = JSON.parse(String(relProps.portOverrides));
        } catch {
          portOverrides = undefined;
        }
      }

      const contentHash = generateArchitectureBlockContentHash({
        name: String(blockProps.name),
        kind: String(blockProps.kind),
        stereotype: blockProps.stereotype ? String(blockProps.stereotype) : undefined,
        description: blockProps.description ? String(blockProps.description) : undefined,
        ports,
        documentIds,
        positionX: typeof relProps?.positionX === 'number' ? relProps.positionX : relProps?.positionX?.toNumber() ?? positionX,
        positionY: typeof relProps?.positionY === 'number' ? relProps.positionY : relProps?.positionY?.toNumber() ?? positionY,
        sizeWidth: typeof relProps?.sizeWidth === 'number' ? relProps.sizeWidth : relProps?.sizeWidth?.toNumber() ?? sizeWidth,
        sizeHeight: typeof relProps?.sizeHeight === 'number' ? relProps.sizeHeight : relProps?.sizeHeight?.toNumber() ?? sizeHeight,
        backgroundColor: relProps?.backgroundColor ? String(relProps.backgroundColor) : undefined,
        borderColor: relProps?.borderColor ? String(relProps.borderColor) : undefined,
        borderWidth: relProps?.borderWidth ? (typeof relProps.borderWidth === 'number' ? relProps.borderWidth : relProps.borderWidth.toNumber()) : undefined,
        borderStyle: relProps?.borderStyle ? String(relProps.borderStyle) : undefined,
        textColor: relProps?.textColor ? String(relProps.textColor) : undefined,
        fontSize: relProps?.fontSize ? (typeof relProps.fontSize === 'number' ? relProps.fontSize : relProps.fontSize.toNumber()) : undefined,
        fontWeight: relProps?.fontWeight ? String(relProps.fontWeight) : undefined,
        borderRadius: relProps?.borderRadius ? (typeof relProps.borderRadius === 'number' ? relProps.borderRadius : relProps.borderRadius.toNumber()) : undefined,
        portOverrides
      });

      await createArchitectureBlockVersion(tx, {
        blockId: String(blockProps.id),
        diagramId: params.diagramId,
        tenantSlug,
        projectSlug,
        changedBy: params.userId,
        changeType: 'created',
        name: String(blockProps.name),
        kind: String(blockProps.kind) as BlockKind,
        stereotype: blockProps.stereotype ? String(blockProps.stereotype) : undefined,
        description: blockProps.description ? String(blockProps.description) : undefined,
        ports,
        documentIds,
        positionX: typeof relProps?.positionX === 'number' ? relProps.positionX : relProps?.positionX?.toNumber() ?? positionX,
        positionY: typeof relProps?.positionY === 'number' ? relProps.positionY : relProps?.positionY?.toNumber() ?? positionY,
        sizeWidth: typeof relProps?.sizeWidth === 'number' ? relProps.sizeWidth : relProps?.sizeWidth?.toNumber() ?? sizeWidth,
        sizeHeight: typeof relProps?.sizeHeight === 'number' ? relProps.sizeHeight : relProps?.sizeHeight?.toNumber() ?? sizeHeight,
        backgroundColor: relProps?.backgroundColor ? String(relProps.backgroundColor) : undefined,
        borderColor: relProps?.borderColor ? String(relProps.borderColor) : undefined,
        borderWidth: relProps?.borderWidth ? (typeof relProps.borderWidth === 'number' ? relProps.borderWidth : relProps.borderWidth.toNumber()) : undefined,
        borderStyle: relProps?.borderStyle ? String(relProps.borderStyle) : undefined,
        textColor: relProps?.textColor ? String(relProps.textColor) : undefined,
        fontSize: relProps?.fontSize ? (typeof relProps.fontSize === 'number' ? relProps.fontSize : relProps.fontSize.toNumber()) : undefined,
        fontWeight: relProps?.fontWeight ? String(relProps.fontWeight) : undefined,
        borderRadius: relProps?.borderRadius ? (typeof relProps.borderRadius === 'number' ? relProps.borderRadius : relProps.borderRadius.toNumber()) : undefined,
        portOverrides,
        contentHash
      });
    });

    // Invalidate architecture cache
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
  const limit = parseInt(String(Math.min(params.options?.limit ?? 100, 1000)), 10);
  const offset = parseInt(String(params.options?.offset ?? 0), 10);

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
            offset: neo4jInt(offset),
            limit: neo4jInt(limit)
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
  portOverrides?: Record<string, BlockPortOverrideRecord>;
  userId: string;
}): Promise<ArchitectureBlockRecord> {
  const tenantSlug = slugify(params.tenant);
  const projectSlug = slugify(params.projectKey);
  const now = new Date().toISOString();

  const session = getSession();
  try {
    const record = await session.executeWrite(async (tx: ManagedTransaction) => {
      // First, get the current state for version comparison
      const getCurrentQuery = `
        MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project {slug: $projectSlug})-[:HAS_ARCHITECTURE_DIAGRAM]->(diagram:ArchitectureDiagram {id: $diagramId})-[rel:HAS_BLOCK]->(block:ArchitectureBlock {id: $blockId})
        OPTIONAL MATCH (block)-[:LINKED_DOCUMENT]->(doc:Document)
        RETURN block, rel, collect(DISTINCT doc.id) AS documentIds
      `;
      const currentResult = await tx.run(getCurrentQuery, {
        tenantSlug,
        projectSlug,
        diagramId: params.diagramId,
        blockId: params.blockId
      });

      let oldContentHash: string | null = null;
      if (currentResult.records.length > 0) {
        const currentBlock = currentResult.records[0].get("block");
        const currentRel = currentResult.records[0].get("rel");
        const currentDocIds = (currentResult.records[0].get("documentIds") as unknown[] | undefined)?.map(String) ?? [];
        const currentBlockProps = currentBlock.properties;
        const currentRelProps = currentRel?.properties;

        // Parse current ports
        let currentPorts: BlockPortRecord[] | undefined;
        if (currentBlockProps.ports) {
          try {
            currentPorts = JSON.parse(String(currentBlockProps.ports));
          } catch {
            currentPorts = undefined;
          }
        }

        // Parse current portOverrides
        let currentPortOverrides: Record<string, BlockPortOverrideRecord> | undefined;
        if (currentRelProps?.portOverrides) {
          try {
            currentPortOverrides = JSON.parse(String(currentRelProps.portOverrides));
          } catch {
            currentPortOverrides = undefined;
          }
        }

        oldContentHash = generateArchitectureBlockContentHash({
          name: String(currentBlockProps.name),
          kind: String(currentBlockProps.kind),
          stereotype: currentBlockProps.stereotype ? String(currentBlockProps.stereotype) : undefined,
          description: currentBlockProps.description ? String(currentBlockProps.description) : undefined,
          ports: currentPorts,
          documentIds: currentDocIds,
          positionX: typeof currentRelProps?.positionX === 'number' ? currentRelProps.positionX : currentRelProps?.positionX?.toNumber() ?? 0,
          positionY: typeof currentRelProps?.positionY === 'number' ? currentRelProps.positionY : currentRelProps?.positionY?.toNumber() ?? 0,
          sizeWidth: typeof currentRelProps?.sizeWidth === 'number' ? currentRelProps.sizeWidth : currentRelProps?.sizeWidth?.toNumber() ?? 220,
          sizeHeight: typeof currentRelProps?.sizeHeight === 'number' ? currentRelProps.sizeHeight : currentRelProps?.sizeHeight?.toNumber() ?? 140,
          backgroundColor: currentRelProps?.backgroundColor ? String(currentRelProps.backgroundColor) : undefined,
          borderColor: currentRelProps?.borderColor ? String(currentRelProps.borderColor) : undefined,
          borderWidth: currentRelProps?.borderWidth ? (typeof currentRelProps.borderWidth === 'number' ? currentRelProps.borderWidth : currentRelProps.borderWidth.toNumber()) : undefined,
          borderStyle: currentRelProps?.borderStyle ? String(currentRelProps.borderStyle) : undefined,
          textColor: currentRelProps?.textColor ? String(currentRelProps.textColor) : undefined,
          fontSize: currentRelProps?.fontSize ? (typeof currentRelProps.fontSize === 'number' ? currentRelProps.fontSize : currentRelProps.fontSize.toNumber()) : undefined,
          fontWeight: currentRelProps?.fontWeight ? String(currentRelProps.fontWeight) : undefined,
          borderRadius: currentRelProps?.borderRadius ? (typeof currentRelProps.borderRadius === 'number' ? currentRelProps.borderRadius : currentRelProps.borderRadius.toNumber()) : undefined,
          portOverrides: currentPortOverrides
        });
      }

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
      if (params.portOverrides !== undefined) {
        const sanitizedOverrides = sanitizePortOverrides(params.portOverrides);
        relUpdates.push("rel.portOverrides = $portOverrides");
        relParams.portOverrides = JSON.stringify(sanitizedOverrides);
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

      // Calculate new content hash and create version if changed
      const finalBlock = finalResult.records[0].get("block");
      const finalRel = finalResult.records[0].get("rel");
      const finalDocIds = (finalResult.records[0].get("documentIds") as unknown[] | undefined)?.map(String) ?? [];
      const finalBlockProps = finalBlock.properties;
      const finalRelProps = finalRel?.properties;

      // Parse final ports
      let finalPorts: BlockPortRecord[] | undefined;
      if (finalBlockProps.ports) {
        try {
          finalPorts = JSON.parse(String(finalBlockProps.ports));
        } catch {
          finalPorts = undefined;
        }
      }

      // Parse final portOverrides
      let finalPortOverrides: Record<string, BlockPortOverrideRecord> | undefined;
      if (finalRelProps?.portOverrides) {
        try {
          finalPortOverrides = JSON.parse(String(finalRelProps.portOverrides));
        } catch {
          finalPortOverrides = undefined;
        }
      }

      const newContentHash = generateArchitectureBlockContentHash({
        name: String(finalBlockProps.name),
        kind: String(finalBlockProps.kind),
        stereotype: finalBlockProps.stereotype ? String(finalBlockProps.stereotype) : undefined,
        description: finalBlockProps.description ? String(finalBlockProps.description) : undefined,
        ports: finalPorts,
        documentIds: finalDocIds,
        positionX: typeof finalRelProps?.positionX === 'number' ? finalRelProps.positionX : finalRelProps?.positionX?.toNumber() ?? 0,
        positionY: typeof finalRelProps?.positionY === 'number' ? finalRelProps.positionY : finalRelProps?.positionY?.toNumber() ?? 0,
        sizeWidth: typeof finalRelProps?.sizeWidth === 'number' ? finalRelProps.sizeWidth : finalRelProps?.sizeWidth?.toNumber() ?? 220,
        sizeHeight: typeof finalRelProps?.sizeHeight === 'number' ? finalRelProps.sizeHeight : finalRelProps?.sizeHeight?.toNumber() ?? 140,
        backgroundColor: finalRelProps?.backgroundColor ? String(finalRelProps.backgroundColor) : undefined,
        borderColor: finalRelProps?.borderColor ? String(finalRelProps.borderColor) : undefined,
        borderWidth: finalRelProps?.borderWidth ? (typeof finalRelProps.borderWidth === 'number' ? finalRelProps.borderWidth : finalRelProps.borderWidth.toNumber()) : undefined,
        borderStyle: finalRelProps?.borderStyle ? String(finalRelProps.borderStyle) : undefined,
        textColor: finalRelProps?.textColor ? String(finalRelProps.textColor) : undefined,
        fontSize: finalRelProps?.fontSize ? (typeof finalRelProps.fontSize === 'number' ? finalRelProps.fontSize : finalRelProps.fontSize.toNumber()) : undefined,
        fontWeight: finalRelProps?.fontWeight ? String(finalRelProps.fontWeight) : undefined,
        borderRadius: finalRelProps?.borderRadius ? (typeof finalRelProps.borderRadius === 'number' ? finalRelProps.borderRadius : finalRelProps.borderRadius.toNumber()) : undefined,
        portOverrides: finalPortOverrides
      });

      const contentChanged = oldContentHash !== null && oldContentHash !== newContentHash;

      // Create new version only if content changed
      if (contentChanged) {
        await createArchitectureBlockVersion(tx, {
          blockId: params.blockId,
          diagramId: params.diagramId,
          tenantSlug,
          projectSlug,
          changedBy: params.userId,
          changeType: 'updated',
          name: String(finalBlockProps.name),
          kind: String(finalBlockProps.kind) as BlockKind,
          stereotype: finalBlockProps.stereotype ? String(finalBlockProps.stereotype) : undefined,
          description: finalBlockProps.description ? String(finalBlockProps.description) : undefined,
          ports: finalPorts,
          documentIds: finalDocIds,
          positionX: typeof finalRelProps?.positionX === 'number' ? finalRelProps.positionX : finalRelProps?.positionX?.toNumber() ?? 0,
          positionY: typeof finalRelProps?.positionY === 'number' ? finalRelProps.positionY : finalRelProps?.positionY?.toNumber() ?? 0,
          sizeWidth: typeof finalRelProps?.sizeWidth === 'number' ? finalRelProps.sizeWidth : finalRelProps?.sizeWidth?.toNumber() ?? 220,
          sizeHeight: typeof finalRelProps?.sizeHeight === 'number' ? finalRelProps.sizeHeight : finalRelProps?.sizeHeight?.toNumber() ?? 140,
          backgroundColor: finalRelProps?.backgroundColor ? String(finalRelProps.backgroundColor) : undefined,
          borderColor: finalRelProps?.borderColor ? String(finalRelProps.borderColor) : undefined,
          borderWidth: finalRelProps?.borderWidth ? (typeof finalRelProps.borderWidth === 'number' ? finalRelProps.borderWidth : finalRelProps.borderWidth.toNumber()) : undefined,
          borderStyle: finalRelProps?.borderStyle ? String(finalRelProps.borderStyle) : undefined,
          textColor: finalRelProps?.textColor ? String(finalRelProps.textColor) : undefined,
          fontSize: finalRelProps?.fontSize ? (typeof finalRelProps.fontSize === 'number' ? finalRelProps.fontSize : finalRelProps.fontSize.toNumber()) : undefined,
          fontWeight: finalRelProps?.fontWeight ? String(finalRelProps.fontWeight) : undefined,
          borderRadius: finalRelProps?.borderRadius ? (typeof finalRelProps.borderRadius === 'number' ? finalRelProps.borderRadius : finalRelProps.borderRadius.toNumber()) : undefined,
          portOverrides: finalPortOverrides,
          contentHash: newContentHash
        });
      }

      return finalResult.records[0];
    });

    const blockNode = record.get("block") as Neo4jNode;
    const rel = record.get("rel") as Neo4jRelationship | undefined;
    const documentIds = (record.get("documentIds") as unknown[] | undefined)?.map(String) ?? [];

    // Invalidate architecture cache
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
  userId: string;
}): Promise<void> {
  const tenantSlug = slugify(params.tenant);
  const projectSlug = slugify(params.projectKey);
  const session = getSession();

  try {
    await session.executeWrite(async (tx: ManagedTransaction) => {
      if (params.diagramId) {
        // Get the current state to create a deletion version
        const getCurrentQuery = `
          MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project {slug: $projectSlug})-[:HAS_ARCHITECTURE_DIAGRAM]->(diagram:ArchitectureDiagram {id: $diagramId})-[rel:HAS_BLOCK]->(block:ArchitectureBlock {id: $blockId})
          OPTIONAL MATCH (block)-[:LINKED_DOCUMENT]->(doc:Document)
          RETURN block, rel, collect(DISTINCT doc.id) AS documentIds
        `;
        const currentResult = await tx.run(getCurrentQuery, {
          tenantSlug,
          projectSlug,
          diagramId: params.diagramId,
          blockId: params.blockId
        });

        if (currentResult.records.length > 0) {
          const currentBlock = currentResult.records[0].get("block");
          const currentRel = currentResult.records[0].get("rel");
          const currentDocIds = (currentResult.records[0].get("documentIds") as unknown[] | undefined)?.map(String) ?? [];
          const currentBlockProps = currentBlock.properties;
          const currentRelProps = currentRel?.properties;

          // Parse current ports
          let currentPorts: BlockPortRecord[] | undefined;
          if (currentBlockProps.ports) {
            try {
              currentPorts = JSON.parse(String(currentBlockProps.ports));
            } catch {
              currentPorts = undefined;
            }
          }

          // Parse current portOverrides
          let currentPortOverrides: Record<string, BlockPortOverrideRecord> | undefined;
          if (currentRelProps?.portOverrides) {
            try {
              currentPortOverrides = JSON.parse(String(currentRelProps.portOverrides));
            } catch {
              currentPortOverrides = undefined;
            }
          }

          const contentHash = generateArchitectureBlockContentHash({
            name: String(currentBlockProps.name),
            kind: String(currentBlockProps.kind),
            stereotype: currentBlockProps.stereotype ? String(currentBlockProps.stereotype) : undefined,
            description: currentBlockProps.description ? String(currentBlockProps.description) : undefined,
            ports: currentPorts,
            documentIds: currentDocIds,
            positionX: typeof currentRelProps?.positionX === 'number' ? currentRelProps.positionX : currentRelProps?.positionX?.toNumber() ?? 0,
            positionY: typeof currentRelProps?.positionY === 'number' ? currentRelProps.positionY : currentRelProps?.positionY?.toNumber() ?? 0,
            sizeWidth: typeof currentRelProps?.sizeWidth === 'number' ? currentRelProps.sizeWidth : currentRelProps?.sizeWidth?.toNumber() ?? 220,
            sizeHeight: typeof currentRelProps?.sizeHeight === 'number' ? currentRelProps.sizeHeight : currentRelProps?.sizeHeight?.toNumber() ?? 140,
            backgroundColor: currentRelProps?.backgroundColor ? String(currentRelProps.backgroundColor) : undefined,
            borderColor: currentRelProps?.borderColor ? String(currentRelProps.borderColor) : undefined,
            borderWidth: currentRelProps?.borderWidth ? (typeof currentRelProps.borderWidth === 'number' ? currentRelProps.borderWidth : currentRelProps.borderWidth.toNumber()) : undefined,
            borderStyle: currentRelProps?.borderStyle ? String(currentRelProps.borderStyle) : undefined,
            textColor: currentRelProps?.textColor ? String(currentRelProps.textColor) : undefined,
            fontSize: currentRelProps?.fontSize ? (typeof currentRelProps.fontSize === 'number' ? currentRelProps.fontSize : currentRelProps.fontSize.toNumber()) : undefined,
            fontWeight: currentRelProps?.fontWeight ? String(currentRelProps.fontWeight) : undefined,
            borderRadius: currentRelProps?.borderRadius ? (typeof currentRelProps.borderRadius === 'number' ? currentRelProps.borderRadius : currentRelProps.borderRadius.toNumber()) : undefined,
            portOverrides: currentPortOverrides
          });

          // Create deletion version for this specific placement
          await createArchitectureBlockVersion(tx, {
            blockId: params.blockId,
            diagramId: params.diagramId,
            tenantSlug,
            projectSlug,
            changedBy: params.userId,
            changeType: 'deleted',
            name: String(currentBlockProps.name),
            kind: String(currentBlockProps.kind) as BlockKind,
            stereotype: currentBlockProps.stereotype ? String(currentBlockProps.stereotype) : undefined,
            description: currentBlockProps.description ? String(currentBlockProps.description) : undefined,
            ports: currentPorts,
            documentIds: currentDocIds,
            positionX: typeof currentRelProps?.positionX === 'number' ? currentRelProps.positionX : currentRelProps?.positionX?.toNumber() ?? 0,
            positionY: typeof currentRelProps?.positionY === 'number' ? currentRelProps.positionY : currentRelProps?.positionY?.toNumber() ?? 0,
            sizeWidth: typeof currentRelProps?.sizeWidth === 'number' ? currentRelProps.sizeWidth : currentRelProps?.sizeWidth?.toNumber() ?? 220,
            sizeHeight: typeof currentRelProps?.sizeHeight === 'number' ? currentRelProps.sizeHeight : currentRelProps?.sizeHeight?.toNumber() ?? 140,
            backgroundColor: currentRelProps?.backgroundColor ? String(currentRelProps.backgroundColor) : undefined,
            borderColor: currentRelProps?.borderColor ? String(currentRelProps.borderColor) : undefined,
            borderWidth: currentRelProps?.borderWidth ? (typeof currentRelProps.borderWidth === 'number' ? currentRelProps.borderWidth : currentRelProps.borderWidth.toNumber()) : undefined,
            borderStyle: currentRelProps?.borderStyle ? String(currentRelProps.borderStyle) : undefined,
            textColor: currentRelProps?.textColor ? String(currentRelProps.textColor) : undefined,
            fontSize: currentRelProps?.fontSize ? (typeof currentRelProps.fontSize === 'number' ? currentRelProps.fontSize : currentRelProps.fontSize.toNumber()) : undefined,
            fontWeight: currentRelProps?.fontWeight ? String(currentRelProps.fontWeight) : undefined,
            borderRadius: currentRelProps?.borderRadius ? (typeof currentRelProps.borderRadius === 'number' ? currentRelProps.borderRadius : currentRelProps.borderRadius.toNumber()) : undefined,
            portOverrides: currentPortOverrides,
            contentHash
          });
        }

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
    await CacheInvalidation.invalidateArchitecture(tenantSlug, projectSlug, params.diagramId);
  } finally {
    await session.close();
  }
}
