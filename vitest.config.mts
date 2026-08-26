import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // picocolors turns colors on whenever `CI` is set, so on GitHub Actions the
    // formatted output carries ANSI escapes while local runs do not. Pin it off
    // so the suite asserts on the same strings in both places.
    env: { NO_COLOR: '1' },
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
