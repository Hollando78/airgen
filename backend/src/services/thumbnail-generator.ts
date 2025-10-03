import { promises as fs } from "node:fs";
import { join, dirname, extname } from "node:path";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import sharp from "sharp";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import { createCanvas, Image } from "canvas";
import { config } from "../config.js";
import { getArchitectureBlocks, getArchitectureConnectors } from "./graph/architecture/index.js";

const execAsync = promisify(exec);

// Set global Image for pdfjs-dist
(global as any).Image = Image;

// NodeCanvasFactory for pdfjs-dist to work with node-canvas
class NodeCanvasFactory {
  create(width: number, height: number) {
    const canvas = createCanvas(width, height);
    return {
      canvas,
      context: canvas.getContext('2d')
    };
  }

  reset(canvasAndContext: any, width: number, height: number) {
    canvasAndContext.canvas.width = width;
    canvasAndContext.canvas.height = height;
  }

  destroy(canvasAndContext: any) {
    canvasAndContext.canvas.width = 0;
    canvasAndContext.canvas.height = 0;
    canvasAndContext.canvas = null;
    canvasAndContext.context = null;
  }
}

// Image factory for pdfjs-dist
function NodeImage() {
  return new Image();
}

const THUMBNAIL_WIDTH = 400;
const THUMBNAIL_HEIGHT = 300;

/**
 * Ensure thumbnails directory exists
 */
async function ensureThumbnailsDir(tenant: string, project: string, subdir: string): Promise<string> {
  const thumbDir = join(config.workspaceRoot, tenant, project, "thumbnails", subdir);
  await fs.mkdir(thumbDir, { recursive: true });
  return thumbDir;
}

/**
 * Generate SVG from diagram data stored in Neo4j
 */
async function generateDiagramSVG(
  tenant: string,
  project: string,
  diagramId: string
): Promise<string> {
  // Get blocks and connectors from Neo4j
  const [blocks, connectors] = await Promise.all([
    getArchitectureBlocks({ tenant, projectKey: project, diagramId }),
    getArchitectureConnectors({ tenant, projectKey: project, diagramId })
  ]);

  // Calculate diagram bounds
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  for (const block of blocks) {
    minX = Math.min(minX, block.positionX);
    minY = Math.min(minY, block.positionY);
    maxX = Math.max(maxX, block.positionX + block.sizeWidth);
    maxY = Math.max(maxY, block.positionY + block.sizeHeight);
  }

  // If no blocks, use default canvas size
  if (blocks.length === 0) {
    minX = 0;
    minY = 0;
    maxX = 800;
    maxY = 600;
  }

  // Add padding
  const padding = 50;
  minX -= padding;
  minY -= padding;
  maxX += padding;
  maxY += padding;

  const width = Math.max(maxX - minX, 100);
  const height = Math.max(maxY - minY, 100);

  // Build SVG with defs for gradients and shadows
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${minX} ${minY} ${width} ${height}">`;

  // Add definitions for filters and gradients
  svg += `<defs>
    <filter id="shadow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur in="SourceAlpha" stdDeviation="3"/>
      <feOffset dx="2" dy="2" result="offsetblur"/>
      <feComponentTransfer>
        <feFuncA type="linear" slope="0.3"/>
      </feComponentTransfer>
      <feMerge>
        <feMergeNode/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
    <linearGradient id="bgGradient" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" style="stop-color:#f8fafc;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#e2e8f0;stop-opacity:1" />
    </linearGradient>
  </defs>`;

  // Add background with gradient
  svg += `<rect x="${minX}" y="${minY}" width="${width}" height="${height}" fill="url(#bgGradient)"/>`;

  // Render connectors (edges) first so they appear behind blocks
  for (const conn of connectors) {
    const sourceBlock = blocks.find(b => b.id === conn.source);
    const targetBlock = blocks.find(b => b.id === conn.target);

    if (sourceBlock && targetBlock) {
      const x1 = sourceBlock.positionX + sourceBlock.sizeWidth / 2;
      const y1 = sourceBlock.positionY + sourceBlock.sizeHeight / 2;
      const x2 = targetBlock.positionX + targetBlock.sizeWidth / 2;
      const y2 = targetBlock.positionY + targetBlock.sizeHeight / 2;

      const color = conn.color || "#666666";
      const strokeWidth = conn.strokeWidth || 2;
      const strokeDasharray = conn.linePattern === "dashed" ? "5,5" : undefined;

      svg += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${strokeWidth}" ${strokeDasharray ? `stroke-dasharray="${strokeDasharray}"` : ""}/>`;

      // Add arrow marker
      if (conn.markerEnd) {
        const arrowSize = 10;
        const angle = Math.atan2(y2 - y1, x2 - x1);
        const arrowX = x2 - arrowSize * Math.cos(angle);
        const arrowY = y2 - arrowSize * Math.sin(angle);
        svg += `<polygon points="${x2},${y2} ${arrowX - arrowSize/2 * Math.sin(angle)},${arrowY + arrowSize/2 * Math.cos(angle)} ${arrowX + arrowSize/2 * Math.sin(angle)},${arrowY - arrowSize/2 * Math.cos(angle)}" fill="${color}"/>`;
      }
    }
  }

  // Render blocks with enhanced styling
  for (const block of blocks) {
    const x = block.positionX;
    const y = block.positionY;
    const w = block.sizeWidth;
    const h = block.sizeHeight;
    const bg = block.backgroundColor || "#f3f4f6";
    const border = block.borderColor || "#9ca3af";
    const borderWidth = block.borderWidth || 2;
    const borderRadius = block.borderRadius || 8;
    const textColor = block.textColor || "#111827";
    const fontSize = Math.max(block.fontSize || 14, 12);

    // Create gradient for block if it's a solid color
    const blockId = block.id.replace(/[^a-zA-Z0-9]/g, '');
    const gradientId = `grad_${blockId}`;

    // Lighten the background color for gradient
    svg += `<defs>
      <linearGradient id="${gradientId}" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" style="stop-color:${bg};stop-opacity:1" />
        <stop offset="100%" style="stop-color:${bg};stop-opacity:0.85" />
      </linearGradient>
    </defs>`;

    // Draw block rectangle with shadow and gradient
    svg += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#${gradientId})" stroke="${border}" stroke-width="${borderWidth}" rx="${borderRadius}" filter="url(#shadow)"/>`;

    // Draw block name with better typography
    const textX = x + w / 2;
    const textY = y + h / 2;
    svg += `<text x="${textX}" y="${textY}" fill="${textColor}" font-size="${fontSize}" font-family="system-ui, -apple-system, sans-serif" font-weight="600" text-anchor="middle" dominant-baseline="middle">${escapeXml(block.name)}</text>`;

    // Draw stereotype if present
    if (block.stereotype) {
      svg += `<text x="${textX}" y="${y + 20}" fill="${textColor}" font-size="${fontSize - 2}" font-family="system-ui, -apple-system, sans-serif" text-anchor="middle" font-style="italic" opacity="0.7">«${escapeXml(block.stereotype)}»</text>`;
    }
  }

  svg += `</svg>`;
  return svg;
}

