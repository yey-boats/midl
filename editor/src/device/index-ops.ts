// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.
//
// Pure helpers for the display's carousel index ({order, defaultScreen, hidden})
// and the starter doc of a new record.

import type { Manifest } from "@yey-boats/midl";
import type { MidlIndex, RecordList, RecordSummary } from "./device-api";

/** Records in carousel order: `index.order` first, then the rest in the order
 *  the display listed them (its embedded-then-id order). */
export function displayOrder(list: RecordList): RecordSummary[] {
  const byId = new Map(list.records.map((r) => [r.id, r]));
  const out: RecordSummary[] = [];
  for (const id of list.index.order) {
    const r = byId.get(id);
    if (r) {
      out.push(r);
      byId.delete(id);
    }
  }
  for (const r of list.records) if (byId.has(r.id)) out.push(r);
  return out;
}

function base(list: RecordList): MidlIndex {
  const ids = new Set(list.records.map((r) => r.id));
  return {
    order: displayOrder(list).map((r) => r.id),
    defaultScreen: list.index.defaultScreen,
    hidden: list.index.hidden.filter((h) => ids.has(h)),
  };
}

/** Move a record one step up (-1) or down (+1); returns the full new index. */
export function moveRecord(list: RecordList, id: string, delta: -1 | 1): MidlIndex {
  const idx = base(list);
  const i = idx.order.indexOf(id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= idx.order.length) return idx;
  const order = idx.order.slice();
  [order[i], order[j]] = [order[j], order[i]];
  return { ...idx, order };
}

export function toggleHidden(list: RecordList, id: string): MidlIndex {
  const idx = base(list);
  const hidden = idx.hidden.includes(id) ? idx.hidden.filter((h) => h !== id) : [...idx.hidden, id];
  return { ...idx, hidden };
}

export function setDefaultScreen(list: RecordList, screenId: string): MidlIndex {
  return { ...base(list), defaultScreen: screenId };
}

/** Starter doc for a new record: one screen (id = record id) with one value tile. */
export function newRecordDoc(id: string, title: string, manifest: Manifest, className: string): Record<string, unknown> {
  const cls = manifest.classes.find((c) => c.id === className) ?? manifest.classes[0];
  const type = cls?.elements?.includes("single-value") ? "single-value" : (cls?.elements?.[0] ?? "single-value");
  return {
    midl: manifest.midl || "1.0.0",
    screens: [
      {
        id,
        title,
        elements: {
          sog: {
            type,
            name: "SOG",
            format: { unit: "kn", decimals: 1 },
            bindings: { value: { kind: "signalk", path: "navigation.speedOverGround" } },
          },
        },
        layout: { rows: 1, cols: 1, cells: [{ element: "sog" }] },
      },
    ],
  };
}
