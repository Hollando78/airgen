import { defineConfig } from "vitest/config";

/**
 * Integration test configuration for tests that require Docker containers
 * (testcontainers for Neo4j, etc.)
 *
 * Run with: npm run test:integration
 *
 * Note: Requires Docker to be running
 */
export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    // Only run container tests
    include: ["src/**/*.container.test.ts"],
    exclude: ["node_modules", "dist"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: [
        "node_modules/**",
        "dist/**",
        "**/*.test.ts",
        "**/__tests__/**"
      ]
    },
    // Longer timeouts for container startup
    testTimeout: 120000, // 2 minutes
    hookTimeout: 120000  // 2 minutes
  }
});
