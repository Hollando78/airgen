import type { FastifyPluginAsync } from "fastify";
import { getSession } from "../services/graph/driver.js";
import { slugify } from "../services/workspace.js";

const graphRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * GET /graph/data
   * Fetch graph data for visualization
   */
  fastify.get("/graph/data", async (request, reply) => {
    const { tenant, project } = request.query as { tenant?: string; project?: string };

    if (!tenant || !project) {
      return reply.code(400).send({ error: "tenant and project are required" });
    }

    const tenantSlug = slugify(tenant);
    const projectSlug = slugify(project);
    const session = getSession();

    try {
      // Query to fetch all nodes and relationships for the tenant/project
      const result = await session.run(
        `
        MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project {slug: $projectSlug})

        // Collect all nodes
        OPTIONAL MATCH (project)-[:HAS_DOCUMENT]->(doc:Document)
        WHERE doc.deletedAt IS NULL
        OPTIONAL MATCH (doc)-[:HAS_SECTION]->(section:DocumentSection)
        OPTIONAL MATCH (section)-[:CONTAINS]->(req:Requirement)
        WHERE (req.deleted IS NULL OR req.deleted = false) AND (req.archived IS NULL OR req.archived = false)
        OPTIONAL MATCH (section)-[:CONTAINS]->(info:Info)
        OPTIONAL MATCH (section)-[:CONTAINS]->(sur:SurrogateReference)
        OPTIONAL MATCH (project)-[:HAS_LINKSET]->(linkset:DocumentLinkset)
        OPTIONAL MATCH (project)-[:HAS_TRACE_LINK]->(traceLink:TraceLink)
        OPTIONAL MATCH (project)-[:HAS_CANDIDATE]->(candidate:RequirementCandidate)

        WITH tenant, project,
             collect(DISTINCT doc) as docs,
             collect(DISTINCT section) as sections,
             collect(DISTINCT req) as reqs,
             collect(DISTINCT info) as infos,
             collect(DISTINCT sur) as surs,
             collect(DISTINCT linkset) as linksets,
             collect(DISTINCT traceLink) as traceLinks,
             collect(DISTINCT candidate) as candidates

        // Collect requirement relationships separately
        OPTIONAL MATCH (project)-[:HAS_DOCUMENT]->(d:Document)-[:HAS_SECTION]->(s:DocumentSection)-[:CONTAINS]->(r:Requirement)
        WHERE d.deletedAt IS NULL AND (r.deleted IS NULL OR r.deleted = false) AND (r.archived IS NULL OR r.archived = false)
        OPTIONAL MATCH (r)-[reqRel]->(relatedReq:Requirement)
        WHERE type(reqRel) IN ['SATISFIES', 'DERIVES_FROM', 'RELATED_TO', 'VERIFIES', 'DEPENDS_ON']
          AND (relatedReq.deleted IS NULL OR relatedReq.deleted = false)
          AND (relatedReq.archived IS NULL OR relatedReq.archived = false)

        WITH tenant, project, docs, sections, reqs, infos, surs, linksets, traceLinks, candidates,
             collect(DISTINCT relatedReq) as relatedReqs,
             collect(DISTINCT {source: id(r), target: id(relatedReq), type: type(reqRel)}) as reqRels

        // Collect architecture nodes in separate phase to avoid Cartesian product
        OPTIONAL MATCH (project)-[:HAS_ARCHITECTURE_DIAGRAM]->(diagram:ArchitectureDiagram)
        OPTIONAL MATCH (project)-[:HAS_ARCHITECTURE_BLOCK]->(blockDef:ArchitectureBlock)
        OPTIONAL MATCH (project)-[:HAS_ARCHITECTURE_DIAGRAM]->(:ArchitectureDiagram)-[:HAS_BLOCK]->(placedBlock:ArchitectureBlock)
        OPTIONAL MATCH (project)-[:HAS_ARCHITECTURE_DIAGRAM]->(:ArchitectureDiagram)-[:HAS_CONNECTOR]->(connector:ArchitectureConnector)

        WITH tenant, project, docs, sections, reqs, infos, surs, linksets, traceLinks, candidates, relatedReqs, reqRels,
             collect(DISTINCT diagram) as diagrams,
             collect(DISTINCT blockDef) as blockDefs,
             collect(DISTINCT placedBlock) as placedBlocks,
             collect(DISTINCT connector) as connectors

        // Build all nodes
        WITH
          [{id: id(tenant), label: tenant.slug, type: 'Tenant', properties: properties(tenant)}] +
          [{id: id(project), label: project.slug, type: 'Project', properties: properties(project)}] +
          [d IN docs WHERE d IS NOT NULL | {id: id(d), label: d.name, type: 'Document', properties: properties(d)}] +
          [s IN sections WHERE s IS NOT NULL | {id: id(s), label: s.name, type: 'DocumentSection', properties: properties(s)}] +
          [r IN reqs WHERE r IS NOT NULL | {id: id(r), label: r.ref, type: 'Requirement', properties: properties(r)}] +
          [i IN infos WHERE i IS NOT NULL | {id: id(i), label: i.ref, type: 'Info', properties: properties(i)}] +
          [sr IN surs WHERE sr IS NOT NULL | {id: id(sr), label: sr.slug, type: 'SurrogateReference', properties: properties(sr)}] +
          [rr IN relatedReqs WHERE rr IS NOT NULL | {id: id(rr), label: rr.ref, type: 'Requirement', properties: properties(rr)}] +
          [ls IN linksets WHERE ls IS NOT NULL | {id: id(ls), label: ls.sourceDocumentSlug + ' -> ' + ls.targetDocumentSlug, type: 'DocumentLinkset', properties: properties(ls)}] +
          [tl IN traceLinks WHERE tl IS NOT NULL | {id: id(tl), label: tl.linkType + ': ' + tl.sourceRequirementId + ' -> ' + tl.targetRequirementId, type: 'TraceLink', properties: properties(tl)}] +
          [c IN candidates WHERE c IS NOT NULL | {id: id(c), label: substring(c.text, 0, 50) + '...', type: 'RequirementCandidate', properties: properties(c)}] +
          [dia IN diagrams WHERE dia IS NOT NULL | {id: id(dia), label: dia.name, type: 'ArchitectureDiagram', properties: properties(dia)}] +
          [bd IN blockDefs WHERE bd IS NOT NULL | {id: id(bd), label: bd.name, type: 'ArchitectureBlock', properties: properties(bd)}] +
          [pb IN placedBlocks WHERE pb IS NOT NULL | {id: id(pb), label: pb.name, type: 'ArchitectureBlock', properties: properties(pb)}] +
          [conn IN connectors WHERE conn IS NOT NULL | {id: id(conn), label: COALESCE(conn.label, 'Connector'), type: 'ArchitectureConnector', properties: properties(conn)}]
          AS nodes,
          tenant, project, reqRels

        // Build all relationships
        // Tenant -> Project
        WITH nodes, reqRels, tenant, project,
             [{source: id(tenant), target: id(project), type: 'OWNS'}] as tenantRels

        OPTIONAL MATCH (project)-[r1:HAS_DOCUMENT]->(doc:Document)
        WHERE doc.deletedAt IS NULL
        WITH nodes, reqRels, tenantRels, collect(DISTINCT {source: id(project), target: id(doc), type: type(r1)}) as docRels, project

        OPTIONAL MATCH (project)-[:HAS_DOCUMENT]->(d:Document)-[r2:HAS_SECTION]->(sec:DocumentSection)
        WHERE d.deletedAt IS NULL
        WITH nodes, reqRels, tenantRels, docRels, collect(DISTINCT {source: id(d), target: id(sec), type: type(r2)}) as secRels, project

        OPTIONAL MATCH (project)-[:HAS_DOCUMENT]->(d2:Document)-[:HAS_SECTION]->(s:DocumentSection)-[r3:CONTAINS]->(content)
        WHERE d2.deletedAt IS NULL AND (content:Requirement OR content:Info OR content:SurrogateReference)
        WITH nodes, reqRels, tenantRels, docRels, secRels, collect(DISTINCT {source: id(s), target: id(content), type: type(r3)}) as contentRels, project

        // LinkSet relationships
        OPTIONAL MATCH (project)-[r4:HAS_LINKSET]->(linkset:DocumentLinkset)
        OPTIONAL MATCH (linkset)-[r5:FROM_DOCUMENT]->(sourceDoc:Document)
        WHERE sourceDoc.deletedAt IS NULL
        OPTIONAL MATCH (linkset)-[r6:TO_DOCUMENT]->(targetDoc:Document)
        WHERE targetDoc.deletedAt IS NULL
        WITH nodes, reqRels, tenantRels, docRels, secRels, contentRels,
             collect(DISTINCT {source: id(project), target: id(linkset), type: type(r4)}) as linksetRels,
             collect(DISTINCT {source: id(linkset), target: id(sourceDoc), type: type(r5)}) as fromDocRels,
             collect(DISTINCT {source: id(linkset), target: id(targetDoc), type: type(r6)}) as toDocRels,
             project

        // LINKED_TO relationships between documents
        OPTIONAL MATCH (project)-[:HAS_DOCUMENT]->(doc1:Document)-[r7:LINKED_TO]->(doc2:Document)<-[:HAS_DOCUMENT]-(project)
        WHERE doc1.deletedAt IS NULL AND doc2.deletedAt IS NULL
        WITH nodes, reqRels, tenantRels, docRels, secRels, contentRels, linksetRels, fromDocRels, toDocRels,
             collect(DISTINCT {source: id(doc1), target: id(doc2), type: type(r7)}) as linkedToRels,
             project

        // TraceLink relationships
        OPTIONAL MATCH (project)-[r8:HAS_TRACE_LINK]->(traceLink:TraceLink)
        OPTIONAL MATCH (traceLink)-[r9:FROM_REQUIREMENT]->(sourceReq:Requirement)
        OPTIONAL MATCH (traceLink)-[r10:TO_REQUIREMENT]->(targetReq:Requirement)
        OPTIONAL MATCH (linkset:DocumentLinkset)-[r11:CONTAINS_LINK]->(traceLink)
        WITH nodes, reqRels, tenantRels, docRels, secRels, contentRels, linksetRels, fromDocRels, toDocRels, linkedToRels,
             collect(DISTINCT {source: id(project), target: id(traceLink), type: type(r8)}) as traceLinkProjectRels,
             collect(DISTINCT {source: id(traceLink), target: id(sourceReq), type: type(r9)}) as traceLinkFromRels,
             collect(DISTINCT {source: id(traceLink), target: id(targetReq), type: type(r10)}) as traceLinkToRels,
             collect(DISTINCT {source: id(linkset), target: id(traceLink), type: type(r11)}) as linksetContainsRels,
             project

        // Candidate relationships
        OPTIONAL MATCH (project)-[r12:HAS_CANDIDATE]->(candidate:RequirementCandidate)
        WITH nodes, reqRels, tenantRels, docRels, secRels, contentRels, linksetRels, fromDocRels, toDocRels, linkedToRels, traceLinkProjectRels, traceLinkFromRels, traceLinkToRels, linksetContainsRels,
             collect(DISTINCT {source: id(project), target: id(candidate), type: type(r12)}) as candidateRels,
             project

        // Architecture relationships
        OPTIONAL MATCH (project)-[r13:HAS_ARCHITECTURE_DIAGRAM]->(archDiagram:ArchitectureDiagram)
        OPTIONAL MATCH (project)-[r14:HAS_ARCHITECTURE_BLOCK]->(archBlockDef:ArchitectureBlock)
        OPTIONAL MATCH (archDiagram)-[r15:HAS_BLOCK]->(archPlacedBlock:ArchitectureBlock)
        OPTIONAL MATCH (archDiagram)-[r16:HAS_CONNECTOR]->(archConnector:ArchitectureConnector)
        OPTIONAL MATCH (archConnector)-[r17:FROM_BLOCK]->(fromBlock:ArchitectureBlock)
        OPTIONAL MATCH (archConnector)-[r18:TO_BLOCK]->(toBlock:ArchitectureBlock)
        WITH nodes, reqRels, tenantRels, docRels, secRels, contentRels, linksetRels, fromDocRels, toDocRels, linkedToRels, traceLinkProjectRels, traceLinkFromRels, traceLinkToRels, linksetContainsRels, candidateRels,
             collect(DISTINCT {source: id(project), target: id(archDiagram), type: type(r13)}) as archDiagramRels,
             collect(DISTINCT {source: id(project), target: id(archBlockDef), type: type(r14)}) as archBlockDefRels,
             collect(DISTINCT {source: id(archDiagram), target: id(archPlacedBlock), type: type(r15)}) as archPlacedBlockRels,
             collect(DISTINCT {source: id(archDiagram), target: id(archConnector), type: type(r16)}) as archConnectorRels,
             collect(DISTINCT {source: id(archConnector), target: id(fromBlock), type: type(r17)}) as archFromBlockRels,
             collect(DISTINCT {source: id(archConnector), target: id(toBlock), type: type(r18)}) as archToBlockRels

        RETURN nodes, tenantRels + docRels + secRels + contentRels + reqRels + linksetRels + fromDocRels + toDocRels + linkedToRels + traceLinkProjectRels + traceLinkFromRels + traceLinkToRels + linksetContainsRels + candidateRels + archDiagramRels + archBlockDefRels + archPlacedBlockRels + archConnectorRels + archFromBlockRels + archToBlockRels as relationships
        `,
        { tenantSlug, projectSlug }
      );

      if (result.records.length === 0) {
        return reply.send({ nodes: [], relationships: [] });
      }

      const record = result.records[0];
      const nodes = (record.get("nodes") || [])
        .filter((n: any) => n !== null)
        .map((n: any) => ({
          id: n.id.toString(),
          label: n.label || "Unknown",
          type: n.type,
          properties: n.properties || {}
        }));

      // Create a Set of node IDs for fast lookup
      const nodeIds = new Set(nodes.map((n: any) => n.id));

      const relationships = (record.get("relationships") || [])
        .flat()
        .filter((r: any) => r && r.source && r.target && r.type)
        .filter((r: any) => {
          const sourceId = r.source.toString();
          const targetId = r.target.toString();
          // Only include relationships where both source and target nodes exist
          return nodeIds.has(sourceId) && nodeIds.has(targetId);
        })
        .map((r: any) => ({
          id: `${r.source}-${r.type}-${r.target}`,
          source: r.source.toString(),
          target: r.target.toString(),
          type: r.type,
          properties: {}
        }));

      return reply.send({ nodes, relationships });
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: "Failed to fetch graph data" });
    } finally {
      await session.close();
    }
  });
};

export default graphRoutes;
