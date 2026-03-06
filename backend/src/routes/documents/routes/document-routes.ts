import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { promises as fs } from "node:fs";
import { createReadStream } from "node:fs";
import { basename, extname, join, resolve, sep } from "node:path";
import {
  createDocument,
  listDocuments,
  getDocument,
  updateDocument,
  updateDocumentFolder,
  softDeleteDocument
} from "../../../services/graph.js";
import { config } from "../../../config.js";
import { slugify } from "../../../services/workspace.js";
import { tryGeneratePreviewPdf } from "../helpers/file-upload-helpers.js";
import { parseMultipartFormData } from "../helpers/multipart-parser.js";
import { buildDownloadUrl, buildPreviewUrl } from "../helpers/document-url-builders.js";
import { ensureUniqueDocumentSlug } from "../helpers/slug-helpers.js";
import { requireTenantAccess, verifyTenantAccessHook, verifyTenantAccessFromBodyHook, type AuthUser } from "../../../lib/authorization.js";

const documentSchema = z.object({
  tenant: z.string().min(1),
  projectKey: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  shortCode: z.string().optional(),
  parentFolder: z.string().optional()
});

const surrogateUploadFieldsSchema = z.object({
  tenant: z.string().min(1),
  projectKey: z.string().min(1),
  name: z.string().optional(),
  description: z.string().optional(),
  parentFolder: z.string().optional()
});

/**
 * Register all document-related routes (upload, CRUD, file serving)
 */
