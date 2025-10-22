import type { ManagedTransaction } from 'neo4j-driver';
import { getSession } from '../graph/driver.js';
import type { GenerateRequest } from './validation.js';

export interface PortInfo {
  name: string;
  direction: 'in' | 'out' | 'inout';
  type?: string;
  protocol?: string;
}

export interface ElementInfo {
  id: string;
  type: string;
  name: string;
  description?: string;
  properties?: Record<string, any>;
  ports?: PortInfo[];
  connections?: Array<{
    name: string;
    kind: string;
    label?: string;
    direction: 'incoming' | 'outgoing' | 'related';
    targetElement: string;
    hopDistance?: number;
  }>;
}

export interface DocumentInfo {
  title: string;
  content: string;
}

export interface RequirementInfo {
  id: string;
  title: string;
  text: string;
  type?: string;
  priority?: string;
  acceptanceCriteria?: string[];
  verificationMethod?: string;
}

export interface DiagramInfo {
  title: string;
  blocks: any[];
  connectors: any[];
}

export interface SnapDraftContext {
  element: ElementInfo;
  documents: DocumentInfo[];
  requirements: RequirementInfo[];
  referenceDiagrams: DiagramInfo[];
  style: 'engineering' | 'architectural' | 'schematic';
  options?: {
    units: 'mm' | 'in';
    scale: string;
    paper: string;
    orientation: 'landscape' | 'portrait';
  };
}

export class ContextBuilder {
  /**
   * Build complete context for SnapDraft generation
   */
  async build(request: GenerateRequest, tenantSlug: string, projectSlug: string): Promise<SnapDraftContext> {
    const element = await this.getElement(request.elementId, request.elementType, tenantSlug, projectSlug);
    const documents = await this.getDocuments(request.contextDocuments || [], tenantSlug);
    const requirements = await this.getRequirements(request.contextRequirements || [], tenantSlug, projectSlug);
    const referenceDiagrams = await this.getReferenceDiagrams(request.referenceDiagrams || [], tenantSlug, projectSlug);

    return {
      element,
      documents,
      requirements,
      referenceDiagrams,
      style: request.style,
      options: request.options,
    };
  }

  /**
   * Fetch element (block or interface) from Neo4j
   */
  private async getElement(
    elementId: string,
    elementType: 'block' | 'interface',
    tenantSlug: string,
    projectSlug: string
  ): Promise<ElementInfo> {
    const session = getSession();
    try {
      if (elementType === 'block') {
        return await this.getBlock(elementId, tenantSlug, projectSlug);
      } else {
        return await this.getInterface(elementId, tenantSlug, projectSlug);
      }
    } finally {
      await session.close();
    }
  }

