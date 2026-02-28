import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AirgenClient } from "../client.js";
import { ok, formatError, formatTable, truncate } from "../format.js";
import { renderDiagramSvg, autoLayoutBlocks, type SvgBlock, type SvgConnector } from "../svg-renderer.js";

export function registerArchitectureTools(server: McpServer, client: AirgenClient) {
  server.tool(
    "list_diagrams",
    "List all architecture diagrams in a project (block diagrams, internal block diagrams, deployment views)",
    {
      tenant: z.string().describe("Tenant slug"),
      project: z.string().describe("Project slug"),
    },
    async ({ tenant, project }) => {
      try {
        const data = await client.get<{
          diagrams: Array<{
            id: string;
            name: string;
            description?: string;
            view?: string;
          }>;
        }>(`/architecture/diagrams/${tenant}/${project}`);

        const diagrams = data.diagrams ?? [];
        if (diagrams.length === 0) return ok("No architecture diagrams found.");

        const rows = diagrams.map(d => [
          d.id,
          d.name,
          d.view ?? "block",
          truncate(d.description ?? "", 60),
        ]);
        return ok(formatTable(["ID", "Name", "View", "Description"], rows));
      } catch (err) {
        return formatError(err);
      }
    },
  );

  server.tool(
    "get_block_library",
    "Get all architecture block definitions in a project — the reusable component library with their types, ports, and stereotypes",
    {
      tenant: z.string().describe("Tenant slug"),
      project: z.string().describe("Project slug"),
    },
    async ({ tenant, project }) => {
      try {
        const data = await client.get<{
          blocks: Array<{
            id: string;
            name: string;
            kind?: string;
            stereotype?: string;
            ports?: Array<{ name: string; direction: string }>;
          }>;
        }>(`/architecture/block-library/${tenant}/${project}`);

        const blocks = data.blocks ?? [];
        if (blocks.length === 0) return ok("No blocks in library.");

        const lines: string[] = [`## Block Library (${blocks.length} blocks)\n`];
        for (const b of blocks) {
          const kind = b.kind ? ` [${b.kind}]` : "";
          const stereo = b.stereotype ? ` «${b.stereotype}»` : "";
          lines.push(`- **${b.name}**${kind}${stereo} (${b.id})`);
          if (b.ports?.length) {
            for (const p of b.ports) {
              lines.push(`  - Port: ${p.name} (${p.direction})`);
            }
          }
        }
        return ok(lines.join("\n"));
      } catch (err) {
        return formatError(err);
      }
    },
  );

  server.tool(
    "get_diagram_detail",
    "Get full detail of an architecture diagram: all blocks with positions/ports and all connectors with routing",
    {
      tenant: z.string().describe("Tenant slug"),
      project: z.string().describe("Project slug"),
      diagramId: z.string().describe("Diagram ID"),
    },
    async ({ tenant, project, diagramId }) => {
      try {
        const [blocksData, connectorsData] = await Promise.all([
          client.get<{
            blocks: Array<{
              id: string;
              name: string;
              kind?: string;
              positionX?: number;
              positionY?: number;
              sizeWidth?: number;
              sizeHeight?: number;
              ports?: Array<{
                id: string;
                name: string;
                direction: string;
                edge?: string;
                offset?: number;
              }>;
            }>;
          }>(`/architecture/blocks/${tenant}/${project}/${diagramId}`),
          client.get<{
            connectors: Array<{
              id: string;
              source?: string;
              target?: string;
              kind?: string;
              label?: string;
              lineStyle?: string;
              sourcePortId?: string;
              targetPortId?: string;
              controlPoints?: Array<{ x: number; y: number }>;
            }>;
          }>(`/architecture/connectors/${tenant}/${project}/${diagramId}`),
        ]);

        const blocks = blocksData.blocks ?? [];
        const connectors = connectorsData.connectors ?? [];

        // Build ID → name lookup for resolving connector endpoints
        const blockNameById = new Map<string, string>();
        // Build port ID → name lookup
        const portNameById = new Map<string, string>();
        for (const b of blocks) {
          blockNameById.set(b.id, b.name);
          for (const p of b.ports ?? []) {
            portNameById.set(p.id, p.name);
          }
        }

        const lines: string[] = [`## Diagram Detail\n`];

        lines.push(`### Blocks (${blocks.length})\n`);
        for (const b of blocks) {
          const kind = b.kind ? ` [${b.kind}]` : "";
          const pos = b.positionX != null ? ` @ (${b.positionX}, ${b.positionY})` : "";
          const size = b.sizeWidth != null ? ` ${b.sizeWidth}×${b.sizeHeight}` : "";
          lines.push(`- **${b.name}**${kind}${pos}${size} (${b.id})`);
          if (b.ports?.length) {
            for (const p of b.ports) {
              const edge = p.edge ? ` [${p.edge}` + (p.offset != null ? ` ${Math.round(p.offset)}%` : "") + "]" : "";
              lines.push(`  - Port: ${p.name} (${p.direction})${edge}`);
            }
          }
        }

        lines.push(`\n### Connectors (${connectors.length})\n`);
        for (const c of connectors) {
          const srcName = blockNameById.get(c.source ?? "") ?? c.source ?? "?";
          const tgtName = blockNameById.get(c.target ?? "") ?? c.target ?? "?";
          const kind = c.kind ? ` [${c.kind}]` : "";
          const label = c.label ? ` "${c.label}"` : "";
          const style = c.lineStyle ? ` (${c.lineStyle})` : "";
          // Port info
          const srcPort = c.sourcePortId ? portNameById.get(c.sourcePortId) ?? c.sourcePortId : null;
          const tgtPort = c.targetPortId ? portNameById.get(c.targetPortId) ?? c.targetPortId : null;
          const portInfo = srcPort || tgtPort
            ? ` [${srcPort ?? "default"} → ${tgtPort ?? "default"}]`
            : "";
          lines.push(`- **${srcName}** → **${tgtName}**${kind}${style}${label}${portInfo}`);
          // Show control points if present
          const cps = c.controlPoints ?? [];
          if (cps.length > 0) {
            const cpStr = cps.map(p => `(${Math.round(p.x)},${Math.round(p.y)})`).join(" → ");
            lines.push(`  waypoints: ${cpStr}`);
          }
        }

        return ok(lines.join("\n"));
      } catch (err) {
        return formatError(err);
      }
    },
  );

  server.tool(
    "export_diagram_svg",
    "Render an architecture diagram as a self-contained SVG image showing blocks, connectors, ports, and labels with SysML-compliant styling. Use layout='auto' to apply hierarchical auto-layout for programmatically-created diagrams.",
    {
      tenant: z.string().describe("Tenant slug"),
      project: z.string().describe("Project slug"),
      diagramId: z.string().describe("Diagram ID (from list_diagrams)"),
      layout: z.enum(["stored", "auto"]).optional()
        .describe("Layout mode: 'stored' (default) uses positions from DB, 'auto' applies hierarchical auto-layout"),
      direction: z.enum(["TB", "LR"]).optional()
        .describe("Auto-layout direction: TB (top-to-bottom, default) or LR (left-to-right). Only used when layout='auto'."),
    },
    async ({ tenant, project, diagramId, layout, direction }) => {
      try {
        const [blocksData, connectorsData] = await Promise.all([
          client.get<{ blocks: SvgBlock[] }>(
            `/architecture/blocks/${tenant}/${project}/${diagramId}`,
          ),
          client.get<{ connectors: SvgConnector[] }>(
            `/architecture/connectors/${tenant}/${project}/${diagramId}`,
          ),
        ]);

        const blocks = blocksData.blocks ?? [];
        const connectors = connectorsData.connectors ?? [];
        const svg = renderDiagramSvg(blocks, connectors, {
          layout: layout ?? "stored",
          direction: direction ?? "TB",
        });
        return ok(svg);
      } catch (err) {
        return formatError(err);
      }
    },
  );

  // ── Diagram CRUD ──────────────────────────────────────────────

  server.tool(
    "create_diagram",
    "Create a new architecture diagram in a project",
    {
      tenant: z.string().describe("Tenant slug"),
      projectKey: z.string().describe("Project slug/key"),
      name: z.string().describe("Diagram name"),
      view: z.enum(["block", "internal", "deployment", "requirements_schema"]).optional()
        .describe("Diagram view type (default: block)"),
      description: z.string().optional().describe("Diagram description"),
    },
    async (args) => {
      try {
        const data = await client.post<{
          diagram: { id: string; name: string; view?: string; description?: string };
        }>("/architecture/diagrams", args);
        const d = data.diagram;
        return ok(`Diagram created: **${d.name}** [${d.view ?? "block"}] (ID: ${d.id})`);
      } catch (err) {
        return formatError(err);
      }
    },
  );

  server.tool(
    "update_diagram",
    "Update an architecture diagram's name, description, or view type",
    {
      tenant: z.string().describe("Tenant slug"),
      project: z.string().describe("Project slug"),
      diagramId: z.string().describe("Diagram ID"),
      name: z.string().optional().describe("New diagram name"),
      description: z.string().optional().describe("New description"),
      view: z.enum(["block", "internal", "deployment", "requirements_schema"]).optional()
        .describe("New view type"),
    },
    async ({ tenant, project, diagramId, ...updates }) => {
      try {
        const data = await client.patch<{
          diagram: { id: string; name: string; view?: string; description?: string };
        }>(`/architecture/diagrams/${tenant}/${project}/${diagramId}`, updates);
        const d = data.diagram;
        return ok(`Diagram updated: **${d.name}** [${d.view ?? "block"}] (ID: ${d.id})`);
      } catch (err) {
        return formatError(err);
      }
    },
  );

  server.tool(
    "delete_diagram",
    "Delete an architecture diagram and all its block placements and connectors",
    {
      tenant: z.string().describe("Tenant slug"),
      project: z.string().describe("Project slug"),
      diagramId: z.string().describe("Diagram ID"),
    },
    async ({ tenant, project, diagramId }) => {
      try {
        await client.delete(`/architecture/diagrams/${tenant}/${project}/${diagramId}`);
        return ok(`Diagram ${diagramId} deleted.`);
      } catch (err) {
        return formatError(err);
      }
    },
  );

  // ── Block CRUD ────────────────────────────────────────────────

  server.tool(
    "create_block",
    "Create a new architecture block and place it on a diagram. Requires name, kind, and position.",
    {
      tenant: z.string().describe("Tenant slug"),
      projectKey: z.string().describe("Project slug/key"),
      diagramId: z.string().describe("Diagram ID to place the block on"),
      name: z.string().describe("Block name"),
      kind: z.enum(["system", "subsystem", "component", "actor", "external", "interface"])
        .describe("Block kind"),
      positionX: z.number().describe("X position on diagram (pixels)"),
      positionY: z.number().describe("Y position on diagram (pixels)"),
      sizeWidth: z.number().optional().describe("Block width (pixels, default ~200)"),
      sizeHeight: z.number().optional().describe("Block height (pixels, default ~120)"),
      stereotype: z.string().optional().describe("SysML stereotype (e.g. «sensor», «controller»)"),
      description: z.string().optional().describe("Block description"),
      ports: z.array(z.object({
        id: z.string().describe("Unique port ID"),
        name: z.string().describe("Port name"),
        direction: z.enum(["in", "out", "inout", "none"]).describe("Port direction"),
      })).optional().describe("Initial ports for the block"),
    },
    async (args) => {
      try {
        const data = await client.post<{
          block: { id: string; name: string; kind?: string };
        }>("/architecture/blocks", args);
        const b = data.block;
        return ok(`Block created: **${b.name}** [${b.kind ?? "component"}] (ID: ${b.id})`);
      } catch (err) {
        return formatError(err);
      }
    },
  );

  server.tool(
    "place_block",
    "Place an existing library block onto a diagram (reuse a block definition that already exists in the project)",
    {
      tenant: z.string().describe("Tenant slug"),
      projectKey: z.string().describe("Project slug/key"),
      diagramId: z.string().describe("Diagram ID to place the block on"),
      existingBlockId: z.string().describe("ID of the existing block from the block library (use get_block_library to find IDs)"),
      positionX: z.number().describe("X position on diagram (pixels)"),
      positionY: z.number().describe("Y position on diagram (pixels)"),
    },
    async (args) => {
      try {
        const data = await client.post<{
          block: { id: string; name: string; kind?: string };
        }>("/architecture/blocks", args);
        const b = data.block;
        return ok(`Block placed: **${b.name}** [${b.kind ?? "component"}] on diagram (ID: ${b.id})`);
      } catch (err) {
        return formatError(err);
      }
    },
  );

  server.tool(
    "update_block",
    "Update a block's properties: name, kind, position, size, stereotype, description, or styling",
    {
      tenant: z.string().describe("Tenant slug"),
      project: z.string().describe("Project slug"),
      blockId: z.string().describe("Block ID"),
      diagramId: z.string().describe("Diagram ID (required context for the update)"),
      name: z.string().optional().describe("New block name"),
      kind: z.enum(["system", "subsystem", "component", "actor", "external", "interface"]).optional()
        .describe("New block kind"),
      positionX: z.number().optional().describe("New X position"),
      positionY: z.number().optional().describe("New Y position"),
      sizeWidth: z.number().optional().describe("New width"),
      sizeHeight: z.number().optional().describe("New height"),
      stereotype: z.string().optional().describe("New stereotype"),
      description: z.string().optional().describe("New description"),
    },
    async ({ tenant, project, blockId, diagramId, ...updates }) => {
      try {
        const data = await client.patch<{
          block: { id: string; name: string; kind?: string };
        }>(`/architecture/blocks/${tenant}/${project}/${blockId}`, { diagramId, ...updates });
        const b = data.block;
        return ok(`Block updated: **${b.name}** [${b.kind ?? "component"}] (ID: ${b.id})`);
      } catch (err) {
        return formatError(err);
      }
    },
  );

  server.tool(
    "delete_block",
    "Permanently delete a block from the project (removes from all diagrams and the block library)",
    {
      tenant: z.string().describe("Tenant slug"),
      project: z.string().describe("Project slug"),
      blockId: z.string().describe("Block ID"),
    },
    async ({ tenant, project, blockId }) => {
      try {
        await client.delete(`/architecture/blocks/${tenant}/${project}/${blockId}`);
        return ok(`Block ${blockId} deleted from project.`);
      } catch (err) {
        return formatError(err);
      }
    },
  );

  server.tool(
    "remove_block_from_diagram",
    "Remove a block from a specific diagram only (keeps the block in the library and on other diagrams)",
    {
      tenant: z.string().describe("Tenant slug"),
      project: z.string().describe("Project slug"),
      blockId: z.string().describe("Block ID"),
      diagramId: z.string().describe("Diagram ID to remove the block from"),
    },
    async ({ tenant, project, blockId, diagramId }) => {
      try {
        await client.delete(`/architecture/blocks/${tenant}/${project}/${blockId}?diagramId=${diagramId}`);
        return ok(`Block ${blockId} removed from diagram ${diagramId}.`);
      } catch (err) {
        return formatError(err);
      }
    },
  );

  // ── Port management ───────────────────────────────────────────

  server.tool(
    "add_port",
    "Add a port to an architecture block. Ports are connection points where connectors attach.",
    {
      tenant: z.string().describe("Tenant slug"),
      project: z.string().describe("Project slug"),
      blockId: z.string().describe("Block ID to add port to"),
      diagramId: z.string().describe("Diagram ID (required context)"),
      portId: z.string().describe("Unique port ID (e.g. 'p1', 'data-in')"),
      portName: z.string().describe("Port display name"),
      direction: z.enum(["in", "out", "inout", "none"]).describe("Port direction"),
      edge: z.enum(["top", "right", "bottom", "left"]).optional()
        .describe("Which edge of the block to place the port on (default: in→left, out→right)"),
    },
    async ({ tenant, project, blockId, diagramId, portId, portName, direction, edge }) => {
      try {
        // Fetch current block state to get existing ports
        const blocksData = await client.get<{
          blocks: Array<{
            id: string;
            name: string;
            ports?: Array<{ id: string; name: string; direction: string; edge?: string }>;
          }>;
        }>(`/architecture/blocks/${tenant}/${project}/${diagramId}`);

        const block = (blocksData.blocks ?? []).find(b => b.id === blockId);
        if (!block) return ok(`Block ${blockId} not found on diagram ${diagramId}.`);

        const currentPorts = (block.ports ?? []).map(p => ({
          id: p.id,
          name: p.name,
          direction: p.direction as "in" | "out" | "inout" | "none",
          ...(p.edge ? { edge: p.edge } : {}),
        }));

        // Check for duplicate port ID
        if (currentPorts.some(p => p.id === portId)) {
          return ok(`Port with ID "${portId}" already exists on block ${block.name}.`);
        }

        const newPort: Record<string, string> = { id: portId, name: portName, direction };
        if (edge) newPort.edge = edge;

        const updatedPorts = [...currentPorts, newPort];

        await client.patch(
          `/architecture/blocks/${tenant}/${project}/${blockId}`,
          { diagramId, ports: updatedPorts },
        );
        return ok(`Port **${portName}** (${direction}) added to block **${block.name}**.`);
      } catch (err) {
        return formatError(err);
      }
    },
  );

  server.tool(
    "remove_port",
    "Remove a port from an architecture block",
    {
      tenant: z.string().describe("Tenant slug"),
      project: z.string().describe("Project slug"),
      blockId: z.string().describe("Block ID"),
      diagramId: z.string().describe("Diagram ID (required context)"),
      portId: z.string().describe("Port ID to remove"),
    },
    async ({ tenant, project, blockId, diagramId, portId }) => {
      try {
        // Fetch current block state
        const blocksData = await client.get<{
          blocks: Array<{
            id: string;
            name: string;
            ports?: Array<{ id: string; name: string; direction: string; edge?: string }>;
          }>;
        }>(`/architecture/blocks/${tenant}/${project}/${diagramId}`);

        const block = (blocksData.blocks ?? []).find(b => b.id === blockId);
        if (!block) return ok(`Block ${blockId} not found on diagram ${diagramId}.`);

        const currentPorts = block.ports ?? [];
        const removedPort = currentPorts.find(p => p.id === portId);
        if (!removedPort) return ok(`Port "${portId}" not found on block ${block.name}.`);

        const updatedPorts = currentPorts
          .filter(p => p.id !== portId)
          .map(p => ({
            id: p.id,
            name: p.name,
            direction: p.direction as "in" | "out" | "inout" | "none",
            ...(p.edge ? { edge: p.edge } : {}),
          }));

        await client.patch(
          `/architecture/blocks/${tenant}/${project}/${blockId}`,
          { diagramId, ports: updatedPorts },
        );
        return ok(`Port **${removedPort.name}** removed from block **${block.name}**.`);
      } catch (err) {
        return formatError(err);
      }
    },
  );

  // ── Connector CRUD ────────────────────────────────────────────

  server.tool(
    "create_connector",
    "Create a connector between two blocks on a diagram. Optionally connect to specific ports.",
    {
      tenant: z.string().describe("Tenant slug"),
      projectKey: z.string().describe("Project slug/key"),
      diagramId: z.string().describe("Diagram ID"),
      source: z.string().describe("Source block ID"),
      target: z.string().describe("Target block ID"),
      kind: z.enum(["association", "flow", "dependency", "composition"])
        .describe("Connector kind — association (default), flow (data/signal), dependency (dashed arrow), composition (diamond)"),
      label: z.string().optional().describe("Connector label text"),
      sourcePortId: z.string().optional().describe("Source port ID (if connecting to a specific port)"),
      targetPortId: z.string().optional().describe("Target port ID (if connecting to a specific port)"),
      lineStyle: z.enum(["straight", "smoothstep", "step", "polyline", "bezier"]).optional()
        .describe("Line routing style (default depends on kind)"),
      linePattern: z.enum(["solid", "dashed", "dotted"]).optional()
        .describe("Line pattern (default depends on kind)"),
      color: z.string().optional().describe("Line color (hex, e.g. #2563eb)"),
    },
    async (args) => {
      try {
        const data = await client.post<{
          connector: { id: string; source?: string; target?: string; kind?: string; label?: string };
        }>("/architecture/connectors", args);
        const c = data.connector;
        const label = c.label ? ` "${c.label}"` : "";
        return ok(`Connector created: ${c.source} → ${c.target} [${c.kind ?? "association"}]${label} (ID: ${c.id})`);
      } catch (err) {
        return formatError(err);
      }
    },
  );

  server.tool(
    "update_connector",
    "Update a connector's kind, label, ports, or styling",
    {
      tenant: z.string().describe("Tenant slug"),
      project: z.string().describe("Project slug"),
      connectorId: z.string().describe("Connector ID"),
      diagramId: z.string().describe("Diagram ID (required context)"),
      kind: z.enum(["association", "flow", "dependency", "composition"]).optional()
        .describe("New connector kind"),
      label: z.string().optional().describe("New label text"),
      sourcePortId: z.string().optional().describe("New source port ID"),
      targetPortId: z.string().optional().describe("New target port ID"),
      lineStyle: z.enum(["straight", "smoothstep", "step", "polyline", "bezier"]).optional()
        .describe("New line routing style"),
      linePattern: z.enum(["solid", "dashed", "dotted"]).optional()
        .describe("New line pattern"),
      color: z.string().optional().describe("New line color (hex)"),
      strokeWidth: z.number().optional().describe("New stroke width (1-10)"),
    },
    async ({ tenant, project, connectorId, diagramId, ...updates }) => {
      try {
        const data = await client.patch<{
          connector: { id: string; kind?: string; label?: string };
        }>(`/architecture/connectors/${tenant}/${project}/${connectorId}`, { diagramId, ...updates });
        const c = data.connector;
        const label = c.label ? ` "${c.label}"` : "";
        return ok(`Connector updated: [${c.kind ?? "association"}]${label} (ID: ${c.id})`);
      } catch (err) {
        return formatError(err);
      }
    },
  );

  server.tool(
    "delete_connector",
    "Delete a connector from a diagram",
    {
      tenant: z.string().describe("Tenant slug"),
      project: z.string().describe("Project slug"),
      connectorId: z.string().describe("Connector ID"),
      diagramId: z.string().describe("Diagram ID"),
    },
    async ({ tenant, project, connectorId, diagramId }) => {
      try {
        await client.delete(`/architecture/connectors/${tenant}/${project}/${connectorId}?diagramId=${diagramId}`);
        return ok(`Connector ${connectorId} deleted.`);
      } catch (err) {
        return formatError(err);
      }
    },
  );

  // ── Auto-layout ──────────────────────────────────────────────

  server.tool(
    "auto_layout_diagram",
    "Auto-arrange all blocks on a diagram using hierarchical layout (dagre). Updates stored positions in Neo4j so the AIRGen UI also reflects the new layout.",
    {
      tenant: z.string().describe("Tenant slug"),
      project: z.string().describe("Project slug"),
      diagramId: z.string().describe("Diagram ID"),
      direction: z.enum(["TB", "LR"]).optional()
        .describe("Layout direction: TB (top-to-bottom, default) or LR (left-to-right)"),
    },
    async ({ tenant, project, diagramId, direction }) => {
      try {
        const [blocksData, connectorsData] = await Promise.all([
          client.get<{ blocks: SvgBlock[] }>(
            `/architecture/blocks/${tenant}/${project}/${diagramId}`,
          ),
          client.get<{ connectors: SvgConnector[] }>(
            `/architecture/connectors/${tenant}/${project}/${diagramId}`,
          ),
        ]);

        const blocks = blocksData.blocks ?? [];
        const connectors = connectorsData.connectors ?? [];
        if (blocks.length === 0) return ok("No blocks to layout.");

        const laid = autoLayoutBlocks(blocks, connectors, direction ?? "TB");

        // Persist new positions
        let updated = 0;
        for (const b of laid) {
          const orig = blocks.find((o) => o.id === b.id);
          if (
            orig &&
            (Math.round(orig.positionX) !== Math.round(b.positionX) ||
              Math.round(orig.positionY) !== Math.round(b.positionY))
          ) {
            await client.patch(
              `/architecture/blocks/${tenant}/${project}/${b.id}`,
              {
                diagramId,
                positionX: Math.round(b.positionX),
                positionY: Math.round(b.positionY),
                sizeWidth: Math.round(b.sizeWidth),
                sizeHeight: Math.round(b.sizeHeight),
              },
            );
            updated++;
          }
        }

        return ok(
          `Auto-layout applied: ${updated} of ${blocks.length} blocks repositioned (${direction ?? "TB"} direction).`,
        );
      } catch (err) {
        return formatError(err);
      }
    },
  );
}
