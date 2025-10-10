/**
 * Export Service - Single-Source Export System
 *
 * Generates markdown and JSON exports on-demand from Neo4j graph database.
 * Replaces the dual-storage architecture (Neo4j + markdown workspace) with
 * an export-only approach where markdown files are generated when needed.
 *
 * Phase 1.3 of Neo4j Single-Source Migration
 */

import { getSession } from "./graph/driver.js";

// ============================================================================
// Type Definitions
// ============================================================================

export interface RequirementExport {
  id: string;
  ref: string;
  title: string;
  text: string;
  section?: {
    id: string;
    name: string;
    shortCode: string;
  };
  document?: {
    slug: string;
    name: string;
  };
  traceLinks?: Array<{
    linkId: string;
    sourceRef: string;
    targetRef: string;
    linkType: string;
  }>;
  tenant: string;
  projectKey: string;
  pattern?: string | null;
  verification?: string | null;
  qa?: {
    score: number;
    verdict: string | null;
    suggestions: string[];
  } | null;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface DocumentSectionExport {
  id: string;
  name: string;
  shortCode: string;
  order: number;
  requirements: Array<{
    id: string;
    ref: string;
    title: string;
    order: number;
  }>;
}

export interface DocumentExport {
  slug: string;
  name: string;
  shortCode: string;
  sections: DocumentSectionExport[];
  linksets?: Array<{
    id: string;
    targetDocSlug: string;
    defaultLinkType: string;
  }>;
  tenant: string;
  projectKey: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectExportOptions {
  includeRequirements?: boolean;
  includeDocuments?: boolean;
  includeInfos?: boolean;
  includeSurrogates?: boolean;
  includeLinksets?: boolean;
  includeTraceLinks?: boolean;
  format?: "markdown" | "json" | "both";
}

export interface ProjectExportArchive {
  manifest: {
    tenant: string;
    projectKey: string;
    exportDate: string;
    options: ProjectExportOptions;
    stats: {
      requirements: number;
      documents: number;
      infos: number;
      surrogates: number;
      linksets: number;
      traceLinks: number;
    };
  };
  files: Record<string, string>; // filename -> content
}

export interface BackupExportOptions {
  destination: string;
  includeRelationships?: boolean;
  includeMetadata?: boolean;
}

export interface BackupManifest {
  exportDate: string;
  tenants: string[];
  projects: Array<{ tenant: string; projectKey: string }>;
  stats: {
    totalRequirements: number;
    totalDocuments: number;
    totalInfos: number;
    totalSurrogates: number;
    totalLinksets: number;
    totalTraceLinks: number;
  };
}

// ============================================================================
// Export Functions
// ============================================================================

/**
 * Export a requirement with all its relationships as markdown.
 * Includes section info, document info, and trace links.
 */
export async function exportRequirement(requirementId: string): Promise<string> {
  const session = getSession();

  try {
    // Query Neo4j for requirement with all relationships
    const result = await session.run(
      `
      MATCH (req:Requirement {id: $requirementId})
      OPTIONAL MATCH (section:DocumentSection)-[:CONTAINS]->(req)
      OPTIONAL MATCH (doc:Document)-[:HAS_SECTION]->(section)
      OPTIONAL MATCH (req)<-[:LINKS_TO]-(traceLink:TraceLink)-[:LINKS_FROM]->(sourceReq:Requirement)
      OPTIONAL MATCH (req)-[:LINKS_FROM]->(outgoingLink:TraceLink)-[:LINKS_TO]->(targetReq:Requirement)
      RETURN req,
             section.id as sectionId,
             section.name as sectionName,
             section.shortCode as sectionCode,
             doc.slug as docSlug,
             doc.name as docName,
             collect(DISTINCT {
               linkId: traceLink.id,
               sourceRef: sourceReq.ref,
               targetRef: req.ref,
               linkType: traceLink.linkType
             }) as incomingLinks,
             collect(DISTINCT {
               linkId: outgoingLink.id,
               sourceRef: req.ref,
               targetRef: targetReq.ref,
               linkType: outgoingLink.linkType
             }) as outgoingLinks
      `,
      { requirementId }
    );

    if (result.records.length === 0) {
      throw new Error(`Requirement not found: ${requirementId}`);
    }

    const record = result.records[0];
    const req = record.get("req").properties;

    // Build requirement export object
    const exportData: RequirementExport = {
      id: req.id,
      ref: req.ref,
      title: req.title,
      text: req.text,
      tenant: req.tenant,
      projectKey: req.projectKey,
      pattern: req.pattern || null,
      verification: req.verification || null,
      qa: req.qaScore !== undefined && req.qaScore !== null
        ? {
            score: req.qaScore,
            verdict: req.qaVerdict || null,
            suggestions: req.suggestions || []
          }
        : null,
      tags: req.tags || [],
      createdAt: req.createdAt,
      updatedAt: req.updatedAt
    };

    // Add section info if available
    const sectionId = record.get("sectionId");
    if (sectionId) {
      exportData.section = {
        id: sectionId,
        name: record.get("sectionName"),
        shortCode: record.get("sectionCode")
      };
    }

    // Add document info if available
    const docSlug = record.get("docSlug");
    if (docSlug) {
      exportData.document = {
        slug: docSlug,
        name: record.get("docName")
      };
    }

    // Add trace links if available
    const incomingLinks = record.get("incomingLinks");
    const outgoingLinks = record.get("outgoingLinks");
    const allLinks = [
      ...incomingLinks.filter((link: any) => link.linkId !== null),
      ...outgoingLinks.filter((link: any) => link.linkId !== null)
    ];

    if (allLinks.length > 0) {
      exportData.traceLinks = allLinks.map((link: any) => ({
        linkId: link.linkId,
        sourceRef: link.sourceRef,
        targetRef: link.targetRef,
        linkType: link.linkType
      }));
    }

    // Generate markdown
    return generateRequirementMarkdown(exportData);
  } finally {
    await session.close();
  }
}

/**
 * Export a document with all sections and requirements.
 */
export async function exportDocument(
  tenant: string,
  projectKey: string,
  documentSlug: string
): Promise<string> {
  const session = getSession();

  try {
    // First get document and sections
    const docResult = await session.run(
      `
      MATCH (doc:Document {slug: $slug, tenant: $tenant, projectKey: $projectKey})
      OPTIONAL MATCH (doc)-[:HAS_SECTION]->(section:DocumentSection)
      OPTIONAL MATCH (doc)<-[:LINKS_FROM]-(linkset:DocumentLinkset)-[:LINKS_TO]->(targetDoc:Document)
      WITH doc, section, linkset, targetDoc
      ORDER BY section.order
      RETURN doc,
             collect(DISTINCT {
               id: section.id,
               name: section.name,
               shortCode: section.shortCode,
               order: section.order
             }) as sections,
             collect(DISTINCT {
               id: linkset.id,
               targetSlug: targetDoc.slug,
               defaultLinkType: linkset.defaultLinkType
             }) as linksets
      `,
      { slug: documentSlug, tenant, projectKey }
    );

    if (docResult.records.length === 0) {
      throw new Error(`Document not found: ${documentSlug}`);
    }

    const docRecord = docResult.records[0];
    const doc = docRecord.get("doc").properties;
    const sections = docRecord.get("sections").filter((s: any) => s.id !== null);
    const linksets = docRecord.get("linksets").filter((ls: any) => ls.id !== null);

    // Then get requirements for each section
    const sectionsWithReqs: DocumentSectionExport[] = [];
    for (const section of sections) {
      const reqResult = await session.run(
        `
        MATCH (section:DocumentSection {id: $sectionId})-[:CONTAINS]->(req:Requirement)
        WITH req
        ORDER BY req.order
        RETURN collect({
          id: req.id,
          ref: req.ref,
          title: req.title,
          order: req.order
        }) as requirements
        `,
        { sectionId: section.id }
      );

      const requirements = reqResult.records.length > 0
        ? reqResult.records[0].get("requirements")
        : [];

      sectionsWithReqs.push({
        id: section.id,
        name: section.name,
        shortCode: section.shortCode,
        order: section.order,
        requirements: requirements.filter((r: any) => r.id !== null)
      });
    }

    // Build export data
    const exportData: DocumentExport = {
      slug: doc.slug,
      name: doc.name,
      shortCode: doc.shortCode,
      sections: sectionsWithReqs,
      linksets: linksets.length > 0 ? linksets : undefined,
      tenant: doc.tenant,
      projectKey: doc.projectKey,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt
    };

    return generateDocumentMarkdown(exportData);
  } finally {
    await session.close();
  }
}

/**
 * Export an entire project with all entities.
 */
export async function exportProject(
  tenant: string,
  projectKey: string,
  options: ProjectExportOptions = {}
): Promise<ProjectExportArchive> {
  // TODO: Implement full project export
  // This will be implemented in later phases
  throw new Error("exportProject not yet implemented");
}

/**
 * Generate backup exports for all tenants/projects.
 */
export async function exportBackup(
  options: BackupExportOptions
): Promise<BackupManifest> {
  // TODO: Implement backup export
  // This will be implemented in Phase 4
  throw new Error("exportBackup not yet implemented");
}

// ============================================================================
// Markdown Generation
// ============================================================================

/**
 * Generate enhanced markdown for a requirement export.
 * Includes section info, document info, and trace links in frontmatter.
 */
function generateRequirementMarkdown(data: RequirementExport): string {
  const frontmatter: Record<string, any> = {
    id: data.id,
    ref: data.ref,
    title: data.title,
    tenant: data.tenant,
    project: data.projectKey
  };

  // Add section info (NEW)
  if (data.section) {
    frontmatter.section = {
      id: data.section.id,
      name: data.section.name,
      shortCode: data.section.shortCode
    };
  }

  // Add document info (NEW)
  if (data.document) {
    frontmatter.document = {
      slug: data.document.slug,
      name: data.document.name
    };
  }

  // Add trace links (NEW)
  if (data.traceLinks && data.traceLinks.length > 0) {
    frontmatter.traceLinks = data.traceLinks.map(link => ({
      linkId: link.linkId,
      sourceRef: link.sourceRef,
      targetRef: link.targetRef,
      linkType: link.linkType
    }));
  }

  frontmatter.pattern = data.pattern;
  frontmatter.verification = data.verification;
  frontmatter.qa = data.qa;
  frontmatter.tags = data.tags;
  frontmatter.createdAt = data.createdAt;
  frontmatter.updatedAt = data.updatedAt;

  // Generate YAML frontmatter
  const yaml = generateYAML(frontmatter);

  // Return markdown with frontmatter and text
  return `---\n${yaml}---\n\n${data.text}\n`;
}

/**
 * Generate markdown for a document export.
 */
function generateDocumentMarkdown(data: DocumentExport): string {
  const frontmatter: Record<string, any> = {
    slug: data.slug,
    name: data.name,
    shortCode: data.shortCode,
    tenant: data.tenant,
    project: data.projectKey,
    sections: data.sections.map(s => ({
      id: s.id,
      name: s.name,
      shortCode: s.shortCode,
      order: s.order,
      requirementCount: s.requirements.length
    })),
    createdAt: data.createdAt,
    updatedAt: data.updatedAt
  };

  if (data.linksets) {
    frontmatter.linksets = data.linksets;
  }

  const yaml = generateYAML(frontmatter);

  // Generate document body with sections
  let body = `# ${data.name}\n\n`;
  for (const section of data.sections) {
    body += `## ${section.name}\n\n`;
    body += `**Short Code**: ${section.shortCode}\n`;
    body += `**Requirements**: ${section.requirements.length}\n\n`;

    for (const req of section.requirements) {
      body += `- [${req.ref}] ${req.title}\n`;
    }
    body += "\n";
  }

  return `---\n${yaml}---\n\n${body}`;
}

/**
 * Simple YAML generator for frontmatter.
 */
function generateYAML(obj: Record<string, any>, indent = 0): string {
  const lines: string[] = [];
  const prefix = " ".repeat(indent);

  for (const [key, value] of Object.entries(obj)) {
    if (value === null || value === undefined) {
      lines.push(`${prefix}${key}: null`);
    } else if (Array.isArray(value)) {
      if (value.length === 0) {
        lines.push(`${prefix}${key}: []`);
      } else if (typeof value[0] === "object") {
        lines.push(`${prefix}${key}:`);
        for (const item of value) {
          lines.push(`${prefix}  - ${generateYAML(item, indent + 4).trim()}`);
        }
      } else {
        lines.push(`${prefix}${key}: [${value.map(v => JSON.stringify(v)).join(", ")}]`);
      }
    } else if (typeof value === "object") {
      lines.push(`${prefix}${key}:`);
      lines.push(generateYAML(value, indent + 2));
    } else if (typeof value === "string") {
      // Escape quotes and handle multiline
      const escaped = value.replace(/"/g, '\\"');
      lines.push(`${prefix}${key}: "${escaped}"`);
    } else {
      lines.push(`${prefix}${key}: ${value}`);
    }
  }

  return lines.join("\n") + "\n";
}
