/**
 * Imagine Service - Main Orchestrator
 */

import { config } from '../../config.js';
import { getSession } from '../graph/driver.js';
import { logger } from '../../lib/logger.js';
import { ContextBuilder } from './context-builder.js';
import { PromptGenerator } from './prompt-generator.js';
import { GeminiClient } from './gemini-client.js';
import { ImageStorage } from './image-storage.js';
import type { ImagineRequest, ImagineImage, ReImagineRequest } from './types.js';

export class ImagineService {
  private contextBuilder: ContextBuilder;
  private promptGenerator: PromptGenerator;
  private geminiClient: GeminiClient | null;
  private imageStorage: ImageStorage;

  constructor() {
    this.contextBuilder = new ContextBuilder();
    this.promptGenerator = new PromptGenerator();
    this.imageStorage = new ImageStorage();

    // Initialize Gemini client if API key is available
    if (config.imagine.geminiApiKey) {
      this.geminiClient = new GeminiClient(
        config.imagine.geminiApiKey,
        config.imagine.model,
        config.imagine.aspectRatio
      );
    } else {
      logger.warn('[Imagine] Gemini API key not configured - image generation will fail');
      this.geminiClient = null;
    }
  }

  async generateVisualization(request: ImagineRequest): Promise<ImagineImage> {
    if (!this.geminiClient) {
      throw new Error('[Imagine] Gemini API key not configured');
    }

    logger.info(`[Imagine] Starting visualization generation for ${request.elementType} ${request.elementId}`);

    // Step 1: Build context
    const context = await this.contextBuilder.buildContext(request);

    // Step 2: Generate prompt
    const prompt = this.promptGenerator.generatePrompt(context, request.customPrompt);
    logger.info(`[Imagine] Generated prompt (${prompt.length} chars)`);

    // Step 3: Generate image with Gemini
    const imageResult = await this.geminiClient.generateImage(prompt);

    // Step 4: Store image
    const imageId = `img-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const imageUrl = await this.imageStorage.saveImage(
      imageResult.imageData,
      imageId,
      imageResult.mimeType
    );

    // Step 5: Create result
    const imagine: ImagineImage = {
      id: imageId,
      elementId: request.elementId,
      elementName: context.element.name,
      elementType: request.elementType,
      tenantSlug: request.tenantSlug,
      projectSlug: request.projectSlug,
      prompt,
      customPrompt: request.customPrompt,
      imageUrl,
      version: 1,
      requirementIds: request.requirementIds,
      metadata: {
        model: config.imagine.model,
        aspectRatio: config.imagine.aspectRatio,
        generatedAt: new Date().toISOString(),
        estimatedCost: this.geminiClient.estimateCost(),
      },
      createdBy: request.userId,
      createdAt: new Date().toISOString(),
    };

    // Step 6: Persist to Neo4j
    await this.persistImageToDatabase(imagine);

    logger.info(`[Imagine] Visualization generated successfully: ${imageId}`);

    return imagine;
  }

  /**
   * Persist ImagineImage metadata to Neo4j
   */
  private async persistImageToDatabase(image: ImagineImage): Promise<void> {
    const session = getSession();
    try {
      await session.run(
        `
        MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project {slug: $projectSlug})
        MATCH (project)-[:HAS_ARCHITECTURE_${image.elementType === 'Block' ? 'BLOCK' : 'CONNECTOR'}]->(element {id: $elementId})

        CREATE (img:ImagineImage {
          id: $id,
          elementId: $elementId,
          elementName: $elementName,
          elementType: $elementType,
          tenantSlug: $tenantSlug,
          projectSlug: $projectSlug,
          prompt: $prompt,
          customPrompt: $customPrompt,
          imageUrl: $imageUrl,
          version: $version,
          parentVersionId: $parentVersionId,
          requirementIds: $requirementIds,
          model: $model,
          aspectRatio: $aspectRatio,
          generatedAt: $generatedAt,
          estimatedCost: $estimatedCost,
          createdBy: $createdBy,
          createdAt: $createdAt
        })

        CREATE (project)-[:HAS_IMAGINE_IMAGE]->(img)
        CREATE (element)-[:HAS_IMAGINE_IMAGE]->(img)

