import { randomBytes, randomUUID as nodeRandomUUID } from "node:crypto";
import type { ManagedTransaction, Node as Neo4jNode } from "neo4j-driver";
import { toNumber } from "../lib/neo4j-utils.js";
import { computeRequirementHash } from "../lib/requirement-hash.js";
import type { ParsedDocument } from "./markdown-parser.js";
import { slugify } from "./workspace.js";
import type { DocumentRecord } from "./graph/documents/index.js";

const REQUIREMENT_PATH = (tenant: string, project: string, ref: string) =>
  `${tenant}/${project}/requirements/${ref}.md`;

const nowISO = () => new Date().toISOString();

const makeUuid = () => (typeof nodeRandomUUID === "function" ? nodeRandomUUID() : randomBytes(16).toString("hex"));

function getSectionData(node: Neo4jNode): {
  id: string;
  name: string;
  shortCode?: string | null;
  order: number;
} {
  const props = node.properties as Record<string, unknown>;
  return {
    id: String(props.id),
    name: String(props.name ?? ""),
    shortCode: props.shortCode ? String(props.shortCode) : null,
    order: toNumber(props.order, 0)
  };
}

function getRequirementData(node: Neo4jNode): {
  id: string;
  ref: string;
  pattern?: string | null;
  verification?: string | null;
  text: string;
  deleted?: boolean;
  archived?: boolean;
} {
  const props = node.properties as Record<string, unknown>;
  return {
    id: String(props.id),
    ref: String(props.ref),
    pattern: props.pattern ? String(props.pattern) : null,
    verification: props.verification ? String(props.verification) : null,
    text: String(props.text ?? ""),
    deleted: props.deleted === true,
    archived: props.archived === true
  };
}

function getInfoData(node: Neo4jNode): {
  id: string;
  ref: string;
  text: string;
  title?: string | null;
  order?: number;
} {
  const props = node.properties as Record<string, unknown>;
  return {
    id: String(props.id),
    ref: String(props.ref),
    text: String(props.text ?? ""),
    title: props.title ? String(props.title) : null,
    order: props.order !== undefined ? toNumber(props.order, 0) : undefined
  };
}

function getSurrogateData(node: Neo4jNode): {
  id: string;
  slug: string;
  caption?: string | null;
  order?: number;
} {
  const props = node.properties as Record<string, unknown>;
  return {
    id: String(props.id),
    slug: String(props.slug),
    caption: props.caption ? String(props.caption) : null,
    order: props.order !== undefined ? toNumber(props.order, 0) : undefined
  };
}

function normalizeMetadata(metadata?: Record<string, unknown> | null): Record<string, unknown> {
  if (!metadata) {
    return {};
  }

  const normalized: Record<string, unknown> = {};

  for (const [key, rawValue] of Object.entries(metadata)) {
    if (rawValue === null || rawValue === undefined) {
      continue;
    }

    if (Array.isArray(rawValue)) {
      const primitiveArray = rawValue.every(item => item === null || ["string", "number", "boolean"].includes(typeof item));
      normalized[key] = primitiveArray ? rawValue.map(item => (item === undefined ? null : item)) : JSON.stringify(rawValue);
      continue;
    }

    const valueType = typeof rawValue;
    if (valueType === "string" || valueType === "number" || valueType === "boolean") {
      normalized[key] = rawValue;
    } else if (valueType === "bigint") {
      normalized[key] = Number(rawValue);
    } else {
      normalized[key] = JSON.stringify(rawValue);
    }
  }

  return normalized;
}

