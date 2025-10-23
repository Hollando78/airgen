import { z } from 'zod';

// Layer definition schema
export const LayerDefSchema = z.object({
  color: z.number().int().min(1).max(255),
  lineweight: z.number().positive(),
  linetype: z.enum(['CONTINUOUS', 'HIDDEN', 'CENTER', 'DASHED', 'PHANTOM', 'DOT']),
});

// Entity schemas
export const PointSchema = z.tuple([z.number(), z.number()]);

export const LWPolylineEntitySchema = z.object({
  type: z.literal('LWPOLYLINE'),
  layer: z.string(),
  closed: z.boolean(),
  points: z.array(PointSchema).min(2),
  elevation: z.number().optional().default(0),
  annotations: z.record(z.string(), z.any()).optional(),
});

export const LineEntitySchema = z.object({
  type: z.literal('LINE'),
  layer: z.string(),
  p1: PointSchema,
  p2: PointSchema,
  annotations: z.record(z.string(), z.any()).optional(),
});

export const CircleEntitySchema = z.object({
  type: z.literal('CIRCLE'),
  layer: z.string(),
  center: PointSchema,
  radius: z.number().positive(),
  annotations: z.record(z.string(), z.any()).optional(),
});

export const ArcEntitySchema = z.object({
  type: z.literal('ARC'),
  layer: z.string(),
  center: PointSchema,
  radius: z.number().positive(),
  startAngle: z.number(),
  endAngle: z.number(),
  annotations: z.record(z.string(), z.any()).optional(),
});

export const TextEntitySchema = z.object({
  type: z.literal('TEXT'),
  layer: z.string(),
  insert: PointSchema,
  text: z.string(),
  height: z.number().positive(),
  rotation: z.number().optional().default(0),
  annotations: z.record(z.string(), z.any()).optional(),
});

export const MTextEntitySchema = z.object({
  type: z.literal('MTEXT'),
  layer: z.string(),
  insert: PointSchema,
  text: z.string(),
  height: z.number().positive(),
  width: z.number().positive().optional(),
  rotation: z.number().optional().default(0),
  annotations: z.record(z.string(), z.any()).optional(),
});

export const EllipseEntitySchema = z.object({
  type: z.literal('ELLIPSE'),
  layer: z.string(),
  center: PointSchema,
  majorAxis: PointSchema,
  ratio: z.number().positive(),
  startAngle: z.number().optional().default(0),
  endAngle: z.number().optional().default(Math.PI * 2),
  annotations: z.record(z.string(), z.any()).optional(),
});

export const EntitySchema = z.discriminatedUnion('type', [
  LWPolylineEntitySchema,
  LineEntitySchema,
  CircleEntitySchema,
  ArcEntitySchema,
  TextEntitySchema,
  MTextEntitySchema,
  EllipseEntitySchema,
]);

// Dimension schemas
export const AlignedDimensionSchema = z.object({
  type: z.literal('ALIGNED'),
  layer: z.string(),
  p1: PointSchema,
  p2: PointSchema,
  offset: z.number(),
  text: z.string(),
  tolerance: z.object({
    upper: z.number(),
    lower: z.number(),
  }).optional(),
});

export const LinearDimensionSchema = z.object({
  type: z.literal('LINEAR'),
  layer: z.string(),
  p1: PointSchema,
  p2: PointSchema,
  offset: z.number(),
  text: z.string(),
  angle: z.number().optional().default(0),
  tolerance: z.object({
    upper: z.number(),
    lower: z.number(),
  }).optional(),
});

export const RadialDimensionSchema = z.object({
  type: z.literal('RADIAL'),
  layer: z.string(),
  center: PointSchema,
  radius: z.number().positive(),
  angle: z.number(),
  text: z.string(),
});

export const DiameterDimensionSchema = z.object({
  type: z.literal('DIAMETER'),
  layer: z.string(),
  center: PointSchema,
  radius: z.number().positive(),
  angle: z.number(),
  text: z.string(),
});

export const DimensionSchema = z.discriminatedUnion('type', [
  AlignedDimensionSchema,
  LinearDimensionSchema,
  RadialDimensionSchema,
  DiameterDimensionSchema,
]);

// Annotation schemas
export const LeaderAnnotationSchema = z.object({
  type: z.literal('LEADER'),
  points: z.array(PointSchema).min(2),
  text: z.string(),
  layer: z.string(),
});

export const NoteAnnotationSchema = z.object({
  type: z.literal('NOTE'),
  insert: PointSchema,
  text: z.string(),
  layer: z.string().optional().default('TEXT'),
});

export const AnnotationSchema = z.discriminatedUnion('type', [
  LeaderAnnotationSchema,
  NoteAnnotationSchema,
]);

// Viewport schema
export const ViewportSchema = z.object({
  name: z.string(),
  bounds: z.object({
    minX: z.number(),
    minY: z.number(),
    maxX: z.number(),
    maxY: z.number(),
  }),
  position: z.object({
    x: z.number(),
    y: z.number(),
  }),
});

