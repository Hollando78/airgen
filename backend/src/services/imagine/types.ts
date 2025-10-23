/**
 * Imagine Visualization Service Types
 *
 * Simple, focused type definitions for quick visualization generation
 */

export interface ImagineRequest {
  tenantSlug: string;
  projectSlug: string;
  elementId: string;
  elementType: 'Block' | 'Interface';
  userId: string;
  requirementIds?: string[]; // Optional: filter to specific requirements
  customPrompt?: string; // Optional: additional user instructions
  referenceImages?: string[]; // Optional: URLs to reference images
}

export interface ImagineContext {
  element: {
    id: string;
    name: string;
    type: 'Block' | 'Interface';
    description?: string;
    kind?: string;
    ports?: Array<{
      name: string;
      direction: string;
      type?: string;
      protocol?: string;
    }>;
    connections?: Array<{
      name: string;
      kind: string;
      direction: 'incoming' | 'outgoing' | 'bidirectional';
    }>;
  };
  requirements: Array<{
    id: string;
    title: string;
    text: string;
    type?: string;
    priority?: string;
  }>;
  documents: Array<{
    title: string;
    content: string;
  }>;
}

export interface ImagineImage {
  id: string;
  elementId: string;
  elementName: string;
  elementType: 'Block' | 'Interface';
  tenantSlug: string;
  projectSlug: string;
  prompt: string; // Full generated prompt
  customPrompt?: string; // User's custom instructions (if provided)
  imageUrl: string;
  version: number; // Version number (1 for original, 2+ for iterations)
  parentVersionId?: string; // Reference to parent image if this is an iteration
  requirementIds?: string[]; // IDs of requirements used in generation
  metadata: {
    model: string;
    aspectRatio: string;
    generatedAt: string;
    estimatedCost: number; // in USD
  };
  createdBy: string;
  createdAt: string;
}

export interface ReImagineRequest {
  parentImageId: string;
  iterationInstructions: string; // User's specific iteration instructions
  userId: string;
}

export interface GeminiImageGenerationResult {
  imageData: Buffer; // Raw image bytes
  mimeType: string; // e.g., "image/png"
}
