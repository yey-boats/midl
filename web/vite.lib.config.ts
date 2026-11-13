// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.
//
// Build the web renderer library: ESM + UMD/CJS outputs (midl#17).
// Declarations are emitted separately by `tsc -p tsconfig.lib.json`.
// @yey-boats/midl, react and react-dom are externals: they are resolved by the
// consumer (@yey-boats/midl is a dependency, react/react-dom are peers).
import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

export default defineConfig({
  esbuild: { jsx: "automatic" },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    lib: {
      entry: fileURLToPath(new URL("./src/index.ts", import.meta.url)),
      name: "MidlWeb",
      formats: ["es", "umd"],
      fileName: (format) => format === "es" ? "midl-web.js" : "midl-web.umd.cjs",
    },
    rollupOptions: {
      external: ["react", "react-dom", "react/jsx-runtime", "@yey-boats/midl"],
      output: {
        globals: {
          react: "React",
          "react-dom": "ReactDOM",
          "react/jsx-runtime": "jsxRuntime",
          "@yey-boats/midl": "MidlTs",
        },
      },
    },
  },
});
