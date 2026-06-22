// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.
//
// Build the editor library: ESM + CJS outputs with TypeScript declarations.
// @yey-boats/midl and @yey-boats/midl-web are treated as externals (peers).
import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@yey-boats/midl": fileURLToPath(new URL("../ts/src/index.ts", import.meta.url)),
      "@yey-boats/midl-web": fileURLToPath(new URL("../web/src/index.ts", import.meta.url)),
    },
  },
  esbuild: { jsx: "automatic" },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    lib: {
      entry: fileURLToPath(new URL("./src/index.ts", import.meta.url)),
      name: "MidlEditor",
      formats: ["es", "umd"],
      fileName: (format) => format === "es" ? "midl-editor.js" : "midl-editor.umd.cjs",
    },
    rollupOptions: {
      external: ["react", "react-dom", "@yey-boats/midl", "@yey-boats/midl-web"],
      output: {
        globals: {
          react: "React",
          "react-dom": "ReactDOM",
          "@yey-boats/midl": "MidlTs",
          "@yey-boats/midl-web": "MidlWeb",
        },
      },
    },
  },
});
