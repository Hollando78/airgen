import { randomUUID } from "node:crypto";
import process from "node:process";
import { initGraph, closeGraph, createSysmlPackage, listSysmlPackages, createSysmlElement, createSysmlElementRelationship, createSysmlDiagram } from "../services/graph.js";
import { getSession } from "../services/graph/driver.js";

type SeedOptions = {
  tenant: string;
  projectKey: string;
};

function parseArgs(): SeedOptions {
  const args = process.argv.slice(2);
  let tenant = "demo";
  let projectKey = "sysml-eval";

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if ((arg === "--tenant" || arg === "-t") && args[i + 1]) {
      tenant = args[i + 1];
      i++;
    } else if ((arg === "--project" || arg === "-p") && args[i + 1]) {
      projectKey = args[i + 1];
      i++;
    }
  }

  return { tenant, projectKey };
}

async function ensurePackage(options: SeedOptions): Promise<string> {
  const packages = await listSysmlPackages({
    tenant: options.tenant,
    projectKey: options.projectKey
  });

  const existing = packages.find(pkg => pkg.name === "Evaluation SysML Model");
  if (existing) {
    return existing.id;
  }

  const pkg = await createSysmlPackage({
    tenant: options.tenant,
    projectKey: options.projectKey,
    name: "Evaluation SysML Model",
    packageKind: "model",
    defaultViewpoints: ["bdd", "ibd"],
    metadata: { seeded: true }
  });

  return pkg.id;
}

async function seedElements(options: SeedOptions, packageId: string) {
  const controller = await createSysmlElement({
    tenant: options.tenant,
    projectKey: options.projectKey,
    elementType: "block",
    name: "Propulsion Controller",
    packageId,
    documentation: "Controls thrust vectoring and engine telemetry.",
    block: {
      blockKind: "component",
      defaultSize: { width: 320, height: 180 }
    }
  });

  const engine = await createSysmlElement({
    tenant: options.tenant,
    projectKey: options.projectKey,
    elementType: "block",
    name: "Engine Assembly",
    packageId,
    documentation: "Physical engine hardware and actuators.",
    block: {
      blockKind: "component",
      defaultSize: { width: 320, height: 180 }
    }
  });

  await createSysmlElementRelationship({
    tenant: options.tenant,
    projectKey: options.projectKey,
    sourceElementId: controller.id,
    targetElementId: engine.id,
    type: "HAS_PART",
    metadata: { multiplicity: "1" }
  });

  return { controller, engine };
}

async function seedDiagram(options: SeedOptions, packageId: string, controllerId: string, engineId: string) {
  const diagram = await createSysmlDiagram({
    tenant: options.tenant,
    projectKey: options.projectKey,
    name: "Propulsion Overview",
    diagramType: "bdd",
    packageId,
    description: "High-level block definition diagram for propulsion subsystem.",
    metadata: { seeded: true }
  });

  const session = getSession();
  try {
    await session.executeWrite(async tx => {
      await tx.run(
        `
          MATCH (d:SYSML_DIAGRAM {id: $diagramId, tenant: $tenant, projectKey: $projectKey})
          MATCH (controller:SYSML_ELEMENT {id: $controllerId, tenant: $tenant, projectKey: $projectKey})
          MATCH (engine:SYSML_ELEMENT {id: $engineId, tenant: $tenant, projectKey: $projectKey})
          MERGE (d)-[rel1:VISUALIZES {elementId: $controllerId}]->(controller)
            ON CREATE SET rel1.position = {x: 120, y: 80}, rel1.size = {width: 320, height: 180}
          SET rel1.updatedAt = datetime()
          MERGE (d)-[rel2:VISUALIZES {elementId: $engineId}]->(engine)
            ON CREATE SET rel2.position = {x: 520, y: 80}, rel2.size = {width: 320, height: 180}
          SET rel2.updatedAt = datetime()
        `,
        {
          tenant: options.tenant,
          projectKey: options.projectKey,
          diagramId: diagram.id,
          controllerId,
          engineId
        }
      );

      await tx.run(
        `
          MERGE (conn:SYSML_CONNECTION {
            id: $connectionId,
            diagramId: $diagramId,
            tenant: $tenant,
            projectKey: $projectKey
          })
          SET conn.source = $sourceId,
              conn.target = $targetId,
              conn.connectionType = 'association',
              conn.lineStyle = 'straight',
              conn.color = '#000000',
              conn.createdAt = coalesce(conn.createdAt, datetime()),
              conn.updatedAt = datetime()
        `,
        {
          connectionId: randomUUID(),
          diagramId: diagram.id,
          tenant: options.tenant,
          projectKey: options.projectKey,
          sourceId: controllerId,
          targetId: engineId
        }
      );
    });
  } finally {
    await session.close();
  }
}

async function main(): Promise<void> {
  const options = parseArgs();
  console.log(`[SysML Seed] Target tenant=${options.tenant} project=${options.projectKey}`);

  await initGraph();

  try {
    const packageId = await ensurePackage(options);
    console.log(`[SysML Seed] Package ready (${packageId})`);

    const { controller, engine } = await seedElements(options, packageId);
    console.log(`[SysML Seed] Created elements: ${controller.name} (${controller.id}), ${engine.name} (${engine.id})`);

    await seedDiagram(options, packageId, controller.id, engine.id);
    console.log("[SysML Seed] Diagram seeded");
  } finally {
    await closeGraph();
  }

  console.log("[SysML Seed] Completed.");
}

main().catch(error => {
  console.error("[SysML Seed] Failed", error);
  process.exitCode = 1;
});
