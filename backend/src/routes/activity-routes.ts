/**
 * Activity Timeline API Routes
 *
 * Provides endpoints for accessing the activity timeline:
 * - List activity events with filtering and pagination
 * - Get activity statistics
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { requireTenantAccess, type AuthUser } from '../lib/authorization.js';
import { listActivity, getActivityStats, type ActivityFilters } from '../services/graph/activity.js';

const activityQuerySchema = z.object({
  tenantSlug: z.string().min(1),
  projectSlug: z.string().min(1),
  activityTypes: z.array(z.string()).optional(),
  actionTypes: z.array(z.string()).optional(),
  userIds: z.array(z.string()).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  searchQuery: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0)
});

const statsQuerySchema = z.object({
  tenantSlug: z.string().min(1),
  projectSlug: z.string().min(1)
});

const activityRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * GET /api/activity
   * List activity events with filtering and pagination
   */
  fastify.get<{
    Querystring: z.infer<typeof activityQuerySchema>;
  }>(
    '/activity',
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ['activity'],
        summary: 'List activity events',
        description: 'Get a paginated, filtered timeline of activity events',
        querystring: {
          type: 'object',
          required: ['tenantSlug', 'projectSlug'],
          properties: {
            tenantSlug: { type: 'string' },
            projectSlug: { type: 'string' },
            activityTypes: {
              type: 'array',
              items: { type: 'string' },
              description: 'Filter by activity types (requirement, document, block, etc.)'
            },
            actionTypes: {
              type: 'array',
              items: { type: 'string' },
              description: 'Filter by action types (created, updated, deleted, etc.)'
            },
            userIds: {
              type: 'array',
              items: { type: 'string' },
              description: 'Filter by user IDs'
            },
            startDate: {
              type: 'string',
              format: 'date-time',
              description: 'Filter events after this date'
            },
            endDate: {
              type: 'string',
              format: 'date-time',
              description: 'Filter events before this date'
            },
            searchQuery: {
              type: 'string',
              description: 'Search entity names and refs'
            },
            limit: {
              type: 'number',
              minimum: 1,
              maximum: 100,
              default: 50,
              description: 'Number of events to return'
            },
            offset: {
              type: 'number',
              minimum: 0,
              default: 0,
              description: 'Offset for pagination'
            }
          }
        },
        response: {
          200: {
            type: 'object',
            properties: {
              events: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    timestamp: { type: 'string' },
                    activityType: { type: 'string' },
                    actionType: { type: 'string' },
                    entityId: { type: 'string' },
                    entityName: { type: 'string' },
                    entityRef: { type: 'string' },
                    userId: { type: 'string' },
                    userName: { type: 'string' },
                    description: { type: 'string' },
                    metadata: { type: 'object' },
                    tenantSlug: { type: 'string' },
                    projectSlug: { type: 'string' }
                  }
                }
              },
              total: { type: 'number' },
              hasMore: { type: 'boolean' },
              nextOffset: { type: 'number' }
            }
          }
        }
      }
    },
    async (request, reply) => {
      try {
        // Validate query parameters
        const query = activityQuerySchema.parse(request.query);

        // Check tenant access
        await requireTenantAccess(request.currentUser as AuthUser, query.tenantSlug, reply);

        // Build filters
        const filters: ActivityFilters = {
          tenantSlug: query.tenantSlug,
          projectSlug: query.projectSlug,
          activityTypes: query.activityTypes as any,
          actionTypes: query.actionTypes as any,
          userIds: query.userIds,
          startDate: query.startDate,
          endDate: query.endDate,
          searchQuery: query.searchQuery,
          limit: query.limit,
          offset: query.offset
        };

        // Get activity events
        const result = await listActivity(filters);

        return reply.send(result);
      } catch (error: any) {
        fastify.log.error({ err: error }, '[Activity] Failed to list activity events');

        if (error.name === 'ZodError') {
          return reply.status(400).send({
            error: 'Bad Request',
            message: 'Invalid query parameters',
            details: error.errors
          });
        }

        return reply.status(500).send({
          error: 'Internal Server Error',
          message: error.message || 'Failed to list activity events'
        });
      }
    }
  );

  /**
   * GET /api/activity/stats
   * Get activity statistics for a project
   */
  fastify.get<{
    Querystring: z.infer<typeof statsQuerySchema>;
  }>(
    '/activity/stats',
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ['activity'],
        summary: 'Get activity statistics',
        description: 'Get aggregated statistics about activity in a project',
        querystring: {
          type: 'object',
          required: ['tenantSlug', 'projectSlug'],
          properties: {
            tenantSlug: { type: 'string' },
            projectSlug: { type: 'string' }
          }
        },
        response: {
          200: {
            type: 'object',
            properties: {
              totalEvents: { type: 'number' },
              eventsByType: {
                type: 'object',
                additionalProperties: { type: 'number' }
              },
              eventsByAction: {
                type: 'object',
                additionalProperties: { type: 'number' }
              },
              recentUsers: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    userId: { type: 'string' },
                    count: { type: 'number' }
                  }
                }
              }
            }
          }
        }
      }
    },
    async (request, reply) => {
      try {
        // Validate query parameters
        const query = statsQuerySchema.parse(request.query);

        // Check tenant access
        await requireTenantAccess(request.currentUser as AuthUser, query.tenantSlug, reply);

        // Get statistics
        const stats = await getActivityStats(query.tenantSlug, query.projectSlug);

        return reply.send(stats);
      } catch (error: any) {
        fastify.log.error({ err: error }, '[Activity] Failed to get activity stats');

        if (error.name === 'ZodError') {
          return reply.status(400).send({
            error: 'Bad Request',
            message: 'Invalid query parameters',
            details: error.errors
          });
        }

        return reply.status(500).send({
          error: 'Internal Server Error',
          message: error.message || 'Failed to get activity stats'
        });
      }
    }
  );
};

export default activityRoutes;