/**
 * Escape XML special characters
 */
function escapeXml(unsafe: string): string {
  return unsafe.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case "'": return '&apos;';
      case '"': return '&quot;';
      default: return c;
    }
  });
}

/**
 * Generate thumbnail for a diagram
 */
export async function generateDiagramThumbnail(
  tenant: string,
  project: string,
  diagramId: string
): Promise<string> {
  const thumbDir = await ensureThumbnailsDir(tenant, project, "diagrams");
  const outputPath = join(thumbDir, `${diagramId}.png`);

  // Check if thumbnail already exists
  try {
    await fs.access(outputPath);
    return outputPath;
  } catch {
    // Thumbnail doesn't exist, generate it
  }

  // Generate SVG from Neo4j data
  const svg = await generateDiagramSVG(tenant, project, diagramId);

  // Convert SVG to PNG thumbnail using Sharp
  await sharp(Buffer.from(svg))
    .resize(THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT, {
      fit: "inside",
      background: { r: 255, g: 255, b: 255, alpha: 1 }
    })
    .png()
    .toFile(outputPath);

  return outputPath;
}

/**
 * Convert Office file (pptx, docx, xlsx) to PDF using LibreOffice
 */
async function convertOfficeToPDF(inputPath: string, outputDir: string): Promise<string> {
  const { stdout, stderr } = await execAsync(
    `libreoffice --headless --convert-to pdf --outdir "${outputDir}" "${inputPath}"`
  );

  // Check if conversion was successful by looking for the PDF file
  const baseName = inputPath.split('/').pop()?.replace(/\.[^.]+$/, '');
  const pdfPath = join(outputDir, `${baseName}.pdf`);

  try {
    await fs.access(pdfPath);
    return pdfPath;
  } catch {
    throw new Error(`LibreOffice conversion failed: PDF not generated. stderr: ${stderr}`);
  }
}

/**
 * Generate thumbnail from PDF using pdfjs-dist
 */
