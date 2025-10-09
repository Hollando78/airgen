/**
 * Test script for version history implementation
 *
 * Tests:
 * 1. Create requirement → version 1 created
 * 2. Update requirement → version 2 created
 * 3. Get history → returns all versions
 * 4. Get diff → shows changes between versions
 * 5. Restore → restores to previous version
 */

import { randomUUID } from "crypto";
import { getSession, initGraph, closeGraph } from "./src/services/graph/driver.js";
import { createRequirement, updateRequirement, getRequirement } from "./src/services/graph/requirements/requirements-crud.js";
import { getRequirementHistory, getRequirementDiff } from "./src/services/graph/requirements/requirements-versions.js";

const TEST_TENANT = "test-tenant";
const TEST_PROJECT = "test-project";
const TEST_USER = "test@example.com";

async function cleanup() {
  const session = getSession();
  try {
    await session.run(
      `
        MATCH (req:Requirement {tenant: $tenant, projectKey: $project})
        WHERE req.ref STARTS WITH 'TEST-VER'
        DETACH DELETE req
      `,
      { tenant: TEST_TENANT, project: TEST_PROJECT }
    );
    console.log("✓ Cleaned up test data");
  } finally {
    await session.close();
  }
}

async function testCreateRequirement() {
  console.log("\n=== Test 1: Create Requirement ===");

  const requirement = await createRequirement({
    tenant: TEST_TENANT,
    projectKey: TEST_PROJECT,
    ref: `TEST-VER-${Date.now()}`,
    text: "Initial requirement text for version testing",
    pattern: "ubiquitous",
    verification: "Test",
    rationale: "Initial rationale",
    complianceStatus: "N/A",
    userId: TEST_USER
  });

  console.log(`✓ Created requirement: ${requirement.ref} (ID: ${requirement.id})`);

  // Check version was created
  const history = await getRequirementHistory(TEST_TENANT, TEST_PROJECT, requirement.id);

  if (history.length !== 1) {
    throw new Error(`Expected 1 version, got ${history.length}`);
  }

  if (history[0].versionNumber !== 1) {
    throw new Error(`Expected version 1, got ${history[0].versionNumber}`);
  }

  if (history[0].changeType !== "created") {
    throw new Error(`Expected changeType 'created', got ${history[0].changeType}`);
  }

  if (history[0].changedBy !== TEST_USER) {
    throw new Error(`Expected changedBy '${TEST_USER}', got ${history[0].changedBy}`);
  }

  console.log(`✓ Version 1 created successfully`);
  console.log(`  - Version number: ${history[0].versionNumber}`);
  console.log(`  - Change type: ${history[0].changeType}`);
  console.log(`  - Changed by: ${history[0].changedBy}`);
  console.log(`  - Text: ${history[0].text.substring(0, 50)}...`);

  return requirement;
}

async function testUpdateRequirement(requirementId: string) {
  console.log("\n=== Test 2: Update Requirement ===");

  // Wait a moment to ensure different timestamps
  await new Promise(resolve => setTimeout(resolve, 100));

  const updated = await updateRequirement(
    TEST_TENANT,
    TEST_PROJECT,
    requirementId,
    {
      text: "Updated requirement text with new content",
      pattern: "event",
      verification: "Analysis",
      rationale: "Updated rationale with more details",
      complianceStatus: "Compliant",
      userId: TEST_USER
    }
  );

  if (!updated) {
    throw new Error("Update returned null");
  }

  console.log(`✓ Updated requirement successfully`);

  // Check versions
  const history = await getRequirementHistory(TEST_TENANT, TEST_PROJECT, requirementId);

  if (history.length !== 2) {
    throw new Error(`Expected 2 versions, got ${history.length}`);
  }

  // History should be in reverse chronological order (newest first)
  const v2 = history[0];
  const v1 = history[1];

  if (v2.versionNumber !== 2) {
    throw new Error(`Expected version 2 first, got ${v2.versionNumber}`);
  }

  if (v1.versionNumber !== 1) {
    throw new Error(`Expected version 1 second, got ${v1.versionNumber}`);
  }

  if (v2.changeType !== "updated") {
    throw new Error(`Expected changeType 'updated', got ${v2.changeType}`);
  }

  console.log(`✓ Version 2 created successfully`);
  console.log(`  - Version number: ${v2.versionNumber}`);
  console.log(`  - Change type: ${v2.changeType}`);
  console.log(`  - Changed by: ${v2.changedBy}`);
  console.log(`  - Text: ${v2.text.substring(0, 50)}...`);

  return updated;
}

