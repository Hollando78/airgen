/**
 * Activity Service
 *
 * Aggregates activity events from various sources in the Neo4j graph:
 * - Version history nodes (RequirementVersion, BlockVersion, etc.)
 * - Candidate nodes (RequirementCandidate, DiagramCandidate)
 * - Imagine images (ImagineImage)
 * - Baselines (Baseline)
 * - Trace links (LinkSet)
 */

import { getSession } from "./driver.js";
import neo4j, { type Integer } from "neo4j-driver";

// ============================================================================
// Types
// ============================================================================

export type ActivityType =
  | 'requirement'
  | 'document'
  | 'section'
  | 'block'
  | 'diagram'
  | 'connector'
  | 'port'
  | 'package'
  | 'candidate'
  | 'diagram-candidate'
  | 'imagine'
  | 'baseline'
  | 'link';

export type ActionType =
  | 'created'
  | 'updated'
  | 'archived'
  | 'restored'
  | 'deleted'
  | 'accepted'
  | 'rejected'
  | 'generated';

export interface ActivityEvent {
  id: string;
  timestamp: string;
  activityType: ActivityType;
  actionType: ActionType;
  entityId: string;
  entityName: string;
  entityRef?: string; // For requirements
  userId: string;
  userName?: string;
  description: string;
  metadata: Record<string, any>;
  tenantSlug: string;
  projectSlug: string;
}

export interface ActivityFilters {
  tenantSlug: string;
  projectSlug: string;
  activityTypes?: ActivityType[];
  actionTypes?: ActionType[];
  userIds?: string[];
  startDate?: string;
  endDate?: string;
  searchQuery?: string;
  limit?: number;
  offset?: number;
}

export interface ActivityResponse {
  events: ActivityEvent[];
  total: number;
  hasMore: boolean;
  nextOffset?: number;
}

export interface ActivityStats {
  totalEvents: number;
  eventsByType: Record<ActivityType, number>;
  eventsByAction: Record<ActionType, number>;
  recentUsers: Array<{ userId: string; count: number }>;
  activeUsers: number;
}

// ============================================================================
// Activity Aggregation
// ============================================================================

/**
 * List activity events from all sources
 */
