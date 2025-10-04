import "../env.js";
import { initGraph, closeGraph } from "../services/graph.js";
import { getSession } from "../services/graph/driver.js";
import { parseMarkdownDocument } from "../services/markdown-parser.js";
import { syncParsedDocument } from "../services/markdown-sync.js";
import { ensureWorkspace } from "../services/workspace.js";
import type { DocumentRecord } from "../services/graph/documents/index.js";
import { slugify } from "../services/workspace.js";
import { generateMarkdownFromNeo4j as generateMarkdown } from "../routes/markdown-api.js";

interface Filters {
  tenant?: string;
  project?: string;
  document?: string;
}

function parseArgs(): Filters {
  const filters: Filters = {};
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith("--tenant=")) {
      filters.tenant = arg.split("=")[1];
    } else if (arg.startsWith("--project=")) {
      filters.project = arg.split("=")[1];
    } else if (arg.startsWith("--document=")) {
      filters.document = arg.split("=")[1];
    }
  }
  return filters;
}

async function main(): Promise<void> {
  const filters = parseArgs();
  await ensureWorkspace();
  await initGraph();
  const session = getSession();

  const whereClauses: string[] = [];
  const params: Record<string, unknown> = {};

  if (filters.tenant) {
    whereClauses.push("doc.tenant = $tenant");
    params.tenant = slugify(filters.tenant);
  }
  if (filters.project) {
    whereClauses.push("doc.projectKey = $project");
    params.project = slugify(filters.project);
  }
  if (filters.document) {
    whereClauses.push("doc.slug = $document");
    params.document = slugify(filters.document);
  }

  const whereClause = whereClauses.length ? `WHERE ${whereClauses.join(" AND ")}` : "";

  const docsResult = await session.run(
    `
      MATCH (doc:Document)
      ${whereClause}
      RETURN doc
      ORDER BY doc.tenant, doc.projectKey, doc.slug
    `,
    params
  );

  const documents = docsResult.records.map(record => record.get("doc")) as Array<{ properties: Record<string, unknown> }>;

  let processed = 0;

  for (const docNode of documents) {
    const props = docNode.properties;
    const tenant = String(props.tenant);
    const projectKey = String(props.projectKey);
    const documentSlug = String(props.slug);
    const documentName = String(props.name ?? documentSlug);

    const markdown = await generateMarkdown(
      tenant,
      projectKey,
      documentSlug,
      documentName
    );

    const parsed = await parseMarkdownDocument(markdown, {
      tenant,
      projectKey,
      documentSlug
    });

    const documentRecord: DocumentRecord = {
      id: String(props.id),
      slug: documentSlug,
      name: documentName,
      description: props.description ? String(props.description) : null,
      tenant,
      projectKey,
      shortCode: props.shortCode ? String(props.shortCode) : null,
      parentFolder: props.parentFolder ? String(props.parentFolder) : null,
      createdAt: String(props.createdAt),
      updatedAt: String(props.updatedAt),
      requirementCount: props.requirementCount !== undefined ? Number(props.requirementCount) : undefined,
      kind: props.kind ? String(props.kind) as DocumentRecord["kind"] : "structured",
      originalFileName: props.originalFileName ? String(props.originalFileName) : null,
      storedFileName: props.storedFileName ? String(props.storedFileName) : null,
      mimeType: props.mimeType ? String(props.mimeType) : null,
      fileSize: props.fileSize !== undefined && props.fileSize !== null ? Number(props.fileSize) : null,
      storagePath: props.storagePath ? String(props.storagePath) : null,
      previewPath: props.previewPath ? String(props.previewPath) : null,
      previewMimeType: props.previewMimeType ? String(props.previewMimeType) : null
    };

    await session.executeWrite(async tx => {
      await syncParsedDocument(tx, {
        tenant,
        projectKey,
        document: documentRecord,
        documentSlug,
        parsed
      });
    });

    processed += 1;
    console.log(`Backfilled content blocks for ${tenant}/${projectKey}/${documentSlug} (blocks=${parsed.blocks.length})`);
  }

  console.log(`Completed backfill for ${processed} document(s).`);
  await closeGraph();
}

main().catch(async (error) => {
  console.error("Backfill failed", error);
  await closeGraph();
  process.exit(1);
});
