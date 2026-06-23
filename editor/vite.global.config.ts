// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.
//
// Build the self-contained global bundle: one IIFE that exposes the editor as
// `window.MidlEditor`, with React, ReactDOM, @yey-boats/midl, and
// @yey-boats/midl-web all INLINED — no externals, no bundler required by host.
// A vanilla HTML page loads the editor with one <script> tag.
// Output: dist-global/midl-editor.global.js
import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@yey-boats/midl": fileURLToPath(new URL("../ts/src/index.ts", import.meta.url)),
      "@yey-boats/midl-web": fileURLToPath(new URL("../web/src/index.ts", import.meta.url)),
    },
  },
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
  esbuild: { jsx: "automatic" },
  build: {
    outDir: "dist-global",
    emptyOutDir: true,
    minify: true,
    lib: {
      entry: fileURLToPath(new URL("./src/index.ts", import.meta.url)),
      name: "MidlEditor",
      formats: ["iife"],
      fileName: () => "midl-editor.global.js",
    },
    // No `external` entries — React, ReactDOM, midl-web, and midl all get
    // inlined into the single file so the host needs nothing else.
    rollupOptions: {},
  },
});
