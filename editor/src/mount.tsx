// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { MidlEditor, type MidlEditorProps } from "./MidlEditor";
export function mount(el: HTMLElement, props: MidlEditorProps): () => void {
  const root = createRoot(el);
  root.render(createElement(MidlEditor, props));
  return () => root.unmount();
}
