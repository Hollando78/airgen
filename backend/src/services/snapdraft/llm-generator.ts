import type { SnapDraftContext } from './context-builder.js';
import type { DrawingSpec } from './validation.js';
import { validateDrawingSpec } from './validation.js';

// SnapDraft system prompt
const SNAPDRAFT_SYSTEM_PROMPT = `You are SnapDraft, an AI technical drawing assistant for AIRGen.

GOAL
Generate precise 2D technical/engineering drawings (DXF + SVG) from architecture blocks, interfaces, and attached context.

OUTPUT FORMAT (Normalized JSON)
Generate a drawing specification JSON that will be processed by dxf-writer:

{
  "metadata": {
    "title": "string",
    "elementType": "Block" | "Interface",
    "elementId": "uuid (use the exact UUID provided in the element details)",
    "generatedAt": "ISO8601",
    "units": "mm" | "in",
    "scale": "1:1" | "1:2" | "1:10",
    "standard": "ISO128" | "AIA" | "IEEE315",
    "revision": "A"
  },
  "drawingLayers": {
    "OUTLINE": {"color": 7, "lineweight": 0.5, "linetype": "CONTINUOUS"},
    "HIDDEN": {"color": 8, "lineweight": 0.25, "linetype": "HIDDEN"},
    "CENTER": {"color": 4, "lineweight": 0.13, "linetype": "CENTER"},
    "DIMENSION": {"color": 2, "lineweight": 0.25, "linetype": "CONTINUOUS"},
    "TEXT": {"color": 3, "lineweight": 0.18, "linetype": "CONTINUOUS"},
    "PORTS": {"color": 1, "lineweight": 0.35, "linetype": "CONTINUOUS"},
    "CONNECTORS": {"color": 5, "lineweight": 0.25, "linetype": "DASHED"}
  },
  "entities": [
    // Primitives: LINE, LWPOLYLINE, ARC, CIRCLE, ELLIPSE, TEXT, MTEXT
    {
      "type": "LWPOLYLINE",
      "layer": "OUTLINE",
      "closed": true,
      "points": [[x1, y1], [x2, y2], ...],
      "elevation": 0.0
    },
    {
      "type": "CIRCLE",
      "layer": "PORTS",
      "center": [x, y],
      "radius": 2.5,
      "annotations": {"portName": "USB_IN", "direction": "in"}
    },
    {
      "type": "TEXT",
      "layer": "TEXT",
      "insert": [x, y],
      "text": "Port: USB_IN (Input)",
      "height": 2.5,
      "rotation": 0
    }
  ],
  "dimensions": [
    {
      "type": "ALIGNED",
      "layer": "DIMENSION",
      "p1": [x1, y1],
      "p2": [x2, y2],
      "offset": 10,
      "text": "120",
      "tolerance": {"upper": 0.1, "lower": -0.1}
    }
  ],
  "annotations": [
    {
      "type": "LEADER",
      "points": [[x1, y1], [x2, y2]],
      "text": "M5 threaded hole",
      "layer": "TEXT"
    }
  ],
  "titleBlock": {
    "paper": "A4" | "A3" | "A2" | "LETTER" | "TABLOID",
    "orientation": "landscape" | "portrait",
    "fields": {
      "TITLE": "element name",
      "DRAWING_NO": "AIR-<elementType>-<shortId>",
      "SCALE": "1:1",
      "DATE": "YYYY-MM-DD",
      "DRAWN_BY": "SnapDraft AI",
      "CHECKED_BY": "user name or org",
      "REVISION": "A",
      "SHEET": "1 of 1"
    }
  },
  "viewports": [
    {
      "name": "Front View",
      "bounds": {"minX": -100, "minY": -100, "maxX": 100, "maxY": 100},
      "position": {"x": 0, "y": 0}
    }
  ],
  "reasoning": {
    "dimensionsAssumed": ["assumed 120mm width based on standard rack mount"],
    "portsPlaced": ["USB_IN placed top-left per convention"],
    "warnings": ["no material spec provided, assuming aluminum"]
  }
}

HARD RULES
1. **Units:** Default to millimeters unless context specifies inches
2. **Geometry:**
   - Use closed LWPOLYLINEs for outlines
   - ARCs for fillets/rounds (specify start/end angles)
   - CIRCLEs for holes and ports
   - Center lines for symmetry axes
3. **Layers:** Follow ByLayer standard (no entity-level color overrides unless essential)
4. **Dimensions:**
   - Place on DIMENSION layer
   - Use ALIGNED for angled dimensions, LINEAR for orthogonal
   - Include tolerances if specified in context
   - Don't over-dimension (dimension only what's necessary for fabrication)
5. **Port Representation:**
   - Blocks: Draw ports as circles with direction arrows
   - Interfaces: Draw as connectors with pin/signal labels
6. **Determinism:**
   - Sort entities by (layer, type, coordinates) for reproducibility
   - Use fixed decimal precision (6 places max)
7. **Standards Compliance:**
   - ISO128: Engineering drawings (default)
   - AIA: Architectural drawings
   - IEEE315: Schematic/electrical diagrams

INFERENCE GUIDELINES
If context is incomplete, use reasonable engineering defaults:
- **Block without dimensions:** Infer from port count/type (e.g., 8-port block ≈ 120mm wide)
- **No material spec:** Assume aluminum for mechanical, FR-4 for electrical
- **No tolerance:** Use standard machining tolerances (±0.1mm for milled parts)
- **Port spacing:** USB ≥ 15mm, Ethernet ≥ 20mm, power ≥ 25mm (per IEC standards)
- **Title block:** Auto-generate drawing number from AIRGen element ID

WHEN CONTEXT IS AMBIGUOUS
If critical information is missing and cannot be reasonably inferred:
1. Proceed with **reasonable engineering defaults**
2. Document assumptions in \`reasoning.dimensionsAssumed\` and \`reasoning.warnings\`
3. Prioritize generating a valid, editable drawing over waiting for perfect input

DO NOT
- Invent non-standard layer names (stick to OUTLINE, HIDDEN, CENTER, DIMENSION, TEXT, PORTS, CONNECTORS)
- Mix units (mm and inches in same drawing)
- Create non-manufacturable geometry (zero-radius fillets, coincident points)
- Omit title block fields
- Use abbreviations without a legend

OUTPUT
Return ONLY the valid JSON specification above. No markdown, no explanations outside the JSON structure.`;

