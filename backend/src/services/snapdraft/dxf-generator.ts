import Drawing from 'dxf-writer';
import type { DrawingSpec, Entity, Dimension } from './validation.js';

export class DXFGenerator {
  /**
   * Generate DXF file from drawing specification
   */
  async generate(spec: DrawingSpec): Promise<Buffer> {
    const dxf = new Drawing();

    // Set document units
    dxf.setUnits(spec.metadata.units === 'mm' ? 'Millimeters' : 'Inches');

    // Add layers with proper settings
    this.addLayers(dxf, spec);

    // Sort entities for determinism (layer, type, coordinates)
    const sortedEntities = this.sortEntities([...spec.entities]);

    // Add entities
    for (const entity of sortedEntities) {
      this.addEntity(dxf, entity);
    }

    // Add dimensions
    if (spec.dimensions) {
      for (const dimension of spec.dimensions) {
        this.addDimension(dxf, dimension);
      }
    }

    // Add annotations
    if (spec.annotations) {
      for (const annotation of spec.annotations) {
        this.addAnnotation(dxf, annotation);
      }
    }

    // Add title block
    this.addTitleBlock(dxf, spec);

    // Generate DXF string and convert to buffer
    const dxfString = dxf.toDxfString();
    return Buffer.from(dxfString, 'utf-8');
  }

  /**
   * Add layers to DXF document
   */
  private addLayers(dxf: Drawing, spec: DrawingSpec): void {
    for (const [layerName, layerDef] of Object.entries(spec.drawingLayers)) {
      dxf.addLayer(layerName, layerDef.color, layerDef.linetype);
    }
  }

  /**
   * Add an entity to the DXF document
   */
  private addEntity(dxf: any, entity: Entity): void {
    // Set active layer before drawing
    if (entity.layer) {
      dxf.setActiveLayer(entity.layer);
    }

    switch (entity.type) {
      case 'LWPOLYLINE':
        dxf.drawPolyline(
          entity.points,
          entity.closed
        );
        break;

      case 'LINE':
        dxf.drawLine(
          entity.p1[0], entity.p1[1],
          entity.p2[0], entity.p2[1]
        );
        break;

      case 'CIRCLE':
        dxf.drawCircle(
          entity.center[0],
          entity.center[1],
          entity.radius
        );
        break;

      case 'ARC':
        dxf.drawArc(
          entity.center[0],
          entity.center[1],
          entity.radius,
          entity.startAngle,
          entity.endAngle
        );
        break;

      case 'TEXT':
        dxf.drawText(
          entity.insert[0],
          entity.insert[1],
          entity.height,
          entity.rotation || 0,
          entity.text
        );
        break;

      case 'MTEXT':
        // dxf-writer doesn't have native MTEXT, use TEXT as fallback
        dxf.drawText(
          entity.insert[0],
          entity.insert[1],
          entity.height,
          entity.rotation || 0,
          entity.text
        );
        break;

      case 'ELLIPSE':
        // dxf-writer may not support ellipse, approximate with spline or polyline
        // For now, skip or convert to circle if ratio is 1
        if (Math.abs(entity.ratio - 1.0) < 0.01) {
          const majorAxisLength = Math.sqrt(entity.majorAxis[0] ** 2 + entity.majorAxis[1] ** 2);
          dxf.drawCircle(
            entity.center[0],
            entity.center[1],
            majorAxisLength
          );
        }
        break;
    }
  }

  /**
   * Add a dimension to the DXF document
   * Note: dxf-writer has limited dimension support, so we draw dimension lines and text manually
   */
  private addDimension(dxf: any, dimension: Dimension): void {
    if (dimension.layer) {
      dxf.setActiveLayer(dimension.layer);
    }

    switch (dimension.type) {
      case 'ALIGNED':
      case 'LINEAR': {
        // Draw dimension line above/below the measured points
        const dx = dimension.p2[0] - dimension.p1[0];
        const dy = dimension.p2[1] - dimension.p1[1];
        const length = Math.sqrt(dx * dx + dy * dy);
        const angle = Math.atan2(dy, dx);
        const offsetAngle = angle + Math.PI / 2;

        const offset = dimension.offset || 10;
        const p1x = dimension.p1[0] + Math.cos(offsetAngle) * offset;
        const p1y = dimension.p1[1] + Math.sin(offsetAngle) * offset;
        const p2x = dimension.p2[0] + Math.cos(offsetAngle) * offset;
        const p2y = dimension.p2[1] + Math.sin(offsetAngle) * offset;

        // Dimension line
        dxf.drawLine(p1x, p1y, p2x, p2y);

        // Extension lines
        dxf.drawLine(dimension.p1[0], dimension.p1[1], p1x, p1y);
        dxf.drawLine(dimension.p2[0], dimension.p2[1], p2x, p2y);

        // Text at midpoint
        const midX = (p1x + p2x) / 2;
        const midY = (p1y + p2y) / 2;
        dxf.drawText(midX, midY, 2.5, angle * 180 / Math.PI, dimension.text);
        break;
      }

      case 'RADIAL': {
        // Radial dimensions (for radius)
        const angle = dimension.angle || 0;
        const textX = dimension.center[0] + dimension.radius * Math.cos(angle);
        const textY = dimension.center[1] + dimension.radius * Math.sin(angle);
        dxf.drawText(textX, textY, 2.5, 0, `R${dimension.text}`);
        break;
      }

      case 'DIAMETER': {
        // Diameter dimensions
        const angle = dimension.angle || 0;
        const textX = dimension.center[0] + dimension.radius * Math.cos(angle);
        const textY = dimension.center[1] + dimension.radius * Math.sin(angle);
        dxf.drawText(textX, textY, 2.5, 0, `Ø${dimension.text}`);
        break;
      }
    }
  }

