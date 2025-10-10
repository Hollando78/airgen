import { initGraph, getSession, closeGraph } from "./src/services/graph/driver.js";
import {
  createRequirement,
  archiveRequirements,
  unarchiveRequirements,
  softDeleteRequirement,
  restoreRequirement
} from "./src/services/graph/requirements/requirements-crud.js";
import { getRequirementHistory } from "./src/services/graph/requirements/requirements-versions.js";

async function testVersionHistoryLifecycle() {
  await initGraph();
  const session = getSession();

  try {
    console.log("🧪 Testing version history for lifecycle operations...\n");

    // Step 1: Create a test requirement
    console.log("📝 Step 1: Creating test requirement...");
    const requirement = await createRequirement({
      tenant: "test-tenant",
      projectKey: "test-project",
      documentSlug: "test-doc",
      sectionId: "test-section-1",
      text: "The system SHALL track version history for all lifecycle operations.",
      pattern: "ubiquitous",
      verification: "Test"
    });

    if (!requirement) {
      throw new Error("Failed to create requirement");
    }

    console.log(`   ✅ Created requirement: ${requirement.ref} (ID: ${requirement.id})\n`);

    // Step 2: Check initial version history (should have 1 version: created)
    console.log("🔍 Step 2: Checking initial version history...");
    let history = await getRequirementHistory("test-tenant", "test-project", requirement.id);
    console.log(`   📊 Version count: ${history.length}`);
    console.log(`   📝 Version 1: ${history[0].changeType} by ${history[0].changedBy}\n`);

    if (history.length !== 1 || history[0].changeType !== "created") {
      throw new Error("Expected 1 version with changeType 'created'");
    }

    // Step 3: Archive the requirement
    console.log("📦 Step 3: Archiving requirement...");
    await archiveRequirements("test-tenant", "test-project", [requirement.id], "test-user@example.com");
    console.log("   ✅ Requirement archived\n");

    // Step 4: Check version history (should have 2 versions: created, archived)
    console.log("🔍 Step 4: Checking version history after archive...");
    history = await getRequirementHistory("test-tenant", "test-project", requirement.id);
    console.log(`   📊 Version count: ${history.length}`);
    history.forEach((v, i) => {
      console.log(`   📝 Version ${i + 1}: ${v.changeType} by ${v.changedBy}`);
    });
    console.log();

    if (history.length !== 2 || history[0].changeType !== "archived") {
      throw new Error("Expected 2 versions with latest changeType 'archived'");
    }

    // Step 5: Unarchive the requirement
    console.log("📤 Step 5: Unarchiving requirement...");
    await unarchiveRequirements("test-tenant", "test-project", [requirement.id], "test-user@example.com");
    console.log("   ✅ Requirement unarchived\n");

    // Step 6: Check version history (should have 3 versions: created, archived, restored)
    console.log("🔍 Step 6: Checking version history after unarchive...");
    history = await getRequirementHistory("test-tenant", "test-project", requirement.id);
    console.log(`   📊 Version count: ${history.length}`);
    history.forEach((v, i) => {
      console.log(`   📝 Version ${i + 1}: ${v.changeType} by ${v.changedBy}`);
    });
    console.log();

    if (history.length !== 3 || history[0].changeType !== "restored") {
      throw new Error("Expected 3 versions with latest changeType 'restored'");
    }

    // Step 7: Soft delete the requirement
    console.log("🗑️  Step 7: Soft deleting requirement...");
    await softDeleteRequirement("test-tenant", "test-project", requirement.id, "test-user@example.com");
    console.log("   ✅ Requirement soft deleted\n");

    // Step 8: Check version history (should have 4 versions: created, archived, restored, deleted)
    console.log("🔍 Step 8: Checking version history after delete...");
    history = await getRequirementHistory("test-tenant", "test-project", requirement.id);
    console.log(`   📊 Version count: ${history.length}`);
    history.forEach((v, i) => {
      console.log(`   📝 Version ${i + 1}: ${v.changeType} by ${v.changedBy}`);
    });
    console.log();

    if (history.length !== 4 || history[0].changeType !== "deleted") {
      throw new Error("Expected 4 versions with latest changeType 'deleted'");
    }

    // Step 9: Restore the deleted requirement
    console.log("♻️  Step 9: Restoring deleted requirement...");
    await restoreRequirement("test-tenant", "test-project", requirement.id, "test-user@example.com");
    console.log("   ✅ Requirement restored from deletion\n");

    // Step 10: Check final version history (should have 5 versions)
    console.log("🔍 Step 10: Checking final version history...");
    history = await getRequirementHistory("test-tenant", "test-project", requirement.id);
    console.log(`   📊 Version count: ${history.length}`);
    history.forEach((v, i) => {
      console.log(`   📝 Version ${i + 1}: ${v.changeType} by ${v.changedBy}`);
    });
    console.log();

    if (history.length !== 5 || history[0].changeType !== "restored") {
      throw new Error("Expected 5 versions with latest changeType 'restored'");
    }

    // Step 11: Verify version data completeness
    console.log("✅ Step 11: Verifying version data completeness...");
    for (const version of history) {
      if (!version.versionId) {
        throw new Error(`Version ${version.versionNumber} missing versionId`);
      }
      if (!version.requirementId) {
        throw new Error(`Version ${version.versionNumber} missing requirementId`);
      }
      if (!version.text) {
        throw new Error(`Version ${version.versionNumber} missing text`);
      }
      if (!version.contentHash) {
        throw new Error(`Version ${version.versionNumber} missing contentHash`);
      }
      if (!version.changedBy) {
        throw new Error(`Version ${version.versionNumber} missing changedBy`);
      }
    }
    console.log("   ✅ All versions have complete data\n");

    // Step 12: Clean up test data
    console.log("🧹 Step 12: Cleaning up test data...");
    await session.run(
      `
        MATCH (n)
        WHERE n.tenant = 'test-tenant' OR (n:Tenant AND n.slug = 'test-tenant')
        DETACH DELETE n
      `
    );
    console.log("   ✅ Test data cleaned up\n");

    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("✅ TEST PASSED: Version history lifecycle operations working correctly!");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

    console.log("📊 Summary:");
    console.log("   ✅ Created version tracked");
    console.log("   ✅ Archived version tracked");
    console.log("   ✅ Unarchived version tracked (changeType: restored)");
    console.log("   ✅ Deleted version tracked");
    console.log("   ✅ Restored version tracked (changeType: restored)");
    console.log("   ✅ User attribution working (changedBy field)");
    console.log("   ✅ All version data complete (text, contentHash, etc.)");
    console.log();

  } catch (error) {
    console.error("❌ TEST FAILED:", error);
    throw error;
  } finally {
    await session.close();
    await closeGraph();
  }
}

testVersionHistoryLifecycle()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