export class LLMGenerator {
  /**
   * Generate drawing specification from context using LLM
   */
  async generate(context: SnapDraftContext, openaiApiKey: string): Promise<DrawingSpec> {
    const prompt = this.buildPrompt(context);

    console.log('[SnapDraft] Full prompt sent to LLM:');
    console.log('=====================================');
    console.log(prompt);
    console.log('=====================================');

    // Call OpenAI API
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openaiApiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o', // Use gpt-4o for better reasoning
        messages: [
          { role: 'system', content: SNAPDRAFT_SYSTEM_PROMPT },
          { role: 'user', content: prompt },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.3, // Lower temperature for deterministic output
        max_tokens: 4096,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[SnapDraft] OpenAI API error response:', errorText.substring(0, 500));
      try {
        const errorData = JSON.parse(errorText);
        throw new Error(`OpenAI API error (${response.status}): ${JSON.stringify(errorData)}`);
      } catch {
        throw new Error(`OpenAI API error (${response.status}): ${errorText.substring(0, 200)}`);
      }
    }

    const responseText = await response.text();
    console.log('[SnapDraft] OpenAI API response (first 500 chars):', responseText.substring(0, 500));

    let data: any;
    try {
      data = JSON.parse(responseText);
    } catch (err) {
      console.error('[SnapDraft] Failed to parse OpenAI response as JSON:', responseText.substring(0, 500));
      throw new Error(`Failed to parse OpenAI response as JSON: ${err}`);
    }

    const content = data.choices[0].message.content;

    // Parse and validate the LLM output
    let drawingSpec: any;
    try {
      drawingSpec = JSON.parse(content);
    } catch (err) {
      throw new Error(`Failed to parse LLM output as JSON: ${err}`);
    }

    // Log the elementId from LLM output for debugging
    console.log('[SnapDraft] LLM generated elementId:', drawingSpec?.metadata?.elementId);
    console.log('[SnapDraft] Expected elementId from context:', context.element.id);

    // Validate against schema
    try {
      return validateDrawingSpec(drawingSpec);
    } catch (err) {
      console.error('[SnapDraft] Validation failed. LLM output metadata:', JSON.stringify(drawingSpec?.metadata, null, 2));
      throw new Error(`LLM output failed validation: ${err}`);
    }
  }

