import { defineConfig } from "tsup";
export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  sourcemap: true,
  // ajv + yaml stay external (consumer installs them); schema JSON is inlined by esbuild.
  external: ["ajv", "yaml"],
});
