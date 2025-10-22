import type { SnapDraftContext } from './context-builder.js';

export interface VisualizationResult {
  type: 'dalle' | 'svg';
  data: Buffer | string; // Buffer for PNG, string for SVG
  prompt: string; // The prompt used to generate
  revisedPrompt?: string; // DALL-E revised prompt
}

const DALLE_PROMPT_SYSTEM = `You are a professional technical illustrator creating detailed image prompts for DALL-E 3.

Convert architecture element descriptions into clear, professional visualization prompts.

STYLE GUIDELINES:
- **Engineering**: Clean, technical, annotated diagrams with measurements visible, isometric or orthographic views
- **Architectural**: Professional architectural renderings, realistic materials, lighting, context
- **Schematic**: Clean vector-style diagrams, color-coded components, clear labeling

PROMPT STRUCTURE:
1. View type (isometric, front elevation, section, perspective)
2. Main subject description
3. Key features and components
4. Style and finish (professional, technical, photorealistic)
5. Context and environment if relevant
6. Lighting and ambiance
7. Annotations or labels if needed

AVOID:
- Text in images (DALL-E struggles with text)
- Overly complex scenes
- Multiple disconnected elements

OUTPUT:
Return ONLY the prompt text, no JSON, no explanations.`;

const SVG_GENERATION_SYSTEM = `You are an expert SVG code generator creating semi-technical diagrams.

Generate clean, valid SVG code for architecture element visualizations.

REQUIREMENTS:
- Valid SVG 1.1 syntax
- Use semantic colors (avoid random colors)
- Include clear labels and annotations
- Proper viewBox for scalability
- Clean, minimal styling
- Use standard shapes (rect, circle, path, text)

STRUCTURE:
- Main element representation (block/component)
- Connections or relationships
- Labels and annotations
- Legend if needed
- Title

COLOR PALETTE:
- Primary elements: #2563eb (blue)
- Secondary: #64748b (slate)
- Connections: #10b981 (green)
- Accents: #f59e0b (amber)
- Text: #1e293b (dark)
- Background: #ffffff or transparent

OUTPUT:
Return ONLY valid SVG code starting with <svg>, no markdown, no explanations.`;

export class VisualizationGenerator {
  /**
   * Generate DALL-E visualization
   */
  async generateDALLE(context: SnapDraftContext, openaiApiKey: string): Promise<VisualizationResult> {
    console.log('[VisualizationGenerator] Generating DALL-E image...');

    // 1. Build DALL-E prompt
    const promptDescription = this.buildPromptDescription(context);

    // 2. Use GPT-4o to refine the prompt for DALL-E
    const dallePrompt = await this.buildDALLEPrompt(promptDescription, context, openaiApiKey);

    console.log('[VisualizationGenerator] DALL-E prompt:', dallePrompt);

    // 3. Call DALL-E API
    const response = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openaiApiKey}`,
      },
      body: JSON.stringify({
        model: 'dall-e-3',
        prompt: dallePrompt,
        n: 1,
        size: '1024x1024',
        quality: 'standard',
        style: context.style === 'architectural' ? 'natural' : 'vivid',
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[VisualizationGenerator] DALL-E API error:', errorText);
      throw new Error(`DALL-E API error (${response.status}): ${errorText.substring(0, 200)}`);
    }

    const data = await response.json();
    const imageUrl = data.data[0].url;
    const revisedPrompt = data.data[0].revised_prompt;

    console.log('[VisualizationGenerator] DALL-E revised prompt:', revisedPrompt);

    // 4. Download the image
    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) {
      throw new Error(`Failed to download DALL-E image: ${imageResponse.status}`);
    }

    const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());

    return {
      type: 'dalle',
      data: imageBuffer,
      prompt: dallePrompt,
      revisedPrompt,
    };
  }

  /**
   * Generate SVG visualization
   */
  async generateSVG(context: SnapDraftContext, openaiApiKey: string): Promise<VisualizationResult> {
    console.log('[VisualizationGenerator] Generating SVG code...');

    const promptDescription = this.buildPromptDescription(context);
    const svgPrompt = this.buildSVGPrompt(promptDescription, context);

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openaiApiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: SVG_GENERATION_SYSTEM },
          { role: 'user', content: svgPrompt },
        ],
        temperature: 0.4,
        max_tokens: 4096,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[VisualizationGenerator] SVG generation API error:', errorText);
      throw new Error(`SVG generation error (${response.status}): ${errorText.substring(0, 200)}`);
    }

    const data = await response.json();
    let svgCode = data.choices[0].message.content;

    // Clean up SVG code (remove markdown if present)
    svgCode = svgCode.replace(/```svg\n?/g, '').replace(/```\n?/g, '').trim();

    // Validate SVG
    if (!svgCode.startsWith('<svg')) {
      throw new Error('Generated SVG code is invalid (does not start with <svg>)');
    }

    console.log('[VisualizationGenerator] Generated SVG code length:', svgCode.length);

    return {
      type: 'svg',
      data: svgCode,
      prompt: svgPrompt,
    };
  }

  /**
   * Build description of element from context
   */
  private buildPromptDescription(context: SnapDraftContext): string {
    const element = context.element;
    let description = `${element.type}: ${element.name}`;

    if (element.description) {
      description += `\n${element.description}`;
    }

    // Add key features from requirements (simplified)
    if (context.requirements.length > 0) {
      description += '\n\nKey Requirements:';
      const keyReqs = context.requirements.slice(0, 10); // First 10
      for (const req of keyReqs) {
        const reqText = req.text || req.title || '';
        // Simplify requirement text (remove technical jargon, focus on visual aspects)
        const simplified = reqText
          .replace(/SHALL/g, '')
          .replace(/\d+\s*(mm|in|inches|millimeters)/g, '') // Remove measurements
          .substring(0, 150);
        description += `\n- ${simplified}`;
      }
    }

    // Add document context (high-level only)
    if (context.documents.length > 0) {
      description += '\n\nContext:';
      for (const doc of context.documents) {
        const docPreview = doc.content.substring(0, 300);
        description += `\n${doc.title}: ${docPreview}...`;
      }
    }

    return description;
  }

  /**
   * Build DALL-E prompt using GPT-4o
   */
  private async buildDALLEPrompt(
    description: string,
    context: SnapDraftContext,
    openaiApiKey: string
  ): Promise<string> {
    const promptRequest = `Convert this technical description into a detailed DALL-E 3 image prompt:

${description}

**Style:** ${context.style}
**Element Type:** ${context.element.type}

Create a professional prompt for a ${context.style} visualization.`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openaiApiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: DALLE_PROMPT_SYSTEM },
          { role: 'user', content: promptRequest },
        ],
        temperature: 0.7,
        max_tokens: 500,
      }),
    });

    if (!response.ok) {
      // Fallback to basic prompt if refinement fails
      return `Professional ${context.style} visualization of ${context.element.name}: ${description.substring(0, 200)}`;
    }

    const data = await response.json();
    return data.choices[0].message.content;
  }

  /**
   * Build SVG generation prompt
   */
  private buildSVGPrompt(description: string, context: SnapDraftContext): string {
    return `Generate an SVG diagram for this architecture element:

${description}

**Element:** ${context.element.name}
**Type:** ${context.element.type}
**Style:** ${context.style}

Requirements:
- Use a 800x600 viewBox
- Include a title at the top
- Represent the main element as a rounded rectangle or appropriate shape
- Add labels for key features
- Use professional colors from the palette
- Include a simple legend if there are multiple component types
- Make it clear, clean, and semi-technical

Generate valid SVG code.`;
  }
}
