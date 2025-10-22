import type { SnapDraftContext } from './context-builder.js';

export interface ModeDecision {
  mode: 'technical_drawing' | 'visualization';
  visualizationType?: 'dalle' | 'svg';
  reasoning: string;
  suitabilityScore: number; // 0-10
  issues: string[]; // Specific problems that prevent technical drawing
}

const MODE_ANALYSIS_SYSTEM_PROMPT = `You are a technical drawing advisor analyzing if an architecture element has sufficient detail for a manufacturing-ready CAD/technical drawing.

INDUSTRY STANDARDS (ISO 128, ASME Y14.5, ASME Y14.100):
Manufacturing-ready technical drawings require:
1. COMPLETE GEOMETRY: All features fully dimensioned (not just 1-2 measurements)
2. TOLERANCES: All dimensions must have explicit tolerances OR reference a tolerance standard (per ASME Y14.5)
3. MATERIAL SPECIFICATIONS: Material type clearly specified
4. MANUFACTURING CLARITY: Sufficient detail to determine fabrication process
5. UNAMBIGUOUS: Only one possible interpretation

TECHNICAL DRAWING REQUIREMENTS (must have MOST of these):
- Multiple specific dimensions covering all major features (5+ measurements minimum)
- Explicit tolerances (e.g., "±0.5mm") OR reference to tolerance standards (e.g., "ISO 2768")
- Material specifications (e.g., "aluminum alloy", "steel grade")
- Complete geometric definition (overall dimensions, feature sizes, spatial relationships)
- Manufacturing/fabrication details (surface finish, heat treatment, etc.)
- Port definitions with precise types/protocols/dimensions

VISUALIZATION IS BETTER FOR:
- Few dimensions (1-4 measurements only, like clearances or constraints)
- No tolerances specified
- No material specifications
- High-level functional requirements
- Conceptual descriptions
- Ambiguous geometry
- Marketing/presentation focus

STRICT SCORING GUIDE (0-10) - Based on ISO/ASME Standards:
- 9-10: Manufacturing-ready (complete dimensions + tolerances + materials + full geometry definition)
- 7-8: Good technical detail (most dimensions + some tolerances/materials + clear geometry, but missing some elements)
- 5-6: Partial dimensions (some measurements but missing tolerances, materials, OR incomplete geometry)
- 3-4: Minimal technical detail (few dimensions, mostly functional requirements, no tolerances/materials)
- 0-2: Pure conceptual (no manufacturing details, functional descriptions only)

MODE DECISION LOGIC:
- Score 9-10: "technical_drawing" (manufacturing-ready per industry standards)
- Score 7-8: "technical_drawing" (adequate detail for CAD generation)
- Score 5-6: "visualization" (insufficient for manufacturing - missing critical elements per ISO/ASME)
- Score 0-4: "visualization" (conceptual only)

CRITICAL CHECKS (answer each):
1. Are there 5+ specific dimensions covering major features?
2. Are tolerances specified (explicit or standard reference)?
3. Is material specified?
4. Is geometry completely defined (overall size + feature locations)?
5. Can a manufacturer build this without assumptions?

If 3+ checks fail → Score ≤6 → visualization mode

VISUALIZATION TYPE DECISION (if visualization chosen):
- "dalle": For photorealistic, architectural, or physical appearance visualizations
- "svg": For semi-technical diagrams, flowcharts, block diagrams, system relationships

OUTPUT FORMAT:
{
  "mode": "technical_drawing" | "visualization",
  "visualizationType": "dalle" | "svg" | null,
  "suitabilityScore": 0-10,
  "reasoning": "brief explanation citing which standards criteria are met/missing",
  "issues": ["list of specific missing elements (dimensions, tolerances, materials, geometry)"]
}`;

export class ModeAnalyzer {
  /**
   * Analyze context and decide on generation mode
   */
  async analyze(context: SnapDraftContext, openaiApiKey: string): Promise<ModeDecision> {
    const analysisPrompt = this.buildAnalysisPrompt(context);

    console.log('[ModeAnalyzer] Analyzing context for mode decision...');

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openaiApiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini', // Use mini for quick analysis
        messages: [
          { role: 'system', content: MODE_ANALYSIS_SYSTEM_PROMPT },
          { role: 'user', content: analysisPrompt },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.2, // Low temperature for consistent decisions
        max_tokens: 500,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[ModeAnalyzer] OpenAI API error:', errorText.substring(0, 500));
      // Fallback to technical drawing on error
      return {
        mode: 'technical_drawing',
        suitabilityScore: 5,
        reasoning: 'Mode analysis failed, defaulting to technical drawing',
        issues: ['mode-analysis-error'],
      };
    }

    const data = await response.json();
    const content = data.choices[0].message.content;
    const decision: ModeDecision = JSON.parse(content);

    console.log('[ModeAnalyzer] Decision:', {
      mode: decision.mode,
      visualizationType: decision.visualizationType,
      score: decision.suitabilityScore,
      reasoning: decision.reasoning,
    });

    return decision;
  }

  /**
   * Build analysis prompt from context
   */
  private buildAnalysisPrompt(context: SnapDraftContext): string {
    const element = context.element;

    let prompt = `Analyze this ${element.type} for technical drawing suitability:

**Element:** ${element.name}
${element.description ? `**Description:** ${element.description}` : ''}
${element.properties ? `**Properties:** ${JSON.stringify(element.properties)}` : ''}

**Ports:** ${element.ports?.length || 0} defined
${element.ports?.map(p => `- ${p.name} (${p.direction}): ${p.type || 'unspecified'}`).join('\n') || 'None'}

**Connections:** ${element.connections?.length || 0}
`;

    // Add document content analysis
    if (context.documents.length > 0) {
      prompt += `\n**Context Documents:** ${context.documents.length} document(s)\n`;
      for (const doc of context.documents) {
        const contentPreview = doc.content.substring(0, 1000); // First 1000 chars
        prompt += `\n**${doc.title}**:\n${contentPreview}${doc.content.length > 1000 ? '...' : ''}\n`;
      }
    }

    // Add requirements analysis
    if (context.requirements.length > 0) {
      prompt += `\n**Requirements:** ${context.requirements.length} requirement(s)\n`;
      const sampleReqs = context.requirements.slice(0, 5); // First 5 requirements
      for (const req of sampleReqs) {
        prompt += `- ${req.title || req.id}: ${req.text?.substring(0, 200)}${(req.text?.length || 0) > 200 ? '...' : ''}\n`;
      }
      if (context.requirements.length > 5) {
        prompt += `... and ${context.requirements.length - 5} more requirements\n`;
      }
    }

    // Add diagram context
    if (context.referenceDiagrams.length > 0) {
      prompt += `\n**Reference Diagrams:** ${context.referenceDiagrams.length} diagram(s) with ${context.referenceDiagrams.reduce((sum, d) => sum + d.blocks.length, 0)} total blocks\n`;
    }

    prompt += `\n**Drawing Style Requested:** ${context.style}`;

    prompt += `\n\nAnalyze this context and decide:
1. Is there enough technical detail for a precise CAD/technical drawing?
2. Look for: dimensions, measurements, materials, tolerances, geometric specifications
3. Assign a suitability score (0-10)
4. Choose mode: "technical_drawing" or "visualization"
5. If visualization, choose type: "dalle" (photorealistic) or "svg" (diagrammatic)

Return your analysis as JSON.`;

    return prompt;
  }
}
