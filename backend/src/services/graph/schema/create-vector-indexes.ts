import { getSession } from "../driver.js";
import { logger } from "../../../lib/logger.js";

/**
 * Create vector indexes for semantic search
 * Requires Neo4j 5.11+
 */
export async function createVectorIndexes(): Promise<void> {
  const session = getSession();

  try {
    logger.info('[Schema] Creating vector indexes...');

    // Create vector index for requirements
    await session.run(`
      CREATE VECTOR INDEX requirement_embeddings IF NOT EXISTS
      FOR (r:Requirement)
      ON r.embedding
      OPTIONS {
        indexConfig: {
          \`vector.dimensions\`: 1536,
          \`vector.similarity_function\`: 'cosine'
        }
      }
    `);

    logger.info('[Schema] Created requirement_embeddings vector index');

    // Wait for index to become available
    let indexReady = false;
    let attempts = 0;
    const maxAttempts = 30;

    while (!indexReady && attempts < maxAttempts) {
      const result = await session.run(`
        SHOW INDEXES
        YIELD name, state
        WHERE name = 'requirement_embeddings'
        RETURN state
      `);

      if (result.records.length > 0) {
        const state = result.records[0].get('state');
        if (state === 'ONLINE') {
          indexReady = true;
          logger.info('[Schema] Vector index is online and ready');
        } else {
          logger.info(`[Schema] Waiting for index... (state: ${state})`);
          await new Promise(resolve => setTimeout(resolve, 1000));
          attempts++;
        }
      } else {
        logger.info('[Schema] Waiting for index to appear...');
        await new Promise(resolve => setTimeout(resolve, 1000));
        attempts++;
      }
    }

    if (!indexReady) {
      logger.warn('[Schema] Vector index may not be ready yet, but continuing...');
    }

  } catch (error) {
    logger.error({ err: error }, '[Schema] Error creating vector indexes');
    throw error;
  } finally {
    await session.close();
  }
}

/**
 * Check if vector indexes exist and are online
 */
export async function checkVectorIndexes(): Promise<boolean> {
  const session = getSession();

  try {
    const result = await session.run(`
      SHOW INDEXES
      YIELD name, state, type
      WHERE name = 'requirement_embeddings'
      RETURN name, state, type
    `);

    if (result.records.length === 0) {
      logger.info('[Schema] Vector index does not exist');
      return false;
    }

    const state = result.records[0].get('state');
    const type = result.records[0].get('type');

    logger.info(`[Schema] Vector index status: ${state} (${type})`);

    return state === 'ONLINE';
  } catch (error) {
    logger.error({ err: error }, '[Schema] Error checking vector indexes');
    return false;
  } finally {
    await session.close();
  }
}
