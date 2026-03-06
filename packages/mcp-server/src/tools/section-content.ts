import { z } from "zod";
import { mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AirgenClient } from "../client.js";
import { ok, error, formatError, truncate } from "../format.js";

const UPLOAD_BASE = "/tmp/airgen_uploads";
const CHUNK_SIZE_BYTES = 1500;
const UPLOAD_TTL_MS = 60 * 60 * 1000; // 1 hour

interface UploadMeta {
  filename: string;
  tenant: string;
  project: string;
  createdAt: number;
}

interface DocResponse {
  document: {
    slug: string;
    name: string;
    kind: string;
    mimeType?: string;
    fileSize?: number;
    downloadUrl?: string;
    previewDownloadUrl?: string | null;
  };
}

function formatDocResponse(doc: DocResponse["document"]): string {
  const sizeMB = doc.fileSize ? (doc.fileSize / (1024 * 1024)).toFixed(2) : "?";
  return (
    `Surrogate uploaded.\n\n` +
    `- **Slug:** ${doc.slug}\n` +
    `- **Name:** ${doc.name}\n` +
    `- **Type:** ${doc.mimeType ?? "unknown"}\n` +
    `- **Size:** ${sizeMB} MB\n` +
    (doc.downloadUrl ? `- **Download:** ${doc.downloadUrl}\n` : "") +
    (doc.previewDownloadUrl ? `- **Preview:** ${doc.previewDownloadUrl}\n` : "")
  );
}

/** Upload a binary buffer as a surrogate via the multipart endpoint. */
async function uploadBuffer(
  client: AirgenClient,
  buf: Buffer,
  filename: string,
  opts: { tenant: string; project: string; name?: string; description?: string; parentFolder?: string },
): Promise<DocResponse> {
  const contentType = getMimeType(filename);
  const fields: Record<string, string> = {
    tenant: opts.tenant,
    projectKey: opts.project,
  };
  if (opts.name) fields.name = opts.name;
  if (opts.description) fields.description = opts.description;
  if (opts.parentFolder) fields.parentFolder = opts.parentFolder;

  return client.postMultipart<DocResponse>("/documents/upload", fields, {
    filename,
    contentType,
    data: buf,
  });
}

const MIME_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  odt: "application/vnd.oasis.opendocument.text",
  ods: "application/vnd.oasis.opendocument.spreadsheet",
  odp: "application/vnd.oasis.opendocument.presentation",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  svg: "image/svg+xml",
  csv: "text/csv",
  txt: "text/plain",
  json: "application/json",
  xml: "application/xml",
  zip: "application/zip",
};

function getMimeType(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  return MIME_TYPES[ext] ?? "application/octet-stream";
}

interface InfoRecord {
  id: string;
  ref: string;
  text: string;
  title?: string;
  sectionId?: string;
  order?: number;
  createdAt: string;
  updatedAt: string;
}

interface SurrogateRecord {
  id: string;
  slug: string;
  caption?: string;
  sectionId?: string;
  order?: number;
  createdAt: string;
  updatedAt: string;
}

