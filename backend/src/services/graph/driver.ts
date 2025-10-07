import type { Driver, Session } from "neo4j-driver";
import neo4j from "neo4j-driver";
import { config } from "../../config.js";

let driver: Driver | null = null;

function getEncryption(): "ENCRYPTION_ON" | "ENCRYPTION_OFF" {
  return config.graph.encrypted ? "ENCRYPTION_ON" : "ENCRYPTION_OFF";
}

export async function initGraph(): Promise<void> {
  if (!driver) {
    driver = neo4j.driver(
      config.graph.url,
      neo4j.auth.basic(config.graph.username, config.graph.password),
      {
        encrypted: getEncryption(),
        // Connection pool configuration for optimal performance and resource management
        maxConnectionPoolSize: 50,           // Max concurrent connections (default: 100)
        connectionAcquisitionTimeout: 60000, // Wait up to 60s for connection (default: 60000)
        maxConnectionLifetime: 3600000,      // Recycle connections after 1 hour (default: 1 hour)
        connectionTimeout: 30000,            // Connection establishment timeout 30s (default: 30000)
      }
    );
  }

  await driver.verifyConnectivity();
}

export async function closeGraph(): Promise<void> {
  if (driver) {
    await driver.close();
    driver = null;
  }
}

export function getSession(): Session {
  if (!driver) {
    throw new Error("Graph driver not initialized. Call initGraph() first.");
  }

  return driver.session({ database: config.graph.database });
}

export function __setDriverForTests(mock: Driver | null): void {
  driver = mock;
}
