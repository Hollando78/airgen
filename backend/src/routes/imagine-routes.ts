/**
 * Imagine Visualization API Routes
 */

import type { FastifyPluginAsync } from 'fastify';
import { ImagineService } from '../services/imagine/imagine-service.js';
import type { ImagineRequest } from '../services/imagine/types.js';
import { getSession } from '../services/graph/driver.js';

const imagineRoutes: FastifyPluginAsync = async (fastify) => {
  const imagineService = new ImagineService();

  /**
   * GET /api/:tenant/:project/imagine/requirements/:elementId
   * Get requirements linked to a block or interface
   */
  fastify.get<{
    Params: { tenant: string; project: string; elementId: string };
  }>(
    '/:tenant/:project/imagine/requirements/:elementId',
    {
      preHandler: fastify.authenticate,
      schema: {
        tags: ['imagine'],
        summary: 'Get linked requirements',
        description: 'Get requirements linked to an architecture element',
        params: {
          type: 'object',
          required: ['tenant', 'project', 'elementId'],
          properties: {
            tenant: { type: 'string' },
            project: { type: 'string' },
            elementId: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const { tenant, project, elementId } = request.params;

      try {
        const session = getSession();
        try {
          const result = await session.run(
            `
            MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project {slug: $projectSlug})
            MATCH (project)-[:HAS_ARCHITECTURE_BLOCK|HAS_ARCHITECTURE_CONNECTOR]->(element {id: $elementId})
            OPTIONAL MATCH (element)-[:LINKED_DOCUMENT]->(doc:Document)
                          -[:HAS_SECTION]->(section:DocumentSection)
                          -[:CONTAINS]->(req:Requirement)
            WHERE doc.deletedAt IS NULL
              AND (req.deleted IS NULL OR req.deleted = false)
              AND (req.archived IS NULL OR req.archived = false)
            RETURN DISTINCT req
            ORDER BY req.priority DESC, req.createdAt DESC
            `,
            {
              tenantSlug: tenant,
              projectSlug: project,
              elementId,
            }
          );

          const requirements = result.records
            .map((record: any) => record.get('req'))
            .filter((req: any) => req !== null && req.properties)
            .map((req: any) => ({
              id: req.properties.id,
              ref: req.properties.ref,
              title: req.properties.title || 'Untitled',
              text: req.properties.text || '',
              type: req.properties.type || undefined,
              priority: req.properties.priority || undefined,
            }));

          return reply.send({
            success: true,
            data: { requirements },
          });
        } finally {
          await session.close();
        }
      } catch (error: any) {
        fastify.log.error({ err: error, elementId }, '[Imagine] Failed to fetch requirements');
        return reply.status(500).send({
          success: false,
          error: error.message || 'Failed to fetch requirements',
        });
      }
    }
  );

  /**
   * POST /api/:tenant/:project/imagine/generate
   * Generate a visualization for a block or interface
   */
  fastify.post<{
    Params: { tenant: string; project: string };
    Body: {
      elementId: string;
      elementType: 'Block' | 'Interface';
      requirementIds?: string[];
      customPrompt?: string;
      referenceImages?: string[];
    };
  }>(
    '/:tenant/:project/imagine/generate',
    {
      preHandler: fastify.authenticate,
      schema: {
        tags: ['imagine'],
        summary: 'Generate visualization',
        description: 'Generate an AI visualization for an architecture element',
        params: {
          type: 'object',
          required: ['tenant', 'project'],
          properties: {
            tenant: { type: 'string' },
            project: { type: 'string' },
          },
        },
        body: {
          type: 'object',
          required: ['elementId', 'elementType'],
          properties: {
            elementId: { type: 'string' },
            elementType: { type: 'string', enum: ['Block', 'Interface'] },
            requirementIds: { type: 'array', items: { type: 'string' } },
            customPrompt: { type: 'string' },
            referenceImages: { type: 'array', items: { type: 'string' } },
          },
        },
      },
    },
    async (request, reply) => {
      const { tenant, project } = request.params;
      const { elementId, elementType, requirementIds, customPrompt, referenceImages } = request.body;

      const imagineRequest: ImagineRequest = {
        tenantSlug: tenant,
        projectSlug: project,
        elementId,
        elementType,
        userId: request.currentUser!.sub,
        requirementIds,
        customPrompt,
        referenceImages,
      };

      try {
        const result = await imagineService.generateVisualization(imagineRequest);

        return reply.status(201).send({
          success: true,
          data: result,
        });
      } catch (error: any) {
        fastify.log.error({ err: error, request: imagineRequest }, '[Imagine] Generation failed');

        return reply.status(500).send({
          success: false,
          error: error.message || 'Failed to generate visualization',
        });
      }
    }
  );

  /**
   * GET /api/:tenant/:project/imagine/images
   * List all imagine images for a project
   */
  fastify.get<{
    Params: { tenant: string; project: string };
  }>(
    '/:tenant/:project/imagine/images',
    {
      preHandler: fastify.authenticate,
      schema: {
        tags: ['imagine'],
        summary: 'List imagine images',
        description: 'List all imagine images for a project',
        params: {
          type: 'object',
          required: ['tenant', 'project'],
          properties: {
            tenant: { type: 'string' },
            project: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const { tenant, project } = request.params;

      try {
        const images = await imagineService.listImages(tenant, project);

        return reply.send({
          success: true,
          data: {
            images,
            total: images.length,
          },
        });
      } catch (error: any) {
        fastify.log.error({ err: error, tenant, project }, '[Imagine] Failed to list images');
        return reply.status(500).send({
          success: false,
          error: error.message || 'Failed to list images',
        });
      }
    }
  );

  /**
   * GET /api/:tenant/:project/imagine/images/:imageId
   * Get image details with version history
   */
  fastify.get<{
    Params: { tenant: string; project: string; imageId: string };
  }>(
    '/:tenant/:project/imagine/images/:imageId',
    {
      preHandler: fastify.authenticate,
      schema: {
        tags: ['imagine'],
        summary: 'Get image details',
        description: 'Get image details with version history',
        params: {
          type: 'object',
          required: ['tenant', 'project', 'imageId'],
          properties: {
            tenant: { type: 'string' },
            project: { type: 'string' },
            imageId: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const { tenant, project, imageId } = request.params;

      try {
        const result = await imagineService.getImageDetails(tenant, project, imageId);

        return reply.send({
          success: true,
          data: result,
        });
      } catch (error: any) {
        fastify.log.error({ err: error, tenant, project, imageId }, '[Imagine] Failed to get image details');
        return reply.status(404).send({
          success: false,
          error: error.message || 'Image not found',
        });
      }
    }
  );

  /**
   * GET /api/:tenant/:project/imagine/element/:elementId
   * Get element metadata (diagramId and documentIds) for Save to Documents feature
   */
  fastify.get<{
    Params: { tenant: string; project: string; elementId: string };
    Querystring: { elementType: 'Block' | 'Interface' };
  }>(
    '/:tenant/:project/imagine/element/:elementId',
    {
      preHandler: fastify.authenticate,
      schema: {
        tags: ['imagine'],
        summary: 'Get element metadata',
        description: 'Get element diagram and documents for linking',
        params: {
          type: 'object',
          required: ['tenant', 'project', 'elementId'],
          properties: {
            tenant: { type: 'string' },
            project: { type: 'string' },
            elementId: { type: 'string' },
          },
        },
        querystring: {
          type: 'object',
          required: ['elementType'],
          properties: {
            elementType: { type: 'string', enum: ['Block', 'Interface'] },
          },
        },
      },
    },
    async (request, reply) => {
      const { tenant, project, elementId } = request.params;
      const { elementType } = request.query;

      try {
        const session = getSession();
        try {
          const relationshipType = elementType === 'Block' ? 'HAS_ARCHITECTURE_BLOCK' : 'HAS_ARCHITECTURE_CONNECTOR';
          const diagramRelationshipType = elementType === 'Block' ? 'HAS_BLOCK' : 'HAS_CONNECTOR';

          const result = await session.run(
            `
            MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project {slug: $projectSlug})
            MATCH (project)-[:${relationshipType}]->(element {id: $elementId})
            MATCH (diagram:ArchitectureDiagram)-[:${diagramRelationshipType}]->(element)
            OPTIONAL MATCH (element)-[:LINKED_DOCUMENT]->(doc:Document)
            WHERE doc.deletedAt IS NULL
            RETURN diagram.id AS diagramId, COLLECT(DISTINCT doc.id) AS documentIds
            `,
            {
              tenantSlug: tenant,
              projectSlug: project,
              elementId,
            }
          );

          if (result.records.length === 0) {
            return reply.status(404).send({
              success: false,
              error: 'Element not found',
            });
          }

          const record = result.records[0];
          return reply.send({
            success: true,
            data: {
              diagramId: record.get('diagramId'),
              documentIds: record.get('documentIds').filter((id: any) => id !== null),
            },
          });
        } finally {
          await session.close();
        }
      } catch (error: any) {
        fastify.log.error({ err: error, elementId }, '[Imagine] Failed to get element metadata');
        return reply.status(500).send({
          success: false,
          error: error.message || 'Failed to get element metadata',
        });
      }
    }
  );

  /**
   * POST /api/:tenant/:project/imagine/reimagine
   * Re-imagine an existing image with iteration instructions
   */
  fastify.post<{
    Params: { tenant: string; project: string };
    Body: {
      parentImageId: string;
      iterationInstructions: string;
    };
  }>(
    '/:tenant/:project/imagine/reimagine',
    {
      preHandler: fastify.authenticate,
      schema: {
        tags: ['imagine'],
        summary: 'Re-imagine image',
        description: 'Create a new version of an image with iteration instructions',
        params: {
          type: 'object',
          required: ['tenant', 'project'],
          properties: {
            tenant: { type: 'string' },
            project: { type: 'string' },
          },
        },
        body: {
          type: 'object',
          required: ['parentImageId', 'iterationInstructions'],
          properties: {
            parentImageId: { type: 'string' },
            iterationInstructions: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const { parentImageId, iterationInstructions } = request.body;

      try {
        const result = await imagineService.reImagine({
          parentImageId,
          iterationInstructions,
          userId: request.currentUser!.sub,
        });

        return reply.status(201).send({
          success: true,
          data: {
            image: result,
          },
        });
      } catch (error: any) {
        fastify.log.error({ err: error, parentImageId }, '[Imagine] Re-imagination failed');

        return reply.status(500).send({
          success: false,
          error: error.message || 'Failed to re-imagine image',
        });
      }
    }
  );
};

export default imagineRoutes;
