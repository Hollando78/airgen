import type { ManagedTransaction } from "neo4j-driver";
import { randomUUID } from "crypto";
import { createHash } from "crypto";
import { getSession } from "../driver.js";
import type { BlockKind, BlockPortRecord, BlockPortOverrideRecord } from "./types.js";

export type ArchitectureBlockVersionRecord = {
  versionId: string;
  blockId: string;
  diagramId: string;
  versionNumber: number;
  timestamp: string;
  changedBy: string;
  changeType: "created" | "updated" | "deleted";
  changeDescription?: string;
  // Snapshot of block definition
  name: string;
  kind: BlockKind;
  stereotype?: string;
  description?: string;
  ports?: BlockPortRecord[];
  documentIds?: string[];
  // Snapshot of placement properties
  positionX: number;
  positionY: number;
  sizeWidth: number;
  sizeHeight: number;
  // Snapshot of styling properties
  backgroundColor?: string;
  borderColor?: string;
  borderWidth?: number;
  borderStyle?: string;
  textColor?: string;
  fontSize?: number;
  fontWeight?: string;
  borderRadius?: number;
  portOverrides?: Record<string, BlockPortOverrideRecord>;
  contentHash: string;
};

/**
 * Generate content hash for ArchitectureBlock placement to detect changes
 * Includes both block definition and diagram-specific placement/styling
 */
export function generateArchitectureBlockContentHash(params: {
  name: string;
  kind: string;
  stereotype?: string | null;
  description?: string | null;
  ports?: BlockPortRecord[] | null;
  documentIds?: string[] | null;
  positionX: number;
  positionY: number;
  sizeWidth: number;
  sizeHeight: number;
  backgroundColor?: string | null;
  borderColor?: string | null;
  borderWidth?: number | null;
  borderStyle?: string | null;
  textColor?: string | null;
  fontSize?: number | null;
  fontWeight?: string | null;
  borderRadius?: number | null;
  portOverrides?: Record<string, BlockPortOverrideRecord> | null;
}): string {
  const content = JSON.stringify({
    name: params.name,
    kind: params.kind,
    stereotype: params.stereotype || null,
    description: params.description || null,
    ports: params.ports || null,
    documentIds: params.documentIds || null,
    positionX: params.positionX,
    positionY: params.positionY,
    sizeWidth: params.sizeWidth,
    sizeHeight: params.sizeHeight,
    backgroundColor: params.backgroundColor || null,
    borderColor: params.borderColor || null,
    borderWidth: params.borderWidth || null,
    borderStyle: params.borderStyle || null,
    textColor: params.textColor || null,
    fontSize: params.fontSize || null,
    fontWeight: params.fontWeight || null,
    borderRadius: params.borderRadius || null,
    portOverrides: params.portOverrides || null
  });
  return createHash("sha256").update(content).digest("hex");
}

/**
 * Create a new version snapshot for an ArchitectureBlock placement
 * This captures both the block definition and its diagram-specific placement
 */
