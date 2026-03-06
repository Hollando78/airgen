import { writeFileSync } from "node:fs";
import { Command } from "commander";
import type { AirgenClient } from "../client.js";
import { output, printTable, isJsonMode } from "../output.js";

interface Diagram {
  id: string;
  name?: string;
  view?: string;
  description?: string;
  blockCount?: number;
  connectorCount?: number;
}

interface Block {
  id: string;
  name: string;
  kind?: string;
  stereotype?: string | null;
  description?: string | null;
  ports?: Array<{ id: string; name: string; direction: string }>;
}

interface Connector {
  id: string;
  source: string;
  target: string;
  kind?: string;
  label?: string | null;
  sourcePortId?: string | null;
  targetPortId?: string | null;
}

// ── Mermaid rendering helpers ─────────────────────────────────

function sanitizeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function mermaidNodeShape(block: Block): string {
  const id = sanitizeId(block.id);
  const label = block.name.replace(/"/g, "'");
  const stereo = block.stereotype?.replace(/[«»<>]/g, "") ?? block.kind ?? "block";
  const display = `"«${stereo}»\\n${label}"`;

  switch (block.kind) {
    case "system":     return `${id}[${display}]`;
    case "subsystem":  return `${id}[${display}]`;
    case "actor":      return `${id}([${display}])`;
    case "external":   return `${id}>${display}]`;
    case "interface":  return `${id}{{${display}}}`;
    default:           return `${id}[${display}]`; // component
  }
}

function mermaidArrow(kind?: string): string {
  switch (kind) {
    case "flow":        return "==>";
    case "dependency":  return "-.->";
    case "composition": return "--*";
    default:            return "-->";  // association
  }
}

function mermaidStyle(block: Block): string | null {
  const id = sanitizeId(block.id);
  switch (block.kind) {
    case "system":    return `style ${id} fill:#ebf8ff,stroke:#1a365d,color:#1a365d`;
    case "subsystem": return `style ${id} fill:#f0f5ff,stroke:#2c5282,color:#2c5282`;
    case "actor":     return `style ${id} fill:#f0fff4,stroke:#276749,color:#276749`;
    case "external":  return `style ${id} fill:#fffbeb,stroke:#92400e,color:#92400e`;
    case "interface": return `style ${id} fill:#faf5ff,stroke:#6b21a8,color:#6b21a8`;
    default:          return null;
  }
}

// ── Terminal (layered) rendering ─────────────────────────────

const KIND_ICONS: Record<string, string> = {
  system: "■", subsystem: "□", component: "◦",
  actor: "☺", external: "◇", interface: "◈",
};

function kindArrow(kind?: string): string {
  switch (kind) {
    case "flow":        return "══▶";
    case "dependency":  return "--▷";
    case "composition": return "◆──";
    default:            return "──▶";
  }
}

function renderTerminal(blocks: Block[], connectors: Connector[]): string {
  const blockMap = new Map(blocks.map(b => [b.id, b]));

  // Build adjacency
  const outEdges = new Map<string, Array<{ target: string; label: string; kind?: string }>>();
  const inEdges = new Map<string, Array<{ source: string; label: string; kind?: string }>>();
  const inDegree = new Map<string, number>();
  for (const b of blocks) inDegree.set(b.id, 0);
  for (const c of connectors) {
    const out = outEdges.get(c.source) ?? [];
    out.push({ target: c.target, label: c.label ?? "", kind: c.kind });
    outEdges.set(c.source, out);
    const inn = inEdges.get(c.target) ?? [];
    inn.push({ source: c.source, label: c.label ?? "", kind: c.kind });
    inEdges.set(c.target, inn);
    inDegree.set(c.target, (inDegree.get(c.target) ?? 0) + 1);
  }

  // BFS layering (Kahn's algorithm, cycles go to last layer)
  const layer = new Map<string, number>();
  const queue: string[] = [];
  for (const b of blocks) {
    if ((inDegree.get(b.id) ?? 0) === 0) {
      queue.push(b.id);
      layer.set(b.id, 0);
    }
  }
  let maxLayer = 0;
  while (queue.length > 0) {
    const id = queue.shift()!;
    const curLayer = layer.get(id)!;
    for (const e of outEdges.get(id) ?? []) {
      if (layer.has(e.target)) continue;
      const newDeg = (inDegree.get(e.target) ?? 1) - 1;
      inDegree.set(e.target, newDeg);
      if (newDeg <= 0) {
        const nextLayer = curLayer + 1;
        layer.set(e.target, nextLayer);
        maxLayer = Math.max(maxLayer, nextLayer);
        queue.push(e.target);
      }
    }
  }
  // Assign remaining (cycle members) to maxLayer + 1
  for (const b of blocks) {
    if (!layer.has(b.id)) {
      layer.set(b.id, maxLayer + 1);
      maxLayer = maxLayer + 1;
    }
  }

  // Group blocks by layer
  const layers: Block[][] = [];
  for (let i = 0; i <= maxLayer; i++) layers.push([]);
  for (const b of blocks) {
    layers[layer.get(b.id)!].push(b);
  }

  // Compute column widths for the block name column
  const nameColWidth = Math.max(...blocks.map(b => b.name.length + 4), 20);
  const icon = (b: Block) => KIND_ICONS[b.kind ?? ""] ?? "□";

  const lines: string[] = [];
  const PAD = "  ";

  for (let li = 0; li < layers.length; li++) {
    const layerBlocks = layers[li];
    if (layerBlocks.length === 0) continue;

    // Layer header
    const layerLabel = li === 0 ? "Sources" : li === layers.length - 1 ? "Outputs" : `Layer ${li}`;
    lines.push(`${PAD}┄┄ ${layerLabel} ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄`);
    lines.push("");

    for (const b of layerBlocks) {
      const blockIcon = icon(b);
      const stereo = b.stereotype?.replace(/[«»<>]/g, "") ?? b.kind ?? "block";
      const nameStr = `${blockIcon} ${b.name}`;
      const paddedName = nameStr + " ".repeat(Math.max(0, nameColWidth - nameStr.length));

      // Incoming connections for this block
      const incoming = inEdges.get(b.id) ?? [];
      // Outgoing connections
      const outgoing = outEdges.get(b.id) ?? [];

      // Build the box line
      const boxTop = `${PAD}  ┌${"─".repeat(nameColWidth + 2)}┐`;
      const boxSte = `${PAD}  │ «${stereo}»${" ".repeat(Math.max(0, nameColWidth - stereo.length - 2))} │`;
      const boxNam = `${PAD}  │ ${paddedName} │`;
      const boxBot = `${PAD}  └${"─".repeat(nameColWidth + 2)}┘`;

      lines.push(boxTop);
      lines.push(boxSte);
      lines.push(boxNam);
      lines.push(boxBot);

      // Show incoming connections (who feeds this block)
      if (incoming.length > 0) {
        for (const e of incoming) {
          const srcBlock = blockMap.get(e.source);
          const srcName = srcBlock?.name ?? "?";
          const arrow = kindArrow(e.kind);
          const label = e.label ? ` (${e.label})` : "";
          lines.push(`${PAD}    ◀── ${srcName}${label}`);
        }
      }

      // Show outgoing connections (where this block sends data)
      if (outgoing.length > 0) {
        for (const e of outgoing) {
          const tgtBlock = blockMap.get(e.target);
          const tgtName = tgtBlock?.name ?? "?";
          const arrow = kindArrow(e.kind);
          const label = e.label ? ` ${e.label} ` : " ";
          lines.push(`${PAD}    ${arrow}${label}──▶ ${tgtName}`);
        }
      }

      lines.push("");
    }

    // Visual separator between layers
    if (li < layers.length - 1) {
      lines.push(`${PAD}        │`);
      lines.push(`${PAD}        ▼`);
      lines.push("");
    }
  }

  // Legend
  lines.push(`${PAD}┄┄ Legend ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄`);
  lines.push(`${PAD}  ☺ actor   ■ system   □ subsystem   ◦ component   ◇ external   ◈ interface`);
  lines.push(`${PAD}  ──▶ association   ══▶ flow   ◆── composition   --▷ dependency`);

  return lines.join("\n");
}

function renderMermaid(blocks: Block[], connectors: Connector[], direction: string): string {
  const lines: string[] = [`flowchart ${direction}`];

  // Nodes
  for (const b of blocks) {
    lines.push(`  ${mermaidNodeShape(b)}`);
  }

  // Edges
  for (const c of connectors) {
    const src = sanitizeId(c.source);
    const tgt = sanitizeId(c.target);
    const arrow = mermaidArrow(c.kind);
    if (c.label) {
      lines.push(`  ${src} ${arrow}|"${c.label.replace(/"/g, "'")}"| ${tgt}`);
    } else {
      lines.push(`  ${src} ${arrow} ${tgt}`);
    }
  }

  // Styles
  const styles = blocks.map(mermaidStyle).filter(Boolean);
  if (styles.length > 0) {
    lines.push("");
    for (const s of styles) lines.push(`  ${s}`);
  }

  return lines.join("\n");
}

export function registerDiagramCommands(program: Command, client: AirgenClient) {
  const cmd = program.command("diagrams").alias("diag").description("Architecture diagrams");

  cmd
    .command("list")
    .description("List all diagrams in a project")
    .argument("<tenant>", "Tenant slug")
    .argument("<project>", "Project slug")
    .action(async (tenant: string, project: string) => {
      const data = await client.get<{ diagrams: Diagram[] }>(
        `/architecture/diagrams/${tenant}/${project}`,
      );
      const diagrams = data.diagrams ?? [];
      if (isJsonMode()) {
        output(diagrams);
      } else {
        printTable(
          ["ID", "Name", "View", "Blocks", "Connectors"],
          diagrams.map(d => [
            d.id,
            d.name ?? "",
            d.view ?? "",
            String(d.blockCount ?? 0),
            String(d.connectorCount ?? 0),
          ]),
        );
      }
    });

  cmd
    .command("get")
    .description("Get full detail of a diagram (blocks + connectors)")
    .argument("<tenant>", "Tenant slug")
    .argument("<project>", "Project slug")
    .argument("<id>", "Diagram ID")
    .action(async (tenant: string, project: string, id: string) => {
      const [blocks, connectors] = await Promise.all([
        client.get(`/architecture/blocks/${tenant}/${project}/${id}`),
        client.get(`/architecture/connectors/${tenant}/${project}/${id}`),
      ]);
      output({ blocks, connectors });
    });

  cmd
    .command("render")
    .description("Render a diagram in the terminal or as Mermaid syntax")
    .argument("<tenant>", "Tenant slug")
    .argument("<project>", "Project slug")
    .argument("<id>", "Diagram ID")
    .option("--format <fmt>", "Output format: text, mermaid", "text")
    .option("--direction <dir>", "Layout direction for mermaid: TB, LR, BT, RL", "TB")
    .option("-o, --output <file>", "Write to file instead of stdout")
    .option("--wrap", "Wrap mermaid in markdown fenced code block")
    .action(async (tenant: string, project: string, id: string, opts: {
      format: string; direction: string; output?: string; wrap?: boolean;
    }) => {
      // Fetch diagram metadata + blocks + connectors in parallel
      const [diagramData, blocksData, connectorsData] = await Promise.all([
        client.get<{ diagrams: Diagram[] }>(`/architecture/diagrams/${tenant}/${project}`),
        client.get<{ blocks: Block[] }>(`/architecture/blocks/${tenant}/${project}/${id}`),
        client.get<{ connectors: Connector[] }>(`/architecture/connectors/${tenant}/${project}/${id}`),
      ]);

      const diagram = (diagramData.diagrams ?? []).find(d => d.id === id);
      const blocks = blocksData.blocks ?? [];
      const connectors = connectorsData.connectors ?? [];

      if (blocks.length === 0) {
        console.log("Empty diagram — no blocks to render.");
        return;
      }

      let rendered: string;

      if (opts.format === "mermaid") {
        rendered = renderMermaid(blocks, connectors, opts.direction);
        if (isJsonMode()) {
          output({ mermaid: rendered, blocks: blocks.length, connectors: connectors.length });
          return;
        }
        if (opts.wrap) rendered = "```mermaid\n" + rendered + "\n```";
      } else {
        // Terminal text format
        const header = diagram?.name ?? id;
        const headerLine = `  ${header}`;
        const underline = `  ${"═".repeat(header.length)}`;
        const stats = `  ${blocks.length} blocks, ${connectors.length} connectors`;
        rendered = [headerLine, underline, stats, "", renderTerminal(blocks, connectors)].join("\n");

        if (isJsonMode()) {
          output({ text: rendered, blocks: blocks.length, connectors: connectors.length });
          return;
        }
      }

      if (opts.output) {
        writeFileSync(opts.output, rendered + "\n", "utf-8");
        console.log(`Diagram written to ${opts.output}`);
      } else {
        console.log(rendered);
      }
    });

  cmd
    .command("create")
    .description("Create a new diagram")
    .argument("<tenant>", "Tenant slug")
    .argument("<project-key>", "Project key")
    .requiredOption("--name <name>", "Diagram name")
    .option("--view <view>", "View type: block, internal, deployment, requirements_schema")
    .option("--description <desc>", "Description")
    .action(async (tenant: string, projectKey: string, opts: { name: string; view?: string; description?: string }) => {
      const data = await client.post("/architecture/diagrams", {
        tenant,
        projectKey,
        name: opts.name,
        view: opts.view,
        description: opts.description,
      });
      if (isJsonMode()) {
        output(data);
      } else {
        console.log("Diagram created.");
        output(data);
      }
    });

  cmd
    .command("update")
    .description("Update diagram properties")
    .argument("<tenant>", "Tenant slug")
    .argument("<project>", "Project slug")
    .argument("<id>", "Diagram ID")
    .option("--name <name>", "Diagram name")
    .option("--description <desc>", "Description")
    .option("--view <view>", "View type")
    .action(async (tenant: string, project: string, id: string, opts: { name?: string; description?: string; view?: string }) => {
      const body: Record<string, unknown> = {};
      if (opts.name) body.name = opts.name;
      if (opts.description) body.description = opts.description;
      if (opts.view) body.view = opts.view;
      await client.patch(`/architecture/diagrams/${tenant}/${project}/${id}`, body);
      console.log("Diagram updated.");
    });

  cmd
    .command("delete")
    .description("Delete a diagram")
    .argument("<tenant>", "Tenant slug")
    .argument("<project>", "Project slug")
    .argument("<id>", "Diagram ID")
    .action(async (tenant: string, project: string, id: string) => {
      await client.delete(`/architecture/diagrams/${tenant}/${project}/${id}`);
      console.log("Diagram deleted.");
    });

  // Blocks sub-group
  const blocks = cmd.command("blocks").description("Manage blocks in diagrams");

  blocks
    .command("library")
    .description("Get all block definitions in the project")
    .argument("<tenant>", "Tenant slug")
    .argument("<project>", "Project slug")
    .action(async (tenant: string, project: string) => {
      const data = await client.get(`/architecture/block-library/${tenant}/${project}`);
      output(data);
    });

  blocks
    .command("create")
    .description("Create a new block")
    .argument("<tenant>", "Tenant slug")
    .argument("<project-key>", "Project key")
    .requiredOption("--diagram <id>", "Diagram ID")
    .requiredOption("--name <name>", "Block name")
    .requiredOption("--kind <kind>", "Kind: system, subsystem, component, actor, external, interface")
    .option("--x <n>", "Position X", "0")
    .option("--y <n>", "Position Y", "0")
    .option("--width <n>", "Width")
    .option("--height <n>", "Height")
    .option("--stereotype <s>", "Stereotype")
    .option("--description <desc>", "Description")
    .action(async (tenant: string, projectKey: string, opts: {
      diagram: string; name: string; kind: string;
      x: string; y: string; width?: string; height?: string;
      stereotype?: string; description?: string;
    }) => {
      const data = await client.post("/architecture/blocks", {
        tenant,
        projectKey,
        diagramId: opts.diagram,
        name: opts.name,
        kind: opts.kind,
        positionX: parseInt(opts.x, 10),
        positionY: parseInt(opts.y, 10),
        sizeWidth: opts.width ? parseInt(opts.width, 10) : undefined,
        sizeHeight: opts.height ? parseInt(opts.height, 10) : undefined,
        stereotype: opts.stereotype,
        description: opts.description,
      });
      if (isJsonMode()) {
        output(data);
      } else {
        console.log("Block created.");
        output(data);
      }
    });

  blocks
    .command("delete")
    .description("Delete a block from the project")
    .argument("<tenant>", "Tenant slug")
    .argument("<project>", "Project slug")
    .argument("<block-id>", "Block ID")
    .action(async (tenant: string, project: string, blockId: string) => {
      await client.delete(`/architecture/blocks/${tenant}/${project}/${blockId}`);
      console.log("Block deleted.");
    });

  // Connectors sub-group
  const connectors = cmd.command("connectors").alias("conn").description("Manage connectors");

  connectors
    .command("create")
    .description("Create a connector between blocks")
    .argument("<tenant>", "Tenant slug")
    .argument("<project-key>", "Project key")
    .requiredOption("--diagram <id>", "Diagram ID")
    .requiredOption("--source <id>", "Source block ID")
    .requiredOption("--target <id>", "Target block ID")
    .requiredOption("--kind <kind>", "Kind: association, flow, dependency, composition")
    .option("--label <text>", "Label")
    .option("--source-port <id>", "Source port ID")
    .option("--target-port <id>", "Target port ID")
    .option("--line-style <style>", "Line style: straight, smoothstep, step, polyline, bezier")
    .action(async (tenant: string, projectKey: string, opts: {
      diagram: string; source: string; target: string; kind: string;
      label?: string; sourcePort?: string; targetPort?: string; lineStyle?: string;
    }) => {
      const data = await client.post("/architecture/connectors", {
        tenant,
        projectKey,
        diagramId: opts.diagram,
        source: opts.source,
        target: opts.target,
        kind: opts.kind,
        label: opts.label,
        sourcePortId: opts.sourcePort,
        targetPortId: opts.targetPort,
        lineStyle: opts.lineStyle,
      });
      if (isJsonMode()) {
        output(data);
      } else {
        console.log("Connector created.");
        output(data);
      }
    });

  connectors
    .command("delete")
    .description("Delete a connector")
    .argument("<tenant>", "Tenant slug")
    .argument("<project>", "Project slug")
    .argument("<connector-id>", "Connector ID")
    .requiredOption("--diagram <id>", "Diagram ID")
    .action(async (tenant: string, project: string, connectorId: string, opts: { diagram: string }) => {
      await client.delete(`/architecture/connectors/${tenant}/${project}/${connectorId}?diagramId=${opts.diagram}`);
      console.log("Connector deleted.");
    });
}
