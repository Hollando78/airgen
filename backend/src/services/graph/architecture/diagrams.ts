import type { ManagedTransaction, Node as Neo4jNode } from "neo4j-driver";
import { slugify } from "../../workspace.js";
import { getSession } from "../driver.js";
import type { ArchitectureDiagramRecord } from "./types.js";
import { mapArchitectureDiagram } from "./mappers.js";
import { toNumber } from "../../../lib/neo4j-utils.js";
import { createArchitectureDiagramVersion, generateArchitectureDiagramContentHash } from "./diagrams-versions.js";

export async function createArchitectureDiagram(params: {
  tenant: string;
  projectKey: string;
  name: string;
  description?: string;
  view?: ArchitectureDiagramRecord["view"];
  userId: string;
}): Promise<ArchitectureDiagramRecord> {
  const tenantSlug = slugify(params.tenant);
  const projectSlug = slugify(params.projectKey);
  const now = new Date().toISOString();
  const diagramId = `diagram-${Date.now()}`;

  const session = getSession();

  try {
    const result = await session.executeWrite(async (tx: ManagedTransaction) => {
      const query = `
        MERGE (tenant:Tenant {slug: $tenantSlug})
          ON CREATE SET tenant.createdAt = $now
        MERGE (project:Project {slug: $projectSlug, tenantSlug: $tenantSlug})
          ON CREATE SET project.projectKey = $projectKey, project.createdAt = $now
        MERGE (tenant)-[:OWNS]->(project)
        CREATE (diagram:ArchitectureDiagram {
          id: $diagramId,
          name: $name,
          description: $description,
          view: $view,
          tenant: $tenant,
          projectKey: $projectKey,
          isVisible: true,
          createdAt: $now,
          updatedAt: $now
        })
        MERGE (project)-[:HAS_ARCHITECTURE_DIAGRAM]->(diagram)
        RETURN diagram
      `;

      const queryResult = await tx.run(query, {
        tenantSlug,
        projectSlug,
        diagramId,
        name: params.name,
        description: params.description ?? null,
        view: params.view ?? "block",
        tenant: params.tenant,
        projectKey: params.projectKey,
        now
      });

      if (queryResult.records.length === 0) {
        throw new Error("Project not found for architecture diagram creation");
      }

      const node = queryResult.records[0].get("diagram") as Neo4jNode;
      return mapArchitectureDiagram(node);
    });

    // Create version 1 for the new diagram
    await session.executeWrite(async (tx: ManagedTransaction) => {
      const contentHash = generateArchitectureDiagramContentHash({
        name: params.name,
        description: params.description,
        view: params.view ?? "block"
      });

      await createArchitectureDiagramVersion(tx, {
        diagramId,
        tenantSlug,
        projectSlug,
        changedBy: params.userId,
        changeType: 'created',
        name: params.name,
        description: params.description,
        view: params.view ?? "block",
        contentHash
      });
    });

    return result;
  } finally {
    await session.close();
  }
}

export async function getArchitectureDiagrams(params: {
  tenant: string;
  projectKey: string;
  includeHidden?: boolean;
}): Promise<ArchitectureDiagramRecord[]> {
  const tenantSlug = slugify(params.tenant);
  const projectSlug = slugify(params.projectKey);

  const session = getSession();
  try {
    const visibilityFilter = params.includeHidden ? '' : 'AND (diagram.isVisible = true OR diagram.isVisible IS NULL)';

    const result = await session.run(
      `
        MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project {slug: $projectSlug})
        OPTIONAL MATCH (project)-[:HAS_ARCHITECTURE_DIAGRAM]->(diagram:ArchitectureDiagram)
        WHERE diagram IS NOT NULL ${visibilityFilter}
        RETURN DISTINCT diagram
        ORDER BY diagram.createdAt
      `,
      { tenantSlug, projectSlug }
    );

    return result.records
      .map(record => record.get("diagram") as Neo4jNode | null)
      .filter((node): node is Neo4jNode => node !== null)
      .map(mapArchitectureDiagram);
  } finally {
    await session.close();
  }
}

