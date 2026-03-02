import { initGraph, closeGraph } from "../src/services/graph.js";
import { logger } from "../src/lib/logger.js";
import { getSession } from "../src/services/graph/driver.js";
import { slugify } from "../src/services/workspace.js";

type SeedOptions = {
  tenant: string;
  projectKey: string;
};

async function createConstraints(): Promise<void> {
  const session = getSession();

  try {
    await session.executeWrite(async tx => {
      const statements = [
        "CREATE CONSTRAINT sysml_package_id IF NOT EXISTS FOR (pkg:SYSML_PACKAGE) REQUIRE pkg.id IS UNIQUE",
        "CREATE INDEX sysml_package_tenant_project IF NOT EXISTS FOR (pkg:SYSML_PACKAGE) ON (pkg.tenant, pkg.projectKey)",
        "CREATE CONSTRAINT sysml_viewpoint_id IF NOT EXISTS FOR (vp:SYSML_VIEWPOINT) REQUIRE vp.id IS UNIQUE",
        "CREATE INDEX sysml_viewpoint_tenant_project IF NOT EXISTS FOR (vp:SYSML_VIEWPOINT) ON (vp.tenant, vp.projectKey)",
        "CREATE CONSTRAINT sysml_diagram_id IF NOT EXISTS FOR (diag:SYSML_DIAGRAM) REQUIRE diag.id IS UNIQUE"
      ];

      for (const cypher of statements) {
        await tx.run(cypher);
      }
    });
  } finally {
    await session.close();
  }
}

async function seedSampleData(options: SeedOptions): Promise<void> {
  const session = getSession();
  const now = new Date().toISOString();
  const tenantSlug = slugify(options.tenant);
  const projectSlug = slugify(options.projectKey);
  const rootPackageId = `sysml-root-${tenantSlug}-${projectSlug}`;
  const structuralPackageId = `sysml-structural-${tenantSlug}-${projectSlug}`;

  try {
    await session.executeWrite(async tx => {
      await tx.run(
        `
          MERGE (tenant:Tenant {slug: $tenantSlug})
            ON CREATE SET tenant.createdAt = $now
          MERGE (project:Project {slug: $projectSlug, tenantSlug: $tenantSlug})
            ON CREATE SET project.projectKey = $projectKey, project.createdAt = $now
          MERGE (tenant)-[:OWNS]->(project)
        `,
        {
          tenantSlug,
          projectSlug,
          projectKey: options.projectKey,
          now
        }
      );

      const packages = [
        {
          id: rootPackageId,
          name: "Evaluation SysML Model",
          packageKind: "model",
          parentId: null,
          isRoot: true,
          defaultViewpoints: ["bdd", "ibd"],
          metadata: null
        },
        {
          id: structuralPackageId,
          name: "Structural Library",
          packageKind: "library",
          parentId: rootPackageId,
          isRoot: false,
          defaultViewpoints: ["bdd"],
          metadata: { description: "Sample structural elements for demos" }
        }
      ];

      await tx.run(
        `
          UNWIND $packages AS pkg
          MERGE (node:SYSML_PACKAGE {id: pkg.id})
            ON CREATE SET node.createdAt = $now
          SET node.name = pkg.name,
              node.packageKind = pkg.packageKind,
              node.parentId = pkg.parentId,
              node.tenant = $tenant,
              node.projectKey = $projectKey,
              node.isRoot = pkg.isRoot,
              node.defaultViewpoints = pkg.defaultViewpoints,
              node.metadata = pkg.metadata,
              node.lifecycleState = coalesce(node.lifecycleState, 'active'),
              node.updatedAt = $now
          WITH node, pkg
          MATCH (project:Project {slug: $projectSlug, tenantSlug: $tenantSlug})
          MERGE (project)-[:HAS_SYSML_PACKAGE]->(node)
          WITH node, pkg
          CALL {
            WITH node, pkg
            WHERE pkg.parentId IS NOT NULL
            MATCH (parent:SYSML_PACKAGE {id: pkg.parentId, tenant: $tenant, projectKey: $projectKey})
            MERGE (parent)-[:CONTAINS]->(node)
            RETURN 1
          }
          RETURN count(node) AS packageCount
        `,
        {
          packages,
          tenant: options.tenant,
          projectKey: options.projectKey,
          tenantSlug,
          projectSlug,
          now
        }
      );

      const viewpoints = [
        {
          id: `sysml-viewpoint-bdd-${tenantSlug}-${projectSlug}`,
          name: "Block Definition View",
          description: "Default viewpoint for structural block definition diagrams.",
          elementTypes: ["block"],
          diagramTypes: ["bdd"]
        },
        {
          id: `sysml-viewpoint-ibd-${tenantSlug}-${projectSlug}`,
          name: "Internal Block View",
          description: "Default viewpoint for internal block diagrams showing flows and ports.",
          elementTypes: ["block", "port"],
          diagramTypes: ["ibd"]
        }
      ];

      await tx.run(
        `
          UNWIND $viewpoints AS vp
          MERGE (view:SYSML_VIEWPOINT {id: vp.id})
            ON CREATE SET view.createdAt = $now
          SET view.name = vp.name,
              view.description = vp.description,
              view.elementTypes = vp.elementTypes,
              view.diagramTypes = vp.diagramTypes,
              view.tenant = $tenant,
              view.projectKey = $projectKey,
              view.metadata = coalesce(view.metadata, {}),
              view.updatedAt = $now
          RETURN count(view) AS viewpointCount
        `,
        {
          viewpoints,
          tenant: options.tenant,
          projectKey: options.projectKey,
          now
        }
      );
    });
  } finally {
    await session.close();
  }

  logger.info("[SysML] Seeded evaluation packages and viewpoints", {
    tenant: options.tenant,
    projectKey: options.projectKey,
    rootPackageId
  });
}

function parseSeedOptions(): SeedOptions {
  const tenant = process.env.SYSML_SEED_TENANT ?? "demo";
  const projectKey = process.env.SYSML_SEED_PROJECT ?? "sysml-eval";

  return { tenant, projectKey };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const seedRequested = args.includes("--seed");

  logger.info("[SysML] migrate-add-sysml starting");
  await initGraph();
  logger.info("[SysML] Neo4j connectivity verified");

  await createConstraints();
  logger.info("[SysML] Constraints and indexes ensured");

  if (seedRequested) {
    const seedOptions = parseSeedOptions();
    logger.info("[SysML] Seeding sample data", seedOptions);
    await seedSampleData(seedOptions);
  } else {
    logger.info("[SysML] Seed skipped (pass --seed to populate evaluation data)");
  }
}

main()
  .catch((error) => {
    logger.error({ err: error }, "[SysML] migrate-add-sysml failed");
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeGraph();
    logger.info("[SysML] migrate-add-sysml finished.");
  });
