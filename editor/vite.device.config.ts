// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.
//
// JS stage of the device-hosted editor build: one IIFE (React, the editor, the
// renderer and the validator all inlined) for src/device/main.tsx. Not used on
// its own: scripts/build-device.mjs runs it, then inlines the script and
// device/device.css into device/index.html and writes device/dist/.
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
  esbuild: { jsx: "automatic", legalComments: "none" },
  logLevel: "warn",
  build: {
    outDir: "dist-device-build",
    emptyOutDir: true,
    minify: true,
    reportCompressedSize: false,
    lib: {
      entry: fileURLToPath(new URL("./src/device/main.tsx", import.meta.url)),
      name: "MidlDeviceEditor",
      formats: ["iife"],
      fileName: () => "device-editor.js",
    },
    rollupOptions: {},
  },
});