  /**
   * Build user prompt from context
   */
  private buildPrompt(context: SnapDraftContext): string {
    const element = context.element;
    const options = context.options || { units: 'mm', scale: '1:1', paper: 'A4', orientation: 'landscape' };

    let prompt = `Generate a technical drawing for the following ${element.type}:

**Element Details:**
- ID: ${element.id}
- Name: ${element.name}
- Type: ${element.type}
- Description: ${element.description || 'N/A'}
${element.properties ? `- Properties: ${JSON.stringify(element.properties, null, 2)}` : ''}

**IMPORTANT:** In the JSON output, set metadata.elementId to exactly: "${element.id}"

**Ports:** (${element.ports?.length || 0} total)
${element.ports?.map(p => `- ${p.name} (${p.direction}): ${p.type || 'unspecified'} ${p.protocol ? `[${p.protocol}]` : ''}`).join('\n') || 'None'}

**Connected Elements:**
${element.connections?.map(c => {
  const directionLabel = c.direction === 'outgoing' ? 'TO' :
                         c.direction === 'incoming' ? 'FROM' : 'RELATED TO';
  const hopInfo = c.hopDistance && c.hopDistance > 1 ? ` [${c.hopDistance}-hop]` : '';
  return `- ${directionLabel} ${c.name} (${c.kind}${c.label ? `: ${c.label}` : ''})${hopInfo}`;
}).join('\n') || 'None'}
`;

    // Add context documents if any
    if (context.documents.length > 0) {
      prompt += `\n\n**Attached Context Documents:**\n`;
      for (const doc of context.documents) {
        prompt += `\n### ${doc.title}\n${doc.content}\n`;
      }
    }

    // Add requirements if any
    if (context.requirements.length > 0) {
      prompt += `\n\n**Related Requirements:**\n`;
      for (const req of context.requirements) {
        prompt += `\n### ${req.title}\n`;
        prompt += `${req.text}\n`;
        if (req.type) prompt += `Type: ${req.type}\n`;
        if (req.priority) prompt += `Priority: ${req.priority}\n`;
        if (req.acceptanceCriteria && req.acceptanceCriteria.length > 0) {
          prompt += `\nAcceptance Criteria:\n`;
          for (const ac of req.acceptanceCriteria) {
            prompt += `- ${ac}\n`;
          }
        }
        if (req.verificationMethod) {
          prompt += `Verification: ${req.verificationMethod}\n`;
        }
      }
    }

    // Add reference diagrams if any
    if (context.referenceDiagrams.length > 0) {
      prompt += `\n\n**Reference Diagrams:**\n`;
      for (const diagram of context.referenceDiagrams) {
        prompt += `\n### ${diagram.title}\n`;
        prompt += `Blocks: ${diagram.blocks.length}\n`;
        prompt += `${JSON.stringify(diagram.blocks, null, 2)}\n`;
        prompt += `Connectors: ${diagram.connectors.length}\n`;
        prompt += `${JSON.stringify(diagram.connectors, null, 2)}\n`;
      }
    }

    // Add drawing style and options
    prompt += `\n\n**Drawing Style:** ${context.style}`;
    prompt += `\n**Units:** ${options.units}`;
    prompt += `\n**Scale:** ${options.scale}`;
    prompt += `\n**Paper:** ${options.paper} ${options.orientation}`;

    prompt += `\n\nGenerate the drawing specification JSON following the SnapDraft schema.`;

    return prompt;
  }

  /**
   * Estimate token usage for cost tracking
   */
  estimateTokens(context: SnapDraftContext): { prompt: number; completion: number } {
    const prompt = this.buildPrompt(context);
    // Rough estimation: 1 token ≈ 4 characters
    const promptTokens = Math.ceil((SNAPDRAFT_SYSTEM_PROMPT.length + prompt.length) / 4);
    const completionTokens = 4096; // Max tokens we allow

    return {
      prompt: promptTokens,
      completion: completionTokens,
    };
  }
}