        WITH img
        WHERE $parentVersionId IS NOT NULL
        MATCH (parent:ImagineImage {id: $parentVersionId})
        CREATE (img)-[:VERSION_OF]->(parent)
        `,
        {
          id: image.id,
          elementId: image.elementId,
          elementName: image.elementName,
          elementType: image.elementType,
          tenantSlug: image.tenantSlug,
          projectSlug: image.projectSlug,
          prompt: image.prompt,
          customPrompt: image.customPrompt || null,
          imageUrl: image.imageUrl,
          version: image.version,
          parentVersionId: image.parentVersionId || null,
          requirementIds: image.requirementIds || null,
          model: image.metadata.model,
          aspectRatio: image.metadata.aspectRatio,
          generatedAt: image.metadata.generatedAt,
          estimatedCost: image.metadata.estimatedCost,
          createdBy: image.createdBy,
          createdAt: image.createdAt,
        }
      );
      logger.info(`[Imagine] Persisted image ${image.id} to database`);
    } finally {
      await session.close();
    }
  }

  /**
   * List all imagine images for a project
   */
  async listImages(tenantSlug: string, projectSlug: string): Promise<ImagineImage[]> {
    const session = getSession();
    try {
      const result = await session.run(
        `
        MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project {slug: $projectSlug})
        MATCH (project)-[:HAS_IMAGINE_IMAGE]->(img:ImagineImage)
        RETURN img
        ORDER BY img.createdAt DESC
        `,
        { tenantSlug, projectSlug }
      );

      return result.records.map((record) => {
        const img = record.get('img').properties;
        return this.nodeToImage(img);
      });
    } finally {
      await session.close();
    }
  }

  /**
   * Get image details with version history
   */
  async getImageDetails(tenantSlug: string, projectSlug: string, imageId: string): Promise<{ image: ImagineImage; versions: ImagineImage[] }> {
    const session = getSession();
    try {
      const result = await session.run(
        `
        MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project {slug: $projectSlug})
        MATCH (project)-[:HAS_IMAGINE_IMAGE]->(img:ImagineImage {id: $imageId})

        // Get all versions (parent chain and child versions)
        OPTIONAL MATCH (img)-[:VERSION_OF*]->(parent:ImagineImage)
        OPTIONAL MATCH (child:ImagineImage)-[:VERSION_OF*]->(img)

        WITH img, collect(DISTINCT parent) as parents, collect(DISTINCT child) as children

        RETURN img, parents, children
        `,
        { tenantSlug, projectSlug, imageId }
      );

      if (result.records.length === 0) {
        throw new Error(`[Imagine] Image not found: ${imageId}`);
      }

      const record = result.records[0];
      const img = record.get('img').properties;
      const parents = record.get('parents');
      const children = record.get('children');

      const image = this.nodeToImage(img);
      const versions = [
        ...parents.map((p: any) => this.nodeToImage(p.properties)),
        image,
        ...children.map((c: any) => this.nodeToImage(c.properties)),
      ].sort((a, b) => a.version - b.version);

      return { image, versions };
    } finally {
      await session.close();
    }
  }

  /**
   * Re-imagine an existing image with iteration instructions
   */
  async reImagine(request: ReImagineRequest): Promise<ImagineImage> {
    if (!this.geminiClient) {
      throw new Error('[Imagine] Gemini API key not configured');
    }

    logger.info(`[Imagine] Starting re-imagination for image ${request.parentImageId}`);

    const session = getSession();
    try {
      // Get parent image
      const result = await session.run(
        `
        MATCH (parent:ImagineImage {id: $parentImageId})
        RETURN parent
        `,
        { parentImageId: request.parentImageId }
      );

      if (result.records.length === 0) {
        throw new Error(`[Imagine] Parent image not found: ${request.parentImageId}`);
      }

      const parentNode = result.records[0].get('parent').properties;
      const parentImage = this.nodeToImage(parentNode);

      // Build new prompt with iteration instructions
      const iterationPrompt = this.promptGenerator.generateIterationPrompt(
        parentImage.prompt,
        request.iterationInstructions
      );
      logger.info(`[Imagine] Generated iteration prompt (${iterationPrompt.length} chars)`);

      // Generate new image
      const imageResult = await this.geminiClient.generateImage(iterationPrompt);

      // Store image
      const imageId = `img-${Date.now()}-${Math.random().toString(36).substring(7)}`;
      const imageUrl = await this.imageStorage.saveImage(
        imageResult.imageData,
        imageId,
        imageResult.mimeType
      );

      // Create new image record
      const newImage: ImagineImage = {
        id: imageId,
        elementId: parentImage.elementId,
        elementName: parentImage.elementName,
        elementType: parentImage.elementType,
        tenantSlug: parentImage.tenantSlug,
        projectSlug: parentImage.projectSlug,
        prompt: iterationPrompt,
        customPrompt: request.iterationInstructions,
        imageUrl,
        version: parentImage.version + 1,
        parentVersionId: parentImage.id,
        requirementIds: parentImage.requirementIds,
        metadata: {
          model: config.imagine.model,
          aspectRatio: config.imagine.aspectRatio,
          generatedAt: new Date().toISOString(),
          estimatedCost: this.geminiClient.estimateCost(),
        },
        createdBy: request.userId,
        createdAt: new Date().toISOString(),
      };

      // Persist to Neo4j
      await this.persistImageToDatabase(newImage);

      logger.info(`[Imagine] Re-imagination successful: ${imageId} (version ${newImage.version})`);

      return newImage;
    } finally {
      await session.close();
    }
  }

  /**
   * Convert Neo4j node properties to ImagineImage
   */
  private nodeToImage(node: any): ImagineImage {
    return {
      id: node.id,
      elementId: node.elementId,
      elementName: node.elementName,
      elementType: node.elementType,
      tenantSlug: node.tenantSlug,
      projectSlug: node.projectSlug,
      prompt: node.prompt,
      customPrompt: node.customPrompt || undefined,
      imageUrl: node.imageUrl,
      version: node.version,
      parentVersionId: node.parentVersionId || undefined,
      requirementIds: node.requirementIds || undefined,
      metadata: {
        model: node.model,
        aspectRatio: node.aspectRatio,
        generatedAt: node.generatedAt,
        estimatedCost: node.estimatedCost,
      },
      createdBy: node.createdBy,
      createdAt: node.createdAt,
    };
  }
}
