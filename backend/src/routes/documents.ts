import { FastifyInstance } from "fastify";
import { z } from "zod";
import { promises as fs } from "node:fs";
import { createReadStream } from "node:fs";
import { basename, extname, join, resolve, sep } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  createDocument,
  listDocuments,
  getDocument,
  updateDocument,
  updateDocumentFolder,
  softDeleteDocument,
  createFolder,
  listFolders,
  updateFolder,
  softDeleteFolder,
  createDocumentSection,
  listDocumentSections,
  updateDocumentSection,
  deleteDocumentSection,
  listSectionRequirements
} from "../services/graph.js";
import { config } from "../config.js";
import { slugify } from "../services/workspace.js";

const documentSchema = z.object({
  tenant: z.string().min(1),
  projectKey: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  shortCode: z.string().optional(),
  parentFolder: z.string().optional()
});

const folderSchema = z.object({
  tenant: z.string().min(1),
  projectKey: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  parentFolder: z.string().optional()
});

const documentSectionSchema = z.object({
  tenant: z.string().min(1),
  projectKey: z.string().min(1),
  documentSlug: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  shortCode: z.string().optional(),
  order: z.number().int().min(0)
});

const surrogateUploadFieldsSchema = z.object({
  tenant: z.string().min(1),
  projectKey: z.string().min(1),
  name: z.string().optional(),
  description: z.string().optional(),
  parentFolder: z.string().optional()
});

function buildDownloadUrl(tenant: string, project: string, documentSlug: string): string {
  const encodedTenant = encodeURIComponent(tenant);
  const encodedProject = encodeURIComponent(project);
  const encodedSlug = encodeURIComponent(documentSlug);
  return `/documents/${encodedTenant}/${encodedProject}/${encodedSlug}/file`;
}

function buildPreviewUrl(tenant: string, project: string, documentSlug: string): string {
  const encodedTenant = encodeURIComponent(tenant);
  const encodedProject = encodeURIComponent(project);
  const encodedSlug = encodeURIComponent(documentSlug);
  return `/documents/${encodedTenant}/${encodedProject}/${encodedSlug}/preview`;
}

async function ensureUniqueDocumentSlug(
  tenant: string,
  projectKey: string,
  desiredSlug: string
): Promise<string> {
  const baseSlug = slugify(desiredSlug);
  let candidate = baseSlug;
  let counter = 1;

  // Prevent tight loop in case slugify returns empty string
const fallbackSlug = baseSlug || `document-${Date.now()}`;

  while (true) {
    const existing = await getDocument(tenant, projectKey, candidate || fallbackSlug);
    if (!existing) {
      return candidate || fallbackSlug;
    }
    candidate = `${baseSlug || fallbackSlug}-${counter++}`;
  }
}

const execFileAsync = promisify(execFile);

const convertibleExtensions = new Set([
  ".doc",
  ".docx",
  ".ppt",
  ".pptx",
  ".xls",
  ".xlsx",
  ".odt",
  ".odp",
  ".ods"
]);

async function tryGeneratePreviewPdf(params: {
  absolutePath: string;
  outputDir: string;
  documentSlug: string;
  storedFileName: string;
  log: (message: string, meta?: Record<string, unknown>) => void;
}): Promise<{ previewPath: string | null; previewMimeType: string | null }> {
  const extension = extname(params.storedFileName).toLowerCase();
  if (!convertibleExtensions.has(extension)) {
    return { previewPath: null, previewMimeType: null };
  }

  const previewFileName = `${params.documentSlug}-preview.pdf`;
  const previewAbsolutePath = join(params.outputDir, previewFileName);
  const expectedConvertedName = `${params.storedFileName.slice(0, params.storedFileName.length - extension.length)}.pdf`;
  const expectedConvertedPath = join(params.outputDir, expectedConvertedName);

  try {
    await execFileAsync("libreoffice", [
      "--headless",
      "--convert-to",
      "pdf",
      "--outdir",
      params.outputDir,
      params.absolutePath
    ]);

    try {
      await fs.access(expectedConvertedPath);
      await fs.rename(expectedConvertedPath, previewAbsolutePath);
    } catch (renameError) {
      params.log("LibreOffice conversion succeeded but output file missing", {
        error: renameError instanceof Error ? renameError.message : renameError
      });
      return { previewPath: null, previewMimeType: null };
    }

    return {
      previewPath: `surrogates/${params.documentSlug}/${previewFileName}`,
      previewMimeType: "application/pdf"
    };
  } catch (error) {
    params.log("LibreOffice preview conversion failed", {
      error: error instanceof Error ? error.message : error,
      file: params.absolutePath
    });
    try {
      await fs.rm(expectedConvertedPath, { force: true });
      await fs.rm(previewAbsolutePath, { force: true });
    } catch (cleanupError) {
      params.log("Failed cleaning up preview artifacts", {
        error: cleanupError instanceof Error ? cleanupError.message : cleanupError
      });
    }
    return { previewPath: null, previewMimeType: null };
  }
}

