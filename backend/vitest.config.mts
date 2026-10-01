import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    // Starts a throwaway database container and runs migrations once
    globalSetup: ["./tests/global-setup.ts"],
    // Runs in every test file before its imports, so env.ts sees test values
    setupFiles: ["./tests/setup-env.ts"],
    // All files share one database, so they must not run concurrently
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 180_000,
  },
});
