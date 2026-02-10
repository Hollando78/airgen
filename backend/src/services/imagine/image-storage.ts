/**
 * Image Storage Handler
 */

import { promises as fs } from 'fs';
import { join } from 'path';
import { config } from '../../config.js';
import { logger } from '../../lib/logger.js';

export class ImageStorage {
  private storageDir: string;

  constructor() {
    this.storageDir = join(config.workspaceRoot, 'imagine');
  }

  async ensureDirectory(): Promise<void> {
    try {
      await fs.mkdir(this.storageDir, { recursive: true });
    } catch (err: any) {
      if (err.code !== 'EEXIST') throw err;
    }
  }

  async saveImage(
    imageData: Buffer,
    imageId: string,
    mimeType: string
  ): Promise<string> {
    await this.ensureDirectory();

    const ext = mimeType.split('/')[1] || 'png';
    const filename = `${imageId}.${ext}`;
    const filepath = join(this.storageDir, filename);

    await fs.writeFile(filepath, imageData);

    logger.info(`[Imagine] Image saved: ${filepath} (${imageData.length} bytes)`);

    return `/imagine/${filename}`;
  }

  async getImage(imageId: string): Promise<Buffer | null> {
    const filepath = join(this.storageDir, `${imageId}.png`);

    try {
      return await fs.readFile(filepath);
    } catch (err: any) {
      if (err.code === 'ENOENT') return null;
      throw err;
    }
  }
}
