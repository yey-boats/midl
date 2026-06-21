// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.
import type { ConfigDoc } from "./types";

// A flat, searchable digest of a dashboard document: its document-level meta
// plus the union of device classes it targets (via screen variants) and the
// element types it uses. Powers the standard-layout library catalog and agent
// search. Reads only `meta`/`variants`/`elements` — never the layout geometry.
export interface LayoutSummary {
  title?: string;
  description?: string;
  useCase?: string;
  tags: string[];
  classes: string[];
  elements: string[];
}

export function layoutSummary(doc: ConfigDoc): LayoutSummary {
  const tags = new Set<string>(doc.meta?.tags ?? []);
  const classes = new Set<string>();
  const elements = new Set<string>();
  for (const sc of doc.screens ?? []) {
    for (const t of sc.meta?.tags ?? []) tags.add(t);
    for (const v of sc.variants ?? []) classes.add(v.class);
    for (const el of Object.values(sc.elements ?? {})) if (el?.type) elements.add(el.type);
  }
  return {
    title: doc.meta?.title,
    description: doc.meta?.description,
    useCase: doc.meta?.useCase,
    tags: [...tags],
    classes: [...classes],
    elements: [...elements],
  };
}
