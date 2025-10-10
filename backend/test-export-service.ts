import { initGraph, closeGraph } from "./src/services/graph/driver.js";
import { exportRequirement, exportDocument } from "./src/services/export-service.js";

async function testExportService() {
  await initGraph();

  try {
    console.log("=".repeat(80));
    console.log("EXPORT SERVICE TEST");
    console.log("=".repeat(80));

    // Test 1: Export a requirement
    console.log("\n1. Testing exportRequirement()...\n");

    try {
      // Get a sample requirement ID from the database
      const { getSession } = await import("./src/services/graph/driver.js");
      const session = getSession();

      const reqResult = await session.run(`
        MATCH (req:Requirement)
        WHERE req.tenant = 'hollando' AND req.projectKey = 'main-battle-tank'
        RETURN req.id as reqId, req.ref as reqRef
        LIMIT 1
      `);

      await session.close();

      if (reqResult.records.length === 0) {
        console.log("⚠️  No requirements found in database");
      } else {
        const reqId = reqResult.records[0].get("reqId");
        const reqRef = reqResult.records[0].get("reqRef");

        console.log(`Exporting requirement: ${reqRef} (${reqId})\n`);

        const markdown = await exportRequirement(reqId);

        console.log("✓ Export successful!");
        console.log("\nGenerated Markdown:");
        console.log("-".repeat(80));
        console.log(markdown);
        console.log("-".repeat(80));

        // Verify markdown contains enhanced fields
        const hasSection = markdown.includes("section:");
        const hasDocument = markdown.includes("document:");
        const hasTraceLinks = markdown.includes("traceLinks:");

        console.log("\nEnhanced Fields:");
        console.log(`  Section info:    ${hasSection ? "✓ Yes" : "✗ No"}`);
        console.log(`  Document info:   ${hasDocument ? "✓ Yes" : "✗ No"}`);
        console.log(`  Trace links:     ${hasTraceLinks ? "✓ Yes" : "✗ No"}`);
      }
    } catch (error) {
      console.error("✗ Export failed:", error);
    }

    // Test 2: Export a document
    console.log("\n" + "=".repeat(80));
    console.log("2. Testing exportDocument()...\n");

    try {
      const docSlug = "user-requirements-document";
      console.log(`Exporting document: ${docSlug}\n`);

      const docMarkdown = await exportDocument("hollando", "main-battle-tank", docSlug);

      console.log("✓ Export successful!");
      console.log("\nGenerated Markdown (first 500 chars):");
      console.log("-".repeat(80));
      console.log(docMarkdown.substring(0, 500) + "...");
      console.log("-".repeat(80));

      // Verify document markdown contains sections
      const hasSections = docMarkdown.includes("sections:");
      const hasLinksets = docMarkdown.includes("linksets:");

      console.log("\nDocument Fields:");
      console.log(`  Sections:  ${hasSections ? "✓ Yes" : "✗ No"}`);
      console.log(`  Linksets:  ${hasLinksets ? "✓ Yes" : "? Maybe"}`);
    } catch (error) {
      console.error("✗ Export failed:", error);
    }

    console.log("\n" + "=".repeat(80));
    console.log("✓ Test complete!");
    console.log("=".repeat(80) + "\n");
  } finally {
    await closeGraph();
  }
}

testExportService().catch(console.error);