export async function updateArchitectureDiagram(params: {
  tenant: string;
  projectKey: string;
  diagramId: string;
  name?: string;
  description?: string;
  view?: ArchitectureDiagramRecord["view"];
  userId: string;
}): Promise<ArchitectureDiagramRecord> {
  const tenantSlug = slugify(params.tenant);
  const projectSlug = slugify(params.projectKey);
  const session = getSession();

  try {
    const result = await session.executeWrite(async (tx: ManagedTransaction) => {
      // First, get the current state
      const getCurrentQuery = `
        MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project {slug: $projectSlug})-[:HAS_ARCHITECTURE_DIAGRAM]->(diagram:ArchitectureDiagram {id: $diagramId})
        RETURN diagram
      `;
      const currentResult = await tx.run(getCurrentQuery, { tenantSlug, projectSlug, diagramId: params.diagramId });
      if (currentResult.records.length === 0) {
        throw new Error("Architecture diagram not found");
      }

      const currentDiagram = currentResult.records[0].get("diagram");
      const currentProps = currentDiagram.properties;

      // Determine new values
      const newName = params.name !== undefined ? params.name : String(currentProps.name);
      const newDescription = params.description !== undefined ? params.description : (currentProps.description ? String(currentProps.description) : undefined);
      const newView = params.view !== undefined ? params.view : String(currentProps.view);

      // Check if content changed
      const oldContentHash = generateArchitectureDiagramContentHash({
        name: String(currentProps.name),
        description: currentProps.description ? String(currentProps.description) : undefined,
        view: String(currentProps.view)
      });
      const newContentHash = generateArchitectureDiagramContentHash({
        name: newName,
        description: newDescription,
        view: newView
      });

      const contentChanged = oldContentHash !== newContentHash;

      const updates: string[] = ["diagram.updatedAt = $now"];
      const queryParams: Record<string, unknown> = {
        tenantSlug,
        projectSlug,
        diagramId: params.diagramId,
        now: new Date().toISOString()
      };

      if (params.name !== undefined) {
        updates.push("diagram.name = $name");
        queryParams.name = params.name;
      }
      if (params.description !== undefined) {
        updates.push("diagram.description = $description");
        queryParams.description = params.description;
      }
      if (params.view !== undefined) {
        updates.push("diagram.view = $view");
        queryParams.view = params.view;
      }

      if (updates.length === 1) {
        throw new Error("No fields provided for update");
      }

      const query = `
        MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project {slug: $projectSlug})-[:HAS_ARCHITECTURE_DIAGRAM]->(diagram:ArchitectureDiagram {id: $diagramId})
        SET ${updates.join(", ")}
        RETURN diagram
      `;

      const res = await tx.run(query, queryParams);

      if (res.records.length === 0) {
        throw new Error("Architecture diagram not found");
      }

      // Create new version only if content changed
      if (contentChanged) {
        await createArchitectureDiagramVersion(tx, {
          diagramId: params.diagramId,
          tenantSlug,
          projectSlug,
          changedBy: params.userId,
          changeType: 'updated',
          name: newName,
          description: newDescription,
          view: newView as ArchitectureDiagramRecord["view"],
          contentHash: newContentHash
        });
      }

      return mapArchitectureDiagram(res.records[0].get("diagram") as Neo4jNode);
    });

    return result;
  } finally {
    await session.close();
  }
}

/**
 * Soft delete: Hide diagram by setting isVisible = false
 * Diagram and its contents remain in database for potential recovery
 */
export async function deleteArchitectureDiagram(params: {
  tenant: string;
  projectKey: string;
  diagramId: string;
  userId: string;
}): Promise<void> {
  const tenantSlug = slugify(params.tenant);
  const projectSlug = slugify(params.projectKey);

  const session = getSession();

  try {
    await session.executeWrite(async (tx: ManagedTransaction) => {
      const query = `
        MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project {slug: $projectSlug})-[:HAS_ARCHITECTURE_DIAGRAM]->(diagram:ArchitectureDiagram {id: $diagramId})
        SET diagram.isVisible = false, diagram.updatedAt = $now
        RETURN diagram
      `;

      const res = await tx.run(query, {
        tenantSlug,
        projectSlug,
        diagramId: params.diagramId,
        now: new Date().toISOString()
      });

      if (res.records.length === 0) {
        throw new Error("Architecture diagram not found");
      }

      // Create version tracking the hide action
      const diagram = res.records[0].get("diagram");
      const props = diagram.properties;

      const contentHash = generateArchitectureDiagramContentHash({
        name: String(props.name),
        description: props.description ? String(props.description) : undefined,
        view: String(props.view)
      });

      await createArchitectureDiagramVersion(tx, {
        diagramId: params.diagramId,
        tenantSlug,
        projectSlug,
        changedBy: params.userId,
        changeType: 'updated',
        name: String(props.name),
        description: props.description ? String(props.description) : undefined,
        view: String(props.view) as ArchitectureDiagramRecord["view"],
        contentHash
      });
    });
  } finally {
    await session.close();
  }
}

