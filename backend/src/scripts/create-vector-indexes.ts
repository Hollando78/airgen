import { createVectorIndexes, checkVectorIndexes } from "../services/graph/schema/create-vector-indexes.js";
import { initGraph, closeGraph } from "../services/graph/driver.js";

async function main() {
  console.log('Starting vector index creation...\n');

  try {
    // Initialize graph driver
    console.log('Initializing graph connection...');
    await initGraph();
    console.log('✓ Graph connection established\n');

    // Check current status
    const exists = await checkVectorIndexes();

    if (exists) {
      console.log('✓ Vector indexes already exist and are online');
    } else {
      // Create indexes
      await createVectorIndexes();
      console.log('\n✓ Vector indexes created successfully');
    }

    await closeGraph();
    process.exit(0);
  } catch (error) {
    console.error('\n✗ Failed to create vector indexes:', error);
    await closeGraph();
    process.exit(1);
  }
}

main();