  /**
   * Fetch block details from Neo4j with multi-hop connector traversal (up to 3 hops)
   */
  private async getBlock(blockId: string, tenantSlug: string, projectSlug: string): Promise<ElementInfo> {
    const session = getSession();
    try {
      const result = await session.executeRead(async (tx: ManagedTransaction) => {
        return await tx.run(
          `
          MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project {slug: $projectSlug})
          MATCH (project)-[:HAS_ARCHITECTURE_BLOCK]->(block:ArchitectureBlock {id: $blockId})
          OPTIONAL MATCH (block)-[:HAS_PORT_DEFINITION]->(portDef:PortDefinition)

          // 1-hop: Direct connectors
          OPTIONAL MATCH (diagram1:ArchitectureDiagram)-[:HAS_CONNECTOR]->(conn1:ArchitectureConnector)
            WHERE conn1.source = $blockId OR conn1.target = $blockId
          OPTIONAL MATCH (hop1Block:ArchitectureBlock)
            WHERE (conn1.source = $blockId AND hop1Block.id = conn1.target)
               OR (conn1.target = $blockId AND hop1Block.id = conn1.source)

          // 2-hop: Connectors to 1-hop blocks
          OPTIONAL MATCH (diagram2:ArchitectureDiagram)-[:HAS_CONNECTOR]->(conn2:ArchitectureConnector)
            WHERE (conn2.source = hop1Block.id OR conn2.target = hop1Block.id)
              AND conn2.source <> $blockId AND conn2.target <> $blockId
          OPTIONAL MATCH (hop2Block:ArchitectureBlock)
            WHERE (conn2.source = hop1Block.id AND hop2Block.id = conn2.target AND hop2Block.id <> $blockId)
               OR (conn2.target = hop1Block.id AND hop2Block.id = conn2.source AND hop2Block.id <> $blockId)

          // 3-hop: Connectors to 2-hop blocks
          OPTIONAL MATCH (diagram3:ArchitectureDiagram)-[:HAS_CONNECTOR]->(conn3:ArchitectureConnector)
            WHERE (conn3.source = hop2Block.id OR conn3.target = hop2Block.id)
              AND conn3.source <> $blockId AND conn3.target <> $blockId
              AND conn3.source <> hop1Block.id AND conn3.target <> hop1Block.id
          OPTIONAL MATCH (hop3Block:ArchitectureBlock)
            WHERE (conn3.source = hop2Block.id AND hop3Block.id = conn3.target
                   AND hop3Block.id <> $blockId AND hop3Block.id <> hop1Block.id)
               OR (conn3.target = hop2Block.id AND hop3Block.id = conn3.source
                   AND hop3Block.id <> $blockId AND hop3Block.id <> hop1Block.id)

          // Get linked documents
          OPTIONAL MATCH (block)-[:LINKED_DOCUMENT]->(doc:Document)

          WITH block, portDef,
               collect(DISTINCT {conn: conn1, sourceId: conn1.source, targetId: conn1.target, kind: conn1.kind, label: conn1.label}) AS conns1,
               collect(DISTINCT {block: hop1Block, hop: 1}) AS hop1Blocks,
               collect(DISTINCT {block: hop2Block, hop: 2}) AS hop2Blocks,
               collect(DISTINCT {block: hop3Block, hop: 3}) AS hop3Blocks,
               collect(DISTINCT doc.id) AS linkedDocuments

          RETURN
            block,
            collect(DISTINCT portDef {
              .name,
              .direction,
              .type,
              .protocol
            }) AS ports,
            [c IN conns1 WHERE c.conn IS NOT NULL | CASE
              WHEN c.sourceId = $blockId THEN {
                name: [b IN hop1Blocks WHERE b.block.id = c.targetId | b.block.name][0],
                kind: c.kind,
                label: c.label,
                direction: 'outgoing',
                targetElement: c.targetId,
                hopDistance: 1
              }
              ELSE {
                name: [b IN hop1Blocks WHERE b.block.id = c.sourceId | b.block.name][0],
                kind: c.kind,
                label: c.label,
                direction: 'incoming',
                targetElement: c.sourceId,
                hopDistance: 1
              }
            END] AS connections,
            [b IN hop1Blocks + hop2Blocks + hop3Blocks WHERE b.block IS NOT NULL | {
              name: b.block.name,
              id: b.block.id,
              kind: b.block.kind,
              hopDistance: b.hop
            }] AS multiHopBlocks,
            linkedDocuments
          `,
          { tenantSlug, projectSlug, blockId }
        );
      });

      if (result.records.length === 0) {
        throw new Error(`Block ${blockId} not found`);
      }

      const record = result.records[0];
      const block = record.get('block').properties;
      const ports = record.get('ports');
      const connections = record.get('connections').filter((c: any) => c && c.name);
      const multiHopBlocks = record.get('multiHopBlocks').filter((b: any) => b && b.name);

      // Combine direct connections and multi-hop blocks for full context
      const allConnections = [
        ...connections,
        ...multiHopBlocks.map((b: any) => ({
          name: b.name,
          kind: b.kind || 'connected-system',
          label: `${b.hopDistance}-hop connection`,
          direction: 'related',
          targetElement: b.id,
          hopDistance: b.hopDistance,
        }))
      ];

      console.log(`[ContextBuilder] Block ${block.name}: ${connections.length} direct connections, ${multiHopBlocks.length} multi-hop blocks (total: ${allConnections.length})`);

      return {
        id: block.id || blockId,
        type: block.kind || 'Block',
        name: block.name,
        description: block.description,
        properties: {
          stereotype: block.stereotype,
          ...this.parseJsonProperties(block.properties),
        },
        ports: ports.map((p: any) => ({
          name: p.name,
          direction: p.direction || 'inout',
          type: p.type,
          protocol: p.protocol,
        })),
        connections: allConnections,
      };
    } finally {
      await session.close();
    }
  }

