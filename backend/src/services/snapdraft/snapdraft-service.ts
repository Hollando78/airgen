import { randomUUID } from 'crypto';
import type { FastifyInstance } from 'fastify';
import { getPool } from '../../lib/postgres.js';
import { ContextBuilder } from './context-builder.js';
import { LLMGenerator } from './llm-generator.js';
import { DXFGenerator } from './dxf-generator.js';
import { SVGGenerator } from './svg-generator.js';
import { ModeAnalyzer } from './mode-analyzer.js';
import { VisualizationGenerator } from './visualization-generator.js';
import type { GenerateRequest, GenerateResponse, DrawingSpec, DrawingResponse, VisualizationResponse, AnalysisResponse } from './validation.js';
import fs from 'fs/promises';
import path from 'path';

export interface SnapDraftUser {
  id: string;
  tenantSlug: string;
  projectSlug?: string;
}

export class SnapDraftService {
  private contextBuilder: ContextBuilder;
  private llmGenerator: LLMGenerator;
  private dxfGenerator: DXFGenerator;
  private svgGenerator: SVGGenerator;
  private modeAnalyzer: ModeAnalyzer;
  private visualizationGenerator: VisualizationGenerator;
  private fastify: FastifyInstance;

  constructor(fastify: FastifyInstance) {
    this.fastify = fastify;
    this.contextBuilder = new ContextBuilder();
    this.llmGenerator = new LLMGenerator();
    this.dxfGenerator = new DXFGenerator();
    this.svgGenerator = new SVGGenerator();
    this.modeAnalyzer = new ModeAnalyzer();
    this.visualizationGenerator = new VisualizationGenerator();
  }

  /**
   * Analyze context and decide generation mode without full generation
   */
  async analyzeMode(request: GenerateRequest, user: SnapDraftUser): Promise<AnalysisResponse> {
    try {
      // 1. Build context from element + attached docs/diagrams
      const context = await this.contextBuilder.build(
        request,
        user.tenantSlug,
        user.projectSlug || 'default'
      );

      // 2. Get LLM API key from environment
      const openaiApiKey = process.env.LLM_API_KEY || process.env.OPENAI_API_KEY;
      if (!openaiApiKey) {
        throw new Error('LLM_API_KEY not configured');
      }

      // 3. Analyze context to decide mode
      this.fastify.log.info('Analyzing context for mode decision...');
      const modeDecision = await this.modeAnalyzer.analyze(context, openaiApiKey);
      this.fastify.log.info({
        msg: 'Mode analysis complete',
        mode: modeDecision.mode,
        visualizationType: modeDecision.visualizationType,
        suitabilityScore: modeDecision.suitabilityScore,
      });

      // 4. Return analysis result
      return {
        mode: modeDecision.mode,
        visualizationType: modeDecision.visualizationType,
        reasoning: modeDecision.reasoning,
        suitabilityScore: modeDecision.suitabilityScore,
        issues: modeDecision.issues,
      };
    } catch (error) {
      this.fastify.log.error({ err: error, msg: 'SnapDraft mode analysis failed' });
      throw error;
    }
  }

  /**
   * Generate SnapDraft drawing or visualization from request
   */
  async generate(request: GenerateRequest, user: SnapDraftUser): Promise<GenerateResponse> {
    const startTime = Date.now();

    try {
      // 1. Build context from element + attached docs/diagrams
      const context = await this.contextBuilder.build(
        request,
        user.tenantSlug,
        user.projectSlug || 'default'
      );

      // 2. Get LLM API key from environment (loaded from Docker secret via config.ts)
      const openaiApiKey = process.env.LLM_API_KEY || process.env.OPENAI_API_KEY;
      if (!openaiApiKey) {
        throw new Error('LLM_API_KEY not configured');
      }

      // 3. Determine mode (use forcedMode if provided, otherwise analyze)
      let modeDecision;
      if (request.forcedMode) {
        this.fastify.log.info(`Using forced mode: ${request.forcedMode}`);
        modeDecision = {
          mode: request.forcedMode,
          visualizationType: request.forcedMode === 'visualization' ? 'dalle' : undefined,
          reasoning: `User forced ${request.forcedMode} mode`,
          suitabilityScore: request.forcedMode === 'technical_drawing' ? 10 : 0,
          issues: [],
        };
      } else {
        // Analyze context to decide mode (technical drawing vs visualization)
        this.fastify.log.info('Analyzing context for mode decision...');
        modeDecision = await this.modeAnalyzer.analyze(context, openaiApiKey);
        this.fastify.log.info({
          msg: 'Mode decision made',
          mode: modeDecision.mode,
          visualizationType: modeDecision.visualizationType,
          suitabilityScore: modeDecision.suitabilityScore,
          reasoning: modeDecision.reasoning,
        });
      }

      // 4. Branch based on mode decision
      let response: GenerateResponse;
      if (modeDecision.mode === 'technical_drawing') {
        response = await this.generateDrawing(request, user, context, openaiApiKey);
      } else {
        response = await this.generateVisualization(request, user, context, openaiApiKey, modeDecision);
      }

      const latency = Date.now() - startTime;
      this.fastify.log.info(`SnapDraft generation completed in ${latency}ms (mode: ${modeDecision.mode})`);

      // 5. Log generation metrics (for debugging and cost tracking)
      await this.logGenerationMetrics(response.drawingId, latency);

      return response;
    } catch (error) {
      this.fastify.log.error({ err: error, msg: 'SnapDraft generation failed' });
      throw error;
    }
  }