export async function registerDocumentRoutes(app: FastifyInstance): Promise<void> {
  // Upload surrogate document
  app.post("/documents/upload", {
    onRequest: [app.authenticate]
  }, async (req, reply) => {
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

    // Verify tenant access
    requireTenantAccess(req.currentUser as AuthUser, tenant, reply);

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
      previewMimeType: previewMimeType ?? undefined,
      userId: req.currentUser!.sub
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

  // Upload surrogate from server-side file path
  app.post("/documents/upload-from-path", {
    onRequest: [app.authenticate],
    schema: {
      tags: ["documents"],
      summary: "Create surrogate from server-side file",
      description: "Reads a file from the server filesystem and creates a surrogate document. Path must be within /workspace or /root/airgen.",
      body: {
        type: "object",
        required: ["tenant", "projectKey", "filePath"],
        properties: {
          tenant: { type: "string", minLength: 1 },
          projectKey: { type: "string", minLength: 1 },
          filePath: { type: "string", minLength: 1, description: "Absolute path to file on server filesystem" },
          name: { type: "string", description: "Display name (defaults to filename)" },
          description: { type: "string" },
          parentFolder: { type: "string" }
        }
      },
      response: {
        201: {
          type: "object",
          properties: {
            document: { type: "object", additionalProperties: true }
          }
        },
        400: {
          type: "object",
          properties: { error: { type: "string" } }
        },
        404: {
          type: "object",
          properties: { error: { type: "string" } }
        }
      }
    }
  }, async (req, reply) => {
    const bodySchema = z.object({
      tenant: z.string().min(1),
      projectKey: z.string().min(1),
      filePath: z.string().min(1),
      name: z.string().optional(),
      description: z.string().optional(),
      parentFolder: z.string().optional()
    });
    const { tenant, projectKey, filePath, name, description, parentFolder } = bodySchema.parse(req.body);

    requireTenantAccess(req.currentUser as AuthUser, tenant, reply);

    // Validate path is within allowed directories
    const resolvedPath = resolve(filePath);
    const allowedRoots = [
      resolve(config.workspaceRoot),
      resolve("/root/airgen"),
    ];
    const isAllowed = allowedRoots.some(root =>
      resolvedPath.startsWith(root + sep) || resolvedPath === root
    );
    if (!isAllowed) {
      return reply.status(400).send({ error: "File path must be within /workspace or /root/airgen" });
    }

    // Read the file
    let fileData: Buffer;
    try {
      fileData = await fs.readFile(resolvedPath);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "ENOENT") {
        return reply.status(404).send({ error: `File not found: ${filePath}` });
      }
      if (code === "EACCES") {
        return reply.status(400).send({ error: `Permission denied: ${filePath}` });
      }
      throw err;
    }

    const originalFileName = basename(resolvedPath);
    const originalExtension = extname(originalFileName);
    const baseFileName = originalFileName.slice(0, originalFileName.length - originalExtension.length) || originalFileName;
    const documentName = (name ?? "").trim() || baseFileName || "Uploaded Document";

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

    await fs.writeFile(absolutePath, fileData);

    const storagePath = `surrogates/${documentSlug}/${storedFileName}`;

    // Infer MIME type from extension
    const mimeMap: Record<string, string> = {
      ".pdf": "application/pdf",
      ".doc": "application/msword",
      ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ".xls": "application/vnd.ms-excel",
      ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      ".ppt": "application/vnd.ms-powerpoint",
      ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
      ".gif": "image/gif", ".svg": "image/svg+xml",
      ".csv": "text/csv", ".txt": "text/plain",
      ".json": "application/json", ".xml": "application/xml",
      ".zip": "application/zip",
    };
    const mimeType = mimeMap[originalExtension.toLowerCase()] ?? "application/octet-stream";

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
      originalFileName,
      storedFileName,
      mimeType,
      fileSize: fileData.byteLength,
      storagePath,
      previewPath: previewPath ?? undefined,
      previewMimeType: previewMimeType ?? undefined,
      userId: req.currentUser!.sub
    });

    const responseDocument = {
      ...document,
      downloadUrl: buildDownloadUrl(tenant, projectKey, document.slug),
      previewDownloadUrl:
        document.previewPath && document.previewMimeType
          ? buildPreviewUrl(tenant, projectKey, document.slug)
          : null
    };

    return reply.status(201).send({ document: responseDocument });
  });

  // Upload surrogate from URL
  app.post("/documents/upload-from-url", {
    onRequest: [app.authenticate],
    schema: {
      tags: ["documents"],
      summary: "Create surrogate from URL",
      description: "Downloads a file from a URL and creates a surrogate document. Max 100MB.",
      body: {
        type: "object",
        required: ["tenant", "projectKey", "url"],
        properties: {
          tenant: { type: "string", minLength: 1 },
          projectKey: { type: "string", minLength: 1 },
          url: { type: "string", minLength: 1, description: "HTTP(S) URL to download file from" },
          fileName: { type: "string", description: "Override filename (defaults to URL filename)" },
          name: { type: "string", description: "Display name (defaults to filename)" },
          description: { type: "string" },
          parentFolder: { type: "string" }
        }
      },
      response: {
        201: {
          type: "object",
          properties: {
            document: { type: "object", additionalProperties: true }
          }
        },
        400: {
          type: "object",
          properties: { error: { type: "string" } }
        }
      }
    }
  }, async (req, reply) => {
    const bodySchema = z.object({
      tenant: z.string().min(1),
      projectKey: z.string().min(1),
      url: z.string().url(),
      fileName: z.string().optional(),
      name: z.string().optional(),
      description: z.string().optional(),
      parentFolder: z.string().optional()
    });

    let parsed;
    try {
      parsed = bodySchema.parse(req.body);
    } catch (err) {
      return reply.status(400).send({ error: "Invalid request body. 'url' must be a valid URL." });
    }
    const { tenant, projectKey, url, fileName, name, description, parentFolder } = parsed;

    requireTenantAccess(req.currentUser as AuthUser, tenant, reply);

    // Validate URL scheme
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      return reply.status(400).send({ error: "Invalid URL" });
    }
    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      return reply.status(400).send({ error: "Only http and https URLs are supported" });
    }

    // Download the file
    const MAX_SIZE = 100 * 1024 * 1024; // 100MB
    let res: Response;
    try {
      res = await globalThis.fetch(url, {
        headers: { "User-Agent": "AIRGen/1.0" },
        redirect: "follow",
      });
    } catch (err) {
      return reply.status(400).send({ error: `Failed to download: ${err instanceof Error ? err.message : String(err)}` });
    }

    if (!res.ok) {
      return reply.status(400).send({ error: `Download failed: HTTP ${res.status} from ${parsedUrl.hostname}` });
    }

    const contentLength = res.headers.get("content-length");
    if (contentLength && parseInt(contentLength, 10) > MAX_SIZE) {
      return reply.status(400).send({ error: `File too large (${(parseInt(contentLength, 10) / 1024 / 1024).toFixed(1)}MB). Max 100MB.` });
    }

    const arrayBuffer = await res.arrayBuffer();
    const fileData = Buffer.from(arrayBuffer);

    if (fileData.byteLength > MAX_SIZE) {
      return reply.status(400).send({ error: `File too large (${(fileData.byteLength / 1024 / 1024).toFixed(1)}MB). Max 100MB.` });
    }

    // Determine filename from URL path, Content-Disposition, or override
    let originalFileName = fileName?.trim() || "";
    if (!originalFileName) {
      const disposition = res.headers.get("content-disposition");
      if (disposition) {
        const match = disposition.match(/filename[*]?=["']?(?:UTF-8'')?([^"';\r\n]+)/i);
        if (match) originalFileName = decodeURIComponent(match[1].trim());
      }
    }
    if (!originalFileName) {
      const urlPath = parsedUrl.pathname.split("/").pop() || "";
      originalFileName = decodeURIComponent(urlPath) || "download";
    }
    // Ensure it has an extension — try Content-Type
    if (!extname(originalFileName)) {
      const ct = res.headers.get("content-type") || "";
      const extMap: Record<string, string> = {
        "application/pdf": ".pdf",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
        "application/vnd.openxmlformats-officedocument.presentationml.presentation": ".pptx",
        "application/msword": ".doc",
        "application/vnd.ms-excel": ".xls",
        "image/png": ".png",
        "image/jpeg": ".jpg",
        "text/plain": ".txt",
        "text/csv": ".csv",
        "application/json": ".json",
        "application/xml": ".xml",
        "application/zip": ".zip",
      };
      const ext = extMap[ct.split(";")[0].trim()];
      if (ext) originalFileName += ext;
    }

    originalFileName = basename(originalFileName);
    const originalExtension = extname(originalFileName);
    const baseFileName = originalFileName.slice(0, originalFileName.length - originalExtension.length) || originalFileName;
    const documentName = (name ?? "").trim() || baseFileName || "Downloaded Document";

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

    await fs.writeFile(absolutePath, fileData);
    const storagePath = `surrogates/${documentSlug}/${storedFileName}`;

    const mimeMap: Record<string, string> = {
      ".pdf": "application/pdf",
      ".doc": "application/msword",
      ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ".xls": "application/vnd.ms-excel",
      ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      ".ppt": "application/vnd.ms-powerpoint",
      ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
      ".gif": "image/gif", ".svg": "image/svg+xml",
      ".csv": "text/csv", ".txt": "text/plain",
      ".json": "application/json", ".xml": "application/xml",
      ".zip": "application/zip",
    };
    const mimeType = mimeMap[originalExtension.toLowerCase()] ?? res.headers.get("content-type")?.split(";")[0].trim() ?? "application/octet-stream";

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
      originalFileName,
      storedFileName,
      mimeType,
      fileSize: fileData.byteLength,
      storagePath,
      previewPath: previewPath ?? undefined,
      previewMimeType: previewMimeType ?? undefined,
      userId: req.currentUser!.sub
    });

    const responseDocument = {
      ...document,
      downloadUrl: buildDownloadUrl(tenant, projectKey, document.slug),
      previewDownloadUrl:
        document.previewPath && document.previewMimeType
          ? buildPreviewUrl(tenant, projectKey, document.slug)
          : null
    };

    return reply.status(201).send({ document: responseDocument });
  });

  // Create document
  app.post("/documents", {
    onRequest: [app.authenticate],
    preHandler: [verifyTenantAccessFromBodyHook],
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
            document: { type: "object", additionalProperties: true }
          }
        }
      }
    }
  }, async (req, reply) => {
    const payload = documentSchema.parse(req.body);

    const document = await createDocument({
      tenant: payload.tenant,
      projectKey: payload.projectKey,
      name: payload.name,
      description: payload.description,
      shortCode: payload.shortCode,
      parentFolder: payload.parentFolder,
      userId: req.currentUser!.sub
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

  // List documents
  app.get("/documents/:tenant/:project", {
    onRequest: [app.authenticate],
    preHandler: [verifyTenantAccessHook],
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
      }
    }
  }, async (req, reply) => {
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

  // Get single document
  app.get("/documents/:tenant/:project/:documentSlug", {
    onRequest: [app.authenticate],
    preHandler: [verifyTenantAccessHook]
  }, async (req, reply) => {
    const paramsSchema = z.object({
      tenant: z.string().min(1),
      project: z.string().min(1),
      documentSlug: z.string().min(1)
    });
    const params = paramsSchema.parse(req.params);

    const document = await getDocument(params.tenant, params.project, params.documentSlug);
    if (!document) {return reply.status(404).send({ error: "Document not found" });}
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

  // Download document file
  app.get("/documents/:tenant/:project/:documentSlug/file", {
    onRequest: [app.authenticate],
    preHandler: [verifyTenantAccessHook]
  }, async (req, reply) => {
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

  // Get document preview
  app.get("/documents/:tenant/:project/:documentSlug/preview", {
    onRequest: [app.authenticate],
    preHandler: [verifyTenantAccessHook]
  }, async (req, reply) => {
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

  // View document (preview or original)
  app.get("/documents/:tenant/:project/:documentSlug/view", {
    onRequest: [app.authenticate],
    preHandler: [verifyTenantAccessHook]
  }, async (req, reply) => {
    const paramsSchema = z.object({
      tenant: z.string().min(1),
      project: z.string().min(1),
      documentSlug: z.string().min(1)
    });
    const params = paramsSchema.parse(req.params);

    const document = await getDocument(params.tenant, params.project, params.documentSlug);
    if (!document || document.kind !== "surrogate") {
      return reply.status(404).send({ error: "Surrogate document not found" });
    }

    const tenantSlug = slugify(params.tenant);
    const projectSlug = slugify(params.project);
    const baseDirectory = resolve(config.workspaceRoot, tenantSlug, projectSlug);

    // Try preview first, then fall back to original file
    let absolutePath: string;
    let mimeType: string;

    if (document.previewPath) {
      absolutePath = resolve(baseDirectory, document.previewPath);
      mimeType = document.previewMimeType ?? "application/pdf";
    } else if (document.storagePath) {
      absolutePath = resolve(baseDirectory, document.storagePath);
      mimeType = document.mimeType ?? "application/octet-stream";
    } else {
      return reply.status(404).send({ error: "Document file not found" });
    }

    const normalizedBase = baseDirectory.endsWith(sep) ? baseDirectory : `${baseDirectory}${sep}`;
    if (absolutePath !== baseDirectory && !absolutePath.startsWith(normalizedBase)) {
      return reply.status(400).send({ error: "Invalid document path" });
    }

    try {
      await fs.access(absolutePath);
    } catch {
      return reply.status(404).send({ error: "Document file missing" });
    }

    const fileName = absolutePath.split(sep).pop() ?? `${params.documentSlug}`;
    const safeName = fileName.replace(/"/g, "'");

    reply.type(mimeType);
    reply.header(
      "Content-Disposition",
      `inline; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`
    );

    return reply.send(createReadStream(absolutePath));
  });

  // Update document
  app.patch("/documents/:tenant/:project/:documentSlug", {
    onRequest: [app.authenticate],
    preHandler: [verifyTenantAccessHook]
  }, async (req, reply) => {
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
      }, req.currentUser!.sub);
    }

    if (!document) {return reply.status(404).send({ error: "Document not found" });}

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

  // Delete document
  app.delete("/documents/:tenant/:project/:documentSlug", {
    onRequest: [app.authenticate],
    preHandler: [verifyTenantAccessHook],
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
            document: { type: "object", additionalProperties: true }
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

    const document = await softDeleteDocument(params.tenant, params.project, params.documentSlug, req.currentUser!.sub);
    if (!document) {return reply.status(404).send({ error: "Document not found" });}

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
}
