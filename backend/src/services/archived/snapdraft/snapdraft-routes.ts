import type { FastifyInstance } from 'fastify';
import { SnapDraftService } from '../services/snapdraft/snapdraft-service.js';
import { GenerateRequestSchema, GenerateResponseSchema } from '../services/snapdraft/validation.js';
import { z } from 'zod';

/**
 * SnapDraft API routes
 * Technical drawing generation from architecture blocks and interfaces
 */
export default async function registerSnapDraftRoutes(app: FastifyInstance): Promise<void> {
  const snapdraftService = new SnapDraftService(app);

  // Generate SnapDraft drawing
  app.post('/snapdraft/:tenant/:project/generate', {
    preHandler: [
      app.authenticate,
      // TODO: Rate limiting - implement with Redis for production
      // For now, we rely on API-level rate limiting
    ],
  }, async (request, reply) => {
    try {
      const user = (request as any).user;
      const { tenant, project } = request.params as { tenant: string; project: string };
      const body = request.body as z.infer<typeof GenerateRequestSchema>;

      const result = await snapdraftService.generate(body, {
        id: user.id,
        tenantSlug: tenant,
        projectSlug: project,
      });

      return reply.status(200).send(result);
    } catch (error: any) {
      app.log.error('SnapDraft generation error:', error);

      // Handle validation errors
      if (error.name === 'ZodError') {
        return reply.status(400).send({
          error: 'Validation Error',
          message: error.message,
        });
      }

      // Handle LLM errors
      if (error.message?.includes('OpenAI')) {
        return reply.status(500).send({
          error: 'LLM Error',
          message: 'Failed to generate drawing specification. Please try again.',
        });
      }

      return reply.status(500).send({
        error: 'Internal Server Error',
        message: error.message || 'An unexpected error occurred',
      });
    }
  });

  // Download generated file
  app.get('/snapdraft/:tenant/:drawingId/download/:format', {
    preHandler: [app.authenticate],
  }, async (request, reply) => {
    try {
      const user = (request as any).user;
      const { tenant, drawingId, format } = request.params as { tenant: string; drawingId: string; format: 'dxf' | 'svg' | 'png' | 'json' };

      const file = await snapdraftService.getFile(drawingId, format, user.id, tenant);

      return reply
        .type(file.mimeType)
        .header('Content-Disposition', `attachment; filename="${file.filename}"`)
        .send(file.buffer);
    } catch (error: any) {
      app.log.error('SnapDraft file download error:', error);

      if (error.message?.includes('not found') || error.message?.includes('access denied')) {
        return reply.status(404).send({
          error: 'Not Found',
          message: 'Drawing not found or access denied',
        });
      }

      return reply.status(500).send({
        error: 'Internal Server Error',
        message: error.message || 'Failed to retrieve file',
      });
    }
  });

  // Get available context for an element
  app.get('/snapdraft/:tenant/:project/context/:elementType/:elementId', {
    preHandler: [app.authenticate],
  }, async (request, reply) => {
    try {
      const user = (request as any).user;
      const { tenant, project, elementType, elementId } = request.params as {
        tenant: string;
        project: string;
        elementType: 'block' | 'interface';
        elementId: string;
      };

      const context = await snapdraftService.getAvailableContext(elementId, elementType, tenant, project);

      return reply.status(200).send(context);
    } catch (error: any) {
      app.log.error('SnapDraft context error:', error);

      return reply.status(500).send({
        error: 'Internal Server Error',
        message: error.message || 'Failed to retrieve available context',
      });
    }
  });

  // Analyze mode without generating
  app.post('/snapdraft/:tenant/:project/analyze', {
    preHandler: [app.authenticate],
  }, async (request, reply) => {
    try {
      const user = (request as any).user;
      const { tenant, project } = request.params as { tenant: string; project: string };
      const body = request.body as z.infer<typeof GenerateRequestSchema>;

      const result = await snapdraftService.analyzeMode(body, {
        id: user.id,
        tenantSlug: tenant,
        projectSlug: project,
      });

      return reply.status(200).send(result);
    } catch (error: any) {
      app.log.error('SnapDraft analysis error:', error);

      // Handle validation errors
      if (error.name === 'ZodError') {
        return reply.status(400).send({
          error: 'Validation Error',
          message: error.message,
        });
      }

      // Handle LLM errors
      if (error.message?.includes('OpenAI')) {
        return reply.status(500).send({
          error: 'LLM Error',
          message: 'Failed to analyze requirements. Please try again.',
        });
      }

      return reply.status(500).send({
        error: 'Internal Server Error',
        message: error.message || 'An unexpected error occurred',
      });
    }
  });

  // List SnapDraft history for an element
  app.get('/snapdraft/:tenant/element/:elementId', {
    preHandler: [app.authenticate],
  }, async (request, reply) => {
    try {
      const user = (request as any).user;
      const { tenant, elementId } = request.params as { tenant: string; elementId: string };

      const history = await snapdraftService.getHistory(elementId, user.id, tenant);

      return reply.status(200).send(history);
    } catch (error: any) {
      app.log.error('SnapDraft history error:', error);

      return reply.status(500).send({
        error: 'Internal Server Error',
        message: error.message || 'Failed to retrieve history',
      });
    }
  });
}
