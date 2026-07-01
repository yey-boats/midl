// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.

export const EDITOR_VERSION = "0.1.0";

export { MidlEditor } from "./MidlEditor";
export type { MidlEditorProps } from "./MidlEditor";

export { parseMidl, serializeMidl } from "./midl-io";

export type { EditorModel, EditorElement, GridLayout, EditorVariant } from "./model";
export { EditorError } from "./model";

export * from "./adapters";

export { validateModel } from "./validate";

export { sanitizeSvg } from "./sanitize-svg";

export { parseDoc, toCanonicalJson } from "@yey-boats/midl";

export * as layoutOps from "./layout-ops";

export { mount } from "./mount";

export { createSignalKProvider } from "./signalk-provider";
export type { CreateSignalKProviderOpts } from "./signalk-provider";