export async function createArchitectureBlockVersion(
  tx: ManagedTransaction,
  params: {
    blockId: string;
    diagramId: string;
    tenantSlug: string;
    projectSlug: string;
    changedBy: string;
    changeType: "created" | "updated" | "deleted";
    changeDescription?: string;
    // Current block state
    name: string;
    kind: BlockKind;
    stereotype?: string | null;
    description?: string | null;
    ports?: BlockPortRecord[] | null;
    documentIds?: string[] | null;
    positionX: number;
    positionY: number;
    sizeWidth: number;
    sizeHeight: number;
    backgroundColor?: string | null;
    borderColor?: string | null;
    borderWidth?: number | null;
    borderStyle?: string | null;
    textColor?: string | null;
    fontSize?: number | null;
    fontWeight?: string | null;
    borderRadius?: number | null;
    portOverrides?: Record<string, BlockPortOverrideRecord> | null;
    contentHash: string;
  }
): Promise<void> {
  const versionId = randomUUID();
  const now = new Date().toISOString();

  // Get current version number for this block placement
  const versionCountResult = await tx.run(
    `
      MATCH (block:ArchitectureBlock {id: $blockId})
      OPTIONAL MATCH (block)-[:HAS_VERSION]->(v:ArchitectureBlockVersion)
      WHERE v.diagramId = $diagramId
      RETURN count(v) as versionCount
    `,
    { blockId: params.blockId, diagramId: params.diagramId }
  );

  const versionNumber = versionCountResult.records[0].get("versionCount").toNumber() + 1;

  // Create version node
  await tx.run(
    `
      MATCH (block:ArchitectureBlock {id: $blockId})
      CREATE (version:ArchitectureBlockVersion {
        versionId: $versionId,
        blockId: $blockId,
        diagramId: $diagramId,
        versionNumber: $versionNumber,
        timestamp: $timestamp,
        changedBy: $changedBy,
        changeType: $changeType,
        changeDescription: $changeDescription,
        name: $name,
        kind: $kind,
        stereotype: $stereotype,
        description: $description,
        ports: $ports,
        documentIds: $documentIds,
        positionX: $positionX,
        positionY: $positionY,
        sizeWidth: $sizeWidth,
        sizeHeight: $sizeHeight,
        backgroundColor: $backgroundColor,
        borderColor: $borderColor,
        borderWidth: $borderWidth,
        borderStyle: $borderStyle,
        textColor: $textColor,
        fontSize: $fontSize,
        fontWeight: $fontWeight,
        borderRadius: $borderRadius,
        portOverrides: $portOverrides,
        contentHash: $contentHash
      })
      CREATE (block)-[:HAS_VERSION]->(version)

      // Link to previous version if exists
      WITH version, block
      OPTIONAL MATCH (block)-[:HAS_VERSION]->(prevVersion:ArchitectureBlockVersion)
      WHERE prevVersion.diagramId = $diagramId AND prevVersion.versionNumber = $versionNumber - 1
      FOREACH (_ IN CASE WHEN prevVersion IS NOT NULL THEN [1] ELSE [] END |
        CREATE (version)-[:PREVIOUS_VERSION]->(prevVersion)
      )
    `,
    {
      blockId: params.blockId,
      diagramId: params.diagramId,
      versionId,
      versionNumber,
      timestamp: now,
      changedBy: params.changedBy,
      changeType: params.changeType,
      changeDescription: params.changeDescription || null,
      name: params.name,
      kind: params.kind,
      stereotype: params.stereotype || null,
      description: params.description || null,
      ports: params.ports ? JSON.stringify(params.ports) : null,
      documentIds: params.documentIds || null,
      positionX: params.positionX,
      positionY: params.positionY,
      sizeWidth: params.sizeWidth,
      sizeHeight: params.sizeHeight,
      backgroundColor: params.backgroundColor || null,
      borderColor: params.borderColor || null,
      borderWidth: params.borderWidth || null,
      borderStyle: params.borderStyle || null,
      textColor: params.textColor || null,
      fontSize: params.fontSize || null,
      fontWeight: params.fontWeight || null,
      borderRadius: params.borderRadius || null,
      portOverrides: params.portOverrides ? JSON.stringify(params.portOverrides) : null,
      contentHash: params.contentHash
    }
  );
}

/**
 * Get version history for an ArchitectureBlock placement on a specific diagram
 */