async function testGetHistory(requirementId: string) {
  console.log("\n=== Test 3: Get History ===");

  const history = await getRequirementHistory(TEST_TENANT, TEST_PROJECT, requirementId);

  console.log(`✓ Retrieved ${history.length} versions`);
  console.log("\nVersion History:");
  history.forEach((version, idx) => {
    console.log(`  ${idx + 1}. v${version.versionNumber} - ${version.changeType} by ${version.changedBy} at ${version.timestamp}`);
    console.log(`     Text: ${version.text.substring(0, 60)}...`);
  });
}

async function testGetDiff(requirementId: string) {
  console.log("\n=== Test 4: Get Diff ===");

  const diff = await getRequirementDiff(TEST_TENANT, TEST_PROJECT, requirementId, 1, 2);

  console.log(`✓ Retrieved diff between v1 and v2`);
  console.log("\nField Changes:");

  const changedFields = diff.filter(d => d.changed);
  if (changedFields.length === 0) {
    throw new Error("Expected some changed fields");
  }

  changedFields.forEach(change => {
    console.log(`  - ${change.field}:`);
    console.log(`    OLD: ${JSON.stringify(change.oldValue)}`);
    console.log(`    NEW: ${JSON.stringify(change.newValue)}`);
  });

  // Verify expected changes
  const textChange = diff.find(d => d.field === "text" && d.changed);
  if (!textChange) {
    throw new Error("Expected text field to be changed");
  }

  const patternChange = diff.find(d => d.field === "pattern" && d.changed);
  if (!patternChange) {
    throw new Error("Expected pattern field to be changed");
  }

  console.log(`✓ Diff shows ${changedFields.length} changed fields`);
}

async function testMultipleUpdates(requirementId: string) {
  console.log("\n=== Test 5: Multiple Updates ===");

  // Update 2: Change text only
  await new Promise(resolve => setTimeout(resolve, 100));
  await updateRequirement(
    TEST_TENANT,
    TEST_PROJECT,
    requirementId,
    {
      text: "Third version with even more content",
      userId: "user2@example.com"
    }
  );

  // Update 3: Change pattern only
  await new Promise(resolve => setTimeout(resolve, 100));
  await updateRequirement(
    TEST_TENANT,
    TEST_PROJECT,
    requirementId,
    {
      pattern: "state",
      userId: "user3@example.com"
    }
  );

  const history = await getRequirementHistory(TEST_TENANT, TEST_PROJECT, requirementId);

  if (history.length !== 4) {
    throw new Error(`Expected 4 versions, got ${history.length}`);
  }

  console.log(`✓ Created ${history.length} versions total`);
  console.log("\nComplete Version History:");
  history.forEach((version, idx) => {
    console.log(`  v${version.versionNumber} - ${version.changeType} by ${version.changedBy}`);
  });

  // Test diff between v1 and v4
  const fullDiff = await getRequirementDiff(TEST_TENANT, TEST_PROJECT, requirementId, 1, 4);
  const changedFields = fullDiff.filter(d => d.changed);

  console.log(`\n✓ Diff v1→v4 shows ${changedFields.length} changed fields`);
}

