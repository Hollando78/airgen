import type { ManagedTransaction } from "neo4j-driver";
import { randomUUID } from "crypto";
import { createHash } from "crypto";
import { getSession } from "../driver.js";
import type { DocumentKind } from "./documents-crud.js";

export type DocumentVersionRecord = {
  versionId: string;
  documentId: string;
  versionNumber: number;
  timestamp: string;
  changedBy: string;
  changeType: "created" | "updated" | "deleted";
  changeDescription?: string;
  // Snapshot of document state
  slug: string;
  name: string;
  description?: string;
  shortCode?: string;
  kind: DocumentKind;
  originalFileName?: string;
  storedFileName?: string;
  mimeType?: string;
  fileSize?: number;
  storagePath?: string;
  previewPath?: string;
  previewMimeType?: string;
  contentHash: string;
};

/**
 * Generate content hash for Document node to detect changes
 */
export function generateDocumentContentHash(params: {
  name: string;
  description?: string | null;
  shortCode?: string | null;
  kind: DocumentKind;
}): string {
  const content = JSON.stringify({
    name: params.name,
    description: params.description || null,
    shortCode: params.shortCode || null,
    kind: params.kind
  });
  return createHash("sha256").update(content).digest("hex");
}

/**
 * Create a new version snapshot for a Document node
 */
export async function createDocumentVersion(
  tx: ManagedTransaction,
  params: {
    documentId: string;
    tenantSlug: string;
    projectSlug: string;
    changedBy: string;
    changeType: "created" | "updated" | "deleted";
    changeDescription?: string;
    // Current document state
    slug: string;
    name: string;
    description?: string | null;
    shortCode?: string | null;
    kind: DocumentKind;
    originalFileName?: string | null;
    storedFileName?: string | null;
    mimeType?: string | null;
    fileSize?: number | null;
    storagePath?: string | null;
    previewPath?: string | null;
    previewMimeType?: string | null;
    contentHash: string;
  }
): Promise<void> {
  const versionId = randomUUID();
  const now = new Date().toISOString();

  // Get current version number
  const versionCountResult = await tx.run(
    `
      MATCH (doc:Document {id: $documentId})
      OPTIONAL MATCH (doc)-[:HAS_VERSION]->(v:DocumentVersion)
      RETURN count(v) as versionCount
    `,
    { documentId: params.documentId }
  );

  const versionNumber = versionCountResult.records[0].get("versionCount").toNumber() + 1;

  // Create version node
  await tx.run(
    `
      MATCH (doc:Document {id: $documentId})
      CREATE (version:DocumentVersion {
        versionId: $versionId,
        documentId: $documentId,
        versionNumber: $versionNumber,
        timestamp: $timestamp,
        changedBy: $changedBy,
        changeType: $changeType,
        changeDescription: $changeDescription,
        slug: $slug,
        name: $name,
        description: $description,
        shortCode: $shortCode,
        kind: $kind,
        originalFileName: $originalFileName,
        storedFileName: $storedFileName,
        mimeType: $mimeType,
        fileSize: $fileSize,
        storagePath: $storagePath,
        previewPath: $previewPath,
        previewMimeType: $previewMimeType,
        contentHash: $contentHash
      })
      CREATE (doc)-[:HAS_VERSION]->(version)

      // Link to previous version if exists
      WITH version, doc
      OPTIONAL MATCH (doc)-[:HAS_VERSION]->(prevVersion:DocumentVersion)
      WHERE prevVersion.versionNumber = $versionNumber - 1
      FOREACH (_ IN CASE WHEN prevVersion IS NOT NULL THEN [1] ELSE [] END |
        CREATE (version)-[:PREVIOUS_VERSION]->(prevVersion)
      )
    `,
    {
      documentId: params.documentId,
      versionId,
      versionNumber,
      timestamp: now,
      changedBy: params.changedBy,
      changeType: params.changeType,
      changeDescription: params.changeDescription || null,
      slug: params.slug,
      name: params.name,
      description: params.description || null,
      shortCode: params.shortCode || null,
      kind: params.kind,
      originalFileName: params.originalFileName || null,
      storedFileName: params.storedFileName || null,
      mimeType: params.mimeType || null,
      fileSize: params.fileSize || null,
      storagePath: params.storagePath || null,
      previewPath: params.previewPath || null,
      previewMimeType: params.previewMimeType || null,
      contentHash: params.contentHash
    }
  );
}

/**
 * Get version history for a Document node
 */
export async function getDocumentHistory(
  tenant: string,
  projectKey: string,
  documentId: string
): Promise<DocumentVersionRecord[]> {
  const session = getSession();
  try {
    const result = await session.run(
      `
        MATCH (doc:Document {id: $documentId})
        MATCH (doc)-[:HAS_VERSION]->(version:DocumentVersion)
        RETURN version
        ORDER BY version.versionNumber DESC
      `,
      { documentId }
    );

    return result.records.map(record => {
      const v = record.get("version").properties;
      return {
        versionId: String(v.versionId),
        documentId: String(v.documentId),
        versionNumber: typeof v.versionNumber === 'number' ? v.versionNumber : v.versionNumber.toNumber(),
        timestamp: String(v.timestamp),
        changedBy: String(v.changedBy),
        changeType: String(v.changeType) as "created" | "updated" | "deleted",
        changeDescription: v.changeDescription ? String(v.changeDescription) : undefined,
        slug: String(v.slug),
        name: String(v.name),
        description: v.description ? String(v.description) : undefined,
        shortCode: v.shortCode ? String(v.shortCode) : undefined,
        kind: String(v.kind) as DocumentKind,
        originalFileName: v.originalFileName ? String(v.originalFileName) : undefined,
        storedFileName: v.storedFileName ? String(v.storedFileName) : undefined,
        mimeType: v.mimeType ? String(v.mimeType) : undefined,
        fileSize: v.fileSize !== null && v.fileSize !== undefined
          ? (typeof v.fileSize === 'number' ? v.fileSize : v.fileSize.toNumber())
          : undefined,
        storagePath: v.storagePath ? String(v.storagePath) : undefined,
        previewPath: v.previewPath ? String(v.previewPath) : undefined,
        previewMimeType: v.previewMimeType ? String(v.previewMimeType) : undefined,
        contentHash: String(v.contentHash)
      };
    });
  } finally {
    await session.close();
  }
}

/**
 * Compare two versions of a Document node
 */
export type DocumentDiff = {
  field: string;
  oldValue: any;
  newValue: any;
  changed: boolean;
};

export async function getDocumentDiff(
  tenant: string,
  projectKey: string,
  documentId: string,
  fromVersion: number,
  toVersion: number
): Promise<DocumentDiff[]> {
  const history = await getDocumentHistory(tenant, projectKey, documentId);

  const from = history.find(v => v.versionNumber === fromVersion);
  const to = history.find(v => v.versionNumber === toVersion);

  if (!from || !to) {
    throw new Error("Version not found");
  }

  const fields: (keyof DocumentVersionRecord)[] = [
    "slug", "name", "description", "shortCode", "kind",
    "originalFileName", "storedFileName", "mimeType", "fileSize",
    "storagePath", "previewPath", "previewMimeType"
  ];

  const diff: DocumentDiff[] = [];

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
