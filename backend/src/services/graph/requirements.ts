import { randomBytes } from "node:crypto";
import { ManagedTransaction, Node as Neo4jNode } from "neo4j-driver";
import { config } from "../../config.js";
import {
  RequirementRecord,
  RequirementPattern,
  VerificationMethod,
  TenantRecord,
  ProjectRecord,
  slugify,
  writeRequirementMarkdown
} from "../workspace.js";
import { getSession } from "./driver.js";

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

export function mapRequirement(node: Neo4jNode): RequirementRecord {
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
    qaScore:
      props.qaScore !== null && props.qaScore !== undefined
        ? Number(props.qaScore)
        : undefined,
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

export async function createRequirement(input: RequirementInput): Promise<RequirementRecord> {
  const tenantSlug = slugify(input.tenant || config.defaultTenant);
  const projectSlug = slugify(input.projectKey);
  const now = new Date().toISOString();

  const hashId = randomBytes(8).toString("hex");

  const session = getSession();
  try {
    const result = await session.executeWrite(async (tx: ManagedTransaction) => {
      const query = `
        MERGE (tenant:Tenant {slug: $tenantSlug})
          ON CREATE SET tenant.name = $tenantName, tenant.createdAt = $now
        MERGE (project:Project {slug: $projectSlug, tenantSlug: $tenantSlug})
          ON CREATE SET project.key = $projectKey, project.createdAt = $now

        WITH tenant, project, $documentSlug AS documentSlugParam, $sectionId AS sectionIdParam
        OPTIONAL MATCH (project)-[:HAS_DOCUMENT]->(document:Document {slug: documentSlugParam})
        OPTIONAL MATCH (section:DocumentSection {id: sectionIdParam})

        WITH tenant, project, document, section,
             CASE
               WHEN document IS NOT NULL THEN
                 CASE WHEN section IS NOT NULL THEN
                   coalesce(document.shortCode, toUpper(document.slug)) + '-' + coalesce(section.shortCode, toUpper(replace(section.name, ' ', '')))
                 ELSE
                   coalesce(document.shortCode, toUpper(document.slug))
                 END
               ELSE
                 'REQ-' + toUpper(replace($projectSlug, '-', ''))
             END AS prefix

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
        OPTIONAL MATCH (project)-[:CONTAINS]->(directReq:Requirement)
        OPTIONAL MATCH (project)-[:HAS_DOCUMENT]->(:Document)-[:CONTAINS]->(docReq:Requirement)
        WITH project, collect(DISTINCT directReq) + collect(DISTINCT docReq) AS reqs
        WITH project, [req IN reqs WHERE req IS NOT NULL] AS requirements
        RETURN project, size(requirements) AS requirementCount
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

    if (result.records.length === 0) return null;
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
    title?: string;
    text?: string;
    pattern?: RequirementPattern;
    verification?: VerificationMethod;
  }
): Promise<RequirementRecord | null> {
  const tenantSlug = slugify(tenant);
  const projectSlug = slugify(projectKey);
  const session = getSession();
  try {
    const result = await session.executeWrite(async (tx: ManagedTransaction) => {
      const setClause = Object.entries(updates)
        .filter(([_, value]) => value !== undefined)
        .map(([key]) => `requirement.${key} = $${key}`)
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
    const node = record.get("requirement") as Neo4jNode;
    const requirement = mapRequirement(node);
    await writeRequirementMarkdown(requirement);
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
    return mapRequirement(node);
  } finally {
    await session.close();
  }
}

export async function findDuplicateRequirementRefs(
  tenant: string,
  projectKey: string
): Promise<{ ref: string; count: number; requirements: RequirementRecord[] }[]> {
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
      requirements: record.get("requirements").map((node: Neo4jNode) => mapRequirement(node))
    }));
  } finally {
    await session.close();
  }
}

export async function fixDuplicateRequirementRefs(
  tenant: string,
  projectKey: string
): Promise<{ fixed: number; changes: Array<{ oldRef: string; newRef: string; requirementId: string }> }> {
  const tenantSlug = slugify(tenant);
  const projectSlug = slugify(projectKey);
  const session = getSession();

  try {
    const result = await session.executeWrite(async (tx: ManagedTransaction) => {
      const now = new Date().toISOString();
      const changes: Array<{ oldRef: string; newRef: string; requirementId: string }> = [];

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
        const requirements = record.get("requirements") as Neo4jNode[];

        const refParts = duplicateRef.split('-');
        const prefix = refParts.slice(0, -1).join('-');

        const maxQuery = `
          MATCH (req:Requirement)
          WHERE req.ref STARTS WITH $prefix + '-' AND req.ref =~ ($prefix + '-[0-9]{3}')
          WITH max(toInteger(split(req.ref, '-')[size(split(req.ref, '-'))-1])) AS maxExisting
          RETURN maxExisting
        `;

        const maxResult = await tx.run(maxQuery, { prefix });
        const maxExisting = maxResult.records[0]?.get("maxExisting");
        let nextNumber = (maxExisting ? Number(maxExisting) : 0) + 1;

        for (let i = 1; i < requirements.length; i++) {
          const requirement = requirements[i];
          const newRef = prefix + '-' + String(nextNumber).padStart(3, '0');

          const updateQuery = `
            MATCH (requirement:Requirement {id: $requirementId})
            SET requirement.ref = $newRef,
                requirement.updatedAt = $now,
                requirement.path = $tenantSlug + '/' + $projectSlug + '/requirements/' + $newRef + '.md'
            RETURN requirement.id AS id
          `;

          await tx.run(updateQuery, {
            requirementId: (requirement.properties as Record<string, unknown>).id,
            newRef,
            now,
            tenantSlug,
            projectSlug
          });

          changes.push({
            oldRef: duplicateRef,
            newRef,
            requirementId: String((requirement.properties as Record<string, unknown>).id)
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