async function testRestore(requirementId: string) {
  console.log("\n=== Test 6: Restore to Previous Version ===");

  const history = await getRequirementHistory(TEST_TENANT, TEST_PROJECT, requirementId);
  const v1 = history.find(v => v.versionNumber === 1);

  if (!v1) {
    throw new Error("Could not find version 1");
  }

  console.log(`Restoring to v1...`);
  console.log(`  Original text: ${v1.text.substring(0, 50)}...`);

  // Restore to v1 by updating with v1's values
  await new Promise(resolve => setTimeout(resolve, 100));
  const restored = await updateRequirement(
    TEST_TENANT,
    TEST_PROJECT,
    requirementId,
    {
      text: v1.text,
      pattern: v1.pattern,
      verification: v1.verification,
      rationale: v1.rationale,
      complianceStatus: v1.complianceStatus as "N/A" | "Compliant" | "Compliance Risk" | "Non-Compliant" | undefined,
      userId: "restore-test@example.com"
    }
  );

  if (!restored) {
    throw new Error("Restore returned null");
  }

  console.log(`✓ Restored to v1 values`);
  console.log(`  Current text: ${restored.text.substring(0, 50)}...`);

  // Verify new version was created
  const newHistory = await getRequirementHistory(TEST_TENANT, TEST_PROJECT, requirementId);

  if (newHistory.length !== 5) {
    throw new Error(`Expected 5 versions after restore, got ${newHistory.length}`);
  }

  const latestVersion = newHistory[0];
  if (latestVersion.text !== v1.text) {
    throw new Error("Restored text doesn't match v1");
  }

  console.log(`✓ Version 5 created with restored values`);
  console.log(`  Changed by: ${latestVersion.changedBy}`);
}

async function testMetadataUpdateNoVersion(requirementId: string) {
  console.log("\n=== Test 7: Metadata Update (No Version) ===");

  const historyBefore = await getRequirementHistory(TEST_TENANT, TEST_PROJECT, requirementId);
  const versionCountBefore = historyBefore.length;

  // Update only QA fields (metadata, shouldn't create version)
  await updateRequirement(
    TEST_TENANT,
    TEST_PROJECT,
    requirementId,
    {
      qaScore: 85,
      qaVerdict: "Good quality",
      userId: TEST_USER
    }
  );

  const historyAfter = await getRequirementHistory(TEST_TENANT, TEST_PROJECT, requirementId);
  const versionCountAfter = historyAfter.length;

  if (versionCountAfter !== versionCountBefore) {
    throw new Error(`Metadata update created version. Before: ${versionCountBefore}, After: ${versionCountAfter}`);
  }

  console.log(`✓ Metadata update did NOT create new version`);
  console.log(`  Version count remains: ${versionCountAfter}`);
}

async function runAllTests() {
  console.log("=================================");
  console.log("Version History Implementation Test");
  console.log("=================================");

  try {
    // Initialize graph connection
    initGraph();
    console.log("✓ Graph driver initialized\n");

    // Cleanup any existing test data
    await cleanup();

    // Run tests
    const requirement = await testCreateRequirement();
    await testUpdateRequirement(requirement.id);
    await testGetHistory(requirement.id);
    await testGetDiff(requirement.id);
    await testMultipleUpdates(requirement.id);
    await testRestore(requirement.id);
    await testMetadataUpdateNoVersion(requirement.id);

    // Cleanup after tests
    await cleanup();

    console.log("\n=================================");
    console.log("✅ ALL TESTS PASSED");
    console.log("=================================\n");

    // Close graph connection
    await closeGraph();

    process.exit(0);
  } catch (error) {
    console.error("\n=================================");
    console.error("❌ TEST FAILED");
    console.error("=================================");
    console.error(error);

    // Cleanup on failure
    try {
      await cleanup();
    } catch (cleanupError) {
      console.error("Cleanup failed:", cleanupError);
    }

    // Close graph connection
    try {
      await closeGraph();
    } catch (closeError) {
      console.error("Close graph failed:", closeError);
    }

    process.exit(1);
  }
}

runAllTests();
