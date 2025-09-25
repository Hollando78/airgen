import neo4j, { Driver, Session } from "neo4j-driver";
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
      { encrypted: getEncryption() }
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
