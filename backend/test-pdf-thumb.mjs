import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createCanvas, Image } from 'canvas';
import { readFile, writeFile } from 'fs/promises';

const THUMBNAIL_WIDTH = 400;
const THUMBNAIL_HEIGHT = 300;

class NodeCanvasFactory {
  create(width, height) {
    const canvas = createCanvas(width, height);
    return {
      canvas,
      context: canvas.getContext('2d')
    };
  }

  reset(canvasAndContext, width, height) {
    canvasAndContext.canvas.width = width;
    canvasAndContext.canvas.height = height;
  }

  destroy(canvasAndContext) {
    canvasAndContext.canvas.width = 0;
    canvasAndContext.canvas.height = 0;
    canvasAndContext.canvas = null;
    canvasAndContext.context = null;
  }
}

async function generatePDFThumbnail(pdfPath, outputPath) {
  const pdfData = await readFile(pdfPath);
  
  const canvasFactory = new NodeCanvasFactory();
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(pdfData),
    useSystemFonts: true,
    verbosity: 0
  });
  const pdfDocument = await loadingTask.promise;
  
  const page = await pdfDocument.getPage(1);
  
  const viewport = page.getViewport({ scale: 1.0 });
  const scale = Math.min(THUMBNAIL_WIDTH / viewport.width, THUMBNAIL_HEIGHT / viewport.height);
  const scaledViewport = page.getViewport({ scale });
  
  const canvasAndContext = canvasFactory.create(scaledViewport.width, scaledViewport.height);
  
  await page.render({
    canvasContext: canvasAndContext.context,
    viewport: scaledViewport,
    canvasFactory: canvasFactory
  }).promise;
  
  const pngBuffer = canvasAndContext.canvas.toBuffer('image/png');
  await writeFile(outputPath, pngBuffer);
  
  await pdfDocument.cleanup();
  await pdfDocument.destroy();
  
  console.log('Thumbnail generated:', outputPath);
}

generatePDFThumbnail('/tmp/test-conversion/hexes.pdf', '/tmp/hexes-thumb.png')
  .then(() => console.log('Success!'))
  .catch(err => console.error('Error:', err));
