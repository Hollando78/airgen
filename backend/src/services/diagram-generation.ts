import { openai, model } from "../lib/openai.js";

export type DiagramGenerationRequest = {
  user_input: string; // stakeholder instruction for diagram
  glossary?: string; // optional glossary text
  constraints?: string; // optional constraints
  mode: "create" | "update" | "extend"; // diagram action mode
  existingDiagramContext?: string; // context from attached diagrams
  documentContext?: string; // context from attached documents
  diagramId?: string; // for updates/extensions
};

export type DiagramGenerationBlock = {
  id?: string;
  name: string;
  kind: "system" | "subsystem" | "component" | "actor" | "external" | "interface";
  stereotype?: string;
  description?: string;
  positionX: number;
  positionY: number;
  sizeWidth?: number;
  sizeHeight?: number;
  ports?: Array<{
    id: string;
    name: string;
    direction: "in" | "out" | "inout";
  }>;
  action?: "create" | "update" | "delete";
};

export type DiagramGenerationConnector = {
  id?: string;
  source: string;
  target: string;
  kind: "association" | "flow" | "dependency" | "composition";
  label?: string;
  sourcePortId?: string;
  targetPortId?: string;
  action?: "create" | "update" | "delete";
};

export type DiagramGenerationResponse = {
  action: "create" | "update" | "extend";
  diagramName?: string;
  diagramDescription?: string;
  diagramView?: "block" | "internal" | "deployment";
  blocks: DiagramGenerationBlock[];
  connectors: DiagramGenerationConnector[];
  reasoning: string;
};

export async function generateDiagram(req: DiagramGenerationRequest): Promise<DiagramGenerationResponse> {
  if (!openai) {
    throw new Error("OpenAI client not configured. Please set LLM_API_KEY environment variable.");
  }

  const sys = [
    "You are a systems architecture expert specializing in hierarchical SysML block diagrams.",
    "Generate architecture diagrams focusing on parent-child relationships and system decomposition.",
    "CRITICAL RULES for architecture diagrams:",
    "1. Use a strict hierarchy: System -> Subsystem -> Component",
    "2. Create composition connectors to show parent-child relationships (source=parent, target=child)",
    "3. Systems contain Subsystems, Subsystems contain Components",
    "4. Use composition connectors (kind='composition') for all parent-child relationships",
    "5. Avoid peer-to-peer connections in architecture views - focus on hierarchy",
    "6. Position blocks hierarchically: Systems at top, Subsystems in middle, Components at bottom",
    "Block types and stereotypes:",
    "- System: kind='system', stereotype='<<system>>' (top-level, contains subsystems)",
    "- Subsystem: kind='subsystem', stereotype='<<subsystem>>' (mid-level, contains components)",  
    "- Component: kind='component', stereotype='<<component>>' (leaf-level implementations)",
    "- Actor: kind='actor', stereotype='<<actor>>' (external entities, no children)",
    "Connector rules for architecture diagrams:",
    "- ALWAYS use composition (kind='composition') for parent-child relationships",
    "- Parent block is the source, child block is the target",
    "- Label connectors with relationship type if needed (e.g., 'contains', 'comprises')",
    "Layout guidelines:",
    "- Position parent blocks above their children",
    "- Group sibling blocks at the same level horizontally",
    "- Maintain consistent spacing: 200px horizontal, 250px vertical between levels",
    "When EXISTING_DIAGRAM_CONTEXT is provided, understand the current structure before making changes.",
    "When DOCUMENT_CONTEXT is provided, align the diagram with documented requirements and specifications.",
    "Return ONLY a JSON object with this exact structure:",
    JSON.stringify({
      action: "create|update|extend",
      diagramName: "string (for new diagrams)",
      diagramDescription: "string (optional)",
      diagramView: "block|internal|deployment",
      blocks: [
        {
          id: "string (only for updates)",
          name: "string",
          kind: "system|subsystem|component|actor|external|interface", 
          stereotype: "string (optional)",
          description: "string (optional)",
          positionX: "number",
          positionY: "number", 
          sizeWidth: "number (optional, default 150)",
          sizeHeight: "number (optional, default 100)",
          ports: [
            {
              id: "string",
              name: "string", 
              direction: "in|out|inout"
            }
          ],
          action: "create|update|delete (optional)"
        }
      ],
      connectors: [
        {
          id: "string (only for updates)",
          source: "string (block name)",
          target: "string (block name)",
          kind: "association|flow|dependency|composition",
          label: "string (optional)",
          sourcePortId: "string (optional)",
          targetPortId: "string (optional)",
          action: "create|update|delete (optional)"
        }
      ],
      reasoning: "string explaining the design decisions"
    }, null, 2),
    "No markdown fencing, no preface, no comments—just valid JSON."
  ].join("\n");

  const content = [
    `USER_INPUT: ${req.user_input}`,
    `MODE: ${req.mode}`,
    req.existingDiagramContext ? `EXISTING_DIAGRAM_CONTEXT:\n${req.existingDiagramContext}` : "",
    req.documentContext ? `DOCUMENT_CONTEXT:\n${req.documentContext}` : "",
    req.glossary ? `GLOSSARY:\n${req.glossary}` : "",
    req.constraints ? `CONSTRAINTS:\n${req.constraints}` : ""
  ]
    .filter(Boolean)
    .join("\n\n");

  const completion = await openai.chat.completions.create({
    model,
    messages: [
      { role: "system", content: sys },
      { role: "user", content }
    ],
    temperature: 0.3 // Slightly higher for creativity in design
  });

  const text = completion.choices[0]?.message?.content ?? "{}";

  let parsed: unknown = {};
  try {
    parsed = JSON.parse(text);
  } catch {
    // Try to salvage JSON if the model adds extra prose around it
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        parsed = JSON.parse(text.slice(start, end + 1));
      } catch {
        throw new Error("Failed to parse diagram generation response from model.");
      }
    } else {
      throw new Error("Failed to parse diagram generation response from model.");
    }
  }

  // Validate the response structure
  const response = parsed as DiagramGenerationResponse;
  if (!response.action || !Array.isArray(response.blocks) || !Array.isArray(response.connectors) || !response.reasoning) {
    throw new Error("Invalid diagram generation response structure.");
  }

  return response;
}