type ParsedMultipart = {
  fields: Record<string, string>;
  file?: {
    filename: string;
    contentType: string;
    data: Buffer;
  };
};

function parseMultipartFormData(body: Buffer, boundary: string): ParsedMultipart {
  const result: ParsedMultipart = { fields: {} };
  const boundaryMarker = `--${boundary}`;
  const parts = body.toString("binary").split(boundaryMarker);

  for (const rawPart of parts) {
    if (!rawPart || rawPart === "--" || rawPart === "--\r\n") continue;

    let part = rawPart;
    if (part.startsWith("\r\n")) {
      part = part.slice(2);
    }
    if (part.endsWith("\r\n")) {
      part = part.slice(0, -2);
    }
    if (part === "--") continue;

    const headerEndIndex = part.indexOf("\r\n\r\n");
    if (headerEndIndex === -1) continue;

    const headerSection = part.slice(0, headerEndIndex);
    const bodySection = part.slice(headerEndIndex + 4);

    const headers = headerSection.split("\r\n");
    const dispositionHeader = headers.find(header => header.toLowerCase().startsWith("content-disposition"));
    if (!dispositionHeader) continue;

    const nameMatch = dispositionHeader.match(/name="([^"]+)"/);
    if (!nameMatch) continue;
    const fieldName = nameMatch[1];

    const filenameMatch = dispositionHeader.match(/filename="([^"]*)"/);
    if (filenameMatch && filenameMatch[1]) {
      const contentTypeHeader = headers.find(header => header.toLowerCase().startsWith("content-type"));
      const contentType = contentTypeHeader ? contentTypeHeader.split(":")[1].trim() : "application/octet-stream";
      const fileBuffer = Buffer.from(bodySection, "binary");
      result.file = {
        filename: filenameMatch[1],
        contentType,
        data: fileBuffer
      };
    } else {
      let textValue = Buffer.from(bodySection, "binary").toString("utf8");
      if (textValue.endsWith("\r\n")) {
        textValue = textValue.slice(0, -2);
      }
      result.fields[fieldName] = textValue;
    }
  }

  return result;
}

