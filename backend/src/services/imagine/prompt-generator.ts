/**
 * Imagine Prompt Generator
 *
 * Generates AIRGen signature-style prompts for visualization
 */

import type { ImagineContext } from './types.js';

export class PromptGenerator {
  /**
   * Generate a visualization prompt with AIRGen signature style
   */
  generatePrompt(context: ImagineContext, customPrompt?: string): string {
    const { element, requirements, documents } = context;

    // Build the main description
    let prompt = this.buildStyleGuidelines();

    prompt += '\n\n' + this.buildElementDescription(element);

    if (requirements.length > 0) {
      prompt += '\n\n' + this.buildRequirementsContext(requirements);
    }

    if (documents.length > 0) {
      prompt += '\n\n' + this.buildDocumentsContext(documents);
    }

    // Add custom user instructions if provided
    if (customPrompt && customPrompt.trim()) {
      prompt += `\n\nUSER INSTRUCTIONS:\n${customPrompt.trim()}`;
    }

    prompt += '\n\n' + this.buildVisualizationInstructions(element);

    return prompt;
  }

  /**
   * AIRGen signature style guidelines
   */
  private buildStyleGuidelines(): string {
    return `Generate a clean, professional technical illustration in the AIRGen signature style.

STYLE REQUIREMENTS:
- Clean, minimal design with subtle gradients (soft blues, grays, whites)
- Technical illustration aesthetic (not photorealistic)
- Modern software/systems engineering look
- Clear labels and annotations where appropriate
- Professional color palette with good contrast (WCAG 2.1 compliant)
- Suitable for presentations and technical documentation
- Isometric or 3D perspective when showing system architecture
- Use iconography for components (servers, databases, interfaces)
- Clean typography for labels (sans-serif, professional)

IMPORTANT:
- Focus on conceptual visualization, not photorealism
- Show system relationships and data flow
- Use visual hierarchy to emphasize important elements
- Include subtle shadows and depth for visual interest
- Maintain technical credibility while being visually appealing`;
  }

  /**
   * Build element description
   */
  private buildElementDescription(element: ImagineContext['element']): string {
    let description = `SUBJECT:\n`;
    description += `Generate a technical illustration showing: "${element.name}"`;

    if (element.description) {
      description += `\n\nDescription: ${element.description}`;
    }

    description += `\n\nType: ${element.type}`;

    if (element.kind) {
      description += `\nKind: ${element.kind}`;
    }

    // Add port information if available
    if (element.ports && element.ports.length > 0) {
      description += `\n\nInterfaces/Ports (${element.ports.length} total):`;
      const topPorts = element.ports.slice(0, 5); // Show top 5 ports
      for (const port of topPorts) {
        const protocol = port.protocol ? ` [${port.protocol}]` : '';
        const type = port.type ? ` (${port.type})` : '';
        description += `\n- ${port.name} (${port.direction})${protocol}${type}`;
      }
      if (element.ports.length > 5) {
        description += `\n... and ${element.ports.length - 5} more ports`;
      }
    }

    // Add connection information
    if (element.connections && element.connections.length > 0) {
      description += `\n\nConnected Systems (${element.connections.length} total):`;
      const topConnections = element.connections.slice(0, 5);
      for (const conn of topConnections) {
        const dirLabel = conn.direction === 'incoming' ? 'FROM' :
                         conn.direction === 'outgoing' ? 'TO' : 'WITH';
        description += `\n- ${dirLabel} ${conn.name} (${conn.kind})`;
      }
      if (element.connections.length > 5) {
        description += `\n... and ${element.connections.length - 5} more connections`;
      }
    }

    return description;
  }

  /**
   * Build requirements context
   */
  private buildRequirementsContext(requirements: ImagineContext['requirements']): string {
    let context = `REQUIREMENTS CONTEXT:\n`;
    context += `The visualization should reflect these key requirements:\n`;

    const topReqs = requirements.slice(0, 5); // Top 5 most relevant
    for (const req of topReqs) {
      const priority = req.priority ? ` [Priority: ${req.priority}]` : '';
      context += `\n- ${req.title}${priority}`;
      if (req.text) {
        // Truncate long requirement text
        const text = req.text.length > 200 ? req.text.substring(0, 200) + '...' : req.text;
        context += `\n  ${text}`;
      }
    }

    if (requirements.length > 5) {
      context += `\n\n(${requirements.length - 5} additional requirements also inform this visualization)`;
    }

    return context;
  }

  /**
   * Build documents context
   */
  private buildDocumentsContext(documents: ImagineContext['documents']): string {
    let context = `ADDITIONAL CONTEXT:\n`;

    for (const doc of documents) {
      context += `\n${doc.title}:\n`;
      // Truncate long document content
      const content = doc.content.length > 500 ? doc.content.substring(0, 500) + '...' : doc.content;
      context += `${content}\n`;
    }

    return context;
  }

  /**
   * Build visualization instructions
   */
  private buildVisualizationInstructions(element: ImagineContext['element']): string {
    const isBlock = element.type === 'Block';

    let instructions = `VISUALIZATION INSTRUCTIONS:\n`;

    if (isBlock) {
      instructions += `Show this block/component as the central element in the illustration.
- Visualize its internal structure or key subsystems
- Show data flow and interactions with connected systems
- Use boxes, containers, or isometric blocks to represent components
- Include interface points where connections occur
- Add subtle icons or symbols to represent functionality`;
    } else {
      instructions += `Show this interface as a connection/integration point.
- Visualize the communication channel or protocol
- Show systems on both ends of the interface
- Represent data exchange or message flow
- Use arrows, lines, or channels to show direction
- Include protocol or data format indicators`;
    }

    instructions += `\n\nOUTPUT:
Generate the visualization as a single comprehensive illustration.
Ensure all text is readable and professionally styled.
Use the AIRGen signature style throughout (clean, technical, professional).`;

    return instructions;
  }

  /**
   * Generate iteration prompt for re-imagining an existing image
   */
  generateIterationPrompt(originalPrompt: string, iterationInstructions: string): string {
    let prompt = `You are iterating on an existing visualization. Use the same AIRGen signature style and maintain visual consistency.

ORIGINAL PROMPT:
${originalPrompt}

ITERATION INSTRUCTIONS (PRIORITY):
${iterationInstructions}

IMPORTANT:
- Apply the iteration instructions as the PRIMARY modification
- Maintain the AIRGen signature style (clean, minimal, professional)
- Keep the same subject and core elements
- Only change what the iteration instructions specifically request
- Preserve the overall composition and technical illustration aesthetic
- If the instructions conflict with the original style, prioritize the instructions while maintaining professional quality

OUTPUT:
Generate the modified visualization incorporating the requested changes while maintaining consistency with the original AIRGen style.`;

    return prompt;
  }
}
