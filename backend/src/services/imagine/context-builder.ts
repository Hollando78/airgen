/**
 * Imagine Context Builder
 *
 * Simplified context building - just element + direct requirements
 * No multi-hop traversal, no semantic search, no fact extraction
 */

import { getSession } from '../graph/driver.js';
import { logger } from '../../lib/logger.js';
import type { ImagineContext, ImagineRequest } from './types.js';

export class ContextBuilder {
  async buildContext(request: ImagineRequest): Promise<ImagineContext> {
    logger.info(`[Imagine] Building context for ${request.elementType} ${request.elementId}`);

    const session = getSession();
    try {
      const result = await session.run(
        `
        MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project {slug: $projectSlug})
        MATCH (project)-[:HAS_ARCHITECTURE_${request.elementType === 'Block' ? 'BLOCK' : 'CONNECTOR'}]->(element {id: $elementId})

        // Get linked documents
        OPTIONAL MATCH (element)-[:LINKED_DOCUMENT]->(doc:Document)

        // Get linked requirements through documents
        OPTIONAL MATCH (element)-[:LINKED_DOCUMENT]->(linkDoc:Document)
                      -[:HAS_SECTION]->(section:DocumentSection)
                      -[:CONTAINS]->(req:Requirement)
        WHERE linkDoc.deletedAt IS NULL
          AND (req.deleted IS NULL OR req.deleted = false)
          AND (req.archived IS NULL OR req.archived = false)

        // Get connections (for blocks)
        OPTIONAL MATCH (element)-[conn]-(connected)
        WHERE type(conn) IN ['CONNECTED_TO', 'CONNECTS', 'SOURCE_OF', 'TARGET_OF']

        RETURN element,
               collect(DISTINCT doc) as documents,
               collect(DISTINCT req) as requirements,
               collect(DISTINCT {name: connected.name, kind: labels(connected)[0], direction: CASE WHEN startNode(conn) = element THEN 'outgoing' ELSE 'incoming' END}) as connections
        `,
        {
          tenantSlug: request.tenantSlug,
          projectSlug: request.projectSlug,
          elementId: request.elementId,
        }
      );

      if (result.records.length === 0) {
        throw new Error(`[Imagine] Element not found: ${request.elementId}`);
      }

      const record = result.records[0];
      const elementNode = record.get('element');
      const documents = record.get('documents');
      const requirements = record.get('requirements');
      const connections = record.get('connections');

      // Parse ports from JSON if available
      let ports = [];
      try {
        if (elementNode.properties.ports && typeof elementNode.properties.ports === 'string') {
          ports = JSON.parse(elementNode.properties.ports);
        } else if (Array.isArray(elementNode.properties.ports)) {
          ports = elementNode.properties.ports;
        }
      } catch (err) {
        logger.warn({ err }, '[Imagine] Failed to parse ports');
      }

      // Parse requirements and filter by IDs if provided
      let parsedRequirements = requirements
        .filter((r: any) => r && r.properties)
        .map((r: any) => ({
          id: r.properties.id,
          title: r.properties.title || 'Untitled',
          text: r.properties.text || '',
          type: r.properties.type || undefined,
          priority: r.properties.priority || undefined,
        }));

      // Filter by requirement IDs if provided, otherwise take top 5
      if (request.requirementIds && request.requirementIds.length > 0) {
        const selectedIds = new Set(request.requirementIds);
        parsedRequirements = parsedRequirements.filter((r: any) => selectedIds.has(r.id));
        logger.info(`[Imagine] Filtered to ${parsedRequirements.length} selected requirements`);
      } else {
        parsedRequirements = parsedRequirements.slice(0, 5); // Top 5 requirements if no filter
      }

      const context: ImagineContext = {
        element: {
          id: elementNode.properties.id,
          name: elementNode.properties.name,
          type: request.elementType,
          description: elementNode.properties.description || undefined,
          kind: elementNode.properties.kind || undefined,
          ports: ports.length > 0 ? ports : undefined,
          connections: connections.filter((c: any) => c.name).slice(0, 10), // Top 10 connections
        },
        requirements: parsedRequirements,
        documents: documents
          .filter((d: any) => d && d.properties)
          .map((d: any) => {
            // Parse sections to get content
            let content = d.properties.content || '';
            try {
              if (d.properties.sections && typeof d.properties.sections === 'string') {
                const sections = JSON.parse(d.properties.sections);
                content = sections.map((s: any) => s.content || '').join('\n\n');
              }
            } catch (err) {
              logger.warn({ err }, '[Imagine] Failed to parse document sections');
            }

            return {
              title: d.properties.title || 'Untitled Document',
              content: content.substring(0, 1000), // Limit content to 1000 chars
            };
          })
          .slice(0, 2), // Top 2 documents
      };

      logger.info(`[Imagine] Context built: ${context.requirements.length} requirements, ${context.documents.length} documents, ${context.element.connections?.length || 0} connections`);

      return context;
    } finally {
      await session.close();
    }
  }
}