export async function listActivity(filters: ActivityFilters): Promise<ActivityResponse> {
  const session = getSession();

  const limit = Math.floor(filters.limit || 50);
  const offset = Math.floor(filters.offset || 0);

  try {
    // Build WHERE clauses for filtering
    const whereClauses: string[] = [];
    const params: Record<string, any> = {
      tenantSlug: filters.tenantSlug,
      projectSlug: filters.projectSlug,
      limit: neo4j.int(limit + 1), // Fetch one extra to determine if there are more results - use neo4j.int() to ensure integer type
      offset: neo4j.int(offset)
    };

    // Activity type filter
    if (filters.activityTypes && filters.activityTypes.length > 0) {
      whereClauses.push(`activityType IN $activityTypes`);
      params.activityTypes = filters.activityTypes;
    }

    // Action type filter
    if (filters.actionTypes && filters.actionTypes.length > 0) {
      whereClauses.push(`actionType IN $actionTypes`);
      params.actionTypes = filters.actionTypes;
    }

    // User filter
    if (filters.userIds && filters.userIds.length > 0) {
      whereClauses.push(`userId IN $userIds`);
      params.userIds = filters.userIds;
    }

    // Date range filter
    if (filters.startDate) {
      whereClauses.push(`timestamp >= $startDate`);
      params.startDate = filters.startDate;
    }
    if (filters.endDate) {
      whereClauses.push(`timestamp <= $endDate`);
      params.endDate = filters.endDate;
    }

    // Search query filter (entity name or ref)
    if (filters.searchQuery) {
      whereClauses.push(`(toLower(entityName) CONTAINS toLower($searchQuery) OR toLower(coalesce(entityRef, '')) CONTAINS toLower($searchQuery))`);
      params.searchQuery = filters.searchQuery;
    }

    const whereClause = whereClauses.length > 0
      ? `WHERE ${whereClauses.join(' AND ')}`
      : '';

    // Query to aggregate events from all sources
    const query = `
      CALL {
        // Get requirement version events
        MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project {slug: $projectSlug})
      OPTIONAL MATCH (project)-[:HAS_DOCUMENT]->(doc:Document)-[:CONTAINS]->(req:Requirement)-[:HAS_VERSION]->(reqVer:RequirementVersion)
      WITH
        reqVer.versionId as id,
        reqVer.timestamp as timestamp,
        'requirement' as activityType,
        reqVer.changeType as actionType,
        req.id as entityId,
        req.text as entityName,
        req.ref as entityRef,
        reqVer.changedBy as userId,
        reqVer.changeDescription as description,
        {versionNumber: reqVer.versionNumber, text: reqVer.text} as metadata,
        $tenantSlug as tenantSlug,
        $projectSlug as projectSlug
      WHERE reqVer IS NOT NULL
      RETURN id, timestamp, activityType, actionType, entityId, entityName,
             entityRef, userId, description, metadata, tenantSlug, projectSlug

      UNION ALL

      // Get document version events
      MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project {slug: $projectSlug})
      OPTIONAL MATCH (project)-[:HAS_DOCUMENT]->(doc:Document)-[:HAS_VERSION]->(docVer:DocumentVersion)
      WITH
        docVer.versionId as id,
        docVer.timestamp as timestamp,
        'document' as activityType,
        docVer.changeType as actionType,
        doc.id as entityId,
        doc.name as entityName,
        null as entityRef,
        docVer.changedBy as userId,
        docVer.changeDescription as description,
        {versionNumber: docVer.versionNumber} as metadata,
        $tenantSlug as tenantSlug,
        $projectSlug as projectSlug
      WHERE docVer IS NOT NULL
      RETURN id, timestamp, activityType, actionType, entityId, entityName,
             entityRef, userId, description, metadata, tenantSlug, projectSlug

      UNION ALL

      // Get block version events
      MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project {slug: $projectSlug})
      OPTIONAL MATCH (project)-[:HAS_ARCHITECTURE_BLOCK]->(block)-[:HAS_VERSION]->(blockVer:BlockVersion)
      WITH
        blockVer.versionId as id,
        blockVer.timestamp as timestamp,
        'block' as activityType,
        blockVer.changeType as actionType,
        block.id as entityId,
        block.name as entityName,
        null as entityRef,
        blockVer.changedBy as userId,
        blockVer.changeDescription as description,
        {versionNumber: blockVer.versionNumber, kind: block.kind} as metadata,
        $tenantSlug as tenantSlug,
        $projectSlug as projectSlug
      WHERE blockVer IS NOT NULL
      RETURN id, timestamp, activityType, actionType, entityId, entityName,
             entityRef, userId, description, metadata, tenantSlug, projectSlug

      UNION ALL

      // Get diagram version events
      MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project {slug: $projectSlug})
      OPTIONAL MATCH (project)-[:HAS_ARCHITECTURE_DIAGRAM]->(diagram:ArchitectureDiagram)-[:HAS_VERSION]->(diagramVer:DiagramVersion)
      WITH
        diagramVer.versionId as id,
        diagramVer.timestamp as timestamp,
        'diagram' as activityType,
        diagramVer.changeType as actionType,
        diagram.id as entityId,
        diagram.name as entityName,
        null as entityRef,
        diagramVer.changedBy as userId,
        diagramVer.changeDescription as description,
        {versionNumber: diagramVer.versionNumber, view: diagram.view} as metadata,
        $tenantSlug as tenantSlug,
        $projectSlug as projectSlug
      WHERE diagramVer IS NOT NULL
      RETURN id, timestamp, activityType, actionType, entityId, entityName,
             entityRef, userId, description, metadata, tenantSlug, projectSlug

      UNION ALL

      // Get connector version events
      MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project {slug: $projectSlug})
      OPTIONAL MATCH (project)-[:HAS_ARCHITECTURE_CONNECTOR]->(connector)-[:HAS_VERSION]->(connVer:ConnectorVersion)
      WITH
        connVer.versionId as id,
        connVer.timestamp as timestamp,
        'connector' as activityType,
        connVer.changeType as actionType,
        connector.id as entityId,
        coalesce(connector.label, connector.kind) as entityName,
        null as entityRef,
        connVer.changedBy as userId,
        connVer.changeDescription as description,
        {versionNumber: connVer.versionNumber, kind: connector.kind} as metadata,
        $tenantSlug as tenantSlug,
        $projectSlug as projectSlug
      WHERE connVer IS NOT NULL
      RETURN id, timestamp, activityType, actionType, entityId, entityName,
             entityRef, userId, description, metadata, tenantSlug, projectSlug

      UNION ALL

      // Get requirement candidate events
      MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project {slug: $projectSlug})
      OPTIONAL MATCH (project)-[:HAS_REQUIREMENT_CANDIDATE]->(cand:RequirementCandidate)
      WITH
        cand.id as id,
        cand.createdAt as timestamp,
        'candidate' as activityType,
        CASE WHEN cand.status = 'accepted' THEN 'accepted'
             WHEN cand.status = 'rejected' THEN 'rejected'
             ELSE 'created' END as actionType,
        cand.id as entityId,
        substring(cand.text, 0, 100) as entityName,
        null as entityRef,
        'system' as userId,
        CASE WHEN cand.prompt IS NOT NULL THEN 'Generated from AIRGen prompt' ELSE 'Created as draft' END as description,
        {status: cand.status, qaScore: cand.qaScore} as metadata,
        $tenantSlug as tenantSlug,
        $projectSlug as projectSlug
      WHERE cand IS NOT NULL
      RETURN id, timestamp, activityType, actionType, entityId, entityName,
             entityRef, userId, description, metadata, tenantSlug, projectSlug

      UNION ALL

      // Get diagram candidate events
      MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project {slug: $projectSlug})
      OPTIONAL MATCH (project)-[:HAS_DIAGRAM_CANDIDATE]->(diagCand:DiagramCandidate)
      WITH
        diagCand.id as id,
        diagCand.createdAt as timestamp,
        'diagram-candidate' as activityType,
        CASE WHEN diagCand.status = 'accepted' THEN 'accepted'
             WHEN diagCand.status = 'rejected' THEN 'rejected'
             ELSE 'created' END as actionType,
        diagCand.id as entityId,
        coalesce(diagCand.name, 'Untitled Diagram') as entityName,
        null as entityRef,
        'system' as userId,
        'Generated from AIRGen diagram request' as description,
        {status: diagCand.status, view: diagCand.view} as metadata,
        $tenantSlug as tenantSlug,
        $projectSlug as projectSlug
      WHERE diagCand IS NOT NULL
      RETURN id, timestamp, activityType, actionType, entityId, entityName,
             entityRef, userId, description, metadata, tenantSlug, projectSlug

      UNION ALL

      // Get Imagine image events
      MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project {slug: $projectSlug})
      OPTIONAL MATCH (project)-[:HAS_IMAGINE_IMAGE]->(img:ImagineImage)
      WITH
        img.id as id,
        img.createdAt as timestamp,
        'imagine' as activityType,
        'generated' as actionType,
        img.id as entityId,
        img.elementName as entityName,
        null as entityRef,
        img.createdBy as userId,
        CASE WHEN img.parentVersionId IS NOT NULL THEN 'Regenerated image' ELSE 'Generated image' END as description,
        {elementType: img.elementType, version: img.version, model: img.model} as metadata,
        $tenantSlug as tenantSlug,
        $projectSlug as projectSlug
      WHERE img IS NOT NULL
      RETURN id, timestamp, activityType, actionType, entityId, entityName,
             entityRef, userId, description, metadata, tenantSlug, projectSlug

      UNION ALL

      // Get baseline events
      MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project {slug: $projectSlug})
      OPTIONAL MATCH (project)-[:HAS_BASELINE]->(baseline:Baseline)
      WITH
        baseline.id as id,
        baseline.createdAt as timestamp,
        'baseline' as activityType,
        'created' as actionType,
        baseline.id as entityId,
        baseline.name as entityName,
        baseline.ref as entityRef,
        baseline.createdBy as userId,
        baseline.description as description,
        {status: baseline.status, requirementCount: COUNT { (baseline)<-[:BASELINED_IN]-() }} as metadata,
        $tenantSlug as tenantSlug,
        $projectSlug as projectSlug
      WHERE baseline IS NOT NULL
      RETURN id, timestamp, activityType, actionType, entityId, entityName,
             entityRef, userId, description, metadata, tenantSlug, projectSlug

      UNION ALL

      // Get link set events
      MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project {slug: $projectSlug})
      OPTIONAL MATCH (project)-[:HAS_LINKSET]->(linkset:LinkSet)
      WITH
        linkset.id as id,
        linkset.createdAt as timestamp,
        'link' as activityType,
        'created' as actionType,
        linkset.id as entityId,
        linkset.name as entityName,
        null as entityRef,
        linkset.createdBy as userId,
        linkset.description as description,
        {linkCount: COUNT { (linkset)-[:HAS_LINK]->() }} as metadata,
        $tenantSlug as tenantSlug,
        $projectSlug as projectSlug
      WHERE linkset IS NOT NULL
      RETURN id, timestamp, activityType, actionType, entityId, entityName,
             entityRef, userId, description, metadata, tenantSlug, projectSlug
      }

      WITH id, timestamp, activityType, actionType, entityId, entityName,
           entityRef, userId, description, metadata, tenantSlug, projectSlug
      ${whereClause}
      RETURN id, timestamp, activityType, actionType, entityId, entityName,
             entityRef, userId, description, metadata, tenantSlug, projectSlug
      ORDER BY timestamp DESC
      SKIP $offset
      LIMIT $limit
    `;

    const result = await session.run(query, params);

    const events: ActivityEvent[] = result.records.slice(0, limit).map(record => ({
      id: String(record.get('id')),
      timestamp: String(record.get('timestamp')),
      activityType: String(record.get('activityType')) as ActivityType,
      actionType: String(record.get('actionType')) as ActionType,
      entityId: String(record.get('entityId')),
      entityName: String(record.get('entityName')),
      entityRef: record.get('entityRef') ? String(record.get('entityRef')) : undefined,
      userId: String(record.get('userId')),
      description: String(record.get('description') || ''),
      metadata: record.get('metadata') || {},
      tenantSlug: String(record.get('tenantSlug')),
      projectSlug: String(record.get('projectSlug'))
    }));

    const hasMore = result.records.length > limit;
    const total = events.length; // Approximate - full count would be expensive

    return {
      events,
      total,
      hasMore,
      nextOffset: hasMore ? offset + limit : undefined
    };

  } finally {
    await session.close();
  }
}

