import {
  getArchitectureBlocks,
  getArchitectureConnectors,
  getArchitectureDiagrams
} from "./graph/architecture/index.js";

/**
 * Extracts content from a diagram attachment
 */
export async function extractDiagramContent(
  tenant: string,
  projectKey: string,
  attachment: { type: "diagram"; diagramId: string; includeGeometry?: boolean; includeConnections?: boolean }
): Promise<string> {
  try {
    // Get diagram metadata
    const diagrams = await getArchitectureDiagrams({
      tenant,
      projectKey
    });

    const diagram = diagrams.find(d => d.id === attachment.diagramId);
    if (!diagram) {
      throw new Error(`Diagram not found: ${attachment.diagramId}`);
    }

    // Get blocks and connectors
    const [blocks, connectors] = await Promise.all([
      getArchitectureBlocks({
        tenant,
        projectKey,
        diagramId: attachment.diagramId
      }),
      getArchitectureConnectors({
        tenant,
        projectKey,
        diagramId: attachment.diagramId
      })
    ]);

    let content = `=== DIAGRAM: ${diagram.name} ===\n`;
    if (diagram.description) {
      content += `Description: ${diagram.description}\n`;
    }
    content += `View: ${diagram.view}\n\n`;

    // Serialize blocks/components
    if (blocks.length > 0) {
      content += `COMPONENTS:\n`;
      for (const block of blocks) {
        content += `- [${block.kind}] ${block.name} (id: ${block.id})\n`;
        if (block.description) {
          content += `  Description: ${block.description}\n`;
        }
        if (block.stereotype) {
          content += `  Stereotype: ${block.stereotype}\n`;
        }
        if (block.ports && block.ports.length > 0) {
          const portList = block.ports.map(port => `${port.direction}[${port.name}]`).join(', ');
          content += `  Ports: ${portList}\n`;
        }
        if (attachment.includeGeometry) {
          content += `  Position: (${block.positionX}, ${block.positionY})\n`;
          content += `  Size: ${block.sizeWidth}x${block.sizeHeight}\n`;
        }
        content += `\n`;
      }
    }

    // Serialize connections
    if (attachment.includeConnections && connectors.length > 0) {
      content += `CONNECTIONS:\n`;
      for (const connector of connectors) {
        const sourceBlock = blocks.find(b => b.id === connector.source);
        const targetBlock = blocks.find(b => b.id === connector.target);

        if (sourceBlock && targetBlock) {
          content += `- ${sourceBlock.name} → ${targetBlock.name} (${connector.kind}`;
          if (connector.label) {
            content += `: ${connector.label}`;
          }
          content += `)\n`;

          if (connector.sourcePortId && connector.targetPortId) {
            const sourcePort = sourceBlock.ports?.find(p => p.id === connector.sourcePortId);
            const targetPort = targetBlock.ports?.find(p => p.id === connector.targetPortId);
            if (sourcePort && targetPort) {
              content += `  From: ${sourceBlock.name}.${sourcePort.name} → ${targetBlock.name}.${targetPort.name}\n`;
            }
          }
          content += `\n`;
        }
      }
    }

    return content + `\n`;

  } catch (error) {
    throw new Error(`Failed to extract diagram content: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
