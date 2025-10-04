import { randomBytes } from "node:crypto";
import type { ManagedTransaction, Node as Neo4jNode } from "neo4j-driver";
import { config } from "../../../config.js";
import { toNumber } from "../../../lib/neo4j-utils.js";
import type {
  RequirementRecord,
  RequirementPattern,
  VerificationMethod} from "../../workspace.js";
import {
  slugify,
  writeRequirementMarkdown
} from "../../workspace.js";
import { getSession } from "../driver.js";
import { CacheInvalidation } from "../../../lib/cache.js";

export type RequirementInput = {
  tenant: string;
  projectKey: string;
  documentSlug?: string;
  sectionId?: string;
  ref?: string;
  text: string;
  pattern?: RequirementPattern;
  verification?: VerificationMethod;
  qaScore?: number;
  qaVerdict?: string;
  suggestions?: string[];
  tags?: string[];
};

export function mapRequirement(node: Neo4jNode, documentSlug?: string): RequirementRecord {
  const props = node.properties as Record<string, unknown>;
  const text = props.text ? String(props.text) : "";
  const titleProp = props.title ? String(props.title) : null;
  return {
    id: String(props.id),
    hashId: props.hashId ? String(props.hashId) : "",
    ref: String(props.ref),
    tenant: String(props.tenant),
    projectKey: String(props.projectKey),
    title:
      titleProp && titleProp.trim().length > 0
        ? titleProp
        : text.split(" ").slice(0, 8).join(" ") + (text.split(" ").length > 8 ? "..." : ""),
    text,
    pattern: props.pattern ? (props.pattern as RequirementPattern) : undefined,
    verification: props.verification ? (props.verification as VerificationMethod) : undefined,
    qaScore:
      props.qaScore !== null && props.qaScore !== undefined
        ? toNumber(props.qaScore)
        : undefined,
    qaVerdict: props.qaVerdict ? String(props.qaVerdict) : undefined,
    suggestions: Array.isArray(props.suggestions)
      ? (props.suggestions as string[])
      : [],
    tags: Array.isArray(props.tags) ? (props.tags as string[]) : [],
    path: String(props.path),
    documentSlug,
    createdAt: String(props.createdAt),
    updatedAt: String(props.updatedAt),
    deleted: props.deleted ? Boolean(props.deleted) : undefined,
    archived: props.archived ? Boolean(props.archived) : undefined
  };
}

