// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.
//
// Device/standalone entry: the React-FREE surface of @yey-boats/midl-web, for a
// single self-contained bundle a device (or Instruments-manager) can serve from
// flash with no backend and no framework. Excludes the React <MidlDashboard>
// wrapper; the canvas `renderDashboard` API needs no React.
export { renderDashboard, prepareDashboard, paintPrepared, TrendBuffers } from "./render";
export type { RenderResult, PreparedDashboard } from "./render";
export { paintScreen } from "./paint";
export { MockDataProvider, collectBindings } from "./data";
export type { DataProvider, ResolvedValue } from "./data";
export { resolveElement } from "./model";
export type { ElementModel, ModelState } from "./model";
export { formatValue, convert } from "./format";
export { THEMES, theme } from "./theme";
export type { Theme } from "./theme";
export { previewConfig } from "./preview";
export type { PreviewResult, ScreenPlan } from "./preview";