/**
 * Get activity statistics
 */
export async function getActivityStats(tenantSlug: string, projectSlug: string): Promise<ActivityStats> {
  const session = getSession();

  try {
    // Get event counts by type and action
    const statsQuery = `
      MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project {slug: $projectSlug})

      // Count requirement versions (fixed path through documents)
      OPTIONAL MATCH (project)-[:HAS_DOCUMENT]->(:Document)-[:CONTAINS]->(:Requirement)-[:HAS_VERSION]->(reqVer:RequirementVersion)
      WITH project,
           count(reqVer) as requirementCount,
           collect(distinct reqVer.changedBy) as reqUsers,
           sum(CASE WHEN reqVer.changeType = 'created' THEN 1 ELSE 0 END) as reqCreated,
           sum(CASE WHEN reqVer.changeType = 'updated' THEN 1 ELSE 0 END) as reqUpdated

      // Count document versions
      OPTIONAL MATCH (project)-[:HAS_DOCUMENT]->(:Document)-[:HAS_VERSION]->(docVer:DocumentVersion)
      WITH project, requirementCount, reqUsers, reqCreated, reqUpdated,
           count(docVer) as documentCount,
           collect(distinct docVer.changedBy) as docUsers,
           sum(CASE WHEN docVer.changeType = 'created' THEN 1 ELSE 0 END) as docCreated,
           sum(CASE WHEN docVer.changeType = 'updated' THEN 1 ELSE 0 END) as docUpdated

      // Count block versions
      OPTIONAL MATCH (project)-[:HAS_ARCHITECTURE_BLOCK]->()-[:HAS_VERSION]->(blockVer:BlockVersion)
      WITH project, requirementCount, reqUsers, reqCreated, reqUpdated, documentCount, docUsers, docCreated, docUpdated,
           count(blockVer) as blockCount,
           collect(distinct blockVer.changedBy) as blockUsers,
           sum(CASE WHEN blockVer.changeType = 'created' THEN 1 ELSE 0 END) as blockCreated,
           sum(CASE WHEN blockVer.changeType = 'updated' THEN 1 ELSE 0 END) as blockUpdated

      // Count diagram versions
      OPTIONAL MATCH (project)-[:HAS_ARCHITECTURE_DIAGRAM]->()-[:HAS_VERSION]->(diagramVer:DiagramVersion)
      WITH project, requirementCount, reqUsers, reqCreated, reqUpdated, documentCount, docUsers, docCreated, docUpdated,
           blockCount, blockUsers, blockCreated, blockUpdated,
           count(diagramVer) as diagramCount,
           collect(distinct diagramVer.changedBy) as diagramUsers,
           sum(CASE WHEN diagramVer.changeType = 'created' THEN 1 ELSE 0 END) as diagramCreated,
           sum(CASE WHEN diagramVer.changeType = 'updated' THEN 1 ELSE 0 END) as diagramUpdated

      // Count imagine images
      OPTIONAL MATCH (project)-[:HAS_IMAGINE_IMAGE]->(img:ImagineImage)
      WITH project, requirementCount, reqUsers, reqCreated, reqUpdated, documentCount, docUsers, docCreated, docUpdated,
           blockCount, blockUsers, blockCreated, blockUpdated, diagramCount, diagramUsers, diagramCreated, diagramUpdated,
           count(img) as imagineCount,
           collect(distinct img.createdBy) as imgUsers

      // Count baselines
      OPTIONAL MATCH (project)-[:HAS_BASELINE]->(baseline:Baseline)
      WITH requirementCount, reqUsers, reqCreated, reqUpdated, documentCount, docUsers, docCreated, docUpdated,
           blockCount, blockUsers, blockCreated, blockUpdated, diagramCount, diagramUsers, diagramCreated, diagramUpdated,
           imagineCount, imgUsers,
           count(baseline) as baselineCount,
           collect(distinct baseline.createdBy) as baselineUsers

      // Aggregate all users
      WITH requirementCount, reqCreated, reqUpdated, documentCount, docCreated, docUpdated,
           blockCount, blockCreated, blockUpdated, diagramCount, diagramCreated, diagramUpdated,
           imagineCount, baselineCount,
           reqUsers + docUsers + blockUsers + diagramUsers + imgUsers + baselineUsers as allUsers

      UNWIND allUsers as userId
      WITH requirementCount, reqCreated, reqUpdated, documentCount, docCreated, docUpdated,
           blockCount, blockCreated, blockUpdated, diagramCount, diagramCreated, diagramUpdated,
           imagineCount, baselineCount,
           userId, count(*) as userEventCount
      ORDER BY userEventCount DESC
      LIMIT 10

      RETURN
        requirementCount, reqCreated, reqUpdated, documentCount, docCreated, docUpdated,
        blockCount, blockCreated, blockUpdated, diagramCount, diagramCreated, diagramUpdated,
        imagineCount, baselineCount,
        collect({userId: userId, count: userEventCount}) as recentUsers,
        count(distinct userId) as activeUserCount
    `;

    const result = await session.run(statsQuery, { tenantSlug, projectSlug });

    if (result.records.length === 0) {
      return {
        totalEvents: 0,
        eventsByType: {} as Record<ActivityType, number>,
        eventsByAction: {} as Record<ActionType, number>,
        recentUsers: [],
        activeUsers: 0
      };
    }

    const record = result.records[0];

    const requirementCount = (record.get('requirementCount') as Integer)?.toNumber() || 0;
    const reqCreated = (record.get('reqCreated') as Integer)?.toNumber() || 0;
    const reqUpdated = (record.get('reqUpdated') as Integer)?.toNumber() || 0;

    const documentCount = (record.get('documentCount') as Integer)?.toNumber() || 0;
    const docCreated = (record.get('docCreated') as Integer)?.toNumber() || 0;
    const docUpdated = (record.get('docUpdated') as Integer)?.toNumber() || 0;

    const blockCount = (record.get('blockCount') as Integer)?.toNumber() || 0;
    const blockCreated = (record.get('blockCreated') as Integer)?.toNumber() || 0;
    const blockUpdated = (record.get('blockUpdated') as Integer)?.toNumber() || 0;

    const diagramCount = (record.get('diagramCount') as Integer)?.toNumber() || 0;
    const diagramCreated = (record.get('diagramCreated') as Integer)?.toNumber() || 0;
    const diagramUpdated = (record.get('diagramUpdated') as Integer)?.toNumber() || 0;

    const imagineCount = (record.get('imagineCount') as Integer)?.toNumber() || 0;
    const baselineCount = (record.get('baselineCount') as Integer)?.toNumber() || 0;
    const activeUserCount = (record.get('activeUserCount') as Integer)?.toNumber() || 0;

    const recentUsers = (record.get('recentUsers') || []).map((u: any) => ({
      userId: String(u.userId),
      count: typeof u.count === 'number' ? u.count : (u.count as Integer).toNumber()
    }));

    const totalCreated = reqCreated + docCreated + blockCreated + diagramCreated + imagineCount + baselineCount;
    const totalUpdated = reqUpdated + docUpdated + blockUpdated + diagramUpdated;

    return {
      totalEvents: requirementCount + documentCount + blockCount + diagramCount + imagineCount + baselineCount,
      eventsByType: {
        requirement: requirementCount,
        document: documentCount,
        section: 0, // Not tracked separately
        block: blockCount,
        diagram: diagramCount,
        connector: 0, // Included in block count
        port: 0, // Not tracked separately
        package: 0, // Not tracked separately
        candidate: 0, // Not included in stats for now
        'diagram-candidate': 0,
        imagine: imagineCount,
        baseline: baselineCount,
        link: 0 // Not tracked separately
      },
      eventsByAction: {
        created: totalCreated,
        updated: totalUpdated,
        archived: 0,
        restored: 0,
        deleted: 0,
        accepted: 0,
        rejected: 0,
        generated: imagineCount // Imagine images are "generated"
      } as Record<ActionType, number>,
      recentUsers,
      activeUsers: activeUserCount
    };

  } finally {
    await session.close();
  }
}
