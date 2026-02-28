/**
 * SVG Renderer for AIRGen Architecture Diagrams
 *
 * Renders block diagrams as self-contained SVG strings with SysML-compliant styling.
 *
 * Features:
 *  - Block colouring by kind (system, subsystem, component, actor, external, interface)
 *  - SysML-compliant connector markers (diamond for composition, arrows for flow/dependency)
 *  - Port colouring by direction (in=green, out=orange, inout=indigo)
 *  - Description word-wrapping with tooltips
 *  - Adaptive font scaling and stroke widths
 *  - Optional auto-layout via dagre
 *
 * Connector routing:
 *  - If controlPoints are stored, they are used as-is (polyline through waypoints).
 *  - If controlPoints are empty and lineStyle is step/smoothstep/polyline,
 *    an orthogonal auto-route is computed (matching React Flow's getSmoothStepPath).
 *  - If lineStyle is straight or bezier, uses straight line or cubic curve.
 */

import dagre from "dagre";

// ─── Types (mirrors API response shape) ────────────────────────────────────

export type SvgPort = {
  id: string;
  name: string;
  direction: "in" | "out" | "inout" | "none";
  edge?: "top" | "right" | "bottom" | "left" | null;
  offset?: number | null;
  backgroundColor?: string | null;
  borderColor?: string | null;
  size?: number | null;
  shape?: "circle" | "square" | "diamond" | null;
  hidden?: boolean | null;
  showLabel?: boolean | null;
};

export type SvgBlock = {
  id: string;
  name: string;
  kind?: string;
  stereotype?: string | null;
  description?: string | null;
  positionX: number;
  positionY: number;
  sizeWidth: number;
  sizeHeight: number;
  ports?: SvgPort[];
  backgroundColor?: string | null;
  borderColor?: string | null;
  borderWidth?: number | null;
  borderStyle?: string | null;
  textColor?: string | null;
  fontSize?: number | null;
  fontWeight?: string | null;
  borderRadius?: number | null;
};

export type SvgConnector = {
  id: string;
  source: string;
  target: string;
  kind?: string;
  label?: string | null;
  sourcePortId?: string | null;
  targetPortId?: string | null;
  lineStyle?: string | null;
  linePattern?: string | null;
  markerStart?: string | null;
  markerEnd?: string | null;
  color?: string | null;
  strokeWidth?: number | null;
  labelOffsetX?: number | null;
  labelOffsetY?: number | null;
  controlPoints?: Array<{ x: number; y: number }> | null;
};

export type RenderOptions = {
  layout?: "stored" | "auto";
  direction?: "TB" | "LR";
};

type Point = { x: number; y: number };
type Direction = "top" | "right" | "bottom" | "left";
type EndpointInfo = { point: Point; direction: Direction };

// ─── Constants ─────────────────────────────────────────────────────────────

const PADDING = 40;
const PORT_RADIUS = 6;
const ROUTE_GAP = 25;
const FONT_FAMILY = "'Inter', 'Helvetica Neue', Arial, sans-serif";

// ─── Block kind → colour styles ────────────────────────────────────────────

const BLOCK_STYLES: Record<string, { fill: string; stroke: string; text: string }> = {
  system:    { fill: "#ebf8ff", stroke: "#1a365d", text: "#1a365d" },
  subsystem: { fill: "#f0f5ff", stroke: "#2c5282", text: "#2c5282" },
  component: { fill: "#ffffff", stroke: "#000000", text: "#000000" },
  actor:     { fill: "#f0fff4", stroke: "#276749", text: "#276749" },
  external:  { fill: "#fffbeb", stroke: "#92400e", text: "#92400e" },
  interface: { fill: "#faf5ff", stroke: "#6b21a8", text: "#6b21a8" },
};

// ─── Port direction → colour styles ────────────────────────────────────────

const PORT_STYLES: Record<string, { fill: string; stroke: string }> = {
  in:    { fill: "#22c55e", stroke: "#166534" },
  out:   { fill: "#f97316", stroke: "#9a3412" },
  inout: { fill: "#6366f1", stroke: "#3730a3" },
  none:  { fill: "#94a3b8", stroke: "#475569" },
};

// ─── Default block sizes for auto-layout ───────────────────────────────────

