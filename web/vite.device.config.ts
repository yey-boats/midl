// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.
//
// Build the single-file, self-contained device bundle: one IIFE that exposes the
// React-free renderer as `window.MidlWeb`, with @yey-boats/midl (validator +
// solver), the yaml parser, and ajv all INLINED — no externals, no backend.
// A device serves it from flash; an HTML page renders a MIDL dashboard with one
// <script> tag.  Output: dist-device/midl-device.global.js
import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: { alias: { "@yey-boats/midl": fileURLToPath(new URL("../ts/src/index.ts", import.meta.url)) } },
  esbuild: { jsx: "automatic" },
  build: {
    outDir: "dist-device",
    emptyOutDir: true,
    minify: true,
    lib: {
      entry: fileURLToPath(new URL("./src/device.ts", import.meta.url)),
      name: "MidlWeb",
      formats: ["iife"],
      fileName: () => "midl-device.global.js",
    },
    // No `external` — everything is inlined into the single file.
    rollupOptions: {},
  },
});
