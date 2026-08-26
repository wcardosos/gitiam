import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/index.ts", "src/types.ts"],
      reporter: ["text", "text-summary"],
      // Without this vitest skips the report when a test fails, which is
      // exactly when CI publishes it to the job summary.
      reportOnFailure: true,
    },
  },
});