export async function createRequirement(input: RequirementInput): Promise<RequirementRecord> {
  const tenantSlug = slugify(input.tenant || config.defaultTenant);
  const projectSlug = slugify(input.projectKey);
  const now = new Date().toISOString();

  const hashId = randomBytes(8).toString("hex");

  const session = getSession();
  try {
    const result = await session.executeWrite(async (tx: ManagedTransaction) => {
      // If ref is provided, check if it already exists
      if (input.ref) {
        const existingCheck = await tx.run(
          `
          MATCH (existing:Requirement {tenant: $tenantSlug, projectKey: $projectSlug, ref: $ref})
          RETURN existing.id AS id
          `,
          { tenantSlug, projectSlug, ref: input.ref }
        );

        if (existingCheck.records.length > 0) {
          throw new Error(`Requirement with ref '${input.ref}' already exists`);
        }
      }

      const query = `
        MERGE (tenant:Tenant {slug: $tenantSlug})
          ON CREATE SET tenant.name = $tenantName, tenant.createdAt = $now
        MERGE (project:Project {slug: $projectSlug, tenantSlug: $tenantSlug})
          ON CREATE SET project.key = $projectKey, project.createdAt = $now

        WITH tenant, project, $documentSlug AS documentSlugParam, $sectionId AS sectionIdParam, $providedRef AS providedRef

        // Determine finalRef based on whether one is provided
        CALL {
          WITH tenant, project, documentSlugParam, sectionIdParam, providedRef

          OPTIONAL MATCH (project)-[:HAS_DOCUMENT]->(document:Document {slug: documentSlugParam})
          OPTIONAL MATCH (section:DocumentSection {id: sectionIdParam})

          // Only generate ref if not provided
          FOREACH (ignoreMe IN CASE WHEN providedRef IS NULL AND document IS NOT NULL THEN [1] ELSE [] END |
            SET document.requirementCounter = coalesce(document.requirementCounter, 0) + 1
          )
          FOREACH (ignoreMe IN CASE WHEN providedRef IS NULL AND document IS NULL THEN [1] ELSE [] END |
            SET project.requirementCounter = coalesce(project.requirementCounter, 0) + 1
          )

          WITH tenant, project, document, section, documentSlugParam, sectionIdParam, providedRef,
               CASE
                 WHEN document IS NOT NULL THEN
                   CASE WHEN section IS NOT NULL THEN
                     coalesce(document.shortCode, toUpper(document.slug)) + '-' + coalesce(section.shortCode, toUpper(replace(section.name, ' ', '')))
                   ELSE
                     coalesce(document.shortCode, toUpper(document.slug))
                   END
                 ELSE
                   'REQ-' + toUpper(replace($projectSlug, '-', ''))
               END AS prefix,
               CASE
                 WHEN document IS NOT NULL THEN document.requirementCounter
                 ELSE project.requirementCounter
               END AS counter

          OPTIONAL MATCH (existingReq:Requirement {tenant: $tenantSlug, projectKey: $projectSlug})
          WHERE providedRef IS NULL AND existingReq.ref STARTS WITH prefix + '-' AND existingReq.ref =~ (prefix + '-[0-9]{3}')
          WITH tenant, project, documentSlugParam, sectionIdParam, providedRef, prefix, counter,
               max(toInteger(split(existingReq.ref, '-')[size(split(existingReq.ref, '-'))-1])) AS maxExisting

          WITH tenant, project, documentSlugParam, sectionIdParam, providedRef, prefix,
               CASE WHEN maxExisting IS NOT NULL AND maxExisting >= counter
                 THEN maxExisting + 1
                 ELSE counter
               END AS safeCounter

          WITH CASE
                 WHEN providedRef IS NOT NULL THEN providedRef
                 ELSE prefix + '-' + right('000' + toString(safeCounter), 3)
               END AS finalRef

          RETURN finalRef
        }

        OPTIONAL MATCH (project)-[:HAS_DOCUMENT]->(document:Document {slug: documentSlugParam})
        OPTIONAL MATCH (section:DocumentSection {id: sectionIdParam})

        CREATE (requirement:Requirement {
          id: $tenantSlug + ':' + $projectSlug + ':' + finalRef,
          hashId: $hashId,
          ref: finalRef,
          tenant: $tenantSlug,
          projectKey: $projectSlug,
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
        text: input.text,
        pattern: input.pattern ?? null,
        verification: input.verification ?? null,
        qaScore: input.qaScore ?? null,
        qaVerdict: input.qaVerdict ?? null,
        suggestions: input.suggestions ?? [],
        tags: input.tags ?? [],
        documentSlug: input.documentSlug ?? null,
        sectionId: input.sectionId ?? null,
        providedRef: input.ref ?? null,
        now
      });

      if (res.records.length === 0) {
        throw new Error("Failed to create requirement node");
      }

      const node = res.records[0].get("requirement") as Neo4jNode;
      return mapRequirement(node);
    });

    // Invalidate requirement cache
    await CacheInvalidation.invalidateRequirements(tenantSlug, projectSlug);

    // Invalidate documents cache since requirement count changed
    await CacheInvalidation.invalidateDocuments(tenantSlug, projectSlug);

    return result;
  } finally {
    await session.close();
  }
}

export async function getRequirement(
  tenant: string,
  projectKey: string,
  ref: string
): Promise<RequirementRecord | null> {
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

    if (result.records.length === 0) {return null;}
    const node = result.records[0].get("requirement") as Neo4jNode;
    return mapRequirement(node);
  } finally {
    await session.close();
  }
}

export async function updateRequirementTimestamp(
  tenant: string,
  projectKey: string,
  ref: string
): Promise<void> {
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

export async function updateRequirement(
  tenant: string,
  projectKey: string,
  requirementId: string,
  updates: {
    text?: string;
    pattern?: RequirementPattern;
    verification?: VerificationMethod;
    sectionId?: string | null;
  }
): Promise<RequirementRecord | null> {
  const tenantSlug = slugify(tenant);
  const projectSlug = slugify(projectKey);
  const session = getSession();
  try {
    const result = await session.executeWrite(async (tx: ManagedTransaction) => {
      const { sectionId, ...propertyUpdates } = updates;
      const hasSectionUpdate = Object.prototype.hasOwnProperty.call(updates, "sectionId");

      const setClause = Object.entries(propertyUpdates)
        .filter(([_, value]) => value !== undefined)
        .map(([key]) => `requirement.${key} = $${key}`)
        .join(', ');

      if (!setClause && !hasSectionUpdate) {
        throw new Error("No valid updates provided");
      }

      const now = new Date().toISOString();
      const baseParams: Record<string, unknown> = {
        tenantSlug,
        projectSlug,
        requirementId
      };
      const writeParams: Record<string, unknown> = {
        ...baseParams,
        now,
        ...propertyUpdates
      };

      if (setClause) {
        await tx.run(
          `
            MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project {slug: $projectSlug})
            MATCH (requirement:Requirement {id: $requirementId})
            WHERE requirement.tenant = $tenantSlug AND requirement.projectKey = $projectSlug
            SET ${setClause}, requirement.updatedAt = $now
          `,
          writeParams
        );
      } else {
        await tx.run(
          `
            MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project {slug: $projectSlug})
            MATCH (requirement:Requirement {id: $requirementId})
            WHERE requirement.tenant = $tenantSlug AND requirement.projectKey = $projectSlug
            SET requirement.updatedAt = $now
          `,
          writeParams
        );
      }

      let documentSlug: string | null = null;

      if (hasSectionUpdate) {
        const sectionParams: Record<string, unknown> = {
          ...baseParams,
          sectionId: sectionId ?? null
        };

        const docResult = await tx.run(
          `
            MATCH (requirement:Requirement {id: $requirementId})
            WHERE requirement.tenant = $tenantSlug AND requirement.projectKey = $projectSlug
            OPTIONAL MATCH (document:Document)-[:CONTAINS]->(requirement)
            RETURN document.slug AS documentSlug
          `,
          baseParams
        );

        const docRecord = docResult.records[0];
        if (docRecord) {
          const slug = docRecord.get("documentSlug");
          documentSlug = slug ? String(slug) : null;
        }

        await tx.run(
          `
            MATCH (requirement:Requirement {id: $requirementId})
            WHERE requirement.tenant = $tenantSlug AND requirement.projectKey = $projectSlug
            OPTIONAL MATCH (requirement)<-[existingRel:HAS_REQUIREMENT]-(:DocumentSection)
            WITH requirement, collect(existingRel) AS rels
            FOREACH (rel IN rels | DELETE rel)
          `,
          baseParams
        );

        if (sectionId) {
          await tx.run(
            `
              MATCH (requirement:Requirement {id: $requirementId})
              WHERE requirement.tenant = $tenantSlug AND requirement.projectKey = $projectSlug
              MATCH (newSection:DocumentSection {id: $sectionId})
              MERGE (newSection)-[:HAS_REQUIREMENT]->(requirement)
            `,
            sectionParams
          );

          await updateRequirementRefsForSection(tx, sectionId);
        } else if (documentSlug) {
          await updateRequirementRefsForDocument(tx, tenantSlug, projectSlug, documentSlug);
        }
      }

      const finalResult = await tx.run(
        `
          MATCH (requirement:Requirement {id: $requirementId})
          WHERE requirement.tenant = $tenantSlug AND requirement.projectKey = $projectSlug
          RETURN requirement
        `,
        baseParams
      );

      return finalResult.records[0]?.get("requirement") as Neo4jNode | undefined;
    });

    if (!result) {
      return null;
    }

    const requirement = mapRequirement(result);

    const { hashId, ...rest } = requirement;
    const normalizedRequirement = {
      ...rest,
      ...(hashId ? { hashId } : {}),
      title: requirement.title || requirement.text,
      suggestions: requirement.suggestions ?? [],
      tags: requirement.tags ?? []
    };

    await writeRequirementMarkdown(normalizedRequirement as RequirementRecord);

    // Invalidate requirement cache
    await CacheInvalidation.invalidateRequirements(tenantSlug, projectSlug);

    return requirement;
  } finally {
    await session.close();
  }
}

export async function softDeleteRequirement(
  tenant: string,
  projectKey: string,
  requirementId: string
): Promise<RequirementRecord | null> {
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
    const node = record.get("requirement") as Neo4jNode;

    // Invalidate requirement cache
    await CacheInvalidation.invalidateRequirements(tenantSlug, projectSlug);

    // Invalidate documents cache since requirement count changed
    await CacheInvalidation.invalidateDocuments(tenantSlug, projectSlug);

    return mapRequirement(node);
  } finally {
    await session.close();
  }
}

export async function archiveRequirements(
  tenant: string,
  projectKey: string,
  requirementIds: string[]
): Promise<RequirementRecord[]> {
  const tenantSlug = slugify(tenant);
  const projectSlug = slugify(projectKey);
  const session = getSession();
  try {
    const result = await session.executeWrite(async (tx: ManagedTransaction) => {
      const query = `
        MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project {slug: $projectSlug})
        MATCH (requirement:Requirement)
        WHERE requirement.id IN $requirementIds
          AND requirement.tenant = $tenantSlug
          AND requirement.projectKey = $projectSlug
        SET requirement.archived = true, requirement.updatedAt = $now
        RETURN requirement
      `;

      return await tx.run(query, {
        tenantSlug,
        projectSlug,
        requirementIds,
        now: new Date().toISOString()
      });
    });

    // Invalidate requirement cache
    await CacheInvalidation.invalidateRequirements(tenantSlug, projectSlug);

    // Invalidate documents cache since requirement visibility changed
    await CacheInvalidation.invalidateDocuments(tenantSlug, projectSlug);

    return result.records.map(record => {
      const node = record.get("requirement") as Neo4jNode;
      return mapRequirement(node);
    });
  } finally {
    await session.close();
  }
}

export async function unarchiveRequirements(
  tenant: string,
  projectKey: string,
  requirementIds: string[]
): Promise<RequirementRecord[]> {
  const tenantSlug = slugify(tenant);
  const projectSlug = slugify(projectKey);
  const session = getSession();
  try {
    const result = await session.executeWrite(async (tx: ManagedTransaction) => {
      const query = `
        MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project {slug: $projectSlug})
        MATCH (requirement:Requirement)
        WHERE requirement.id IN $requirementIds
          AND requirement.tenant = $tenantSlug
          AND requirement.projectKey = $projectSlug
        SET requirement.archived = false, requirement.updatedAt = $now
        RETURN requirement
      `;

      return await tx.run(query, {
        tenantSlug,
        projectSlug,
        requirementIds,
        now: new Date().toISOString()
      });
    });

    // Invalidate requirement cache
    await CacheInvalidation.invalidateRequirements(tenantSlug, projectSlug);

    // Invalidate documents cache since requirement visibility changed
    await CacheInvalidation.invalidateDocuments(tenantSlug, projectSlug);

    return result.records.map(record => {
      const node = record.get("requirement") as Neo4jNode;
      return mapRequirement(node);
    });
  } finally {
    await session.close();
  }
}

export async function updateRequirementRefsForDocument(
  tx: ManagedTransaction,
  tenantSlug: string,
  projectSlug: string,
  documentSlug: string
): Promise<void> {
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

  await tx.run(updateQuery, {
    tenantSlug,
    projectSlug,
    documentSlug,
    now: new Date().toISOString()
  });
}

export async function updateRequirementRefsForSection(
  tx: ManagedTransaction,
  sectionId: string
): Promise<void> {
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
