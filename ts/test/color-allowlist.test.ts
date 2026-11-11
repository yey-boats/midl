// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.
//
// Colour values are a strict allowlist: #rgb, #rrggbb, #rrggbbaa or a named
// theme token. Anything else is rejected structurally, because renderers write
// colours into SVG attributes and a value like `#fff"/><img onerror=…>` would
// otherwise be markup injection (stored XSS through a saved layout).
import { test, expect, describe } from "vitest";
import { validateConfigStructure } from "../src/validate";

const GOOD = ["#fff", "#FFF", "#36d399", "#36D399", "#36d39980", "accent", "warn", "good", "bad", "alarm", "danger", "port", "starboard", "fg", "dim", "tide"];
const HOSTILE = [
  '#fff"/><img src=x onerror=alert(1)>',
  '#fff" onmouseover="alert(1)',
  "#fff;background:url(javascript:alert(1))",
  "#ff", "#fffff", "#fffffff", "#ggg", "#", " #fff", "#fff ", "#fff\n",
  "red", "Accent", "javascript:alert(1)", "url(#x)", "constructor", "__proto__", "",
];

function docWith(el: Record<string, unknown>) {
  return { midl: "1.0.0", screens: [{ id: "d", elements: { e: el }, layout: { element: "e" } }] };
}
const SITES: Record<string, (c: string) => Record<string, unknown>> = {
  "style.color": (c) => ({ type: "single-value", style: { color: c } }),
  "style.colorRole": (c) => ({ type: "single-value", style: { colorRole: c } }),
  "style.zones[].color": (c) => ({ type: "gauge", style: { zones: [{ lt: 1, color: c }] } }),
  "style.sectors[].color": (c) => ({ type: "compass", style: { sectors: [{ from: 0, to: 30, color: c }] } }),
  "markers[].color": (c) => ({ type: "compass", markers: [{ glyph: "triangle", color: c }] }),
};

describe("colour allowlist", () => {
  for (const [site, mk] of Object.entries(SITES)) {
    test(`${site} accepts hex literals and theme tokens`, () => {
      for (const c of GOOD) expect(validateConfigStructure(docWith(mk(c))), `${site}=${c}`).toEqual([]);
    });
    test(`${site} rejects hostile and malformed colours`, () => {
      for (const c of HOSTILE) expect(validateConfigStructure(docWith(mk(c))).length, `${site}=${JSON.stringify(c)}`).toBeGreaterThan(0);
    });
  }
});