  /**
   * Generate technical drawing (DXF/SVG from CAD spec)
   */
  private async generateDrawing(
    request: GenerateRequest,
    user: SnapDraftUser,
    context: any,
    openaiApiKey: string
  ): Promise<DrawingResponse> {
    // 1. Call LLM with SnapDraft prompt to generate drawing spec
    this.fastify.log.info('Generating drawing spec with LLM...');
    const drawingSpec = await this.llmGenerator.generate(context, openaiApiKey);

    // 2. Generate outputs
    const files: { dxf?: Buffer; svg?: Buffer } = {};

    if (request.outputs.includes('dxf')) {
      this.fastify.log.info('Generating DXF file...');
      files.dxf = await this.dxfGenerator.generate(drawingSpec);
    }

    if (request.outputs.includes('svg')) {
      this.fastify.log.info('Generating SVG preview...');
      files.svg = await this.svgGenerator.generate(drawingSpec);
    }

    // 3. Store in database + file system
    const drawingId = randomUUID();
    await this.storeDrawing(
      drawingId,
      request.elementId,
      request.elementType,
      user,
      drawingSpec,
      files,
      request.style
    );

    return {
      mode: 'technical_drawing',
      drawingId,
      specJson: drawingSpec,
      files: {
        dxf: files.dxf ? `/api/snapdraft/${user.tenantSlug}/${drawingId}/download/dxf` : undefined,
        svg: files.svg ? `/api/snapdraft/${user.tenantSlug}/${drawingId}/download/svg` : undefined,
      },
      reasoning: {
        dimensionsAssumed: drawingSpec.reasoning.dimensionsAssumed,
        warnings: drawingSpec.reasoning.warnings,
      },
    };
  }

  /**
   * Generate visualization (DALL-E PNG or SVG diagram)
   */
  private async generateVisualization(
    request: GenerateRequest,
    user: SnapDraftUser,
    context: any,
    openaiApiKey: string,
    modeDecision: any
  ): Promise<VisualizationResponse> {
    const visualizationType = modeDecision.visualizationType || 'svg'; // Default to SVG if not specified

    // 1. Generate visualization
    let visualizationResult;
    if (visualizationType === 'dalle') {
      this.fastify.log.info('Generating DALL-E visualization...');
      visualizationResult = await this.visualizationGenerator.generateDALLE(context, openaiApiKey);
    } else {
      this.fastify.log.info('Generating SVG visualization...');
      visualizationResult = await this.visualizationGenerator.generateSVG(context, openaiApiKey);
    }

    // 2. Store in database + file system
    const drawingId = randomUUID();
    await this.storeVisualization(
      drawingId,
      request.elementId,
      request.elementType,
      user,
      visualizationResult,
      request.style,
      modeDecision
    );

    return {
      mode: 'visualization',
      drawingId,
      visualizationType: visualizationResult.type,
      files: {
        png: visualizationResult.type === 'dalle'
          ? `/api/snapdraft/${user.tenantSlug}/${drawingId}/download/png`
          : undefined,
        svg: visualizationResult.type === 'svg'
          ? `/api/snapdraft/${user.tenantSlug}/${drawingId}/download/svg`
          : undefined,
      },
      prompt: visualizationResult.prompt,
      revisedPrompt: visualizationResult.revisedPrompt,
      reasoning: {
        whyNotDrawing: modeDecision.issues || [],
        suitabilityScore: modeDecision.suitabilityScore,
      },
    };
  }