export default async function registerDocumentRoutes(app: FastifyInstance): Promise<void> {
  app.post("/documents/upload", async (req, reply) => {
    const contentType = req.headers["content-type"] ?? "";
    const boundaryMatch = contentType.match(/boundary=([^;]+)/i);
    if (!boundaryMatch) {
      return reply.status(400).send({ error: "Missing multipart boundary" });
    }

    const bodyBuffer = req.body;
    if (!Buffer.isBuffer(bodyBuffer)) {
      return reply.status(400).send({ error: "Multipart payload not available" });
    }

    const boundary = boundaryMatch[1].trim().replace(/^"|"$/g, "");
    const parsedPayload = parseMultipartFormData(bodyBuffer, boundary);
    const parsedFields = surrogateUploadFieldsSchema.safeParse(parsedPayload.fields);
    if (!parsedFields.success) {
      return reply.status(400).send({ error: parsedFields.error.issues[0]?.message ?? "Invalid form data" });
    }

    const filePart = parsedPayload.file;
    if (!filePart || !filePart.filename) {
      return reply.status(400).send({ error: "A document file is required" });
    }

    const { tenant, projectKey, name, description, parentFolder } = parsedFields.data;
    const sanitizedOriginalName = basename(filePart.filename);
    const originalExtension = extname(sanitizedOriginalName);
    const baseFileName = sanitizedOriginalName.slice(0, sanitizedOriginalName.length - originalExtension.length) || sanitizedOriginalName;
    const normalizedName = (name ?? "").trim();
    const documentName = normalizedName || baseFileName || "Uploaded Document";

    const documentSlug = await ensureUniqueDocumentSlug(tenant, projectKey, documentName);

    const tenantSlug = slugify(tenant);
    const projectSlug = slugify(projectKey);
    const storageDir = join(config.workspaceRoot, tenantSlug, projectSlug, "surrogates", documentSlug);
    await fs.mkdir(storageDir, { recursive: true });

    let storedFileName = originalExtension ? `${documentSlug}${originalExtension}` : documentSlug;
    let absolutePath = join(storageDir, storedFileName);
    let attempt = 1;
    while (true) {
      try {
        await fs.access(absolutePath);
        storedFileName = originalExtension ? `${documentSlug}-${attempt}${originalExtension}` : `${documentSlug}-${attempt}`;
        absolutePath = join(storageDir, storedFileName);
        attempt += 1;
      } catch {
        break;
      }
    }

    await fs.writeFile(absolutePath, filePart.data);

    const storagePath = `surrogates/${documentSlug}/${storedFileName}`;

    let previewPath: string | null = null;
    let previewMimeType: string | null = null;

    const logger = req.log ?? app.log;
    try {
      const previewResult = await tryGeneratePreviewPdf({
        absolutePath,
        outputDir: storageDir,
        documentSlug,
        storedFileName,
        log: (message, meta) => logger?.warn(meta ?? {}, message)
      });
      previewPath = previewResult.previewPath;
      previewMimeType = previewResult.previewMimeType;
    } catch (conversionError) {
      logger?.warn(
        { error: conversionError instanceof Error ? conversionError.message : conversionError },
        "Unexpected error during preview conversion"
      );
    }

    const document = await createDocument({
      tenant,
      projectKey,
      name: documentName,
      description: description?.trim() || undefined,
      parentFolder: parentFolder?.trim() || undefined,
      slug: documentSlug,
      kind: "surrogate",
      originalFileName: sanitizedOriginalName,
      storedFileName,
      mimeType: filePart.contentType ?? "application/octet-stream",
      fileSize: filePart.data.byteLength,
      storagePath,
      previewPath: previewPath ?? undefined,
      previewMimeType: previewMimeType ?? undefined
    });

    const documentWithDownload = {
      ...document,
      downloadUrl: buildDownloadUrl(tenant, projectKey, document.slug)
    };

    const responseDocument = {
      ...documentWithDownload,
      previewDownloadUrl:
        document.previewPath && document.previewMimeType
          ? buildPreviewUrl(tenant, projectKey, document.slug)
          : null
    };

    return reply.status(201).send({ document: responseDocument });
  });

  app.post("/documents", {
    schema: {
      tags: ["documents"],
      summary: "Create a new document",
      description: "Creates a new document record",
      body: {
        type: "object",
        required: ["tenant", "projectKey", "name"],
        properties: {
          tenant: { type: "string", minLength: 1 },
          projectKey: { type: "string", minLength: 1 },
          name: { type: "string", minLength: 1 },
          description: { type: "string" },
          shortCode: { type: "string" },
          parentFolder: { type: "string" }
        }
      },
      response: {
        200: {
          type: "object",
          properties: {
            document: { type: "object" }
          }
        }
      }
    }
  }, async (req) => {
    const payload = documentSchema.parse(req.body);
    const document = await createDocument({
      tenant: payload.tenant,
      projectKey: payload.projectKey,
      name: payload.name,
      description: payload.description,
      shortCode: payload.shortCode,
      parentFolder: payload.parentFolder
    });
    const documentWithDownload = {
      ...document,
      downloadUrl:
        document.kind === "surrogate"
          ? buildDownloadUrl(payload.tenant, payload.projectKey, document.slug)
          : null,
      previewDownloadUrl:
        document.previewPath && document.previewMimeType
          ? buildPreviewUrl(payload.tenant, payload.projectKey, document.slug)
          : null
    };

    return { document: documentWithDownload };
  });

  app.get("/documents/:tenant/:project", {
    schema: {
      tags: ["documents"],
      summary: "List documents",
      description: "Lists all documents for a project",
      params: {
        type: "object",
        required: ["tenant", "project"],
        properties: {
          tenant: { type: "string" },
          project: { type: "string" }
        }
      },
      response: {
        200: {
          type: "object",
          properties: {
            documents: { type: "array", items: { type: "object" } }
          }
        }
      }
    }
  }, async (req) => {
    const paramsSchema = z.object({ tenant: z.string().min(1), project: z.string().min(1) });
    const params = paramsSchema.parse(req.params);
    const documents = await listDocuments(params.tenant, params.project);
    const documentsWithDownload = documents.map(document => ({
      ...document,
      downloadUrl:
        document.kind === "surrogate"
          ? buildDownloadUrl(params.tenant, params.project, document.slug)
          : null,
      previewDownloadUrl:
        document.previewPath && document.previewMimeType
          ? buildPreviewUrl(params.tenant, params.project, document.slug)
          : null
    }));

    return { documents: documentsWithDownload };
  });

  app.get("/documents/:tenant/:project/:documentSlug", async (req, reply) => {
    const paramsSchema = z.object({
      tenant: z.string().min(1),
      project: z.string().min(1),
      documentSlug: z.string().min(1)
    });
    const params = paramsSchema.parse(req.params);
    const document = await getDocument(params.tenant, params.project, params.documentSlug);
    if (!document) return reply.status(404).send({ error: "Document not found" });
    const documentWithDownload = {
      ...document,
      downloadUrl:
        document.kind === "surrogate"
          ? buildDownloadUrl(params.tenant, params.project, document.slug)
          : null,
      previewDownloadUrl:
        document.previewPath && document.previewMimeType
          ? buildPreviewUrl(params.tenant, params.project, document.slug)
          : null
    };

    return { document: documentWithDownload };
  });

  app.get("/documents/:tenant/:project/:documentSlug/file", async (req, reply) => {
    const paramsSchema = z.object({
      tenant: z.string().min(1),
      project: z.string().min(1),
      documentSlug: z.string().min(1)
    });
    const params = paramsSchema.parse(req.params);

    const document = await getDocument(params.tenant, params.project, params.documentSlug);
    if (!document || document.kind !== "surrogate" || !document.storagePath) {
      return reply.status(404).send({ error: "Document file not found" });
    }

    const tenantSlug = slugify(params.tenant);
    const projectSlug = slugify(params.project);
    const baseDirectory = resolve(config.workspaceRoot, tenantSlug, projectSlug);
    const absolutePath = resolve(baseDirectory, document.storagePath);

    const normalizedBase = baseDirectory.endsWith(sep) ? baseDirectory : `${baseDirectory}${sep}`;
    if (absolutePath !== baseDirectory && !absolutePath.startsWith(normalizedBase)) {
      return reply.status(400).send({ error: "Invalid document path" });
    }

    try {
      await fs.access(absolutePath);
    } catch {
      return reply.status(404).send({ error: "Document file missing" });
    }

    const downloadName = document.originalFileName || document.storedFileName || `${document.name}${document.storedFileName ? extname(document.storedFileName) : ""}`;
    const safeName = downloadName.replace(/"/g, "'");

    reply.type(document.mimeType ?? "application/octet-stream");
    reply.header(
      "Content-Disposition",
      `attachment; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(downloadName)}`
    );

    return reply.send(createReadStream(absolutePath));
  });

  app.get("/documents/:tenant/:project/:documentSlug/preview", async (req, reply) => {
    const paramsSchema = z.object({
      tenant: z.string().min(1),
      project: z.string().min(1),
      documentSlug: z.string().min(1)
    });
    const params = paramsSchema.parse(req.params);

    const document = await getDocument(params.tenant, params.project, params.documentSlug);
    if (!document || document.kind !== "surrogate" || !document.previewPath) {
      return reply.status(404).send({ error: "Document preview not available" });
    }

    const tenantSlug = slugify(params.tenant);
    const projectSlug = slugify(params.project);
    const baseDirectory = resolve(config.workspaceRoot, tenantSlug, projectSlug);
    const absolutePath = resolve(baseDirectory, document.previewPath);

    const normalizedBase = baseDirectory.endsWith(sep) ? baseDirectory : `${baseDirectory}${sep}`;
    if (absolutePath !== baseDirectory && !absolutePath.startsWith(normalizedBase)) {
      return reply.status(400).send({ error: "Invalid preview path" });
    }

    try {
      await fs.access(absolutePath);
    } catch {
      return reply.status(404).send({ error: "Preview file missing" });
    }

    const previewName = document.previewPath.split("/").pop() ?? `${params.documentSlug}-preview.pdf`;
    const safeName = previewName.replace(/"/g, "'");

    reply.type(document.previewMimeType ?? "application/pdf");
    reply.header(
      "Content-Disposition",
      `inline; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(previewName)}`
    );

    return reply.send(createReadStream(absolutePath));
  });

  app.patch("/documents/:tenant/:project/:documentSlug", async (req, reply) => {
    const paramsSchema = z.object({
      tenant: z.string().min(1),
      project: z.string().min(1),
      documentSlug: z.string().min(1)
    });
    const bodySchema = z.object({
      name: z.string().optional(),
      description: z.string().optional(),
      shortCode: z.string().optional(),
      parentFolder: z.string().optional().nullable()
    });
    const params = paramsSchema.parse(req.params);
    const body = bodySchema.parse(req.body);

    let document;
    if (body.parentFolder !== undefined) {
      document = await updateDocumentFolder(
        params.tenant,
        params.project,
        params.documentSlug,
        body.parentFolder
      );
    } else {
      const { name, description, shortCode } = body;
      document = await updateDocument(params.tenant, params.project, params.documentSlug, {
        name,
        description,
        shortCode
      });
    }

    if (!document) return reply.status(404).send({ error: "Document not found" });

    const documentWithDownload = {
      ...document,
      downloadUrl:
        document.kind === "surrogate"
          ? buildDownloadUrl(params.tenant, params.project, document.slug)
          : null,
      previewDownloadUrl:
        document.previewPath && document.previewMimeType
          ? buildPreviewUrl(params.tenant, params.project, document.slug)
          : null
    };

    return { document: documentWithDownload };
  });

  app.delete("/documents/:tenant/:project/:documentSlug", {
    schema: {
      tags: ["documents"],
      summary: "Delete a document",
      description: "Soft deletes a document",
      params: {
        type: "object",
        required: ["tenant", "project", "documentSlug"],
        properties: {
          tenant: { type: "string" },
          project: { type: "string" },
          documentSlug: { type: "string" }
        }
      },
      response: {
        200: {
          type: "object",
          properties: {
            document: { type: "object" }
          }
        },
        404: {
          type: "object",
          properties: {
            error: { type: "string" }
          }
        }
      }
    }
  }, async (req, reply) => {
    const paramsSchema = z.object({
      tenant: z.string().min(1),
      project: z.string().min(1),
      documentSlug: z.string().min(1)
    });
    const params = paramsSchema.parse(req.params);
    const document = await softDeleteDocument(params.tenant, params.project, params.documentSlug);
    if (!document) return reply.status(404).send({ error: "Document not found" });

    const documentWithDownload = {
      ...document,
      downloadUrl:
        document.kind === "surrogate"
          ? buildDownloadUrl(params.tenant, params.project, document.slug)
          : null,
      previewDownloadUrl:
        document.previewPath && document.previewMimeType
          ? buildPreviewUrl(params.tenant, params.project, document.slug)
          : null
    };

    return { document: documentWithDownload };
  });

  app.post("/folders", async (req) => {
    const payload = folderSchema.parse(req.body);
    const folder = await createFolder({
      tenant: payload.tenant,
      projectKey: payload.projectKey,
      name: payload.name,
      description: payload.description,
      parentFolder: payload.parentFolder
    });
    return { folder };
  });

  app.get("/folders/:tenant/:project", async (req) => {
    const paramsSchema = z.object({ tenant: z.string().min(1), project: z.string().min(1) });
    const params = paramsSchema.parse(req.params);
    const folders = await listFolders(params.tenant, params.project);
    return { folders };
  });

  app.patch("/folders/:tenant/:project/:folderSlug", async (req, reply) => {
    const paramsSchema = z.object({
      tenant: z.string().min(1),
      project: z.string().min(1),
      folderSlug: z.string().min(1)
    });
    const bodySchema = z.object({
      name: z.string().min(1).optional(),
      description: z.string().optional()
    });
    const params = paramsSchema.parse(req.params);
    const body = bodySchema.parse(req.body);

    const folder = await updateFolder(params.tenant, params.project, params.folderSlug, body);
    if (!folder) return reply.status(404).send({ error: "Folder not found" });
    return { folder };
  });

  app.delete("/folders/:tenant/:project/:folderSlug", async (req, reply) => {
    const paramsSchema = z.object({
      tenant: z.string().min(1),
      project: z.string().min(1),
      folderSlug: z.string().min(1)
    });
    const params = paramsSchema.parse(req.params);
    const folder = await softDeleteFolder(params.tenant, params.project, params.folderSlug);
    if (!folder) return reply.status(404).send({ error: "Folder not found" });
    return { folder };
  });

  app.post("/sections", async (req) => {
    const payload = documentSectionSchema.parse(req.body);
    const section = await createDocumentSection({
      tenant: payload.tenant,
      projectKey: payload.projectKey,
      documentSlug: payload.documentSlug,
      name: payload.name,
      description: payload.description,
      shortCode: payload.shortCode,
      order: payload.order
    });
    return { section };
  });

  app.get("/sections/:tenant/:project/:documentSlug", async (req) => {
    const paramsSchema = z.object({
      tenant: z.string().min(1),
      project: z.string().min(1),
      documentSlug: z.string().min(1)
    });
    const params = paramsSchema.parse(req.params);
    const sections = await listDocumentSections(params.tenant, params.project, params.documentSlug);
    return { sections };
  });

  app.patch("/sections/:sectionId", async (req, reply) => {
    const paramsSchema = z.object({
      sectionId: z.string().min(1)
    });
    const bodySchema = z.object({
      name: z.string().min(1).optional(),
      description: z.string().optional(),
      order: z.number().int().min(0).optional(),
      shortCode: z.string().optional()
    });
    const params = paramsSchema.parse(req.params);
    const body = bodySchema.parse(req.body);

    try {
      const section = await updateDocumentSection(params.sectionId, body);
      return { section };
    } catch (error) {
      if ((error as Error).message === "Section not found") {
        return reply.status(404).send({ error: "Section not found" });
      }
      throw error;
    }
  });

  app.delete("/sections/:sectionId", async (req, reply) => {
    const paramsSchema = z.object({
      sectionId: z.string().min(1)
    });
    const params = paramsSchema.parse(req.params);

    try {
      await deleteDocumentSection(params.sectionId);
      return { success: true };
    } catch (error) {
      return reply.status(404).send({ error: "Section not found" });
    }
  });

  app.get("/sections/:sectionId/requirements", async (req) => {
    const paramsSchema = z.object({
      sectionId: z.string().min(1)
    });
    const params = paramsSchema.parse(req.params);
    const requirements = await listSectionRequirements(params.sectionId);
    return { requirements };
  });
}
