import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AirgenClient } from "../client.js";
import { ok, error, formatError, formatTable } from "../format.js";

interface ImagineImageRecord {
  id: string;
  elementId: string;
  elementName: string;
  elementType: "Block" | "Interface";
  tenantSlug: string;
  projectSlug: string;
  prompt: string;
  customPrompt?: string;
  imageUrl: string;
  version: number;
  parentVersionId?: string;
  requirementIds?: string[];
  metadata: {
    model: string;
    aspectRatio: string;
    generatedAt: string;
    estimatedCost: number;
  };
  createdBy: string;
  createdAt: string;
}

interface DocumentRecord {
  slug: string;
  name: string;
  description?: string;
  type?: string;
  kind?: string;
  mimeType?: string;
}

function extractBlockName(text: string): string {
  const blockMatch = text.match(/Block:\s*([^(]+)/i);
  if (blockMatch) return blockMatch[1].trim();
  const imagineMatch = text.match(/Imagine:\s*([^(]+)/i);
  if (imagineMatch) return imagineMatch[1].trim();
  return "";
}

export function registerImagineTools(server: McpServer, client: AirgenClient) {
  server.tool(
    "export_document_asset",
    "Export the image asset from an Imagine document. Accepts an ImagineImage ID (img-xxx) or a document slug (imagine-xxx). Returns base64 image data or a URL.",
    {
      documentSlug: z.string().describe(
        "Document slug (e.g. 'imagine-sound-system-v3') or ImagineImage ID (e.g. 'img-xxx')",
      ),
      project: z.string().describe("Project slug"),
      tenant: z.string().describe("Tenant slug"),
      format: z
        .enum(["base64", "url"])
        .optional()
        .describe(
          "Output format. 'base64' returns base64-encoded image data, 'url' returns the image URL. Default: base64",
        ),
    },
    async ({ documentSlug, project, tenant, format }) => {
      const outputFormat = format ?? "base64";

      try {
        // Strategy 1: ImagineImage ID (e.g. img-1708999123-abc123)
        if (documentSlug.startsWith("img-")) {
          return await exportByImageId(client, tenant, project, documentSlug, outputFormat);
        }

        // Strategy 2: Document slug — get metadata first
        const doc = await client.get<DocumentRecord>(
          `/documents/${tenant}/${project}/${documentSlug}`,
        );

        const isImagine =
          documentSlug.startsWith("imagine-") ||
          (doc.description ?? "").toLowerCase().includes("ai-generated visualization");

        if (!isImagine) {
          const kind = doc.kind ?? doc.type ?? "structured";
          if (kind === "structured") {
            return error(
              `Document '${documentSlug}' is a requirements document, not an image asset. ` +
                `Use export_document_markdown or get_document_sections instead.`,
            );
          }
          // Allow non-imagine surrogates through (could be any uploaded file)
        }

        if (outputFormat === "url") {
          return ok(
            JSON.stringify(
              {
                documentSlug: doc.slug,
                documentName: doc.name,
                type: isImagine ? "imagine" : "surrogate",
                contentType: doc.mimeType || "image/png",
                format: "url",
                url: `/api/documents/${tenant}/${project}/${documentSlug}/file`,
                description: doc.description ?? "",
                relatedBlock: extractBlockName(doc.description ?? doc.name ?? ""),
              },
              null,
              2,
            ),
          );
        }

        // Fetch binary content from the documents file endpoint
        const { data, contentType } = await client.fetchBinary(
          `/documents/${tenant}/${project}/${documentSlug}/file`,
        );

        const mimeType = contentType || doc.mimeType || "image/png";
        const isImage = mimeType.startsWith("image/");

        const metadata = {
          documentSlug: doc.slug,
          documentName: doc.name,
          type: isImagine ? "imagine" : "surrogate",
          contentType: mimeType,
          description: doc.description ?? "",
          relatedBlock: extractBlockName(doc.description ?? doc.name ?? ""),
        };

        if (isImage) {
          return {
            content: [
              { type: "text" as const, text: JSON.stringify(metadata, null, 2) },
              { type: "image" as const, data: data.toString("base64"), mimeType },
            ],
          };
        }

        // Non-image file — return base64 in JSON
        return ok(
          JSON.stringify(
            { ...metadata, encoding: "base64", data: data.toString("base64") },
            null,
            2,
          ),
        );
      } catch (err) {
        return formatError(err);
      }
    },
  );

  server.tool(
    "export_document_assets_batch",
    "Export all Imagine image assets from a project. Returns a list of assets with metadata and optionally content. Uses the Imagine gallery (not the documents list).",
    {
      project: z.string().describe("Project slug"),
      tenant: z.string().describe("Tenant slug"),
      includeContent: z
        .boolean()
        .optional()
        .describe(
          "If false, returns metadata only without image data. Useful for listing what's available. Default: true",
        ),
    },
    async ({ project, tenant, includeContent }) => {
      const withContent = includeContent !== false;

      try {
        const resp = await client.get<{
          success: boolean;
          data: { images: ImagineImageRecord[]; total: number };
        }>(`/${tenant}/${project}/imagine/images`);

        const images = resp.data?.images ?? [];

        if (images.length === 0) return ok("No Imagine images found in this project.");

        // Metadata-only mode
        if (!withContent) {
          const rows = images.map((img) => [
            img.id,
            img.elementName,
            img.elementType,
            `v${img.version}`,
            img.metadata?.aspectRatio ?? "",
            img.metadata?.model ?? "",
            img.createdAt?.split("T")[0] ?? "",
          ]);

          return ok(
            `## Imagine Images (${images.length} total)\n\n` +
              formatTable(
                ["Image ID", "Element", "Type", "Version", "Aspect Ratio", "Model", "Created"],
                rows,
              ),
          );
        }

        // Full content mode — fetch each image and return as MCP image content blocks
        const content: Array<
          | { type: "text"; text: string }
          | { type: "image"; data: string; mimeType: string }
        > = [];

        content.push({
          type: "text" as const,
          text: `## Imagine Images (${images.length} total)\n`,
        });

        for (const img of images) {
          const meta = {
            imageId: img.id,
            elementName: img.elementName,
            elementType: img.elementType,
            version: img.version,
            imageUrl: img.imageUrl,
            customPrompt: img.customPrompt,
            metadata: img.metadata,
          };

          try {
            const { data, contentType } = await client.fetchStaticFile(img.imageUrl);
            const mimeType = contentType.startsWith("image/") ? contentType : "image/png";

            content.push({
              type: "text" as const,
              text: `### ${img.elementName} (v${img.version})\n\`\`\`json\n${JSON.stringify(meta, null, 2)}\n\`\`\``,
            });
            content.push({
              type: "image" as const,
              data: data.toString("base64"),
              mimeType,
            });
          } catch {
            content.push({
              type: "text" as const,
              text: `### ${img.elementName} (v${img.version})\n${JSON.stringify(meta, null, 2)}\n\n_Failed to fetch image content._`,
            });
          }
        }

        return { content };
      } catch (err) {
        return formatError(err);
      }
    },
  );
}

/** Export an ImagineImage by its ID (img-xxx). */
async function exportByImageId(
  client: AirgenClient,
  tenant: string,
  project: string,
  imageId: string,
  outputFormat: "base64" | "url",
) {
  const resp = await client.get<{
    success: boolean;
    data: { image: ImagineImageRecord; versions: ImagineImageRecord[] };
  }>(`/${tenant}/${project}/imagine/images/${imageId}`);

  const img = resp.data?.image;
  if (!img) {
    return error(`Imagine image '${imageId}' not found.`);
  }

  const metadata = {
    imageId: img.id,
    documentName: `Imagine: ${img.elementName} (v${img.version})`,
    type: "imagine" as const,
    contentType: "image/png",
    description: `AI-generated visualization of ${img.elementType}: ${img.elementName} (version ${img.version})`,
    relatedBlock: img.elementName,
    version: img.version,
    model: img.metadata?.model,
    aspectRatio: img.metadata?.aspectRatio,
    generatedAt: img.metadata?.generatedAt,
    customPrompt: img.customPrompt,
    versions: resp.data?.versions?.length ?? 1,
  };

  if (outputFormat === "url") {
    return ok(JSON.stringify({ ...metadata, format: "url", url: img.imageUrl }, null, 2));
  }

  const { data, contentType } = await client.fetchStaticFile(img.imageUrl);
  const mimeType = contentType.startsWith("image/") ? contentType : "image/png";

  return {
    content: [
      { type: "text" as const, text: JSON.stringify(metadata, null, 2) },
      { type: "image" as const, data: data.toString("base64"), mimeType },
    ],
  };
}
