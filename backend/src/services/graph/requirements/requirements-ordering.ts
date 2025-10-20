import type { ManagedTransaction } from "neo4j-driver";
import { getSession } from "../driver.js";

/**
 * Reorders requirements within a section based on an ordered list of IDs
 * Sets order to array index (0, 1, 2, ...)
 *
 * @param sectionId - Document section ID
 * @param requirementIds - Ordered list of requirement IDs
 */
export async function reorderRequirements(sectionId: string, requirementIds: string[]): Promise<void> {
  const session = getSession();
  try {
    await session.executeWrite(async (tx: ManagedTransaction) => {
      // Update order for each requirement
      for (let i = 0; i < requirementIds.length; i++) {
        const query = `
          MATCH (section:DocumentSection {id: $sectionId})-[rel:CONTAINS]->(requirement:Requirement {id: $requirementId})
          SET rel.order = $order, rel.updatedAt = $now, requirement.updatedAt = $now
        `;
        await tx.run(query, {
          sectionId,
          requirementId: requirementIds[i],
          order: i,
          now: new Date().toISOString()
        });
      }
    });
  } finally {
    await session.close();
  }
}

/**
 * Reorders requirements within a section with explicit order values
 * Allows setting arbitrary order values (not just sequential)
 *
 * @param sectionId - Document section ID
 * @param requirements - List of {id, order} pairs
 */
export async function reorderRequirementsWithOrder(
  sectionId: string,
  requirements: Array<{ id: string; order: number }>
): Promise<void> {
  const session = getSession();
  try {
    await session.executeWrite(async (tx: ManagedTransaction) => {
      // Update order for each requirement with explicit order value
      for (const req of requirements) {
        const query = `
          MATCH (section:DocumentSection {id: $sectionId})-[rel:CONTAINS]->(requirement:Requirement {id: $requirementId})
          SET rel.order = $order, rel.updatedAt = $now, requirement.updatedAt = $now
        `;
        await tx.run(query, {
          sectionId,
          requirementId: req.id,
          order: req.order,
          now: new Date().toISOString()
        });
      }
    });
  } finally {
    await session.close();
  }
}
