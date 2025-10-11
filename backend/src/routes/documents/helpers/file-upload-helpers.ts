import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import { extname, join } from "node:path";
import { promisify } from "node:util";

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

/**
 * Try to generate a PDF preview for convertible document types using LibreOffice
 */
export async function tryGeneratePreviewPdf(params: {
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
