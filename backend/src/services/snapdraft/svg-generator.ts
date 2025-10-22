import type { DrawingSpec, Entity, Dimension, Annotation } from './validation.js';

interface BBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export class SVGGenerator {
  /**
   * Generate SVG preview from drawing specification
   */
  async generate(spec: DrawingSpec): Promise<Buffer> {
    // Calculate bounding box
    const bbox = this.calculateBBox(spec.entities);
    const margin = 20;
    const width = bbox.maxX - bbox.minX + 2 * margin;
    const height = bbox.maxY - bbox.minY + 2 * margin;

    // Start SVG
    let svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}mm" height="${height}mm" viewBox="${bbox.minX - margin} ${bbox.minY - margin} ${width} ${height}">
  <defs>
    ${this.generateLineTypeDefs(spec.drawingLayers)}
  </defs>
  <g id="drawing" transform="scale(1,-1) translate(0,${-(bbox.minY + bbox.maxY)})">`;

    // Render entities by layer (for proper ordering)
    const layers = Object.keys(spec.drawingLayers);
    for (const layerName of layers) {
      const layerEntities = spec.entities.filter(e => e.layer === layerName);
      if (layerEntities.length > 0) {
        const layerDef = spec.drawingLayers[layerName];
        svg += `\n    <g id="layer-${layerName}">`;

        for (const entity of layerEntities) {
          svg += this.renderEntity(entity, layerDef);
        }

        svg += `\n    </g>`;
      }
    }

    // Render dimensions
    if (spec.dimensions && spec.dimensions.length > 0) {
      svg += `\n    <g id="dimensions">`;
      for (const dimension of spec.dimensions) {
        svg += this.renderDimension(dimension, spec.drawingLayers[dimension.layer]);
      }
      svg += `\n    </g>`;
    }

    // Render annotations
    if (spec.annotations && spec.annotations.length > 0) {
      svg += `\n    <g id="annotations">`;
      for (const annotation of spec.annotations) {
        svg += this.renderAnnotation(annotation);
      }
      svg += `\n    </g>`;
    }

    svg += `\n  </g>
</svg>`;

    return Buffer.from(svg, 'utf-8');
  }

  /**
   * Generate SVG line type definitions (dashed, dotted, etc.)
   */
  private generateLineTypeDefs(layers: Record<string, any>): string {
    const defs: string[] = [];

    const lineTypes: Record<string, string> = {
      'CONTINUOUS': '',
      'HIDDEN': '5,3',
      'CENTER': '10,3,2,3',
      'DASHED': '10,5',
      'PHANTOM': '15,3,2,3,2,3',
      'DOT': '2,2',
    };

    for (const [type, pattern] of Object.entries(lineTypes)) {
      if (pattern) {
        defs.push(`    <strokeDasharray id="${type.toLowerCase()}">${pattern}</strokeDasharray>`);
      }
    }

    return defs.join('\n');
  }

  /**
   * Render an entity as SVG
   */
  private renderEntity(entity: Entity, layerDef: any): string {
    const color = this.colorToHex(layerDef.color);
    const strokeWidth = layerDef.lineweight;
    const dashArray = this.getStrokeDashArray(layerDef.linetype);

    switch (entity.type) {
      case 'LWPOLYLINE': {
        const points = entity.points.map(p => `${p[0]},${p[1]}`).join(' ');
        return `\n      <polyline points="${points}" fill="none" stroke="${color}" stroke-width="${strokeWidth}" ${dashArray} ${entity.closed ? 'stroke-linejoin="miter"' : ''}/>`;
      }

      case 'LINE': {
        return `\n      <line x1="${entity.p1[0]}" y1="${entity.p1[1]}" x2="${entity.p2[0]}" y2="${entity.p2[1]}" stroke="${color}" stroke-width="${strokeWidth}" ${dashArray}/>`;
      }

      case 'CIRCLE': {
        return `\n      <circle cx="${entity.center[0]}" cy="${entity.center[1]}" r="${entity.radius}" fill="none" stroke="${color}" stroke-width="${strokeWidth}" ${dashArray}/>`;
      }

      case 'ARC': {
        const startX = entity.center[0] + entity.radius * Math.cos(entity.startAngle * Math.PI / 180);
        const startY = entity.center[1] + entity.radius * Math.sin(entity.startAngle * Math.PI / 180);
        const endX = entity.center[0] + entity.radius * Math.cos(entity.endAngle * Math.PI / 180);
        const endY = entity.center[1] + entity.radius * Math.sin(entity.endAngle * Math.PI / 180);
        const largeArcFlag = (entity.endAngle - entity.startAngle) > 180 ? 1 : 0;

        return `\n      <path d="M ${startX},${startY} A ${entity.radius},${entity.radius} 0 ${largeArcFlag} 1 ${endX},${endY}" fill="none" stroke="${color}" stroke-width="${strokeWidth}" ${dashArray}/>`;
      }

      case 'ELLIPSE': {
        const majorAxisLength = Math.sqrt(entity.majorAxis[0] ** 2 + entity.majorAxis[1] ** 2);
        const minorAxisLength = majorAxisLength * entity.ratio;
        const rotation = Math.atan2(entity.majorAxis[1], entity.majorAxis[0]) * 180 / Math.PI;

        return `\n      <ellipse cx="${entity.center[0]}" cy="${entity.center[1]}" rx="${majorAxisLength}" ry="${minorAxisLength}" transform="rotate(${rotation} ${entity.center[0]} ${entity.center[1]})" fill="none" stroke="${color}" stroke-width="${strokeWidth}" ${dashArray}/>`;
      }

      case 'TEXT':
      case 'MTEXT': {
        // Text needs to be flipped back because of the parent transform
        return `\n      <text x="${entity.insert[0]}" y="${entity.insert[1]}" font-size="${entity.height}" fill="${color}" transform="scale(1,-1) translate(0,${-2 * entity.insert[1]}) rotate(${-entity.rotation} ${entity.insert[0]} ${entity.insert[1]})">${this.escapeXml(entity.text)}</text>`;
      }

      default:
        return '';
    }
  }

  /**
   * Render a dimension as SVG
   */
  private renderDimension(dimension: Dimension, layerDef: any): string {
    const color = this.colorToHex(layerDef.color);
    const strokeWidth = layerDef.lineweight || 0.25;

    let svg = '';

    switch (dimension.type) {
      case 'ALIGNED':
      case 'LINEAR': {
        const p1 = dimension.p1;
        const p2 = dimension.p2;
        const offset = dimension.offset;

        // Calculate dimension line direction
        const dx = p2[0] - p1[0];
        const dy = p2[1] - p1[1];
        const length = Math.sqrt(dx * dx + dy * dy);
        const angle = Math.atan2(dy, dx);

        // Offset perpendicular to dimension line
        const perpAngle = angle + Math.PI / 2;
        const offsetX = offset * Math.cos(perpAngle);
        const offsetY = offset * Math.sin(perpAngle);

        const dimP1 = [p1[0] + offsetX, p1[1] + offsetY];
        const dimP2 = [p2[0] + offsetX, p2[1] + offsetY];

        // Extension lines
        svg += `\n      <line x1="${p1[0]}" y1="${p1[1]}" x2="${dimP1[0]}" y2="${dimP1[1]}" stroke="${color}" stroke-width="${strokeWidth}"/>`;
        svg += `\n      <line x1="${p2[0]}" y1="${p2[1]}" x2="${dimP2[0]}" y2="${dimP2[1]}" stroke="${color}" stroke-width="${strokeWidth}"/>`;

        // Dimension line
        svg += `\n      <line x1="${dimP1[0]}" y1="${dimP1[1]}" x2="${dimP2[0]}" y2="${dimP2[1]}" stroke="${color}" stroke-width="${strokeWidth}"/>`;

        // Arrowheads
        const arrowSize = 2;
        svg += this.drawArrow(dimP1, angle + Math.PI, arrowSize, color, strokeWidth);
        svg += this.drawArrow(dimP2, angle, arrowSize, color, strokeWidth);

        // Text
        const textX = (dimP1[0] + dimP2[0]) / 2;
        const textY = (dimP1[1] + dimP2[1]) / 2;
        svg += `\n      <text x="${textX}" y="${textY}" font-size="2.5" fill="${color}" text-anchor="middle" transform="scale(1,-1) translate(0,${-2 * textY})">${this.escapeXml(dimension.text)}</text>`;
        break;
      }

      case 'RADIAL': {
        const center = dimension.center;
        const radius = dimension.radius;
        const angle = dimension.angle;
        const textX = center[0] + radius * Math.cos(angle);
        const textY = center[1] + radius * Math.sin(angle);

        // Leader line
        svg += `\n      <line x1="${center[0]}" y1="${center[1]}" x2="${textX}" y2="${textY}" stroke="${color}" stroke-width="${strokeWidth}"/>`;

        // Text
        svg += `\n      <text x="${textX}" y="${textY}" font-size="2.5" fill="${color}" text-anchor="start" transform="scale(1,-1) translate(0,${-2 * textY})">R${this.escapeXml(dimension.text)}</text>`;
        break;
      }

      case 'DIAMETER': {
        const center = dimension.center;
        const radius = dimension.radius;
        const angle = dimension.angle;
        const textX = center[0] + radius * Math.cos(angle);
        const textY = center[1] + radius * Math.sin(angle);

        // Leader line
        svg += `\n      <line x1="${center[0] - radius * Math.cos(angle)}" y1="${center[1] - radius * Math.sin(angle)}" x2="${textX}" y2="${textY}" stroke="${color}" stroke-width="${strokeWidth}"/>`;

        // Text
        svg += `\n      <text x="${textX}" y="${textY}" font-size="2.5" fill="${color}" text-anchor="start" transform="scale(1,-1) translate(0,${-2 * textY})">Ø${this.escapeXml(dimension.text)}</text>`;
        break;
      }
    }

    return svg;
  }

  /**
   * Render an annotation as SVG
   */
  private renderAnnotation(annotation: Annotation): string {
    let svg = '';
    const color = '#0000FF'; // Blue for annotations

    if (annotation.type === 'LEADER') {
      // Draw leader line
      for (let i = 0; i < annotation.points.length - 1; i++) {
        svg += `\n      <line x1="${annotation.points[i][0]}" y1="${annotation.points[i][1]}" x2="${annotation.points[i + 1][0]}" y2="${annotation.points[i + 1][1]}" stroke="${color}" stroke-width="0.25"/>`;
      }
      // Text at last point
      const lastPoint = annotation.points[annotation.points.length - 1];
      svg += `\n      <text x="${lastPoint[0]}" y="${lastPoint[1]}" font-size="2.5" fill="${color}" transform="scale(1,-1) translate(0,${-2 * lastPoint[1]})">${this.escapeXml(annotation.text)}</text>`;
    } else if (annotation.type === 'NOTE') {
      svg += `\n      <text x="${annotation.insert[0]}" y="${annotation.insert[1]}" font-size="2.5" fill="${color}" transform="scale(1,-1) translate(0,${-2 * annotation.insert[1]})">${this.escapeXml(annotation.text)}</text>`;
    }

    return svg;
  }

  /**
   * Draw arrowhead
   */
  private drawArrow(point: number[], angle: number, size: number, color: string, strokeWidth: number): string {
    const x1 = point[0] + size * Math.cos(angle + Math.PI / 6);
    const y1 = point[1] + size * Math.sin(angle + Math.PI / 6);
    const x2 = point[0] + size * Math.cos(angle - Math.PI / 6);
    const y2 = point[1] + size * Math.sin(angle - Math.PI / 6);

    return `\n      <polygon points="${point[0]},${point[1]} ${x1},${y1} ${x2},${y2}" fill="${color}" stroke="none"/>`;
  }

  /**
   * Calculate bounding box of all entities
   */
  private calculateBBox(entities: Entity[]): BBox {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const entity of entities) {
      const bbox = this.getEntityBBox(entity);
      minX = Math.min(minX, bbox.minX);
      minY = Math.min(minY, bbox.minY);
      maxX = Math.max(maxX, bbox.maxX);
      maxY = Math.max(maxY, bbox.maxY);
    }

    // If no entities, default bbox
    if (!isFinite(minX)) {
      return { minX: 0, minY: 0, maxX: 100, maxY: 100 };
    }

    return { minX, minY, maxX, maxY };
  }

  /**
   * Get bounding box of a single entity
   */
  private getEntityBBox(entity: Entity): BBox {
    switch (entity.type) {
      case 'LWPOLYLINE': {
        const xs = entity.points.map(p => p[0]);
        const ys = entity.points.map(p => p[1]);
        return {
          minX: Math.min(...xs),
          minY: Math.min(...ys),
          maxX: Math.max(...xs),
          maxY: Math.max(...ys),
        };
      }

      case 'LINE': {
        return {
          minX: Math.min(entity.p1[0], entity.p2[0]),
          minY: Math.min(entity.p1[1], entity.p2[1]),
          maxX: Math.max(entity.p1[0], entity.p2[0]),
          maxY: Math.max(entity.p1[1], entity.p2[1]),
        };
      }

      case 'CIRCLE':
      case 'ARC': {
        return {
          minX: entity.center[0] - entity.radius,
          minY: entity.center[1] - entity.radius,
          maxX: entity.center[0] + entity.radius,
          maxY: entity.center[1] + entity.radius,
        };
      }

      case 'ELLIPSE': {
        const majorAxisLength = Math.sqrt(entity.majorAxis[0] ** 2 + entity.majorAxis[1] ** 2);
        const minorAxisLength = majorAxisLength * entity.ratio;
        const maxRadius = Math.max(majorAxisLength, minorAxisLength);
        return {
          minX: entity.center[0] - maxRadius,
          minY: entity.center[1] - maxRadius,
          maxX: entity.center[0] + maxRadius,
          maxY: entity.center[1] + maxRadius,
        };
      }

      case 'TEXT':
      case 'MTEXT': {
        // Approximate text bbox
        const approxWidth = entity.text.length * entity.height * 0.6;
        return {
          minX: entity.insert[0],
          minY: entity.insert[1] - entity.height,
          maxX: entity.insert[0] + approxWidth,
          maxY: entity.insert[1],
        };
      }

      default:
        return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
    }
  }

  /**
   * Convert AutoCAD color index to hex
   */
  private colorToHex(acadColor: number): string {
    const colors: Record<number, string> = {
      1: '#FF0000', // Red
      2: '#FFFF00', // Yellow
      3: '#00FF00', // Green
      4: '#00FFFF', // Cyan
      5: '#0000FF', // Blue
      6: '#FF00FF', // Magenta
      7: '#FFFFFF', // White
      8: '#808080', // Gray
    };
    return colors[acadColor] || '#FFFFFF';
  }

  /**
   * Get stroke dash array for linetype
   */
  private getStrokeDashArray(linetype: string): string {
    const patterns: Record<string, string> = {
      'CONTINUOUS': '',
      'HIDDEN': 'stroke-dasharray="5,3"',
      'CENTER': 'stroke-dasharray="10,3,2,3"',
      'DASHED': 'stroke-dasharray="10,5"',
      'PHANTOM': 'stroke-dasharray="15,3,2,3,2,3"',
      'DOT': 'stroke-dasharray="2,2"',
    };
    return patterns[linetype] || '';
  }

  /**
   * Escape XML special characters
   */
  private escapeXml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }
}