export async function syncParsedDocument(
  tx: ManagedTransaction,
  params: {
    tenant: string;
    projectKey: string;
    document: DocumentRecord;
    documentSlug: string;
    parsed: ParsedDocument;
  }
): Promise<void> {
  const { tenant, projectKey, document, documentSlug, parsed } = params;
  const tenantSlug = slugify(tenant);
  const projectSlug = slugify(projectKey);
  const timestamp = nowISO();

  const existingSectionsResult = await tx.run(
    `
      MATCH (doc:Document {slug: $documentSlug, tenant: $tenantSlug, projectKey: $projectSlug})
      OPTIONAL MATCH (doc)-[:HAS_SECTION]->(section:DocumentSection)
      RETURN section
    `,
    { documentSlug, tenantSlug, projectSlug }
  );

  const existingSectionsById = new Map<string, ReturnType<typeof getSectionData>>();
  const existingSectionsByName = new Map<string, ReturnType<typeof getSectionData>>();
  const existingSectionsByShortCode = new Map<string, ReturnType<typeof getSectionData>>();

  for (const record of existingSectionsResult.records) {
    const sectionNode = record.get("section") as Neo4jNode | null;
    if (!sectionNode) {continue;}
    const section = getSectionData(sectionNode);
    existingSectionsById.set(section.id, section);
    if (section.name) {
      existingSectionsByName.set(section.name, section);
    }
    if (section.shortCode) {
      existingSectionsByShortCode.set(section.shortCode, section);
    }
  }

  const existingRequirementsResult = await tx.run(
    `
      MATCH (doc:Document {slug: $documentSlug, tenant: $tenantSlug, projectKey: $projectSlug})
      MATCH (doc)-[:CONTAINS]->(req:Requirement)
      OPTIONAL MATCH (section:DocumentSection)-[:CONTAINS]->(req)
      RETURN req, section
    `,
    { documentSlug, tenantSlug, projectSlug }
  );

  type RequirementWithSection = ReturnType<typeof getRequirementData> & { sectionId?: string | null };
  const existingRequirementsByRef = new Map<string, RequirementWithSection>();

  for (const record of existingRequirementsResult.records) {
    const reqNode = record.get("req") as Neo4jNode;
    const sectionNode = record.get("section") as Neo4jNode | null;
    const requirement = getRequirementData(reqNode);
    const requirementWithSection: RequirementWithSection = {
      ...requirement,
      sectionId: sectionNode ? String(sectionNode.properties.id) : null
    };
    existingRequirementsByRef.set(requirement.ref, requirementWithSection);
  }

  const existingInfosResult = await tx.run(
    `
      MATCH (doc:Document {slug: $documentSlug, tenant: $tenantSlug, projectKey: $projectSlug})
      OPTIONAL MATCH (doc)-[:HAS_INFO]->(info:Info)
      OPTIONAL MATCH (section:DocumentSection)-[:CONTAINS]->(info)
      RETURN info, section
    `,
    { documentSlug, tenantSlug, projectSlug }
  );

  type InfoWithSection = ReturnType<typeof getInfoData> & { sectionId?: string | null };
  const existingInfosByRef = new Map<string, InfoWithSection>();

  for (const record of existingInfosResult.records) {
    const infoNode = record.get("info") as Neo4jNode | null;
    if (!infoNode) {continue;}
    const sectionNode = record.get("section") as Neo4jNode | null;
    const info = getInfoData(infoNode);
    const infoWithSection: InfoWithSection = {
      ...info,
      sectionId: sectionNode ? String(sectionNode.properties.id) : null
    };
    existingInfosByRef.set(info.ref, infoWithSection);
  }

  // Fetch existing surrogate references
  const existingSurrogatesResult = await tx.run(
    `
      MATCH (doc:Document {slug: $documentSlug, tenant: $tenantSlug, projectKey: $projectSlug})
      OPTIONAL MATCH (doc)-[:HAS_SURROGATE_REFERENCE]->(surrogate:SurrogateReference)
      OPTIONAL MATCH (section:DocumentSection)-[:CONTAINS]->(surrogate)
      RETURN surrogate, section
    `,
    { documentSlug, tenantSlug, projectSlug }
  );

  type SurrogateWithSection = ReturnType<typeof getSurrogateData> & { sectionId?: string | null };
  const existingSurrogatesBySlug = new Map<string, SurrogateWithSection>();

  for (const record of existingSurrogatesResult.records) {
    const surrogateNode = record.get("surrogate") as Neo4jNode | null;
    if (!surrogateNode) {continue;}
    const sectionNode = record.get("section") as Neo4jNode | null;
    const surrogate = getSurrogateData(surrogateNode);
    const surrogateWithSection: SurrogateWithSection = {
      ...surrogate,
      sectionId: sectionNode ? String(sectionNode.properties.id) : null
    };
    // Use a composite key: slug + line number to handle multiple references to same surrogate
    const key = `${surrogate.slug}-${surrogate.order}`;
    existingSurrogatesBySlug.set(key, surrogateWithSection);
  }

  const processedSectionIds = new Set<string>();
  const sectionIdByName = new Map<string, string>();

  for (let idx = 0; idx < parsed.sections.length; idx++) {
    const section = parsed.sections[idx];
    const order = idx;
    const matchedSection =
      (section.shortCode && existingSectionsByShortCode.get(section.shortCode)) ||
      existingSectionsByName.get(section.name);

    if (matchedSection) {
      await tx.run(
        `
          MATCH (section:DocumentSection {id: $sectionId})
          SET section.name = $name,
              section.shortCode = $shortCode,
              section.order = $order,
              section.updatedAt = $now
        `,
        {
          sectionId: matchedSection.id,
          name: section.name,
          shortCode: section.shortCode ?? null,
          order,
          now: timestamp
        }
      );

      processedSectionIds.add(matchedSection.id);
      sectionIdByName.set(section.name, matchedSection.id);
    } else {
      const sectionId = `section-${makeUuid()}`;
      await tx.run(
        `
          MATCH (doc:Document {slug: $documentSlug, tenant: $tenantSlug, projectKey: $projectSlug})
          CREATE (section:DocumentSection {
            id: $sectionId,
            name: $name,
            shortCode: $shortCode,
            documentSlug: $documentSlug,
            tenant: $tenantSlug,
            projectKey: $projectSlug,
            order: $order,
            createdAt: $now,
            updatedAt: $now
          })
          MERGE (doc)-[:HAS_SECTION]->(section)
        `,
        {
          sectionId,
          name: section.name,
          shortCode: section.shortCode ?? null,
          order,
          now: timestamp,
          documentSlug,
          tenantSlug,
          projectSlug
        }
      );

      processedSectionIds.add(sectionId);
      sectionIdByName.set(section.name, sectionId);
    }
  }

  for (const [sectionId] of existingSectionsById) {
    if (!processedSectionIds.has(sectionId)) {
      await tx.run(
        `
          MATCH (section:DocumentSection {id: $sectionId})
          DETACH DELETE section
        `,
        { sectionId }
      );
    }
  }

  const processedRequirementRefs = new Set<string>();

  for (const requirement of parsed.requirements) {
    const ref = requirement.ref || requirement.id;
    if (!ref) {continue;}

    const sectionId = requirement.sectionName ? sectionIdByName.get(requirement.sectionName) : undefined;
    const targetSectionId = sectionId ?? null;
    processedRequirementRefs.add(ref);

    const existing = existingRequirementsByRef.get(ref);
    if (existing) {
      const contentHash = computeRequirementHash({
        text: requirement.text,
        pattern: requirement.pattern ?? null,
        verification: requirement.verification ?? null
      });

      await tx.run(
        `
          MATCH (req:Requirement {id: $requirementId})
          SET req.text = $text,
              req.pattern = $pattern,
              req.verification = $verification,
              req.contentHash = $contentHash,
              req.updatedAt = $now,
              req.deleted = false,
              req.archived = false
        `,
        {
          requirementId: existing.id,
          text: requirement.text,
          pattern: requirement.pattern ?? null,
          verification: requirement.verification ?? null,
          contentHash,
          now: timestamp
        }
      );

      await tx.run(
        `
          MATCH (req:Requirement {id: $requirementId})
          OPTIONAL MATCH (req)<-[rel:CONTAINS]-(:DocumentSection)
          DELETE rel
        `,
        { requirementId: existing.id }
      );

      if (targetSectionId) {
        await tx.run(
          `
            MATCH (req:Requirement {id: $requirementId})
            MATCH (section:DocumentSection {id: $sectionId})
            MERGE (section)-[:CONTAINS]->(req)
          `,
          {
            requirementId: existing.id,
            sectionId: targetSectionId
          }
        );
      }
    } else {
      const requirementId = `${tenantSlug}:${projectSlug}:${ref}`;
      const hashId = randomBytes(8).toString("hex");
      const contentHash = computeRequirementHash({
        text: requirement.text,
        pattern: requirement.pattern ?? null,
        verification: requirement.verification ?? null
      });

      await tx.run(
        `
          MATCH (doc:Document {slug: $documentSlug, tenant: $tenantSlug, projectKey: $projectSlug})
          MERGE (req:Requirement {id: $requirementId})
          ON CREATE SET req.hashId = $hashId,
                        req.createdAt = $now
          SET req.ref = $ref,
              req.tenant = $tenantSlug,
              req.projectKey = $projectSlug,
              req.text = $text,
              req.pattern = $pattern,
              req.verification = $verification,
              req.contentHash = $contentHash,
              req.qaScore = NULL,
              req.qaVerdict = NULL,
              req.suggestions = [],
              req.tags = [],
              req.path = $path,
              req.documentSlug = $documentSlug,
              req.updatedAt = $now,
              req.deleted = false,
              req.archived = false
          MERGE (doc)-[:CONTAINS]->(req)
        `,
        {
          documentSlug,
          tenantSlug,
          projectSlug,
          requirementId,
          hashId,
          ref,
          text: requirement.text,
          pattern: requirement.pattern ?? null,
          verification: requirement.verification ?? null,
          contentHash,
          path: REQUIREMENT_PATH(tenantSlug, projectSlug, ref),
          now: timestamp
        }
      );

      if (targetSectionId) {
        await tx.run(
          `
            MATCH (req:Requirement {id: $requirementId})
            MATCH (section:DocumentSection {id: $sectionId})
            MERGE (section)-[:CONTAINS]->(req)
          `,
          {
            requirementId,
            sectionId: targetSectionId
          }
        );
      }
    }
  }

  for (const [ref, existing] of existingRequirementsByRef) {
    if (!processedRequirementRefs.has(ref)) {
      await tx.run(
        `
          MATCH (req:Requirement {id: $requirementId})
          OPTIONAL MATCH (req)<-[rel:CONTAINS]-(:DocumentSection)
          DELETE rel
          SET req.deleted = true,
              req.updatedAt = $now
        `,
        {
          requirementId: existing.id,
          now: timestamp
        }
      );
    }
  }

  const docPrefix = document.shortCode || documentSlug.toUpperCase().replace(/-/g, "");
  const processedInfoRefs = new Set<string>();

  for (let idx = 0; idx < parsed.infos.length; idx++) {
    const info = parsed.infos[idx];
    let ref = info.ref || info.id;
    if (!ref) {
      const infoNumber = String(idx + 1).padStart(3, "0");
      ref = `${docPrefix}-INFO-${infoNumber}`;
    }

    const sectionId = info.sectionName ? sectionIdByName.get(info.sectionName) : undefined;
    const targetSectionId = sectionId ?? null;
    processedInfoRefs.add(ref);

    const existing = existingInfosByRef.get(ref);
    if (existing) {
      await tx.run(
        `
          MATCH (info:Info {id: $infoId})
          SET info.text = $text,
              info.title = $title,
              info.order = $order,
              info.sectionId = $sectionId,
              info.updatedAt = $now
        `,
        {
          infoId: existing.id,
          text: info.text,
          title: info.title ?? null,
          order: info.line,
          sectionId: targetSectionId,
          now: timestamp
        }
      );

      await tx.run(
        `
          MATCH (info:Info {id: $infoId})
          OPTIONAL MATCH (info)<-[rel:CONTAINS]-(:DocumentSection)
          DELETE rel
        `,
        { infoId: existing.id }
      );

      if (targetSectionId) {
        await tx.run(
          `
            MATCH (info:Info {id: $infoId})
            MATCH (section:DocumentSection {id: $sectionId})
            MERGE (section)-[:CONTAINS]->(info)
          `,
          {
            infoId: existing.id,
            sectionId: targetSectionId
          }
        );
      }
    } else {
      const infoId = `info-${makeUuid()}`;
      await tx.run(
        `
          MATCH (doc:Document {slug: $documentSlug, tenant: $tenantSlug, projectKey: $projectSlug})
          CREATE (info:Info {
            id: $infoId,
            ref: $ref,
            tenant: $tenantSlug,
            projectKey: $projectSlug,
            documentSlug: $documentSlug,
            text: $text,
            title: $title,
            sectionId: $sectionId,
            order: $order,
            createdAt: $now,
            updatedAt: $now
          })
          MERGE (doc)-[:HAS_INFO]->(info)
        `,
        {
          infoId,
          ref,
          tenantSlug,
          projectSlug,
          documentSlug,
          text: info.text,
          title: info.title ?? null,
          sectionId: targetSectionId,
          order: info.line,
          now: timestamp
        }
      );

      if (targetSectionId) {
        await tx.run(
          `
            MATCH (info:Info {id: $infoId})
            MATCH (section:DocumentSection {id: $sectionId})
            MERGE (section)-[:CONTAINS]->(info)
          `,
          {
            infoId,
            sectionId: targetSectionId
          }
        );
      }
    }
  }

  for (const [ref, info] of existingInfosByRef) {
    if (!processedInfoRefs.has(ref)) {
      await tx.run(
        `
          MATCH (info:Info {id: $infoId})
          DETACH DELETE info
        `,
        { infoId: info.id }
      );
    }
  }

  // Sync surrogate references
  const processedSurrogateKeys = new Set<string>();

  for (let idx = 0; idx < parsed.surrogates.length; idx++) {
    const surrogate = parsed.surrogates[idx];
    const sectionId = surrogate.sectionName ? sectionIdByName.get(surrogate.sectionName) : undefined;
    const targetSectionId = sectionId ?? null;
    const key = `${surrogate.slug}-${surrogate.line}`;
    processedSurrogateKeys.add(key);

    const existing = existingSurrogatesBySlug.get(key);
    if (existing) {
      // Update existing surrogate reference
      await tx.run(
        `
          MATCH (surrogate:SurrogateReference {id: $surrogateId})
          SET surrogate.caption = $caption,
              surrogate.order = $order,
              surrogate.sectionId = $sectionId,
              surrogate.updatedAt = $now
        `,
        {
          surrogateId: existing.id,
          caption: surrogate.caption ?? null,
          order: surrogate.line,
          sectionId: targetSectionId,
          now: timestamp
        }
      );

      // Update section relationship
      await tx.run(
        `
          MATCH (surrogate:SurrogateReference {id: $surrogateId})
          OPTIONAL MATCH (surrogate)<-[rel:CONTAINS]-(:DocumentSection)
          DELETE rel
        `,
        { surrogateId: existing.id }
      );

      if (targetSectionId) {
        await tx.run(
          `
            MATCH (surrogate:SurrogateReference {id: $surrogateId})
            MATCH (section:DocumentSection {id: $sectionId})
            MERGE (section)-[:CONTAINS]->(surrogate)
          `,
          {
            surrogateId: existing.id,
            sectionId: targetSectionId
          }
        );
      }
    } else {
      // Create new surrogate reference
      const surrogateId = `surrogate-ref-${makeUuid()}`;
      await tx.run(
        `
          MATCH (doc:Document {slug: $documentSlug, tenant: $tenantSlug, projectKey: $projectSlug})
          CREATE (surrogate:SurrogateReference {
            id: $surrogateId,
            tenant: $tenantSlug,
            projectKey: $projectSlug,
            documentSlug: $documentSlug,
            slug: $slug,
            caption: $caption,
            sectionId: $sectionId,
            order: $order,
            createdAt: $now,
            updatedAt: $now
          })
          MERGE (doc)-[:HAS_SURROGATE_REFERENCE]->(surrogate)
        `,
        {
          surrogateId,
          tenantSlug,
          projectSlug,
          documentSlug,
          slug: surrogate.slug,
          caption: surrogate.caption ?? null,
          sectionId: targetSectionId,
          order: surrogate.line,
          now: timestamp
        }
      );

      if (targetSectionId) {
        await tx.run(
          `
            MATCH (surrogate:SurrogateReference {id: $surrogateId})
            MATCH (section:DocumentSection {id: $sectionId})
            MERGE (section)-[:CONTAINS]->(surrogate)
          `,
          {
            surrogateId,
            sectionId: targetSectionId
          }
        );
      }
    }
  }

  // Delete surrogates that are no longer in the markdown
  for (const [key, surrogate] of existingSurrogatesBySlug) {
    if (!processedSurrogateKeys.has(key)) {
      await tx.run(
        `
          MATCH (surrogate:SurrogateReference {id: $surrogateId})
          DETACH DELETE surrogate
        `,
        { surrogateId: surrogate.id }
      );
    }
  }

  await tx.run(
    `
      MATCH (doc:Document {slug: $documentSlug, tenant: $tenantSlug, projectKey: $projectSlug})
      OPTIONAL MATCH (doc)-[:HAS_CONTENT_BLOCK]->(existingBlock:DocumentContentBlock)
      DETACH DELETE existingBlock
    `,
    { documentSlug, tenantSlug, projectSlug }
  );

  for (let idx = 0; idx < parsed.blocks.length; idx++) {
    const block = parsed.blocks[idx];
    const blockId = `content-${makeUuid()}`;
    const metadataObject = normalizeMetadata(block.metadata);
    const metadataJson = Object.keys(metadataObject).length > 0 ? JSON.stringify(metadataObject) : null;
    await tx.run(
      `
        MATCH (doc:Document {slug: $documentSlug, tenant: $tenantSlug, projectKey: $projectSlug})
        CREATE (block:DocumentContentBlock {
          id: $blockId,
          tenant: $tenantSlug,
          projectKey: $projectSlug,
          documentSlug: $documentSlug,
          type: $type,
          raw: $raw,
          line: $line,
          metadata: $metadata,
          order: $order,
          createdAt: $now,
          updatedAt: $now
        })
        MERGE (doc)-[:HAS_CONTENT_BLOCK]->(block)
      `,
      {
        documentSlug,
        tenantSlug,
        projectSlug,
        blockId,
        type: block.type,
        raw: block.raw,
        line: block.line,
        metadata: metadataJson,
        order: idx,
        now: timestamp
      }
    );
  }

  await tx.run(
    `
      MATCH (doc:Document {slug: $documentSlug, tenant: $tenantSlug, projectKey: $projectSlug})
      SET doc.updatedAt = $now
    `,
    { documentSlug, tenantSlug, projectSlug, now: timestamp }
  );
}