  /**
   * Fetch interface details from Neo4j
   */
  private async getInterface(interfaceId: string, tenantSlug: string, projectSlug: string): Promise<ElementInfo> {
    const session = getSession();
    try {
      const result = await session.executeRead(async (tx: ManagedTransaction) => {
        return await tx.run(
          `
          MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project {slug: $projectSlug})
          MATCH (project)-[:HAS_INTERFACE]->(interface:Interface {id: $interfaceId})
          OPTIONAL MATCH (interface)-[:HAS_PORT_DEFINITION]->(portDef:PortDefinition)
          RETURN
            interface,
            collect(DISTINCT portDef {
              .name,
              .direction,
              .type,
              .protocol
            }) AS ports
          `,
          { tenantSlug, projectSlug, interfaceId }
        );
      });

      if (result.records.length === 0) {
        throw new Error(`Interface ${interfaceId} not found`);
      }

      const record = result.records[0];
      const iface = record.get('interface').properties;
      const ports = record.get('ports');

      return {
        id: iface.id || interfaceId,
        type: 'Interface',
        name: iface.name,
        description: iface.description,
        properties: this.parseJsonProperties(iface.properties),
        ports: ports.map((p: any) => ({
          name: p.name,
          direction: p.direction || 'inout',
          type: p.type,
          protocol: p.protocol,
        })),
      };
    } finally {
      await session.close();
    }
  }

  /**
   * Fetch documents from PostgreSQL
   */
  private async getDocuments(documentIds: string[], tenantSlug: string): Promise<DocumentInfo[]> {
    if (documentIds.length === 0) return [];

    console.log('[ContextBuilder] Fetching documents:', { documentIds, tenantSlug });

    const session = getSession();
    try {
      const documents: DocumentInfo[] = [];

      for (const docId of documentIds) {
        const result = await session.executeRead(async (tx: ManagedTransaction) => {
          return await tx.run(
            `
            MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project)
            MATCH (project)-[:HAS_DOCUMENT]->(doc:Document {id: $docId})
            OPTIONAL MATCH (doc)-[:HAS_SECTION]->(section:DocumentSection)
            OPTIONAL MATCH (section)-[:CONTAINS]->(req:Requirement)
            WITH doc, section, collect(DISTINCT req {.id, .title, .text, .type, .priority}) AS requirements
            RETURN
              doc,
              collect(DISTINCT section {
                .name,
                .description,
                .order,
                requirements: requirements
              }) AS sections
            `,
            { tenantSlug, docId }
          );
        });

        console.log('[ContextBuilder] Query result for docId', docId, ':', {
          recordCount: result.records.length,
        });

        if (result.records.length > 0) {
          const record = result.records[0];
          const doc = record.get('doc').properties;
          const sections = record.get('sections');

          console.log('[ContextBuilder] Document fetched:', {
            docId,
            docName: doc.name,
            docDescription: doc.description?.substring(0, 100),
            sectionsCount: sections?.length || 0,
            sections: sections?.map((s: any) => ({
              name: s.name,
              hasDescription: !!s.description,
              descriptionLength: s.description?.length,
              requirementsCount: s.requirements?.filter((r: any) => r.id).length || 0
            }))
          });

          // Build document content from sections
          let content = doc.description || '';
          if (sections && sections.length > 0) {
            const sortedSections = sections
              .filter((s: any) => s.name) // Only filter by name, not description
              .sort((a: any, b: any) => (a.order || 0) - (b.order || 0));

            console.log('[ContextBuilder] Sorted sections after filter:', sortedSections.length);

            for (const section of sortedSections) {
              content += `\n\n## ${section.name}\n`;

              // Add section description if it exists
              if (section.description) {
                content += `${section.description}\n`;
              }

              // Add requirements if they exist
              const validRequirements = section.requirements?.filter((r: any) => r.id && (r.title || r.text)) || [];
              if (validRequirements.length > 0) {
                content += `\n`;
                for (const req of validRequirements) {
                  // Use title if available, otherwise use ID as heading
                  if (req.title) {
                    content += `### ${req.title}\n`;
                  } else if (req.id) {
                    content += `### ${req.id}\n`;
                  }

                  if (req.text) {
                    content += `${req.text}\n`;
                  }
                  if (req.type || req.priority) {
                    content += `*Type: ${req.type || 'N/A'}, Priority: ${req.priority || 'N/A'}*\n`;
                  }
                  content += `\n`;
                }
              }
            }
          }

          console.log('[ContextBuilder] Final content length:', content.length);

          documents.push({
            title: doc.name || doc.title,
            content: content.trim(),
          });
        } else {
          console.log('[ContextBuilder] No records found for docId:', docId);
        }
      }

      console.log('[ContextBuilder] Returning', documents.length, 'documents');
      return documents;
    } finally {
      await session.close();
    }
  }