  /**
   * Get generated file by drawing ID and format
   */
  async getFile(drawingId: string, format: 'dxf' | 'svg' | 'png' | 'json', userId: string, tenantSlug: string): Promise<{
    buffer: Buffer;
    mimeType: string;
    filename: string;
  }> {
    // Query database for drawing
    const pool = getPool();
    const result = await pool.query(
      `SELECT
        sd.element_id,
        sd.spec_json,
        sd.dxf_file_path,
        sd.svg_file_path,
        sd.png_file_path
      FROM snapdraft_drawings sd
      WHERE sd.id = $1 AND sd.tenant_slug = $2 AND sd.user_id = $3`,
      [drawingId, tenantSlug, userId]
    );

    if (result.rows.length === 0) {
      throw new Error('Drawing not found or access denied');
    }

    const drawing = result.rows[0];

    let buffer: Buffer;
    let mimeType: string;
    let filename: string;

    if (format === 'dxf') {
      if (!drawing.dxf_file_path) {
        throw new Error('DXF file not available for this drawing');
      }
      buffer = await fs.readFile(drawing.dxf_file_path);
      mimeType = 'application/dxf';
      filename = `snapdraft-${drawingId}.dxf`;
    } else if (format === 'svg') {
      if (!drawing.svg_file_path) {
        throw new Error('SVG file not available for this drawing');
      }
      buffer = await fs.readFile(drawing.svg_file_path);
      mimeType = 'image/svg+xml';
      filename = `snapdraft-${drawingId}.svg`;
    } else if (format === 'png') {
      if (!drawing.png_file_path) {
        throw new Error('PNG file not available for this drawing');
      }
      buffer = await fs.readFile(drawing.png_file_path);
      mimeType = 'image/png';
      filename = `snapdraft-${drawingId}.png`;
    } else if (format === 'json') {
      buffer = Buffer.from(JSON.stringify(drawing.spec_json, null, 2), 'utf-8');
      mimeType = 'application/json';
      filename = `snapdraft-${drawingId}.json`;
    } else {
      throw new Error('Invalid format');
    }

    return { buffer, mimeType, filename };
  }

  /**
   * Get drawing history for an element
   */
  async getHistory(elementId: string, userId: string, tenantSlug: string): Promise<Array<{
    drawingId: string;
    createdAt: string;
    style: string;
    outputs: string[];
  }>> {
    const pool = getPool();
    const result = await pool.query(
      `SELECT
        sd.id as drawing_id,
        sd.created_at,
        sd.style,
        ARRAY_REMOVE(ARRAY[
          CASE WHEN sd.dxf_file_path IS NOT NULL THEN 'dxf' END,
          CASE WHEN sd.svg_file_path IS NOT NULL THEN 'svg' END
        ], NULL) as outputs
      FROM snapdraft_drawings sd
      WHERE sd.element_id = $1
        AND sd.tenant_slug = $2
        AND sd.user_id = $3
      ORDER BY sd.created_at DESC
      LIMIT 10`,
      [elementId, tenantSlug, userId]
    );

    return result.rows.map((row: any) => ({
      drawingId: row.drawing_id,
      createdAt: row.created_at,
      style: row.style,
      outputs: row.outputs,
    }));
  }

  /**
   * Get available context for an element (documents, requirements, diagrams)
   */
  async getAvailableContext(
    elementId: string,
    elementType: 'block' | 'interface',
    tenantSlug: string,
    projectSlug: string
  ): Promise<{
    documents: Array<{ id: string; name: string; description?: string }>;
    requirements: Array<{ id: string; title: string; text?: string }>;
    diagrams: Array<{ id: string; name: string; description?: string }>;
  }> {
    const { getSession } = await import('../graph/driver.js');
    const session = getSession();

    try {
      // Query for linked documents, requirements, and diagrams containing the element
      const query = elementType === 'block'
        ? `
          MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project {slug: $projectSlug})
          MATCH (project)-[:HAS_ARCHITECTURE_BLOCK]->(element:ArchitectureBlock {id: $elementId})

          OPTIONAL MATCH (element)-[:LINKED_DOCUMENT]->(doc:Document)
          OPTIONAL MATCH (element)-[:LINKED_REQUIREMENT]->(req:Requirement)
          OPTIONAL MATCH (project)-[:HAS_ARCHITECTURE_DIAGRAM]->(diagram:ArchitectureDiagram)-[:HAS_BLOCK]->(element)

          RETURN
            collect(DISTINCT doc {.id, .name, .description}) AS documents,
            collect(DISTINCT req {.id, .title, .text}) AS requirements,
            collect(DISTINCT diagram {.id, .name, .description}) AS diagrams
          `
        : `
          MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project {slug: $projectSlug})
          MATCH (project)-[:HAS_INTERFACE]->(element:Interface {id: $elementId})

          OPTIONAL MATCH (element)-[:LINKED_DOCUMENT]->(doc:Document)
          OPTIONAL MATCH (element)-[:LINKED_REQUIREMENT]->(req:Requirement)

          RETURN
            collect(DISTINCT doc {.id, .name, .description}) AS documents,
            collect(DISTINCT req {.id, .title, .text}) AS requirements,
            [] AS diagrams
          `;

      const result = await session.run(query, { tenantSlug, projectSlug, elementId });

      if (result.records.length === 0) {
        return { documents: [], requirements: [], diagrams: [] };
      }

      const record = result.records[0];
      const documents = record.get('documents').filter((d: any) => d.id);
      const requirements = record.get('requirements').filter((r: any) => r.id);
      const diagrams = record.get('diagrams').filter((d: any) => d.id);

      return {
        documents,
        requirements,
        diagrams,
      };
    } finally {
      await session.close();
    }
  }

