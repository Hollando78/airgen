import { Neo4jContainer, type StartedNeo4jContainer } from "@testcontainers/neo4j";
import type { Driver, Session } from "neo4j-driver";
import neo4j from "neo4j-driver";

type CypherSeed = {
  query: string;
  params?: Record<string, unknown>;
};

export type Neo4jTestEnvironment = {
  container: StartedNeo4jContainer;
  driver: Driver;
  session: Session;
};

async function seedDatabase(session: Session, seeds: CypherSeed[]): Promise<void> {
  for (const seed of seeds) {
    await session.run(seed.query, seed.params ?? {});
  }
}

export async function startNeo4jTestEnvironment(seeds: CypherSeed[] = []): Promise<Neo4jTestEnvironment> {
  const container = await new Neo4jContainer()
    .withPassword("test")
    .withStartupTimeout(60_000)
    .start();

  const driver = neo4j.driver(
    container.getBoltUri(),
    neo4j.auth.basic(container.getUsername(), container.getPassword())
  );

  const session = driver.session();

  if (seeds.length > 0) {
    await seedDatabase(session, seeds);
  }

  return { container, driver, session };
}

export async function stopNeo4jTestEnvironment(env: Neo4jTestEnvironment | null): Promise<void> {
  if (!env) return;

  await env.session.close();
  await env.driver.close();
  await env.container.stop();
}
