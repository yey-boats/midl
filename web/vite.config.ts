// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.

import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@yey-boats/midl": fileURLToPath(new URL("../ts/src/index.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
  },
});