// Title block schema
export const TitleBlockSchema = z.object({
  paper: z.enum(['A4', 'A3', 'A2', 'A1', 'A0', 'LETTER', 'TABLOID', 'LEGAL']),
  orientation: z.enum(['landscape', 'portrait']),
  fields: z.object({
    TITLE: z.string(),
    DRAWING_NO: z.string(),
    SCALE: z.string(),
    DATE: z.string(),
    DRAWN_BY: z.string(),
    CHECKED_BY: z.string().optional(),
    APPROVED_BY: z.string().optional(),
    REVISION: z.string(),
    SHEET: z.string().optional().default('1 of 1'),
    COMPANY: z.string().optional(),
    PROJECT: z.string().optional(),
  }),
});

// Main drawing spec schema
export const DrawingSpecSchema = z.object({
  metadata: z.object({
    title: z.string(),
    elementType: z.enum(['Block', 'Interface']),
    elementId: z.string().min(1),
    generatedAt: z.string().datetime(),
    units: z.enum(['mm', 'in']),
    scale: z.string(),
    standard: z.enum(['ISO128', 'AIA', 'IEEE315', 'ASME_Y14']),
    revision: z.string(),
  }),
  drawingLayers: z.record(z.string(), LayerDefSchema),
  entities: z.array(EntitySchema),
  dimensions: z.array(DimensionSchema).optional().default([]),
  annotations: z.array(AnnotationSchema).optional().default([]),
  titleBlock: TitleBlockSchema,
  viewports: z.array(ViewportSchema).optional().default([]),
  reasoning: z.object({
    dimensionsAssumed: z.array(z.string()),
    portsPlaced: z.array(z.string()).optional().default([]),
    warnings: z.array(z.string()),
  }),
});

// API request/response schemas
export const GenerateRequestSchema = z.object({
  elementId: z.string().min(1),
  elementType: z.enum(['block', 'interface']),
  contextDocuments: z.array(z.string()).optional().default([]),
  contextRequirements: z.array(z.string()).optional().default([]),
  referenceDiagrams: z.array(z.string()).optional().default([]),
  style: z.enum(['engineering', 'architectural', 'schematic']).default('engineering'),
  outputs: z.array(z.enum(['dxf', 'svg'])).default(['dxf', 'svg']),
  options: z.object({
    units: z.enum(['mm', 'in']).default('mm'),
    scale: z.string().default('1:1'),
    paper: z.enum(['A4', 'A3', 'A2', 'A1', 'A0', 'LETTER', 'TABLOID', 'LEGAL']).default('A4'),
    orientation: z.enum(['landscape', 'portrait']).default('landscape'),
  }).optional(),
  forcedMode: z.enum(['technical_drawing', 'visualization']).optional(),
});

// Drawing response (technical CAD drawing)
export const DrawingResponseSchema = z.object({
  drawingId: z.string().uuid(),
  mode: z.literal('technical_drawing'),
  specJson: DrawingSpecSchema,
  files: z.object({
    dxf: z.string().optional(),
    svg: z.string().optional(),
  }),
  reasoning: z.object({
    dimensionsAssumed: z.array(z.string()),
    warnings: z.array(z.string()),
  }),
});

// Visualization response (LLM-generated image)
export const VisualizationResponseSchema = z.object({
  drawingId: z.string().uuid(),
  mode: z.literal('visualization'),
  visualizationType: z.enum(['dalle', 'svg']),
  files: z.object({
    png: z.string().optional(),
    svg: z.string().optional(),
  }),
  prompt: z.string(),
  revisedPrompt: z.string().optional(),
  reasoning: z.object({
    whyNotDrawing: z.array(z.string()),
    suitabilityScore: z.number().min(0).max(10),
  }),
});

// Discriminated union for API responses
export const GenerateResponseSchema = z.discriminatedUnion('mode', [
  DrawingResponseSchema,
  VisualizationResponseSchema,
]);

// Analysis response (mode decision before generation)
export const AnalysisResponseSchema = z.object({
  mode: z.enum(['technical_drawing', 'visualization']),
  visualizationType: z.enum(['dalle', 'svg']).optional(),
  reasoning: z.string(),
  suitabilityScore: z.number().min(0).max(10),
  issues: z.array(z.string()),
});

// Type exports
export type LayerDef = z.infer<typeof LayerDefSchema>;
export type Point = z.infer<typeof PointSchema>;
export type Entity = z.infer<typeof EntitySchema>;
export type Dimension = z.infer<typeof DimensionSchema>;
export type Annotation = z.infer<typeof AnnotationSchema>;
export type Viewport = z.infer<typeof ViewportSchema>;
export type TitleBlock = z.infer<typeof TitleBlockSchema>;
export type DrawingSpec = z.infer<typeof DrawingSpecSchema>;
export type GenerateRequest = z.infer<typeof GenerateRequestSchema>;
export type DrawingResponse = z.infer<typeof DrawingResponseSchema>;
export type VisualizationResponse = z.infer<typeof VisualizationResponseSchema>;
export type GenerateResponse = z.infer<typeof GenerateResponseSchema>;
export type AnalysisResponse = z.infer<typeof AnalysisResponseSchema>;

// Validation helper
export function validateDrawingSpec(data: unknown): DrawingSpec {
  return DrawingSpecSchema.parse(data);
}