  /**
   * Store drawing in database and file system
   */
  private async storeDrawing(
    drawingId: string,
    elementId: string,
    elementType: string,
    user: SnapDraftUser,
    spec: DrawingSpec,
    files: { dxf?: Buffer; svg?: Buffer },
    style: string
  ): Promise<void> {
    // Create storage directory
    const storageDir = path.join(process.cwd(), 'storage', 'snapdraft', user.tenantSlug);
    await fs.mkdir(storageDir, { recursive: true });

    // Save files to disk
    let dxfPath: string | null = null;
    let svgPath: string | null = null;

    if (files.dxf) {
      dxfPath = path.join(storageDir, `${drawingId}.dxf`);
      await fs.writeFile(dxfPath, files.dxf);
    }

    if (files.svg) {
      svgPath = path.join(storageDir, `${drawingId}.svg`);
      await fs.writeFile(svgPath, files.svg);
    }

    // Insert into database (using tenant_slug since tenants are in Neo4j, not PostgreSQL)
    const pool = getPool();
    await pool.query(
      `INSERT INTO snapdraft_drawings (
        id,
        element_id,
        element_type,
        user_id,
        tenant_slug,
        spec_json,
        style,
        dxf_file_path,
        svg_file_path,
        mode
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        drawingId,
        elementId,
        elementType,
        user.id,
        user.tenantSlug,
        JSON.stringify(spec),
        style,
        dxfPath,
        svgPath,
        'technical_drawing',
      ]
    );
  }

  /**
   * Store visualization in database and file system
   */
  private async storeVisualization(
    drawingId: string,
    elementId: string,
    elementType: string,
    user: SnapDraftUser,
    visualizationResult: any,
    style: string,
    modeDecision: any
  ): Promise<void> {
    // Create storage directory
    const storageDir = path.join(process.cwd(), 'storage', 'snapdraft', user.tenantSlug);
    await fs.mkdir(storageDir, { recursive: true });

    // Save file to disk
    let pngPath: string | null = null;
    let svgPath: string | null = null;

    if (visualizationResult.type === 'dalle') {
      pngPath = path.join(storageDir, `${drawingId}.png`);
      await fs.writeFile(pngPath, visualizationResult.data);
    } else if (visualizationResult.type === 'svg') {
      svgPath = path.join(storageDir, `${drawingId}.svg`);
      await fs.writeFile(svgPath, visualizationResult.data);
    }

    // Store metadata about the visualization
    const visualizationMetadata = {
      visualizationType: visualizationResult.type,
      prompt: visualizationResult.prompt,
      revisedPrompt: visualizationResult.revisedPrompt,
      suitabilityScore: modeDecision.suitabilityScore,
      reasoning: modeDecision.reasoning,
      issues: modeDecision.issues,
    };

    // Insert into database
    const pool = getPool();
    await pool.query(
      `INSERT INTO snapdraft_drawings (
        id,
        element_id,
        element_type,
        user_id,
        tenant_slug,
        spec_json,
        style,
        png_file_path,
        svg_file_path,
        mode
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        drawingId,
        elementId,
        elementType,
        user.id,
        user.tenantSlug,
        JSON.stringify(visualizationMetadata),
        style,
        pngPath,
        svgPath,
        'visualization',
      ]
    );
  }

  /**
   * Log generation metrics for monitoring
   */
  private async logGenerationMetrics(drawingId: string, latencyMs: number): Promise<void> {
    // TODO: Implement metrics logging
    // This could integrate with existing metrics/logging infrastructure
    this.fastify.log.info({
      event: 'snapdraft_generation',
      drawingId,
      latencyMs,
    });
  }
}