/**
 * Hard delete: Permanently remove diagram and all its contents from database
 * This action cannot be undone
 */
export async function permanentlyDeleteArchitectureDiagram(params: {
  tenant: string;
  projectKey: string;
  diagramId: string;
  userId: string;
}): Promise<void> {
  const tenantSlug = slugify(params.tenant);
  const projectSlug = slugify(params.projectKey);

  const session = getSession();

  try {
    await session.executeWrite(async (tx: ManagedTransaction) => {
      // First, get the current state to create a deletion version
      const getCurrentQuery = `
        MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project {slug: $projectSlug})-[:HAS_ARCHITECTURE_DIAGRAM]->(diagram:ArchitectureDiagram {id: $diagramId})
        RETURN diagram
      `;
      const currentResult = await tx.run(getCurrentQuery, { tenantSlug, projectSlug, diagramId: params.diagramId });

      if (currentResult.records.length > 0) {
        const currentDiagram = currentResult.records[0].get("diagram");
        const currentProps = currentDiagram.properties;

        // Create deletion version
        const contentHash = generateArchitectureDiagramContentHash({
          name: String(currentProps.name),
          description: currentProps.description ? String(currentProps.description) : undefined,
          view: String(currentProps.view)
        });

        await createArchitectureDiagramVersion(tx, {
          diagramId: params.diagramId,
          tenantSlug,
          projectSlug,
          changedBy: params.userId,
          changeType: 'deleted',
          name: String(currentProps.name),
          description: currentProps.description ? String(currentProps.description) : undefined,
          view: String(currentProps.view) as ArchitectureDiagramRecord["view"],
          contentHash
        });
      }

      const query = `
        MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project {slug: $projectSlug})-[:HAS_ARCHITECTURE_DIAGRAM]->(diagram:ArchitectureDiagram {id: $diagramId})
        OPTIONAL MATCH (diagram)-[:HAS_CONNECTOR]->(connector:ArchitectureConnector)
        OPTIONAL MATCH (diagram)-[rel:HAS_BLOCK]->(:ArchitectureBlock)
        DETACH DELETE connector
        DELETE rel
        DETACH DELETE diagram
        RETURN COUNT(*) AS removed
      `;

      const res = await tx.run(query, {
        tenantSlug,
        projectSlug,
        diagramId: params.diagramId
      });

      const removed = toNumber(res.records[0]?.get("removed"), 0);
      if (removed === 0) {
        throw new Error("Architecture diagram not found");
      }
    });
  } finally {
    await session.close();
  }
}

/**
 * Show/restore a hidden diagram
 */
export async function showArchitectureDiagram(params: {
  tenant: string;
  projectKey: string;
  diagramId: string;
}): Promise<void> {
  const tenantSlug = slugify(params.tenant);
  const projectSlug = slugify(params.projectKey);

  const session = getSession();

  try {
    const query = `
      MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project {slug: $projectSlug})-[:HAS_ARCHITECTURE_DIAGRAM]->(diagram:ArchitectureDiagram {id: $diagramId})
      SET diagram.isVisible = true, diagram.updatedAt = $now
      RETURN diagram
    `;

    const res = await session.run(query, {
      tenantSlug,
      projectSlug,
      diagramId: params.diagramId,
      now: new Date().toISOString()
    });

    if (res.records.length === 0) {
      throw new Error("Architecture diagram not found");
    }
  } finally {
    await session.close();
  }
}