async function generatePDFThumbnail(pdfPath: string, outputPath: string): Promise<void> {
  // Read PDF file
  const pdfData = await fs.readFile(pdfPath);

  // Load PDF document with NodeCanvasFactory
  const canvasFactory = new NodeCanvasFactory();
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(pdfData),
    useSystemFonts: true,
    verbosity: 0
  });
  const pdfDocument = await loadingTask.promise;

  // Get first page
  const page = await pdfDocument.getPage(1);

  // Calculate scale to fit thumbnail size
  const viewport = page.getViewport({ scale: 1.0 });
  const scale = Math.min(THUMBNAIL_WIDTH / viewport.width, THUMBNAIL_HEIGHT / viewport.height);
  const scaledViewport = page.getViewport({ scale });

  // Create canvas using factory
  const canvasAndContext = canvasFactory.create(scaledViewport.width, scaledViewport.height);

  // Render PDF page to canvas with Image constructor for embedded images
  await page.render({
    canvasContext: canvasAndContext.context as any,
    canvas: canvasAndContext.canvas as any,
    viewport: scaledViewport,
    background: 'white'
  }).promise;

  // Save canvas directly to file
  const pngBuffer = canvasAndContext.canvas.toBuffer('image/png');
  await fs.writeFile(outputPath, pngBuffer);

  // Clean up
  await pdfDocument.cleanup();
  await pdfDocument.destroy();
}

/**
 * Generate thumbnail from image file
 */
async function generateImageThumbnail(imagePath: string, outputPath: string): Promise<void> {
  await sharp(imagePath)
    .resize(THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT, {
      fit: "inside",
      background: { r: 255, g: 255, b: 255, alpha: 1 }
    })
    .png()
    .toFile(outputPath);
}

/**
 * Generate thumbnail for a surrogate file
 */
export async function generateSurrogateThumbnail(
  tenant: string,
  project: string,
  surrogateId: string,
  filePath: string
): Promise<string> {
  const thumbDir = await ensureThumbnailsDir(tenant, project, "surrogates");
  const outputPath = join(thumbDir, `${surrogateId}.png`);

  // Check if thumbnail already exists
  try {
    await fs.access(outputPath);
    return outputPath;
  } catch {
    // Thumbnail doesn't exist, generate it
  }

  const ext = extname(filePath).toLowerCase();

  // Handle different file types
  if (['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.tiff'].includes(ext)) {
    // Direct image file
    await generateImageThumbnail(filePath, outputPath);
  } else if (['.pptx', '.pptm', '.ppt', '.docx', '.doc', '.xlsx', '.xls'].includes(ext)) {
    // Office file - convert directly to PNG using LibreOffice
    const tempDir = join(thumbDir, '.temp');
    await fs.mkdir(tempDir, { recursive: true });

    try {
      const { stdout, stderr } = await execAsync(
        `libreoffice --headless --convert-to png --outdir "${tempDir}" "${filePath}"`
      );

      // Get the base name without extension
      const baseName = filePath.split('/').pop()?.replace(/\.[^.]+$/, '');
      const pngPath = join(tempDir, `${baseName}.png`);

      // Check if PNG was created
      try {
        await fs.access(pngPath);
        // Resize to thumbnail size using Sharp
        await generateImageThumbnail(pngPath, outputPath);
        // Clean up temp PNG
        await fs.unlink(pngPath).catch(() => {});
      } catch {
        throw new Error(`LibreOffice PNG conversion failed: PNG not generated`);
      }
    } finally {
      // Clean up temp directory
      await fs.rmdir(tempDir).catch(() => {});
    }
  } else if (ext === '.pdf') {
    // PDF file - still needs pdfjs
    await generatePDFThumbnail(filePath, outputPath);
  } else {
    throw new Error(`Unsupported file type for thumbnail generation: ${ext}`);
  }

  return outputPath;
}

/**
 * Get thumbnail path for a diagram (generate if doesn't exist)
 */
export async function getDiagramThumbnail(
  tenant: string,
  project: string,
  diagramId: string
): Promise<string> {
  return generateDiagramThumbnail(tenant, project, diagramId);
}

/**
 * Get thumbnail path for a surrogate (generate if doesn't exist)
 */
export async function getSurrogateThumbnail(
  tenant: string,
  project: string,
  surrogateId: string,
  filePath: string
): Promise<string> {
  return generateSurrogateThumbnail(tenant, project, surrogateId, filePath);
}

/**
 * Invalidate (delete) thumbnail to force regeneration
 */
export async function invalidateThumbnail(
  tenant: string,
  project: string,
  type: "diagram" | "surrogate",
  assetId: string
): Promise<void> {
  const thumbDir = join(config.workspaceRoot, tenant, project, "thumbnails", type === "diagram" ? "diagrams" : "surrogates");
  const thumbPath = join(thumbDir, `${assetId}.png`);

  try {
    await fs.unlink(thumbPath);
  } catch {
    // Thumbnail doesn't exist, nothing to invalidate
  }
}