export async function getArchitectureBlockHistory(
  tenant: string,
  projectKey: string,
  blockId: string,
  diagramId: string
): Promise<ArchitectureBlockVersionRecord[]> {
  const session = getSession();
  try {
    const result = await session.run(
      `
        MATCH (block:ArchitectureBlock {id: $blockId})
        MATCH (block)-[:HAS_VERSION]->(version:ArchitectureBlockVersion)
        WHERE version.diagramId = $diagramId
        RETURN version
        ORDER BY version.versionNumber DESC
      `,
      { blockId, diagramId }
    );

    return result.records.map(record => {
      const v = record.get("version").properties;
      return {
        versionId: String(v.versionId),
        blockId: String(v.blockId),
        diagramId: String(v.diagramId),
        versionNumber: typeof v.versionNumber === 'number' ? v.versionNumber : v.versionNumber.toNumber(),
        timestamp: String(v.timestamp),
        changedBy: String(v.changedBy),
        changeType: String(v.changeType) as "created" | "updated" | "deleted",
        changeDescription: v.changeDescription ? String(v.changeDescription) : undefined,
        name: String(v.name),
        kind: String(v.kind) as BlockKind,
        stereotype: v.stereotype ? String(v.stereotype) : undefined,
        description: v.description ? String(v.description) : undefined,
        ports: v.ports ? JSON.parse(String(v.ports)) : undefined,
        documentIds: v.documentIds ? (Array.isArray(v.documentIds) ? v.documentIds.map(String) : []) : undefined,
        positionX: typeof v.positionX === 'number' ? v.positionX : v.positionX.toNumber(),
        positionY: typeof v.positionY === 'number' ? v.positionY : v.positionY.toNumber(),
        sizeWidth: typeof v.sizeWidth === 'number' ? v.sizeWidth : v.sizeWidth.toNumber(),
        sizeHeight: typeof v.sizeHeight === 'number' ? v.sizeHeight : v.sizeHeight.toNumber(),
        backgroundColor: v.backgroundColor ? String(v.backgroundColor) : undefined,
        borderColor: v.borderColor ? String(v.borderColor) : undefined,
        borderWidth: v.borderWidth ? (typeof v.borderWidth === 'number' ? v.borderWidth : v.borderWidth.toNumber()) : undefined,
        borderStyle: v.borderStyle ? String(v.borderStyle) : undefined,
        textColor: v.textColor ? String(v.textColor) : undefined,
        fontSize: v.fontSize ? (typeof v.fontSize === 'number' ? v.fontSize : v.fontSize.toNumber()) : undefined,
        fontWeight: v.fontWeight ? String(v.fontWeight) : undefined,
        borderRadius: v.borderRadius ? (typeof v.borderRadius === 'number' ? v.borderRadius : v.borderRadius.toNumber()) : undefined,
        portOverrides: v.portOverrides ? JSON.parse(String(v.portOverrides)) : undefined,
        contentHash: String(v.contentHash)
      };
    });
  } finally {
    await session.close();
  }
}

/**
 * Compare two versions of an ArchitectureBlock placement
 */
export type ArchitectureBlockDiff = {
  field: string;
  oldValue: any;
  newValue: any;
  changed: boolean;
};

export async function getArchitectureBlockDiff(
  tenant: string,
  projectKey: string,
  blockId: string,
  diagramId: string,
  fromVersion: number,
  toVersion: number
): Promise<ArchitectureBlockDiff[]> {
  const history = await getArchitectureBlockHistory(tenant, projectKey, blockId, diagramId);

  const from = history.find(v => v.versionNumber === fromVersion);
  const to = history.find(v => v.versionNumber === toVersion);

  if (!from || !to) {
    throw new Error("Version not found");
  }

  const fields: (keyof ArchitectureBlockVersionRecord)[] = [
    "name", "kind", "stereotype", "description", "ports", "documentIds",
    "positionX", "positionY", "sizeWidth", "sizeHeight",
    "backgroundColor", "borderColor", "borderWidth", "borderStyle",
    "textColor", "fontSize", "fontWeight", "borderRadius", "portOverrides"
  ];

  const diff: ArchitectureBlockDiff[] = [];

  for (const field of fields) {
    const oldValue = from[field];
    const newValue = to[field];
    const changed = JSON.stringify(oldValue) !== JSON.stringify(newValue);

    diff.push({
      field,
      oldValue,
      newValue,
      changed
    });
  }

  return diff;
}