  /**
   * Fetch requirements from Neo4j
   */
  private async getRequirements(requirementIds: string[], tenantSlug: string, projectSlug: string): Promise<RequirementInfo[]> {
    if (requirementIds.length === 0) return [];

    const session = getSession();
    try {
      const requirements: RequirementInfo[] = [];

      for (const reqId of requirementIds) {
        const result = await session.executeRead(async (tx: ManagedTransaction) => {
          return await tx.run(
            `
            MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project {slug: $projectSlug})
            MATCH (project)-[:HAS_REQUIREMENT]->(req:Requirement {id: $reqId})
            OPTIONAL MATCH (req)-[:HAS_ACCEPTANCE_CRITERION]->(ac:AcceptanceCriterion)
            RETURN
              req,
              collect(DISTINCT ac.text) AS acceptanceCriteria
            `,
            { tenantSlug, projectSlug, reqId }
          );
        });

        if (result.records.length > 0) {
          const record = result.records[0];
          const req = record.get('req').properties;
          const acceptanceCriteria = record.get('acceptanceCriteria').filter((ac: any) => ac);

          requirements.push({
            id: req.id || reqId,
            title: req.title || req.name,
            text: req.text || req.description || '',
            type: req.type,
            priority: req.priority,
            acceptanceCriteria,
            verificationMethod: req.verificationMethod,
          });
        }
      }

      return requirements;
    } finally {
      await session.close();
    }
  }

  /**
   * Fetch reference diagrams from Neo4j
   */
  private async getReferenceDiagrams(diagramIds: string[], tenantSlug: string, projectSlug: string): Promise<DiagramInfo[]> {
    if (diagramIds.length === 0) return [];

    const session = getSession();
    try {
      const diagrams: DiagramInfo[] = [];

      for (const diagramId of diagramIds) {
        const result = await session.executeRead(async (tx: ManagedTransaction) => {
          return await tx.run(
            `
            MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project {slug: $projectSlug})
            MATCH (project)-[:HAS_ARCHITECTURE_DIAGRAM]->(diagram:ArchitectureDiagram {id: $diagramId})
            OPTIONAL MATCH (diagram)-[rel:HAS_BLOCK]->(block:ArchitectureBlock)
            OPTIONAL MATCH (diagram)-[:HAS_CONNECTOR]->(connector:Connector)
            RETURN
              diagram,
              collect(DISTINCT block {
                .id,
                .name,
                .kind,
                positionX: rel.positionX,
                positionY: rel.positionY,
                sizeWidth: rel.sizeWidth,
                sizeHeight: rel.sizeHeight
              }) AS blocks,
              collect(DISTINCT connector {
                .id,
                .type,
                .sourceBlockId,
                .targetBlockId
              }) AS connectors
            `,
            { tenantSlug, projectSlug, diagramId }
          );
        });

        if (result.records.length > 0) {
          const record = result.records[0];
          const diagram = record.get('diagram').properties;
          const blocks = record.get('blocks');
          const connectors = record.get('connectors');

          diagrams.push({
            title: diagram.name || diagram.title || diagramId,
            blocks: blocks.filter((b: any) => b.id),
            connectors: connectors.filter((c: any) => c.id),
          });
        }
      }

      return diagrams;
    } finally {
      await session.close();
    }
  }

  /**
   * Parse JSON properties if stored as string
   */
  private parseJsonProperties(properties: any): Record<string, any> {
    if (!properties) return {};
    if (typeof properties === 'string') {
      try {
        return JSON.parse(properties);
      } catch {
        return { raw: properties };
      }
    }
    return properties;
  }
}