export function registerSectionContentTools(
  server: McpServer,
  client: AirgenClient,
) {
  // ── manage_info ──────────────────────────────────────────────
  server.tool(
    "manage_info",
    "Create, update, or delete an info block in a document section. Info blocks are non-requirement text content (notes, context, descriptions). Action 'create' requires documentSlug, text. Action 'update' requires infoRef. Action 'delete' requires infoRef.",
    {
      action: z.enum(["create", "update", "delete"]).describe("Operation to perform"),
      tenant: z.string().describe("Tenant slug"),
      project: z.string().describe("Project slug"),
      documentSlug: z
        .string()
        .optional()
        .describe("(create) Parent document slug"),
      sectionId: z
        .string()
        .optional()
        .describe("(create) Target section ID"),
      infoRef: z
        .string()
        .optional()
        .describe("(update, delete) Info ref (e.g. INFO-1708999123)"),
      text: z
        .string()
        .optional()
        .describe("(create required, update optional) Info text content"),
      title: z
        .string()
        .optional()
        .describe("(create, update) Optional info title"),
    },
    async ({ action, tenant, project, documentSlug, sectionId, infoRef, text, title }) => {
      try {
        switch (action) {
          case "create": {
            if (!documentSlug || !text) {
              return ok("create requires 'documentSlug' and 'text'.");
            }

            const body: Record<string, unknown> = {
              tenant,
              projectKey: project,
              documentSlug,
              text,
            };
            if (sectionId) body.sectionId = sectionId;
            if (title) body.title = title;

            const data = await client.post<{ info: InfoRecord }>("/infos", body);
            const info = data.info;
            return ok(
              `Info created.\n\n` +
                `- **ID:** ${info.id}\n` +
                `- **Ref:** ${info.ref}\n` +
                `- **Text:** ${truncate(info.text, 200)}\n` +
                (info.title ? `- **Title:** ${info.title}\n` : "") +
                (info.sectionId ? `- **Section:** ${info.sectionId}\n` : ""),
            );
          }

          case "update": {
            if (!infoRef) return ok("update requires 'infoRef'.");

            const body: Record<string, unknown> = {};
            if (text !== undefined) body.text = text;
            if (title !== undefined) body.title = title;

            const data = await client.patch<{ info: InfoRecord }>(
              `/infos/${tenant}/${project}/${infoRef}`,
              body,
            );
            const info = data.info;
            return ok(
              `Info updated.\n\n` +
                `- **Ref:** ${info.ref}\n` +
                `- **Text:** ${truncate(info.text, 200)}\n` +
                (info.title ? `- **Title:** ${info.title}\n` : ""),
            );
          }

          case "delete": {
            if (!infoRef) return ok("delete requires 'infoRef'.");
            await client.delete(`/infos/${tenant}/${project}/${infoRef}`);
            return ok(`Info '${infoRef}' deleted.`);
          }
        }
      } catch (err) {
        return formatError(err);
      }
    },
  );

  // ── reorder_content ──────────────────────────────────────────
  server.tool(
    "reorder_content",
    "Reorder requirements, infos, and/or surrogates within a section. Provide arrays of {id, order} pairs with explicit order values. Items are interleaved by order value across all types.",
    {
      tenant: z.string().describe("Tenant slug"),
      sectionId: z.string().describe("Section ID to reorder content within"),
      requirements: z
        .array(z.object({
          id: z.string().describe("Requirement node ID"),
          order: z.number().describe("New order value"),
        }))
        .optional()
        .describe("Requirements to reorder"),
      infos: z
        .array(z.object({
          id: z.string().describe("Info node ID"),
          order: z.number().describe("New order value"),
        }))
        .optional()
        .describe("Infos to reorder"),
      surrogates: z
        .array(z.object({
          id: z.string().describe("Surrogate reference node ID"),
          order: z.number().describe("New order value"),
        }))
        .optional()
        .describe("Surrogate references to reorder"),
    },
    async ({ tenant, sectionId, requirements, infos, surrogates }) => {
      try {
        const body: Record<string, unknown> = { tenant };
        if (requirements?.length) body.requirements = requirements;
        if (infos?.length) body.infos = infos;
        if (surrogates?.length) body.surrogates = surrogates;

        const totalItems =
          (requirements?.length ?? 0) +
          (infos?.length ?? 0) +
          (surrogates?.length ?? 0);

        if (totalItems === 0) {
          return ok("No items provided. Pass at least one of: requirements, infos, surrogates.");
        }

        await client.post(`/sections/${sectionId}/reorder-with-order`, body);

        const parts: string[] = [];
        if (requirements?.length) parts.push(`${requirements.length} requirement(s)`);
        if (infos?.length) parts.push(`${infos.length} info(s)`);
        if (surrogates?.length) parts.push(`${surrogates.length} surrogate(s)`);

        return ok(`Reordered ${parts.join(", ")} in section ${sectionId}.`);
      } catch (err) {
        return formatError(err);
      }
    },
  );

  // ── export_document ──────────────────────────────────────────
  server.tool(
    "export_document",
    "Export a structured document as markdown. Returns the full document content including sections, requirements, infos, and surrogate references.",
    {
      tenant: z.string().describe("Tenant slug"),
      project: z.string().describe("Project slug"),
      documentSlug: z.string().describe("Document slug to export"),
    },
    async ({ tenant, project, documentSlug }) => {
      try {
        const data = await client.get<{ content: string; document: { name: string; slug: string }; draft: boolean }>(
          `/markdown/${tenant}/${project}/${documentSlug}/content`,
        );

        const maxLen = 4000;
        let content = data.content;
        let truncated = false;
        if (content.length > maxLen) {
          content = content.slice(0, maxLen);
          truncated = true;
        }

        const header =
          `## Document Export: ${data.document?.name ?? documentSlug}\n\n` +
          (data.draft ? `_Draft version_\n\n` : "") +
          `---\n\n`;

        const footer = truncated
          ? `\n\n---\n_Output truncated (${data.content.length} chars total). Full content available via markdown API._`
          : "";

        return ok(header + content + footer);
      } catch (err) {
        return formatError(err);
      }
    },
  );

  // ── manage_surrogate_reference ───────────────────────────────
  server.tool(
    "manage_surrogate_reference",
    "Create or delete a surrogate reference (embedded link to an uploaded file) within a document section. Action 'create' requires documentSlug and slug. Action 'delete' requires surrogateId.",
    {
      action: z.enum(["create", "delete"]).describe("Operation to perform"),
      tenant: z.string().describe("Tenant slug"),
      project: z.string().describe("Project slug"),
      documentSlug: z
        .string()
        .optional()
        .describe("(create) Parent document slug"),
      sectionId: z
        .string()
        .optional()
        .describe("(create) Target section ID"),
      slug: z
        .string()
        .optional()
        .describe("(create) Surrogate document slug to reference"),
      caption: z
        .string()
        .optional()
        .describe("(create) Optional caption for the reference"),
      surrogateId: z
        .string()
        .optional()
        .describe("(delete) Surrogate reference node ID"),
    },
    async ({ action, tenant, project, documentSlug, sectionId, slug, caption, surrogateId }) => {
      try {
        switch (action) {
          case "create": {
            if (!documentSlug || !slug) {
              return ok("create requires 'documentSlug' and 'slug'.");
            }

            const body: Record<string, unknown> = {
              tenant,
              projectKey: project,
              documentSlug,
              slug,
            };
            if (sectionId) body.sectionId = sectionId;
            if (caption) body.caption = caption;

            const data = await client.post<{ surrogate: SurrogateRecord }>("/surrogates", body);
            const surrogate = data.surrogate;
            return ok(
              `Surrogate reference created.\n\n` +
                `- **ID:** ${surrogate.id}\n` +
                `- **Slug:** ${surrogate.slug}\n` +
                (surrogate.caption ? `- **Caption:** ${surrogate.caption}\n` : "") +
                (surrogate.sectionId ? `- **Section:** ${surrogate.sectionId}\n` : ""),
            );
          }

          case "delete": {
            if (!surrogateId) return ok("delete requires 'surrogateId'.");
            await client.delete(`/surrogates/${tenant}/${project}/${surrogateId}`);
            return ok(`Surrogate reference '${surrogateId}' deleted.`);
          }
        }
      } catch (err) {
        return formatError(err);
      }
    },
  );

  // ── upload_surrogate ─────────────────────────────────────────
  server.tool(
    "upload_surrogate",
    "Upload a file (PDF, Word, Excel, images, etc.) as a surrogate document. Three modes: (1) url — download from any HTTP/HTTPS URL (best for large files); (2) filePath — server-side path; (3) fileContentBase64 + fileName — base64 content (small files only). Provide exactly one source.",
    {
      tenant: z.string().describe("Tenant slug"),
      project: z.string().describe("Project slug"),
      url: z
        .string()
        .optional()
        .describe("(mode 1 — preferred for large files) HTTP/HTTPS URL to download file from"),
      filePath: z
        .string()
        .optional()
        .describe("(mode 2) Absolute path to file on the AIRGen server filesystem"),
      fileName: z
        .string()
        .optional()
        .describe("(mode 2/3) Override filename. Required for mode 3 (base64)."),
      fileContentBase64: z
        .string()
        .optional()
        .describe("(mode 3 — small files only) File content encoded as base64"),
      name: z
        .string()
        .optional()
        .describe("Display name for the document (defaults to filename)"),
      description: z
        .string()
        .optional()
        .describe("Document description"),
      parentFolder: z
        .string()
        .optional()
        .describe("Folder path to place the document in"),
    },
    async ({ tenant, project, url, filePath, fileName, fileContentBase64, name, description, parentFolder }) => {
      try {
        let data: DocResponse;

        if (url) {
          // Mode 1: URL download (backend fetches the file)
          const body: Record<string, unknown> = {
            tenant,
            projectKey: project,
            url,
          };
          if (fileName) body.fileName = fileName;
          if (name) body.name = name;
          if (description) body.description = description;
          if (parentFolder) body.parentFolder = parentFolder;

          data = await client.post<DocResponse>("/documents/upload-from-url", body);
        } else if (filePath) {
          // Mode 2: server-side file path
          const HOST_BASE = "/mnt/HC_Volume_103049457/apps/airgen";
          let containerPath = filePath;
          if (filePath.startsWith(HOST_BASE + "/workspace/")) {
            containerPath = "/workspace/" + filePath.slice((HOST_BASE + "/workspace/").length);
          } else if (filePath.startsWith(HOST_BASE + "/")) {
            containerPath = "/root/airgen/" + filePath.slice((HOST_BASE + "/").length);
          }

          const body: Record<string, unknown> = {
            tenant,
            projectKey: project,
            filePath: containerPath,
          };
          if (name) body.name = name;
          if (description) body.description = description;
          if (parentFolder) body.parentFolder = parentFolder;

          data = await client.post<DocResponse>("/documents/upload-from-path", body);
        } else if (fileContentBase64 && fileName) {
          // Mode 3: base64-encoded file content
          const fileBuffer = Buffer.from(fileContentBase64, "base64");
          if (fileBuffer.byteLength === 0) {
            return ok("File content is empty. Provide valid base64-encoded file data.");
          }

          data = await uploadBuffer(client, fileBuffer, fileName, { tenant, project, name, description, parentFolder });
        } else {
          return ok(
            "Provide one of:\n" +
              "- **url** — HTTP/HTTPS URL (best for large files)\n" +
              "- **filePath** — absolute path on the AIRGen server\n" +
              "- **fileName** + **fileContentBase64** — filename and base64 content (small files)",
          );
        }

        return ok(formatDocResponse(data.document));
      } catch (err) {
        return formatError(err);
      }
    },
  );

  // ── upload_begin ────────────────────────────────────────────
  server.tool(
    "upload_begin",
    `Start a chunked file upload. Returns an upload_id and the chunk_size_bytes (${CHUNK_SIZE_BYTES}) you must use. ` +
      `Each chunk must be exactly ${CHUNK_SIZE_BYTES} bytes of raw binary (${Math.ceil(CHUNK_SIZE_BYTES * 4 / 3)} base64 chars), except the last chunk which may be smaller. ` +
      "After calling this, send chunks with upload_chunk, then call upload_finalize to assemble and create the surrogate.",
    {
      tenant: z.string().describe("Tenant slug"),
      project: z.string().describe("Project slug"),
      filename: z.string().describe("Original filename with extension (e.g. report.pdf)"),
    },
    async ({ tenant, project, filename }) => {
      try {
        const uploadId = randomUUID();
        const dir = join(UPLOAD_BASE, uploadId);
        mkdirSync(dir, { recursive: true });
        const meta: UploadMeta = { filename, tenant, project, createdAt: Date.now() };
        writeFileSync(join(dir, "meta.json"), JSON.stringify(meta));
        return ok(
          `Upload started.\n\n` +
            `- **upload_id:** ${uploadId}\n` +
            `- **chunk_size_bytes:** ${CHUNK_SIZE_BYTES}\n` +
            `- **filename:** ${filename}\n\n` +
            `Send each chunk as base64 via upload_chunk (index 0, 1, 2, …), then call upload_finalize.`,
        );
      } catch (err) {
        return formatError(err);
      }
    },
  );

  // ── upload_chunk ────────────────────────────────────────────
  server.tool(
    "upload_chunk",
    `Append a chunk to an in-progress chunked upload. The data param must be base64-encoded. ` +
      `Each chunk should encode exactly ${CHUNK_SIZE_BYTES} bytes of raw binary (last chunk may be smaller). ` +
      "Send chunks sequentially starting at chunk_index 0.",
    {
      upload_id: z.string().describe("The upload_id returned by upload_begin"),
      chunk_index: z.number().int().min(0).describe("Zero-based chunk sequence number"),
      data: z.string().describe("Base64-encoded chunk data"),
    },
    async ({ upload_id, chunk_index, data }) => {
      try {
        const dir = join(UPLOAD_BASE, upload_id);
        const metaPath = join(dir, "meta.json");

        if (!existsSync(metaPath)) {
          return error(`Upload '${upload_id}' not found. Call upload_begin first.`);
        }

        const meta: UploadMeta = JSON.parse(readFileSync(metaPath, "utf-8"));
        if (Date.now() - meta.createdAt > UPLOAD_TTL_MS) {
          rmSync(dir, { recursive: true, force: true });
          return error(`Upload '${upload_id}' expired (>1 hour). Start a new upload.`);
        }

        writeFileSync(join(dir, `${chunk_index}.b64`), data);

        return ok(
          `Chunk ${chunk_index} received (${data.length} base64 chars).`,
        );
      } catch (err) {
        return formatError(err);
      }
    },
  );

  // ── upload_finalize ─────────────────────────────────────────
  server.tool(
    "upload_finalize",
    "Finalize a chunked upload: reassemble all chunks, create the surrogate document, and clean up temp files. " +
      "Call this after all chunks have been sent via upload_chunk.",
    {
      upload_id: z.string().describe("The upload_id returned by upload_begin"),
      name: z.string().optional().describe("Display name for the document (defaults to filename)"),
      description: z.string().optional().describe("Document description"),
      parent_folder: z.string().optional().describe("Folder path to place the document in"),
    },
    async ({ upload_id, name, description, parent_folder }) => {
      const dir = join(UPLOAD_BASE, upload_id);

      try {
        const metaPath = join(dir, "meta.json");

        if (!existsSync(metaPath)) {
          return error(`Upload '${upload_id}' not found. Call upload_begin first.`);
        }

        const meta: UploadMeta = JSON.parse(readFileSync(metaPath, "utf-8"));
        if (Date.now() - meta.createdAt > UPLOAD_TTL_MS) {
          rmSync(dir, { recursive: true, force: true });
          return error(`Upload '${upload_id}' expired (>1 hour). Start a new upload.`);
        }

        // Discover and validate chunk files
        const chunkFiles = readdirSync(dir)
          .filter((f) => f.endsWith(".b64"))
          .sort((a, b) => parseInt(a) - parseInt(b));

        if (chunkFiles.length === 0) {
          rmSync(dir, { recursive: true, force: true });
          return error("No chunks found. Send at least one chunk via upload_chunk before finalizing.");
        }

        // Validate sequential indices (0, 1, 2, …)
        for (let i = 0; i < chunkFiles.length; i++) {
          const expected = `${i}.b64`;
          if (chunkFiles[i] !== expected) {
            rmSync(dir, { recursive: true, force: true });
            return error(`Missing chunk ${i}. Got chunks: ${chunkFiles.map((f) => f.replace(".b64", "")).join(", ")}. Ensure all chunks from 0 to ${chunkFiles.length - 1} are sent.`);
          }
        }

        // Reassemble: decode each chunk's base64 independently, then concatenate binary
        const buffers: Buffer[] = [];
        for (const file of chunkFiles) {
          const b64 = readFileSync(join(dir, file), "utf-8");
          buffers.push(Buffer.from(b64, "base64"));
        }
        const fileBuffer = Buffer.concat(buffers);

        if (fileBuffer.byteLength === 0) {
          rmSync(dir, { recursive: true, force: true });
          return error("Reassembled file is empty (0 bytes). Check your chunk data.");
        }

        // Upload via the shared pipeline
        const data = await uploadBuffer(client, fileBuffer, meta.filename, {
          tenant: meta.tenant,
          project: meta.project,
          name,
          description,
          parentFolder: parent_folder,
        });

        // Clean up
        rmSync(dir, { recursive: true, force: true });

        return ok(
          formatDocResponse(data.document) +
            `\n_Reassembled ${chunkFiles.length} chunk(s), ${fileBuffer.byteLength} bytes total._`,
        );
      } catch (err) {
        // Always clean up on failure
        if (existsSync(dir)) {
          rmSync(dir, { recursive: true, force: true });
        }
        return formatError(err);
      }
    },
  );
}