  /**
   * Add an annotation to the DXF document
   */
  private addAnnotation(dxf: any, annotation: any): void {
    if (annotation.layer) {
      dxf.setActiveLayer(annotation.layer);
    }

    if (annotation.type === 'LEADER') {
      // Draw leader line
      for (let i = 0; i < annotation.points.length - 1; i++) {
        dxf.drawLine(
          annotation.points[i][0], annotation.points[i][1],
          annotation.points[i + 1][0], annotation.points[i + 1][1]
        );
      }
      // Add text at last point
      const lastPoint = annotation.points[annotation.points.length - 1];
      dxf.drawText(
        lastPoint[0],
        lastPoint[1],
        2.5,
        0,
        annotation.text
      );
    } else if (annotation.type === 'NOTE') {
      dxf.drawText(
        annotation.insert[0],
        annotation.insert[1],
        2.5,
        0,
        annotation.text
      );
    }
  }

  /**
   * Add title block to DXF document
   */
  private addTitleBlock(dxf: any, spec: DrawingSpec): void {
    const tb = spec.titleBlock;
    const fields = tb.fields;

    // Get paper dimensions (simplified, in mm)
    const paperSizes: Record<string, [number, number]> = {
      'A4': [297, 210],
      'A3': [420, 297],
      'A2': [594, 420],
      'A1': [841, 594],
      'A0': [1189, 841],
      'LETTER': [279.4, 215.9],
      'TABLOID': [431.8, 279.4],
      'LEGAL': [355.6, 215.9],
    };

    let [width, height] = paperSizes[tb.paper] || [297, 210];
    if (tb.orientation === 'portrait' && width > height) {
      [width, height] = [height, width];
    }

    // Draw title block border (bottom right corner)
    const margin = 10;
    const tbWidth = 180;
    const tbHeight = 50;
    const tbX = width - margin - tbWidth;
    const tbY = margin;

    // Set TEXT layer for title block
    dxf.setActiveLayer('TEXT');

    // Border (drawRect takes x1, y1, x2, y2)
    dxf.drawRect(tbX, tbY, tbX + tbWidth, tbY + tbHeight);

    // Dividing lines
    dxf.drawLine(tbX, tbY + 30, tbX + tbWidth, tbY + 30);
    dxf.drawLine(tbX, tbY + 20, tbX + tbWidth, tbY + 20);
    dxf.drawLine(tbX + 90, tbY, tbX + 90, tbY + 30);

    // Title
    dxf.drawText(tbX + 5, tbY + 35, 4, 0, fields.TITLE || '');

    // Drawing number
    dxf.drawText(tbX + 5, tbY + 24, 2.5, 0, `DWG NO: ${fields.DRAWING_NO}`);

    // Scale
    dxf.drawText(tbX + 5, tbY + 14, 2.5, 0, `SCALE: ${fields.SCALE}`);

    // Date and revision
    dxf.drawText(tbX + 95, tbY + 24, 2.5, 0, `DATE: ${fields.DATE}`);
    dxf.drawText(tbX + 95, tbY + 14, 2.5, 0, `REV: ${fields.REVISION}`);

    // Drawn by
    dxf.drawText(tbX + 5, tbY + 4, 2.5, 0, `DRAWN: ${fields.DRAWN_BY}`);

    // Sheet
    if (fields.SHEET) {
      dxf.drawText(tbX + 95, tbY + 4, 2.5, 0, `SHEET: ${fields.SHEET}`);
    }
  }

  /**
   * Sort entities for deterministic output
   */
  private sortEntities(entities: Entity[]): Entity[] {
    return entities.sort((a, b) => {
      // Sort by layer first
      if (a.layer !== b.layer) {
        return a.layer.localeCompare(b.layer);
      }
      // Then by type
      if (a.type !== b.type) {
        return a.type.localeCompare(b.type);
      }
      // Then by coordinates (first point)
      const aCoord = this.getFirstCoord(a);
      const bCoord = this.getFirstCoord(b);
      if (aCoord[0] !== bCoord[0]) {
        return aCoord[0] - bCoord[0];
      }
      return aCoord[1] - bCoord[1];
    });
  }

  /**
   * Get first coordinate from entity for sorting
   */
  private getFirstCoord(entity: Entity): [number, number] {
    switch (entity.type) {
      case 'LWPOLYLINE':
        return entity.points[0];
      case 'LINE':
        return entity.p1;
      case 'CIRCLE':
      case 'ARC':
      case 'ELLIPSE':
        return entity.center;
      case 'TEXT':
      case 'MTEXT':
        return entity.insert;
      default:
        return [0, 0];
    }
  }
}
