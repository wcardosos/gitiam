import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["cjs"],
  target: "node24",
  clean: true,
  banner: { js: "#!/usr/bin/env node" },
});