const BLOCK_SIZES: Record<string, { w: number; h: number }> = {
  system:    { w: 280, h: 160 },
  subsystem: { w: 240, h: 130 },
  component: { w: 200, h: 110 },
  actor:     { w: 180, h: 100 },
  external:  { w: 180, h: 100 },
  interface: { w: 160, h: 90 },
};

// ─── Escaping ──────────────────────────────────────────────────────────────

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ─── Stereotype formatting ─────────────────────────────────────────────────

function formatStereotype(block: SvgBlock): string {
  if (block.stereotype?.trim()) {
    const s = block.stereotype.trim();
    if (s.startsWith("\u00AB")) return s;
    return "\u00AB" + s.replace(/^<</, "").replace(/>>$/, "") + "\u00BB";
  }
  return "\u00AB" + (block.kind || "block") + "\u00BB";
}

// ─── Text wrapping ─────────────────────────────────────────────────────────

function wrapText(text: string, maxWidth: number, fontSize: number): string[] {
  const charsPerLine = Math.floor((maxWidth - 24) / (fontSize * 0.6));
  if (charsPerLine <= 0) return [];
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const test = current ? current + " " + word : word;
    if (test.length > charsPerLine && current) {
      lines.push(current);
      current = word;
      if (lines.length >= 3) break;
    } else {
      current = test;
    }
  }
  if (current && lines.length < 3) lines.push(current);
  // Truncate last line if there's more text
  const totalRendered = lines.join(" ").length;
  if (totalRendered < text.length && lines.length > 0) {
    const last = lines[lines.length - 1];
    if (last.length > 3) {
      lines[lines.length - 1] = last.slice(0, last.length - 3) + "...";
    }
  }
  return lines;
}

// ─── Font scaling ──────────────────────────────────────────────────────────

function computeFontSizes(blocks: SvgBlock[]): { stereo: number; name: number; desc: number } {
  if (blocks.length === 0) return { stereo: 11, name: 14, desc: 12 };
  const avgWidth = blocks.reduce((s, b) => s + b.sizeWidth, 0) / blocks.length;
  const scale = avgWidth < 150 ? 0.8 : avgWidth > 300 ? 1.15 : 1.0;
  return {
    stereo: Math.max(9, Math.min(13, Math.round(11 * scale))),
    name: Math.max(11, Math.min(18, Math.round(14 * scale))),
    desc: Math.max(10, Math.min(14, Math.round(12 * scale))),
  };
}

// ─── Port position calculation ──────────────────────────────────────────────

function getPortEdge(port: SvgPort): Direction {
  if (port.edge) return port.edge;
  return port.direction === "out" ? "right" : "left";
}

function getPortAbsolutePosition(
  block: SvgBlock,
  port: SvgPort,
  index: number,
  totalOnEdge: number
): Point {
  const edge = getPortEdge(port);
  const offset =
    port.offset != null ? port.offset : ((index + 1) / (totalOnEdge + 1)) * 100;
  const frac = offset / 100;

  switch (edge) {
    case "top":
      return { x: block.positionX + block.sizeWidth * frac, y: block.positionY };
    case "bottom":
      return {
        x: block.positionX + block.sizeWidth * frac,
        y: block.positionY + block.sizeHeight,
      };
    case "left":
      return { x: block.positionX, y: block.positionY + block.sizeHeight * frac };
    case "right":
      return {
        x: block.positionX + block.sizeWidth,
        y: block.positionY + block.sizeHeight * frac,
      };
  }
}

function groupPortsByEdge(ports: SvgPort[]): Record<string, SvgPort[]> {
  const groups: Record<string, SvgPort[]> = { top: [], right: [], bottom: [], left: [] };
  for (const p of ports) {
    if (p.hidden) continue;
    groups[getPortEdge(p)].push(p);
  }
  return groups;
}

// ─── Connector endpoint resolution ─────────────────────────────────────────

