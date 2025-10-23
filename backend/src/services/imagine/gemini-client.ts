/**
 * Gemini API Client for Image Generation
 *
 * Handles interaction with Google Gemini 2.5 Flash Image model via HTTP API
 */

import type { GeminiImageGenerationResult } from './types.js';

export class GeminiClient {
  private apiKey: string;
  private model: string;
  private aspectRatio: string;
  private baseUrl = 'https://generativelanguage.googleapis.com/v1beta';

  constructor(apiKey: string, model: string = 'gemini-2.5-flash-image', aspectRatio: string = '16:9') {
    if (!apiKey) {
      throw new Error('[Imagine] Gemini API key is required');
    }

    this.apiKey = apiKey;
    this.model = model;
    this.aspectRatio = aspectRatio;

    console.log(`[Imagine] Gemini client initialized with model: ${this.model}, aspect ratio: ${this.aspectRatio}`);
  }

  /**
   * Generate an image from a text prompt using Gemini 2.5 Flash Image
   */
  async generateImage(prompt: string): Promise<GeminiImageGenerationResult> {
    console.log('[Imagine] Starting image generation with Gemini...');
    console.log('[Imagine] Prompt length:', prompt.length, 'characters');

    try {
      const url = `${this.baseUrl}/models/${this.model}:generateContent?key=${this.apiKey}`;

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [{ text: prompt }]
            }
          ],
          // Note: generationConfig is not needed for image generation models
          // The model automatically returns images as inline data
        }),
      });

      // Check HTTP response status
      if (!response.ok) {
        const errorText = await response.text();
        console.error('[Imagine] Gemini API HTTP error:', response.status, errorText);
        throw new Error(`[Imagine] Gemini API returned ${response.status}: ${errorText}`);
      }

      // Parse JSON response
      const result = await response.json();

      // Extract image data from response
      // Gemini returns images as inline data in the response
      if (!result.candidates || result.candidates.length === 0) {
        throw new Error('[Imagine] No candidates returned from Gemini');
      }

      const candidate = result.candidates[0];
      if (!candidate.content || !candidate.content.parts || candidate.content.parts.length === 0) {
        throw new Error('[Imagine] No content parts in Gemini response');
      }

      // Find the first inline_data part (image)
      const imagePart = candidate.content.parts.find((part: any) => part.inlineData);
      if (!imagePart || !imagePart.inlineData) {
        throw new Error('[Imagine] No image data in Gemini response');
      }

      const { data, mimeType } = imagePart.inlineData;

      if (!data) {
        throw new Error('[Imagine] Empty image data from Gemini');
      }

      // Convert base64 to buffer
      const imageBuffer = Buffer.from(data, 'base64');

      console.log('[Imagine] Image generated successfully');
      console.log('[Imagine] Image size:', imageBuffer.length, 'bytes');
      console.log('[Imagine] MIME type:', mimeType);

      return {
        imageData: imageBuffer,
        mimeType: mimeType || 'image/png',
      };
    } catch (error: any) {
      console.error('[Imagine] Gemini API error:', error);

      // Provide more detailed error messages
      if (error.message?.includes('API key')) {
        throw new Error('[Imagine] Invalid or missing Gemini API key');
      } else if (error.message?.includes('quota')) {
        throw new Error('[Imagine] Gemini API quota exceeded');
      } else if (error.message?.includes('safety')) {
        throw new Error('[Imagine] Content blocked by Gemini safety filters');
      }

      throw new Error(`[Imagine] Failed to generate image: ${error.message || 'Unknown error'}`);
    }
  }

  /**
   * Estimate cost for image generation
   * Gemini 2.5 Flash Image: ~$0.039 per image (1290 output tokens)
   */
  estimateCost(): number {
    return 0.039; // USD per image
  }
}
