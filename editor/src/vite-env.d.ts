// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.

/// <reference types="vite/client" />

// Vite ?inline query: returns CSS as a plain string instead of injecting it.
declare module "*.css?inline" {
  const css: string;
  export default css;
}