function getEndpointInfo(
  connector: SvgConnector,
  blocks: SvgBlock[],
  side: "source" | "target"
): EndpointInfo {
  const blockId = side === "source" ? connector.source : connector.target;
  const portId = side === "source" ? connector.sourcePortId : connector.targetPortId;
  const block = blocks.find((b) => b.id === blockId);
  if (!block) return { point: { x: 0, y: 0 }, direction: "bottom" };

  if (portId && block.ports) {
    const visiblePorts = (block.ports || []).filter((p) => !p.hidden);
    const byEdge = groupPortsByEdge(visiblePorts);
    for (const [, edgePorts] of Object.entries(byEdge)) {
      const idx = edgePorts.findIndex((p) => p.id === portId);
      if (idx !== -1) {
        const port = edgePorts[idx];
        return {
          point: getPortAbsolutePosition(block, port, idx, edgePorts.length),
          direction: getPortEdge(port),
        };
      }
    }
  }

  // Default handles: source exits from bottom, target enters from top
  if (side === "target") {
    return {
      point: { x: block.positionX + block.sizeWidth / 2, y: block.positionY },
      direction: "top",
    };
  }
  return {
    point: {
      x: block.positionX + block.sizeWidth / 2,
      y: block.positionY + block.sizeHeight,
    },
    direction: "bottom",
  };
}

// ─── Orthogonal auto-routing ───────────────────────────────────────────────

function isVertical(dir: Direction): boolean {
  return dir === "top" || dir === "bottom";
}

function extendPoint(p: Point, dir: Direction, dist: number): Point {
  switch (dir) {
    case "top":
      return { x: p.x, y: p.y - dist };
    case "bottom":
      return { x: p.x, y: p.y + dist };
    case "left":
      return { x: p.x - dist, y: p.y };
    case "right":
      return { x: p.x + dist, y: p.y };
  }
}

function buildOrthogonalPath(src: EndpointInfo, tgt: EndpointInfo): Point[] {
  const s = src.point;
  const t = tgt.point;
  const sExt = extendPoint(s, src.direction, ROUTE_GAP);
  const tExt = extendPoint(t, tgt.direction, ROUTE_GAP);

  const points: Point[] = [s, sExt];

  if (isVertical(src.direction) && isVertical(tgt.direction)) {
    const easyPath =
      (src.direction === "bottom" && sExt.y < tExt.y) ||
      (src.direction === "top" && sExt.y > tExt.y);

    if (easyPath || src.direction === tgt.direction) {
      const midY = (sExt.y + tExt.y) / 2;
      points.push({ x: sExt.x, y: midY });
      points.push({ x: tExt.x, y: midY });
    } else {
      const sideX =
        Math.abs(sExt.x - tExt.x) < 50
          ? Math.max(sExt.x, tExt.x) + ROUTE_GAP * 4
          : (sExt.x + tExt.x) / 2;
      points.push({ x: sideX, y: sExt.y });
      points.push({ x: sideX, y: tExt.y });
    }
  } else if (!isVertical(src.direction) && !isVertical(tgt.direction)) {
    const easyPath =
      (src.direction === "right" && sExt.x < tExt.x) ||
      (src.direction === "left" && sExt.x > tExt.x);

    if (easyPath || src.direction === tgt.direction) {
      const midX = (sExt.x + tExt.x) / 2;
      points.push({ x: midX, y: sExt.y });
      points.push({ x: midX, y: tExt.y });
    } else {
      const sideY =
        Math.abs(sExt.y - tExt.y) < 50
          ? Math.max(sExt.y, tExt.y) + ROUTE_GAP * 4
          : (sExt.y + tExt.y) / 2;
      points.push({ x: sExt.x, y: sideY });
      points.push({ x: tExt.x, y: sideY });
    }
  } else {
    // Perpendicular: L-shape
    if (isVertical(src.direction)) {
      points.push({ x: sExt.x, y: tExt.y });
    } else {
      points.push({ x: tExt.x, y: sExt.y });
    }
  }

  points.push(tExt, t);
  return points;
}

// ─── Path building ─────────────────────────────────────────────────────────

function pointsToPath(pts: Point[]): string {
  return pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x},${p.y}`).join(" ");
}

function buildConnectorPath(
  src: EndpointInfo,
  tgt: EndpointInfo,
  controlPoints: Array<{ x: number; y: number }> | null | undefined,
  lineStyle: string | null | undefined
): { d: string; pathPoints: Point[] } {
  const cps = controlPoints ?? [];

  if (lineStyle === "bezier" && cps.length === 2) {
    const d = `M ${src.point.x},${src.point.y} C ${cps[0].x},${cps[0].y} ${cps[1].x},${cps[1].y} ${tgt.point.x},${tgt.point.y}`;
    const mid: Point = {
      x: (src.point.x + cps[0].x + cps[1].x + tgt.point.x) / 4,
      y: (src.point.y + cps[0].y + cps[1].y + tgt.point.y) / 4,
    };
    return { d, pathPoints: [src.point, mid, tgt.point] };
  }

  if (cps.length > 0) {
    const pts = [src.point, ...cps, tgt.point];
    return { d: pointsToPath(pts), pathPoints: pts };
  }

  if (
    lineStyle === "step" ||
    lineStyle === "smoothstep" ||
    lineStyle === "polyline"
  ) {
    const pts = buildOrthogonalPath(src, tgt);
    return { d: pointsToPath(pts), pathPoints: pts };
  }

  const pts = [src.point, tgt.point];
  return { d: pointsToPath(pts), pathPoints: pts };
}

// ─── Path midpoint ─────────────────────────────────────────────────────────

function getPathMidpoint(pathPoints: Point[]): Point {
  if (pathPoints.length < 2) {
    return pathPoints[0] ?? { x: 0, y: 0 };
  }
  let totalLen = 0;
  const segLens: number[] = [];
  for (let i = 0; i < pathPoints.length - 1; i++) {
    const len = Math.hypot(
      pathPoints[i + 1].x - pathPoints[i].x,
      pathPoints[i + 1].y - pathPoints[i].y
    );
    segLens.push(len);
    totalLen += len;
  }
  const half = totalLen / 2;
  let acc = 0;
  for (let i = 0; i < segLens.length; i++) {
    if (acc + segLens[i] >= half) {
      const ratio = segLens[i] === 0 ? 0 : (half - acc) / segLens[i];
      return {
        x: pathPoints[i].x + (pathPoints[i + 1].x - pathPoints[i].x) * ratio,
        y: pathPoints[i].y + (pathPoints[i + 1].y - pathPoints[i].y) * ratio,
      };
    }
    acc += segLens[i];
  }
  return {
    x: (pathPoints[0].x + pathPoints[pathPoints.length - 1].x) / 2,
    y: (pathPoints[0].y + pathPoints[pathPoints.length - 1].y) / 2,
  };
}

// ─── Dash pattern ──────────────────────────────────────────────────────────

function getDashArray(pattern: string | null | undefined): string | undefined {
  switch (pattern) {
    case "dashed":
      return "6 3";
    case "dotted":
      return "2 2";
    default:
      return undefined;
  }
}

// ─── Connector kind defaults (SysML-compliant) ─────────────────────────────

function getConnectorDefaults(kind?: string): {
  color: string;
  lineStyle: string;
  linePattern: string;
  markerStart: string;
  markerEnd: string;
} {
  switch (kind) {
    case "flow":
      return {
        color: "#2563eb",
        lineStyle: "smoothstep",
        linePattern: "dashed",
        markerStart: "none",
        markerEnd: "arrowclosed",
      };
    case "dependency":
      return {
        color: "#64748b",
        lineStyle: "straight",
        linePattern: "dashed",
        markerStart: "none",
        markerEnd: "arrow",
      };
    case "composition":
      return {
        color: "#dc2626",
        lineStyle: "straight",
        linePattern: "solid",
        markerStart: "diamond-filled",
        markerEnd: "none",
      };
    default: // association
      return {
        color: "#000000",
        lineStyle: "straight",
        linePattern: "solid",
        markerStart: "none",
        markerEnd: "arrow",
      };
  }
}

// ─── Marker definitions ────────────────────────────────────────────────────

function markerId(type: string, color: string): string {
  const safeColor = color.replace("#", "");
  return `marker-${type}-${safeColor}`;
}

function buildMarkerDefs(connectors: SvgConnector[]): string {
  const seen = new Set<string>();
  const defs: string[] = [];

  for (const c of connectors) {
    const defaults = getConnectorDefaults(c.kind);
    const color = c.color ?? defaults.color;
    const mStart = c.markerStart ?? defaults.markerStart;
    const mEnd = c.markerEnd ?? defaults.markerEnd;

    for (const type of [mStart, mEnd]) {
      if (type === "none" || !type) continue;
      const id = markerId(type, color);
      if (seen.has(id)) continue;
      seen.add(id);

      if (type === "arrowclosed") {
        defs.push(
          `<marker id="${id}" markerWidth="12" markerHeight="12" refX="10" refY="6" orient="auto-start-reverse" markerUnits="userSpaceOnUse">` +
            `<path d="M 0 0 L 12 6 L 0 12 z" fill="${esc(color)}" />` +
            `</marker>`
        );
      } else if (type === "arrow") {
        defs.push(
          `<marker id="${id}" markerWidth="12" markerHeight="12" refX="10" refY="6" orient="auto-start-reverse" markerUnits="userSpaceOnUse">` +
            `<path d="M 0 0 L 12 6 L 0 12" fill="none" stroke="${esc(color)}" stroke-width="1.5" />` +
            `</marker>`
        );
      } else if (type === "diamond-filled") {
        defs.push(
          `<marker id="${id}" markerWidth="16" markerHeight="10" refX="0" refY="5" orient="auto-start-reverse" markerUnits="userSpaceOnUse">` +
            `<path d="M 0 5 L 8 0 L 16 5 L 8 10 z" fill="${esc(color)}" />` +
            `</marker>`
        );
      }
    }
  }

  return defs.join("\n    ");
}

// ─── Port shape rendering ──────────────────────────────────────────────────

function renderPortShape(pos: Point, port: SvgPort): string {
  const portStyle = PORT_STYLES[port.direction] ?? PORT_STYLES.none;
  const fill = port.backgroundColor ?? portStyle.fill;
  const stroke = port.borderColor ?? portStyle.stroke;
  const r = PORT_RADIUS;

  switch (port.shape) {
    case "square":
      return `<rect x="${pos.x - r}" y="${pos.y - r}" width="${r * 2}" height="${r * 2}" fill="${esc(fill)}" stroke="${esc(stroke)}" stroke-width="1.5" />`;
    case "diamond":
      return `<polygon points="${pos.x},${pos.y - r} ${pos.x + r},${pos.y} ${pos.x},${pos.y + r} ${pos.x - r},${pos.y}" fill="${esc(fill)}" stroke="${esc(stroke)}" stroke-width="1.5" />`;
    default:
      return `<circle cx="${pos.x}" cy="${pos.y}" r="${r}" fill="${esc(fill)}" stroke="${esc(stroke)}" stroke-width="1.5" />`;
  }
}

function renderPortLabel(pos: Point, port: SvgPort, blockWidth: number): string {
  // Only show labels on blocks wide enough
  if (blockWidth < 150) return "";

  const edge = getPortEdge(port);
  const portStyle = PORT_STYLES[port.direction] ?? PORT_STYLES.none;
  const color = portStyle.stroke;
  let tx = pos.x;
  let ty = pos.y;
  let anchor = "middle";

  switch (edge) {
    case "left":
      tx += PORT_RADIUS + 4;
      ty += 3;
      anchor = "start";
      break;
    case "right":
      tx -= PORT_RADIUS + 4;
      ty += 3;
      anchor = "end";
      break;
    case "top":
      ty -= PORT_RADIUS + 4;
      break;
    case "bottom":
      ty += PORT_RADIUS + 12;
      break;
  }

  return `<text x="${tx}" y="${ty}" font-size="9" font-family="${FONT_FAMILY}" text-anchor="${anchor}" fill="${esc(color)}">${esc(port.name)}</text>`;
}

// ─── Auto-layout with dagre ────────────────────────────────────────────────

export function autoLayoutBlocks(
  blocks: SvgBlock[],
  connectors: SvgConnector[],
  direction: "TB" | "LR" = "TB"
): SvgBlock[] {
  if (blocks.length === 0) return blocks;

  const g = new dagre.graphlib.Graph();
  g.setGraph({
    rankdir: direction,
    nodesep: 60,
    ranksep: 180,
    marginx: 40,
    marginy: 40,
  });
  g.setDefaultEdgeLabel(() => ({}));

  for (const b of blocks) {
    const sizes = BLOCK_SIZES[b.kind ?? "component"] ?? BLOCK_SIZES.component;
    g.setNode(b.id, {
      width: b.sizeWidth || sizes.w,
      height: b.sizeHeight || sizes.h,
    });
  }

  for (const c of connectors) {
    if (g.hasNode(c.source) && g.hasNode(c.target)) {
      g.setEdge(c.source, c.target);
    }
  }

  dagre.layout(g);

  return blocks.map((b) => {
    const node = g.node(b.id);
    if (!node) return b;
    const sizes = BLOCK_SIZES[b.kind ?? "component"] ?? BLOCK_SIZES.component;
    const w = b.sizeWidth || sizes.w;
    const h = b.sizeHeight || sizes.h;
    return {
      ...b,
      positionX: node.x - w / 2,
      positionY: node.y - h / 2,
      sizeWidth: w,
      sizeHeight: h,
    };
  });
}

// ─── Main renderer ─────────────────────────────────────────────────────────

export function renderDiagramSvg(
  blocks: SvgBlock[],
  connectors: SvgConnector[],
  options?: RenderOptions
): string {
  if (blocks.length === 0) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 100"><text x="200" y="50" text-anchor="middle" font-family="${FONT_FAMILY}" font-size="14" fill="#64748b">Empty diagram</text></svg>`;
  }

  // Apply auto-layout if requested
  let layoutBlocks = blocks;
  if (options?.layout === "auto") {
    layoutBlocks = autoLayoutBlocks(blocks, connectors, options.direction);
  }

  // Font scaling
  const fontSize = computeFontSizes(layoutBlocks);

  // 1. Compute bounding box
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const b of layoutBlocks) {
    minX = Math.min(minX, b.positionX);
    minY = Math.min(minY, b.positionY);
    maxX = Math.max(maxX, b.positionX + b.sizeWidth);
    maxY = Math.max(maxY, b.positionY + b.sizeHeight);
  }
  // Include connector control points in bounding box
  for (const c of connectors) {
    for (const cp of c.controlPoints ?? []) {
      minX = Math.min(minX, cp.x);
      minY = Math.min(minY, cp.y);
      maxX = Math.max(maxX, cp.x);
      maxY = Math.max(maxY, cp.y);
    }
  }

  // Include port labels extent (approximate)
  for (const b of layoutBlocks) {
    for (const p of b.ports ?? []) {
      if (p.hidden) continue;
      const edge = getPortEdge(p);
      const labelExtent = b.sizeWidth >= 150 ? p.name.length * 5.5 + PORT_RADIUS : PORT_RADIUS;
      if (edge === "left") minX = Math.min(minX, b.positionX - labelExtent);
      if (edge === "right") maxX = Math.max(maxX, b.positionX + b.sizeWidth + labelExtent);
      if (edge === "top") minY = Math.min(minY, b.positionY - PORT_RADIUS - 12);
      if (edge === "bottom") maxY = Math.max(maxY, b.positionY + b.sizeHeight + PORT_RADIUS + 16);
    }
  }

  minX -= PADDING;
  minY -= PADDING;
  maxX += PADDING;
  maxY += PADDING;
  const vw = maxX - minX;
  const vh = maxY - minY;

  // Stroke width scaling
  const baseStrokeWidth = vw > 2000 ? 2 : 1.5;

  // 2. Build marker defs
  const markerDefs = buildMarkerDefs(connectors);

  // 3. Render connectors
  const connectorElements: string[] = [];
  for (const c of connectors) {
    const defaults = getConnectorDefaults(c.kind);
    const color = c.color ?? defaults.color;
    const strokeWidth = c.strokeWidth ?? baseStrokeWidth;
    const lineStyle = c.lineStyle ?? defaults.lineStyle;
    const linePattern = c.linePattern ?? defaults.linePattern;
    const mStart = c.markerStart ?? defaults.markerStart;
    const mEnd = c.markerEnd ?? defaults.markerEnd;

    const srcInfo = getEndpointInfo(c, layoutBlocks, "source");
    const tgtInfo = getEndpointInfo(c, layoutBlocks, "target");
    const { d: pathD, pathPoints } = buildConnectorPath(
      srcInfo,
      tgtInfo,
      c.controlPoints,
      lineStyle
    );
    const dash = getDashArray(linePattern);

    let attrs = `d="${pathD}" fill="none" stroke="${esc(color)}" stroke-width="${strokeWidth}"`;
    if (dash) attrs += ` stroke-dasharray="${dash}"`;
    if (mStart && mStart !== "none") {
      attrs += ` marker-start="url(#${markerId(mStart, color)})"`;
    }
    if (mEnd && mEnd !== "none") {
      attrs += ` marker-end="url(#${markerId(mEnd, color)})"`;
    }

    connectorElements.push(`    <path ${attrs} />`);

    // Connector label
    if (c.label) {
      const mid = getPathMidpoint(pathPoints);
      const lx = mid.x + (c.labelOffsetX ?? 0);
      const ly = mid.y + (c.labelOffsetY ?? 0);
      // Include label in bounding box
      const labelWidth = c.label.length * 7 + 8;
      minX = Math.min(minX, lx - 4);
      maxX = Math.max(maxX, lx + labelWidth);
      connectorElements.push(
        `    <rect x="${lx - 4}" y="${ly - 12}" width="${labelWidth}" height="18" rx="2" fill="#ffffff" stroke="#e2e8f0" stroke-width="1" />` +
          `\n    <text x="${lx}" y="${ly}" font-size="11" font-family="${FONT_FAMILY}" font-weight="500" fill="#0f172a">${esc(c.label)}</text>`
      );
    }
  }

  // 4. Render blocks
  const blockElements: string[] = [];
  for (const b of layoutBlocks) {
    const kindStyle = BLOCK_STYLES[b.kind ?? ""] ?? BLOCK_STYLES.component;
    const bg = b.backgroundColor ?? kindStyle.fill;
    const bc = b.borderColor ?? kindStyle.stroke;
    const tc = b.textColor ?? kindStyle.text;
    const bw = b.borderWidth ?? 1;
    const br = b.borderRadius ?? 0;
    const fw = b.fontWeight ?? "600";

    // Open group with tooltip
    if (b.description) {
      blockElements.push(`    <g>`);
      blockElements.push(`      <title>${esc(b.description)}</title>`);
    }

    // Block rect
    blockElements.push(
      `    <rect x="${b.positionX}" y="${b.positionY}" width="${b.sizeWidth}" height="${b.sizeHeight}" rx="${br}" fill="${esc(bg)}" stroke="${esc(bc)}" stroke-width="${bw}" />`
    );

    // Stereotype (70% opacity for subtlety)
    const stereo = formatStereotype(b);
    blockElements.push(
      `    <text x="${b.positionX + b.sizeWidth / 2}" y="${b.positionY + 22}" font-size="${fontSize.stereo}" font-family="${FONT_FAMILY}" text-anchor="middle" fill="${esc(tc)}" opacity="0.7">${esc(stereo)}</text>`
    );

    // Block name
    blockElements.push(
      `    <text x="${b.positionX + b.sizeWidth / 2}" y="${b.positionY + 22 + fontSize.name + 4}" font-size="${fontSize.name}" font-family="${FONT_FAMILY}" font-weight="${fw}" text-anchor="middle" fill="${esc(tc)}">${esc(b.name)}</text>`
    );

    // Description compartment
    const headerHeight = 22 + fontSize.name + 10; // stereo top offset + name height + gap
    const usableHeight = b.sizeHeight - headerHeight;
    if (b.description && usableHeight > 30) {
      const sepY = b.positionY + headerHeight;
      blockElements.push(
        `    <line x1="${b.positionX}" y1="${sepY}" x2="${b.positionX + b.sizeWidth}" y2="${sepY}" stroke="${esc(bc)}" stroke-width="1" />`
      );
      const lines = wrapText(b.description, b.sizeWidth, fontSize.desc);
      const maxLines = Math.min(lines.length, Math.floor((usableHeight - 10) / 16));
      for (let i = 0; i < maxLines; i++) {
        blockElements.push(
          `    <text x="${b.positionX + 12}" y="${sepY + 18 + i * 16}" font-size="${fontSize.desc}" font-family="'Courier New', monospace" fill="#64748b">${esc(lines[i])}</text>`
        );
      }
    }

    // Close group if tooltip was opened
    if (b.description) {
      blockElements.push(`    </g>`);
    }

    // Ports
    const visiblePorts = (b.ports ?? []).filter((p) => !p.hidden);
    const byEdge = groupPortsByEdge(visiblePorts);
    for (const [, edgePorts] of Object.entries(byEdge)) {
      edgePorts.forEach((port, idx) => {
        const pos = getPortAbsolutePosition(b, port, idx, edgePorts.length);
        blockElements.push(`    ${renderPortShape(pos, port)}`);
        const lbl = renderPortLabel(pos, port, b.sizeWidth);
        if (lbl) blockElements.push(`    ${lbl}`);
      });
    }
  }

  // 5. Assemble SVG
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX} ${minY} ${vw} ${vh}" width="100%" preserveAspectRatio="xMidYMid meet" style="font-family: ${FONT_FAMILY}">`,
    `  <defs>`,
    `    ${markerDefs}`,
    `  </defs>`,
    `  <!-- Connectors -->`,
    ...connectorElements,
    `  <!-- Blocks -->`,
    ...blockElements,
    `</svg>`,
  ].join("\n");
}
